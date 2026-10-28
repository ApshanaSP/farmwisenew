/**
 * Insights about a map answer, computed from its rows (never by AI): what is past its deadline and with whom, the
 * spots where several reports sit within 100 m (one fix may close several), the change on the period before, where
 * the answer is concentrated and which wards are well above their neighbours, the most affected facility, who the
 * reports mention (children, a school, a hospital, the elderly), and how many came from citizens. Each insight
 * carries the ids it counts, so a click shows exactly those rows on the map, and its numbers become facts the AI
 * analyst may quote (analyst.ts). Ranked by how much they should change what the Collector does next. Pure.
 */
import { GI_HOT, dbscan, giStar, runMapPlan, type Ctx, type Hit, type RunResult } from "./execute";
import type { Plan, Step } from "./plan";
import type { World } from "./types";
import { LAYER_WORD } from "./words";
import { MIN_PCT_BASE, pctChange } from "@/lib/reference/metrics";

export interface Insight {
  id: string;
  kind: "overdue" | "repeat" | "change" | "concentration" | "hot" | "facility" | "vulnerable" | "severe" | "citizen";
  tone: "alert" | "warn" | "info" | "good";
  en: string;
  ta: string;
  /** the number the insight is about, and the rows behind it */
  n: number;
  ids: string[];
  /** a suggested next step, in words (the panel can turn it into a question) */
  next?: { en: string; ta: string; ask?: string } | null;
  score: number;
}

const n = (x: number) => x.toLocaleString("en-IN");
const pc = (a: number, b: number) => Math.round((100 * a) / Math.max(1, b));

export function insightsFor(plan: Plan, r: RunResult, w: World, ctx: Ctx, lockDept: string | null = null, max = 5): Insight[] {
  const hits = r.hits;
  const total = hits.length;
  const out: Insight[] = [];
  if (!total || r.show.type === "areas" || (r.show.type === "nearest" && r.show.origin)) return out;
  const open = hits.filter((h) => h.inc.open);
  const dept = (code: string) => w.depts.get(code)?.name ?? code;
  const take = plan.steps.find((s) => s.op === "take" && s.layer === "incidents") as Extract<Step, { op: "take" }> | undefined;
  const f = take?.filter ?? null;

  // past their deadline, and the department holding most of them
  const over = open.filter((h) => h.inc.breached);
  if (over.length && !f?.overdue) {
    const by = new Map<string, number>();
    for (const h of over) by.set(h.inc.dept, (by.get(h.inc.dept) ?? 0) + 1);
    const [d, k] = [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    out.push({ id: "overdue", kind: "overdue", tone: "alert", n: over.length, ids: over.map((h) => h.inc.id),
      en: `${n(over.length)} of the ${n(total)} are past their deadline${by.size > 1 ? `; ${dept(d)} holds ${n(k)} of them` : `, all with ${dept(d)}`}.`,
      ta: `${n(total)} இல் ${n(over.length)} காலக்கெடுவைத் தாண்டியவை; ${dept(d)} இடம் ${n(k)}.`,
      next: { en: `Send these to ${dept(d)}`, ta: `${dept(d)} க்கு அனுப்பு` }, score: 60 + pc(over.length, total) });
  }

  // repeat spots: 3 or more reports within 100 m of each other are usually one problem (clusters for an answer of a
  // few thousand; past that, 100 m grid cells, which one pass finds)
  const pool = open.length >= 3 ? open : hits;
  const spots = (pool.length <= 1200 ? dbscan(pool, 100, 3) : gridSpots(pool)).sort((a, b) => b.length - a.length || (a[0].inc.id < b[0].inc.id ? -1 : 1));
  if (spots.length) {
    const inSpots = spots.flat();
    const top = spots[0];
    const place = mode(top.map((h) => h.inc.place).filter((x): x is string => !!x));
    out.push({ id: "repeat", kind: "repeat", tone: "warn", n: spots.length, ids: inSpots.map((h) => h.inc.id),
      en: `${n(spots.length)} ${spots.length === 1 ? "spot has" : "spots have"} 3 or more reports within 100 m (${n(inSpots.length)} reports): one visit may close several. The largest: ${n(top.length)}${place ? ` near ${place}` : ""}.`,
      ta: `${n(spots.length)} இடங்களில் 100 மீ க்குள் 3+ அறிக்கைகள் (${n(inSpots.length)}): ஒரு வருகையில் பல தீரலாம். பெரியது: ${n(top.length)}${place ? `, ${place}` : ""}.`,
      next: { en: "Show the largest spot", ta: "பெரிய இடத்தைக் காட்டு" }, score: 40 + Math.min(40, inSpots.length * 2) });
  }

  // the change on the period before: reports of this kind in this window against the window before, whatever their
  // status now (comparing what is still open would compare new cases with old ones that have since been closed)
  if (take && f?.period?.kind === "last_days" && f.period.offset === 0 && r.show.type === "incidents" && (r.steps[0]?.count ?? 0) <= 3000) {
    const nowN = rerun(plan, take, { ...f, status: "any" }, w, ctx, lockDept);
    const before = rerun(plan, take, { ...f, status: "any", period: { ...f.period, offset: 1 } }, w, ctx, lockDept);
    if (before != null && nowN != null && nowN !== before) {
      const p = pctChange(nowN, before);
      const days = f.period.days;
      const up = nowN > before;
      const words = p != null ? `${up ? "up" : "down"} ${Math.abs(Math.round(p))} % on the ${days} days before (${n(before)} → ${n(nowN)} reported)`
        : `${n(before)} reported in the ${days} days before, ${n(nowN)} in the last ${days} (too few for a fair percentage)`;
      out.push({ id: "change", kind: "change", tone: up ? "warn" : "good", n: before, ids: [],
        en: `${up ? "Rising" : "Falling"}: ${words}.`, ta: `${up ? "அதிகரிப்பு" : "குறைவு"}: முந்தைய ${days} நாட்களில் ${n(before)} பதிவு, கடந்த ${days} நாட்களில் ${n(nowN)}${p != null ? ` (${Math.abs(Math.round(p))}%)` : ""}.`,
        score: 30 + Math.min(40, Math.abs(p ?? 0) / 2) + (before >= MIN_PCT_BASE ? 5 : 0) });
    }
  }

  // where it is concentrated, and the wards well above their neighbours for this answer
  const byWard = new Map<number, Hit[]>();
  for (const h of hits) if (h.inc.ward != null) (byWard.get(h.inc.ward) ?? byWard.set(h.inc.ward, []).get(h.inc.ward)!).push(h);
  const wards = [...byWard.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  if (wards.length && total >= 8 && wards[0][1].length / total >= 0.12) {
    const [wd, hs] = wards[0];
    out.push({ id: "conc", kind: "concentration", tone: "info", n: hs.length, ids: hs.map((h) => h.inc.id),
      en: `Ward ${wd} alone holds ${n(hs.length)} of the ${n(total)} (${pc(hs.length, total)} %).`, ta: `வார்டு ${wd} இல் மட்டும் ${n(total)} இல் ${n(hs.length)} (${pc(hs.length, total)}%).`,
      next: { en: `What is happening in ward ${wd}?`, ta: `வார்டு ${wd} இல் என்ன நடக்கிறது?`, ask: `ward ${wd} summary` }, score: 25 + pc(hs.length, total) / 2 });
  }
  if (total >= 15 && r.show.type !== "hotspots") {
    const counts = new Map(w.wards.map((x) => [x.ward, byWard.get(x.ward)?.length ?? 0]));
    const z = giStar(counts, new Map(w.wards.map((x) => [x.ward, x.adj])));
    const hot = [...z.entries()].filter(([, v]) => v > GI_HOT).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([wd]) => wd);
    if (hot.length) {
      const ids = hot.flatMap((wd) => (byWard.get(wd) ?? []).map((h) => h.inc.id));
      out.push({ id: "hot", kind: "hot", tone: "warn", n: hot.length, ids,
        en: `Ward${hot.length > 1 ? "s" : ""} ${hot.join(", ")} ${hot.length > 1 ? "are" : "is"} well above ${hot.length > 1 ? "their" : "its"} neighbours for this (${n(ids.length)} cases): a local cause is likely.`,
        ta: `வார்டு ${hot.join(", ")} அண்டை வார்டுகளை விட மிக அதிகம் (${n(ids.length)}): உள்ளூர் காரணம் இருக்கலாம்.`, score: 35 + hot.length * 3 });
    }
  }

  // the facility with the most cases around it (a "within" answer)
  const nearCount = new Map<string, { name: string | null; layer: string; ids: string[] }>();
  // (named facilities only: "an unnamed school" tells the Collector nothing)
  for (const h of hits) if (h.near?.name) { const e = nearCount.get(h.near.id) ?? nearCount.set(h.near.id, { name: h.near.name, layer: h.near.layer, ids: [] }).get(h.near.id)!; e.ids.push(h.inc.id); }
  const within = plan.steps.find((s) => s.op === "within") as Extract<Step, { op: "within" }> | undefined;
  if (within && nearCount.size) {
    const [, top] = [...nearCount.entries()].sort((a, b) => b[1].ids.length - a[1].ids.length || a[0].localeCompare(b[0]))[0];
    if (top.ids.length >= 2) {
      const one = LAYER_WORD[top.layer as keyof typeof LAYER_WORD]?.one ?? "place";
      out.push({ id: "facility", kind: "facility", tone: "info", n: top.ids.length, ids: top.ids,
        en: `Most affected ${one}: ${top.name ?? `an unnamed ${one}`}, with ${n(top.ids.length)} cases within ${within.meters} m.`,
        ta: `அதிகம் பாதிக்கப்பட்டது: ${top.name ?? one}, ${within.meters} மீ க்குள் ${n(top.ids.length)}.`, score: 28 + top.ids.length });
    }
  }

  // who the reports mention: children, a school, a hospital, the elderly (mentions in the text, not distances)
  const vuln = hits.filter((h) => /\b(school|children|child|hospital|elderly|students?)\b/i.test(h.inc.tags ?? ""));
  if (vuln.length && !within) {
    out.push({ id: "vulnerable", kind: "vulnerable", tone: "warn", n: vuln.length, ids: vuln.map((h) => h.inc.id),
      en: `${n(vuln.length)} ${vuln.length === 1 ? "report mentions" : "reports mention"} children, a school, a hospital or the elderly.`,
      ta: `${n(vuln.length)} அறிக்கைகள் குழந்தைகள், பள்ளி, மருத்துவமனை அல்லது முதியோரைக் குறிப்பிடுகின்றன.`, score: 30 + Math.min(30, vuln.length) });
  }

  // severe and still open, when the question did not already ask for severe
  const severe = open.filter((h) => h.inc.sev === "Severe");
  if (severe.length && !f?.severity) {
    out.push({ id: "severe", kind: "severe", tone: "alert", n: severe.length, ids: severe.map((h) => h.inc.id),
      en: `${n(severe.length)} ${severe.length === 1 ? "is" : "are"} severe and still open.`, ta: `${n(severe.length)} கடுமையானவை, இன்னும் திறந்தவை.`,
      next: { en: "Only severe", ta: "கடுமையானவை மட்டும்", ask: "only severe" }, score: 45 + Math.min(30, severe.length * 3) });
  }

  // from citizens
  const cit = hits.filter((h) => h.inc.citizen > 0);
  if (cit.length && !f?.citizen && total >= 5) {
    out.push({ id: "citizen", kind: "citizen", tone: "info", n: cit.length, ids: cit.map((h) => h.inc.id),
      en: `${n(cit.length)} of the ${n(total)} came with citizens' complaints (${pc(cit.length, total)} %).`, ta: `${n(total)} இல் ${n(cit.length)} குடிமக்கள் புகார்களுடன் (${pc(cit.length, total)}%).`,
      score: 12 + pc(cit.length, total) / 10 });
  }
  // each insight's rows in the list's order (priority, newest, id): the answer's own order, looked up once
  const rank = new Map(hits.map((h, k) => [h.inc.id, k]));
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, max)
    .map((x) => ({ ...x, ids: [...new Set(x.ids)].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)) }));
}

/** the same plan with the incidents' filter changed (another window, any status); null when it cannot run */
function rerun(plan: Plan, take: Extract<Step, { op: "take" }>, filter: NonNullable<Extract<Step, { op: "take" }>["filter"]>, w: World, ctx: Ctx, lockDept: string | null): number | null {
  try {
    const p: Plan = { ...plan, steps: plan.steps.map((s) => (s === take ? { ...take, filter } : s)) };
    return runMapPlan(p, w, ctx, lockDept).hits.length;
  } catch { return null; }
}

/** 100 m grid cells holding 3 or more exact places, for very large answers */
function gridSpots(hits: Hit[]): Hit[][] {
  const cells = new Map<string, Hit[]>();
  for (const h of hits) {
    if (!h.inc.pinnable) continue;
    const k = `${Math.floor(h.inc.lat / 0.0009)},${Math.floor(h.inc.lon / 0.000925)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(h);
  }
  return [...cells.values()].filter((c) => c.length >= 3);
}

function mode(xs: string[]): string | null {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}
