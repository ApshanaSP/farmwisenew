/**
 * What to ask next, under an answer: three or four questions made from the answer's own facts (the zone, the place,
 * the department and the facility that hold most of it, the cases past deadline, the period), never generic ones.
 * Each is put through the same router and executor before it is offered, so a click always gets an answer (a plan
 * with rows, an area brief, or a Send to department), not "I could not read that". No AI. Pure, given the World.
 */
import type { AskResponse } from "./ask";
import type { Brief } from "./brief";
import { runMapPlan, type Ctx, type RunResult } from "./execute";
import { periodDays, type Plan, type Step } from "./plan";
import { rulesRoute, type RouteEnv } from "./route";
import { WORDS } from "./suggest";
import type { World } from "./types";

export interface FollowEnv { w: World; env: RouteEnv; ctx: Ctx; lock: string | null; role: string }

type Want = "rows" | "brief" | "send";
interface Cand { q: string; want: Want; prev: Plan | null; sameCat?: boolean }

const MAX = 4;
/** the router and executor are fast (a few ms a plan); this keeps a slow PC from holding the answer back */
const BUDGET_MS = 450;

const FAC_FOR: Record<string, ["hospitals" | "schools", string, string]> = {
  FLOOD_WATERLOGGING: ["hospitals", "Near hospitals", "மருத்துவமனைகள் அருகே"], DRAINAGE_SEWAGE: ["hospitals", "Near hospitals", "மருத்துவமனைகள் அருகே"],
  FLOOD_RISK_SIGNAL: ["hospitals", "Near hospitals", "மருத்துவமனைகள் அருகே"], VECTOR_DISEASE: ["hospitals", "Near hospitals", "மருத்துவமனைகள் அருகே"]
};

/** The answer's follow-ups, checked. `r` is the run behind an answer (null for an area brief). */
export function followUps(res: AskResponse, r: RunResult | null, fe: FollowEnv): string[] {
  const t0 = Date.now();
  const ta = res.lang === "ta";
  const cands = res.kind === "brief" && res.brief ? briefCands(res.brief, ta) : res.kind === "answer" && res.plan && r ? answerCands(res, r, fe, ta) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  const now = res.plan ? JSON.stringify(res.plan.steps) : "";
  for (const c of cands) {
    if (out.length >= MAX || Date.now() - t0 > BUDGET_MS) break;
    if (seen.has(c.q.toLowerCase())) continue;
    seen.add(c.q.toLowerCase());
    if (works(c, fe, now, res.plan)) out.push(c.q);
  }
  return out;
}

function works(c: Cand, fe: FollowEnv, now: string, cur: Plan | null): boolean {
  let o;
  try { o = rulesRoute(c.q, c.prev, fe.env); } catch { return false; }
  if (!o) return false;
  if (c.want === "send") return o.kind === "ui" && o.ui === "send";
  if (c.want === "brief") return o.kind === "brief";
  if (o.kind !== "plan") return false;
  // the same question again is no follow-up
  if (JSON.stringify(o.plan.steps) === now) return false;
  if (c.sameCat && cur && catOf(o.plan) !== catOf(cur)) return false;
  try {
    const run = runMapPlan(o.plan, fe.w, fe.ctx, fe.lock);
    if (run.show.type === "points") return run.show.items.length > 0;
    if (run.show.type === "areas") return run.show.areas.length > 0;
    return run.hits.length > 0;
  } catch { return false; }
}

const takeOf = (p: Plan) => p.steps.find((s): s is Extract<Step, { op: "take" }> => s.op === "take" && s.layer === "incidents") ?? null;
const catOf = (p: Plan) => { const f = takeOf(p)?.filter; return JSON.stringify([f?.category ?? null, f?.family ?? null]); };

function answerCands(res: AskResponse, r: RunResult, fe: FollowEnv, ta: boolean): Cand[] {
  const plan = res.plan!;
  const take = takeOf(plan);
  const f = take?.filter ?? null;
  const last = plan.steps.find((s) => s.as === plan.show);
  const g = res.glance;
  const zoneName = (z: number) => fe.w.zones.find((x) => x.zone === z)?.name ?? null;
  const out: Cand[] = [];
  const edit = (en: string, tam: string, sameCat = true) => out.push({ q: ta ? tam : en, want: "rows", prev: plan, sameCat });

  // places only ("schools in Valasaravakkam"): what is near them, and the other facilities there
  if (!take) {
    if (res.context.points.length) {
      edit("Open complaints near them", "அவற்றின் அருகே திறந்த புகார்கள்", false);
      const layer = res.context.points[0].layer;
      if (plan.steps.some((s) => s.op === "inside"))
        for (const [l, en, tam] of [["hospitals", "Hospitals there", "அங்கே மருத்துவமனைகள்"], ["schools", "Schools there", "அங்கே பள்ளிகள்"], ["police", "Police stations there", "அங்கே காவல் நிலையங்கள்"]] as const)
          if (l !== layer) edit(en, tam, false);
    }
    return out;
  }
  if (!r.hits.length) {
    // nothing in a short window ("today, since midnight" included): offer the month
    if (f?.period && f.period.kind !== "range" && periodDays(f.period) < 30) edit("This month", "இந்த மாதம்");
    if (f?.status === "open") edit("Include closed ones", "மூடியவையும் சேர்த்து");
    return out;
  }

  // where most of it is: that place's whole picture
  const zones = new Map<number, number>();
  for (const h of r.hits) if (h.inc.zone != null) zones.set(h.inc.zone, (zones.get(h.inc.zone) ?? 0) + 1);
  const zs = [...zones.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const inArea = plan.steps.some((s) => s.op === "inside");
  // the facility most of the answer is near ("Kilpauk Medical College"), for "what is happening near it?"
  const nearBy = new Map<string, number>();
  for (const h of r.hits) if (h.near?.name) nearBy.set(h.near.name, (nearBy.get(h.near.name) ?? 0) + 1);
  const topNear = [...nearBy.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const cluster = res.extra.clusters?.find((c) => c.place)?.place ?? null;

  if (cluster) out.push({ q: ta ? `${cluster} இல் என்ன நடக்கிறது?` : `What is happening in ${cluster}?`, want: "brief", prev: null });
  else if (topNear) out.push({ q: ta ? `${topNear} அருகே என்ன நடக்கிறது?` : `What is happening near ${topNear}?`, want: "brief", prev: null });
  if (!inArea && zs.length > 1 && zoneName(zs[0][0])) out.push({ q: ta ? `${zoneName(zs[0][0])} இல் என்ன நடக்கிறது?` : `What is happening in ${zoneName(zs[0][0])}?`, want: "brief", prev: null });
  if (g?.overdue.n && !f?.overdue && g.overdue.n < r.hits.length) edit("Show only the overdue ones", "காலக்கெடு தாண்டியவை மட்டும்");
  // the Collector can hand it to the department holding most of it
  if (fe.role === "collector" && g?.who && g.open.n > 0) out.push({ q: ta ? `இவற்றை ${g.who.name} க்கு அனுப்பு` : `Send these to ${g.who.name}`, want: "send", prev: plan });
  if (last?.op !== "count_by" && last?.op !== "compare" && last?.op !== "hotspot" && zs.length > 1) edit("Which zone has the most?", "எந்த மண்டலத்தில் அதிகம்?");
  if (!inArea && zs.length > 1 && last?.op !== "compare") { const b = zoneName(zs[1][0]); if (b) edit(`Compare with ${b}`, `${b} உடன் ஒப்பிடு`); }
  if (!f?.severity && g?.severe.n && g.severe.n < r.hits.length) edit("Only severe", "கடுமையானவை மட்டும்");
  if ((res.answer?.depts.length ?? 0) > 1) edit("Which department has the most?", "எந்த துறை அதிகம்?");
  if (!plan.steps.some((s) => s.op === "within")) {
    const fac = f?.category?.length ? FAC_FOR[f.category[0]] : null;
    if (fac) edit(fac[1], fac[2]); else edit("Near schools", "பள்ளிகள் அருகே");
  }
  if (!f?.news && res.rows.some((x) => x.news)) edit("Only the ones in the news", "செய்திகளில் வந்தவை மட்டும்");
  const days = f?.period?.kind === "last_days" ? f.period.days : null;
  edit(days === 7 ? "This month" : "Last 7 days", days === 7 ? "இந்த மாதம்" : "கடந்த 7 நாட்கள்");
  return out;
}

/** after an area brief: the area's own questions (its commonest problem, its serious and late cases), asked fresh */
function briefCands(b: Brief, ta: boolean): Cand[] {
  // "Teynampet (Zone 9)", "Adyar (1 km)": the place's own name
  const name = b.label.en.replace(/\s*\([^()]*\)$/, "");
  const out: Cand[] = [];
  const top = b.byType.find((x) => WORDS[x.cat]);
  if (top) out.push({ q: ta ? `${name} அருகே ${WORDS[top.cat].ta} புகார்கள்` : `${cap(WORDS[top.cat].en)} near ${name} this month`, want: "rows", prev: null });
  out.push({ q: ta ? `${name} அருகே கடுமையான சம்பவங்கள்` : `Severe cases near ${name} this month`, want: "rows", prev: null });
  if (b.depts.some((d) => d.overdue > 0)) out.push({ q: ta ? `${name} அருகே காலக்கெடு தாண்டிய புகார்கள்` : `Overdue complaints near ${name}`, want: "rows", prev: null });
  out.push({ q: ta ? `${name} அருகே மருத்துவமனைகள்` : `Hospitals near ${name}`, want: "rows", prev: null });
  out.push({ q: ta ? `${name} அருகே திறந்த புகார்கள்` : `Open complaints near ${name}`, want: "rows", prev: null });
  return out;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
