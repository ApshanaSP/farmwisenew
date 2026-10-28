/**
 * Ask the Map's answer: the headline count ("N … · map layer ready"), one sentence of meaning, the responsible
 * departments and the nearest miss when nothing matched. Built from a fact pack by templates in English, Tamil and
 * Tanglish; every number comes from the executor. An AI model may reword the sentence (ai.ts), and its numbers are
 * then checked against the same facts. Pure.
 */
import { fmtDistance, haversineM } from "./geom";
import { areaLabel, filterWords, runMapPlan, type Ctx, type Hit, type Near, type RunResult } from "./execute";
import type { Plan, Step } from "./plan";
import type { World } from "./types";
import { CAT_TA, LAYER_WORD, isTa, periodWords, type Lang } from "./words";
import { MIN_PCT_BASE, pctChange } from "@/lib/reference/metrics";

export const LAYER_READY = { en: "map layer ready", ta: "வரைபட அடுக்கு தயார்", tanglish: "map layer ready" } as const;

export interface Fact { id: string; value: number; label: string }
export interface Answer {
  /** the count the headline states (also the list's length) */
  count: number;
  headline: string;
  meaning: string | null;
  /** departments holding the answer's incidents, most first */
  depts: { code: string; name: string; n: number }[];
  /** for an empty answer: the closest miss, so the camera can go there */
  miss: { lat: number; lon: number; m: number; name: string | null; id: string } | null;
  facts: Fact[];
  lang: Lang;
}

const n = (x: number) => x.toLocaleString("en-IN");
const take0 = (plan: Plan) => plan.steps.find((s) => s.op === "take" && s.layer === "incidents") as Extract<Step, { op: "take" }> | undefined;

/** The nearest facility to any of the step's incidents, for "no results within 300 m; the closest is 420 m from …". */
export function nearestMiss(plan: Plan, r: RunResult, w: World, ctx: Ctx): Answer["miss"] {
  const s = plan.steps.find((x) => x.op === "within") as Extract<Step, { op: "within" }> | undefined;
  if (!s || r.hits.length) return null;
  const src = runPrefixHits(plan, s.of, w, ctx);
  const facs = s.near.flatMap((name) => {
    const t = plan.steps.find((x) => x.as === name);
    if (t?.op !== "take") return [];
    if (t.layer === "water_bodies") return w.water.map((f) => ({ id: f.id, name: f.name, lat: f.lat, lon: f.lon }));
    const pts = (w.points as Record<string, { id: string; name: string | null; lat: number; lon: number; kind: string; government?: boolean }[]>)[t.layer] ?? [];
    return pts.filter((p) => (!t.where?.kinds?.length || t.where.kinds.includes(p.kind)) && (t.where?.government == null || !!p.government === t.where.government));
  });
  let best: Answer["miss"] = null;
  for (const h of src) {
    if (!h.inc.pinnable) continue;
    for (const f of facs) {
      const m = haversineM(h.inc, f);
      if (!best || m < best.m) best = { lat: h.inc.lat, lon: h.inc.lon, m, name: f.name, id: h.inc.id };
    }
  }
  return best;
}
// the executor is pure, so re-running the prefix of a plan is cheap and gives the same rows
function runPrefixHits(plan: Plan, upTo: string, w: World, ctx: Ctx): Hit[] {
  const i = plan.steps.findIndex((s) => s.as === upTo);
  return runMapPlan({ steps: plan.steps.slice(0, i + 1), show: upTo, language: plan.language }, w, ctx).hits;
}

function deptsOf(hits: Hit[], w: World) {
  const m = new Map<string, number>();
  for (const h of hits) m.set(h.inc.dept, (m.get(h.inc.dept) ?? 0) + 1);
  return [...m.entries()].map(([code, k]) => ({ code, name: w.depts.get(code)?.name ?? code, n: k })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
}
function zonesOf(hits: Hit[], w: World) {
  const m = new Map<number, number>();
  for (const h of hits) if (h.inc.zone != null) m.set(h.inc.zone, (m.get(h.inc.zone) ?? 0) + 1);
  return [...m.entries()].map(([z, k]) => ({ zone: z, name: w.zones.find((x) => x.zone === z)?.name ?? `Zone ${z}`, n: k })).sort((a, b) => b.n - a.n || a.zone - b.zone);
}

/** What the incidents are, in words: "open Flooding & waterlogging reports" / Tamil. */
function subject(plan: Plan, w: World, lang: Lang, n = 2): string {
  const s = subjectMany(plan, w, lang);
  return n === 1 && lang !== "ta" ? s.replace(/complaints$/, "complaint").replace(/incidents$/, "incident") : s;
}
function subjectMany(plan: Plan, w: World, lang: Lang): string {
  const t = take0(plan);
  const f = t?.filter ?? null;
  const ta = isTa(lang);
  const cats = f?.category?.length ? f.category.map((c) => (ta ? CAT_TA[c] ?? c : (w.cats.get(c)?.label ?? c).toLowerCase())).join(", ") : f?.family?.length ? (ta ? "வெள்ளம்" : f.family.join(", ").toLowerCase().replace("flood", "flooding")) : "";
  const st = f?.status === "open" ? (ta ? "திறந்த " : "open ") : f?.status === "closed" ? (ta ? "முடிந்த " : "closed ") : "";
  const sev = f?.severity?.length === 1 ? (ta ? "கடுமையான " : "severe ") : f?.severity?.length ? (ta ? "கடுமையான/அதிக " : "severe or high ") : "";
  const noun = f?.citizen ? (ta ? "புகார்கள்" : "complaints") : ta ? "சம்பவங்கள்" : "incidents";
  return ta ? `${st}${sev}${cats ? cats + " " : ""}${noun}` : `${st}${sev}${cats ? cats + " " : ""}${noun}`.replace(/\s+/g, " ").trim();
}
const periodTail = (plan: Plan, lang: Lang) => {
  const p = take0(plan)?.filter?.period ?? null;
  return p ? ` (${periodWords(p, lang)})` : "";
};

/** The answer for a run. */
export function compose(plan: Plan, r: RunResult, w: World, ctx: Ctx): Answer {
  const lang = plan.language;
  const ta = isTa(lang), tg = lang === "tanglish";
  const show = r.show;
  const last = plan.steps.find((s) => s.as === plan.show)!;
  const subj = subject(plan, w, lang, r.hits.length);
  const per = periodTail(plan, lang);
  const ready = LAYER_READY[lang];
  const facts: Fact[] = [];
  const fact = (id: string, value: number, label: string) => { facts.push({ id, value, label }); return value; };
  const depts = deptsOf(r.hits, w);
  const zones = zonesOf(r.hits, w);
  let headline = "", meaning: string | null = null, count = r.hits.length, miss: Answer["miss"] = null;

  const meaningOf = (extra = "") => {
    if (!r.hits.length) return null;
    const z = zones.slice(0, 2);
    const d = depts[0];
    if (ta) return `${z.length ? `பெரும்பாலானவை ${z.map((x) => `${x.name} (${n(x.n)})`).join(", ")} மண்டலங்களில்${extra}` : ""}${d ? `; ${d.name} துறையிடம் ${n(d.n)}` : ""}.`;
    if (tg) return `${z.length ? `Neraya ${z.map((x) => `${x.name} (${n(x.n)})`).join(", ")} zone-la${extra}` : ""}${d ? `; ${d.name} kitta ${n(d.n)}` : ""}.`;
    return `${z.length ? `Most are in ${z.map((x) => `${x.name} (${n(x.n)})`).join(" and ")}${extra}` : ""}${d ? `; ${d.name} holds ${n(d.n)} of them` : ""}.`;
  };

  switch (last.op) {
    case "within": {
      fact("count", count, "results");
      const facs = r.context.points.length + r.context.polys.length + r.context.lines.length;
      fact("places", facs, "places with one nearby");
      const what = last.near.map((nm) => plan.steps.find((s) => s.as === nm)).filter((s): s is Extract<Step, { op: "take" }> => s?.op === "take")
        .map((s) => (ta ? LAYER_WORD[s.layer].ta_one : `${s.where?.government ? "government " : ""}${LAYER_WORD[s.layer].one}`));
      const d = fmtDistance(last.meters, lang === "ta" ? "ta" : "en");
      if (!count) {
        miss = nearestMiss(plan, r, w, ctx);
        headline = ta ? `${d} க்குள் ${what.join(" / ")} அருகே ${subj} எதுவும் இல்லை${per}.` : tg ? `${d} kulla ${what.join(" / ")} pakkathula ${subj} edhuvum illa${per}.`
          : `No ${subj} within ${d} of a ${what.join(" or ")}${per}.`;
        if (miss) meaning = ta ? `மிக அருகில் உள்ளது ${miss.name ?? what[0]} இலிருந்து ${fmtDistance(miss.m, "ta")}.` : `The closest is ${fmtDistance(miss.m)} from ${miss.name ?? `a ${what[0]}`}.`;
        break;
      }
      headline = ta ? `${what.join(" / ")} இலிருந்து ${d} க்குள் ${n(count)} ${subj}${per} · ${ready}.`
        : tg ? `${d} kulla ${what.join(" / ")} pakkathula ${n(count)} ${subj} irukku${per} · ${ready}.`
          : `${n(count)} ${subj} ${count === 1 ? "is" : "are"} within ${d} of a ${what.join(" or ")}${per} · ${ready}.`;
      const one = last.near.length === 1 ? plan.steps.find((s) => s.as === last.near[0]) : null;
      const lw = one?.op === "take" ? LAYER_WORD[one.layer] : null;
      const facWord = lw ? (facs === 1 ? lw.one : lw.en) : facs === 1 ? "place" : "places";
      meaning = meaningOf(ta ? `, ${facs} ${lw?.ta ?? "இடங்கள்"} அருகே` : tg ? `, ${facs} ${facWord} pakkathula` : `, near ${n(facs)} ${facWord}`);
      break;
    }
    case "inside": case "along": {
      fact("count", count, "results");
      const where = last.op === "inside" ? areaLabel(last.area, w, ctx) : (() => {
        const l = [...w.lines.roads, ...w.lines.waterways].find((x) => x.id === last.line);
        const nm = l?.name ?? last.line.replace(/^gcc:/, "");
        return { en: `within ${fmtDistance(last.meters)} of ${nm}`, ta: `${l?.name_ta ?? nm} இலிருந்து ${fmtDistance(last.meters, "ta")} க்குள்` };
      })();
      const inWord = last.op === "inside" && (last.area.kind === "ward" || last.area.kind === "zone" || last.area.kind === "taluk") ? "in " : "";
      if (!count) {
        headline = ta ? `${where.ta} ${subj} எதுவும் இல்லை${per}.` : tg ? `${inWord}${where.en} ${subj} edhuvum illa${per}.` : `No ${subj} ${inWord}${where.en}${per}.`;
        break;
      }
      headline = ta ? `${where.ta} ${n(count)} ${subj}${per} · ${ready}.` : tg ? `${inWord}${where.en} ${n(count)} ${subj} irukku${per} · ${ready}.`
        : `${n(count)} ${subj} ${inWord}${where.en}${per} · ${ready}.`;
      meaning = meaningOf();
      break;
    }
    case "nearest": {
      if (show.type !== "nearest") break;
      const lw = LAYER_WORD[show.layer];
      if (show.origin) {
        const to = show.pairs[0]?.to ?? [];
        count = to.length;
        fact("count", count, "facilities");
        to.forEach((x, i) => fact(`d${i}`, Math.round(x.m), "metres"));
        headline = ta ? `${show.origin.name_ta ?? show.origin.name} அருகிலுள்ள ${to.length} ${lw.ta}: முதலாவது ${to[0]?.name ?? lw.ta_one}, ${fmtDistance(to[0]?.m ?? NaN, "ta")} · ${ready}.`
          : `The ${to.length === 1 ? `nearest ${lw.one}` : `${to.length} nearest ${lw.en}`} to ${show.origin.name}: ${to[0]?.name ?? `a ${lw.one}`} at ${fmtDistance(to[0]?.m ?? NaN)}${to.length > 1 ? `, the farthest of them ${fmtDistance(to[to.length - 1].m)}` : ""} · ${ready}.`;
        meaning = ta ? "நேர்கோட்டுத் தூரம்; பயண நேரத்திற்கு Google Maps ஐப் பார்க்கவும்." : "Straight-line distance; open Google Maps for travel time.";
        break;
      }
      fact("count", count, "results");
      const ds = show.pairs.map((p) => p.to[0]?.m).filter((x): x is number => x != null).sort((a, b) => a - b);
      const far = show.pairs.filter((p) => p.to[0]).sort((a, b) => b.to[0].m - a.to[0].m)[0];
      if (!count) { headline = ta ? `${subj} எதுவும் இல்லை${per}.` : `No ${subj}${per}.`; break; }
      const med = ds[Math.floor((ds.length - 1) / 2)];
      fact("median", Math.round(med), "metres");
      headline = ta ? `${n(count)} ${subj}${per}; அருகிலுள்ள ${lw.ta_one} நடுநிலைத் தூரம் ${fmtDistance(med, "ta")} · ${ready}.`
        : `${n(count)} ${subj}${per}; the nearest ${lw.one} is a median ${fmtDistance(med)} away · ${ready}.`;
      if (far) meaning = ta ? `மிகத் தொலைவில்: "${far.hit!.inc.title}", ${far.to[0].name ?? lw.ta_one} இலிருந்து ${fmtDistance(far.to[0].m, "ta")}.`
        : `The farthest from one: "${far.hit!.inc.title}", ${fmtDistance(far.to[0].m)} from ${far.to[0].name ?? `a ${lw.one}`}.`;
      break;
    }
    case "farthest": {
      if (show.type !== "areas") break;
      const lw = LAYER_WORD[show.from];
      count = show.areas.length;
      const top = show.areas[0];
      fact("count", count, "areas");
      if (show.beyond != null) {
        headline = !count
          ? (ta ? `எல்லாப் பகுதிகளும் ${lw.ta_one} இலிருந்து ${fmtDistance(show.beyond, "ta")} க்குள் உள்ளன.` : `Every ${show.by} is within ${fmtDistance(show.beyond)} of a ${lw.one} for 90 % of its ground.`)
          : ta ? `${n(count)} ${show.by === "ward" ? "வார்டுகளில்" : "மண்டலங்களில்"} ${fmtDistance(show.beyond, "ta")} க்குள் ${lw.ta_one} இல்லை · ${ready}.`
            : `${n(count)} ${show.by}s have no ${lw.one} within ${fmtDistance(show.beyond)} for much of their ground · ${ready}.`;
      } else if (top) {
        fact("p90", Math.round(top.p90), "metres");
        headline = ta ? `${top.label_ta} ${lw.ta_one} இலிருந்து மிகத் தொலைவில்: அதன் 90% நிலம் ${fmtDistance(top.p90, "ta")} க்குள் · ${ready}.`
          : `${top.label} is the farthest from a ${lw.one}: 90 % of it is within ${fmtDistance(top.p90)} · ${ready}.`;
      }
      if (top && show.best) meaning = ta ? `மாவட்டத்தின் சிறந்த பகுதி ${show.best.label_ta}: ${fmtDistance(show.best.p90, "ta")}.` : `The district's best ${show.by} is ${show.best.label}: ${fmtDistance(show.best.p90)}.`;
      // OpenStreetMap is not an official register: say how many it lists, once, where it matters
      if (w.meta[show.from]?.source === "OpenStreetMap") {
        const inside = (w.points as Record<string, { in_district: boolean }[]>)[show.from]?.filter((p) => p.in_district).length ?? 0;
        meaning = `${meaning ?? ""} ${ta ? `OpenStreetMap மாவட்டத்தில் ${inside} ${lw.ta} மட்டுமே காட்டுகிறது; விடுபட்டவை இருக்கலாம்.` : `OpenStreetMap lists ${inside} ${lw.en} in the district; any it misses would bring these distances down.`}`.trim();
      }
      break;
    }
    case "count_by": {
      if (show.type !== "groups") break;
      const g = show.groups;
      fact("count", count, "results");
      fact("groups", g.length, "areas");
      if (g[0]) fact("top", g[0].n, "in the top area");
      const unit = show.by === "hex500" ? (ta ? "500 மீ கட்டங்கள்" : "500 m cells") : ta ? { ward: "வார்டுகள்", zone: "மண்டலங்கள்", taluk: "வட்டங்கள்" }[show.by] : `${show.by}s`;
      headline = !count ? (ta ? `${subj} எதுவும் இல்லை${per}.` : `No ${subj}${per}.`)
        : ta ? `${n(count)} ${subj}${per}, ${g.length} ${unit}; அதிகம் ${g[0].label_ta} (${n(g[0].n)}) · ${ready}.`
          : tg ? `${n(count)} ${subj}${per}, ${g.length} ${unit}-la; adhigam ${g[0].label} (${n(g[0].n)}) · ${ready}.`
            : `${n(count)} ${subj}${per} across ${g.length} ${unit}; the most in ${g[0].label} (${n(g[0].n)}) · ${ready}.`;
      if (g.length > 1) meaning = ta ? `அடுத்து ${g.slice(1, 3).map((x) => `${x.label_ta} (${n(x.n)})`).join(", ")}.` : `Next: ${g.slice(1, 3).map((x) => `${x.label} (${n(x.n)})`).join(", ")}.`;
      if (show.unassigned.length) meaning = `${meaning ?? ""} ${ta ? `${show.unassigned.length} க்கு பதிவான பகுதி இல்லை.` : `${n(show.unassigned.length)} have no ${show.by} on record.`}`.trim();
      break;
    }
    case "hotspot": {
      if (show.type !== "hotspots") break;
      const c = show.clusters;
      fact("count", count, "results");
      fact("clusters", c.length, "clusters");
      if (c[0]) fact("largest", c[0].n, "reports in the largest");
      headline = !c.length
        ? (ta ? `${subj}${per}: 250 மீ க்குள் 3+ கொண்ட கொத்து எதுவும் இல்லை.` : `No clusters of ${subj}${per}: no 3 or more within 250 m of each other.`)
        : ta ? `${subj}${per}: ${c.length} கொத்துகள்; பெரியதில் ${n(c[0].n)} அறிக்கைகள்${c[0].place ? `, ${c[0].place} அருகே` : ""} · ${ready}.`
          : `${n(c.length)} ${c.length === 1 ? "cluster" : "clusters"} of ${subj}${per}; the largest has ${n(c[0].n)} reports${c[0].place ? ` near ${c[0].place}` : ""} · ${ready}.`;
      const hw = show.hotWards.slice(0, 3);
      if (hw.length) meaning = ta ? `அண்டை வார்டுகளை விட அதிகம்: ${hw.map((x) => `வார்டு ${x.ward} (${n(x.n)})`).join(", ")}.`
        : `More than usual for their neighbours: ${hw.map((x) => `Ward ${x.ward} (${n(x.n)})`).join(", ")}.`;
      break;
    }
    case "compare": {
      if (show.type !== "compare") break;
      fact("a", show.a.n, show.a.label);
      fact("b", show.b.n, show.b.label);
      count = show.a.n + show.b.n;
      const diff = show.a.n === show.b.n ? (ta ? "சமம்" : "the same") : null;
      headline = ta ? `${subj}${per}: ${show.a.label_ta} ${n(show.a.n)}, ${show.b.label_ta} ${n(show.b.n)} · ${ready}.`
        : `${cap(subj)}${per}: ${show.a.label} ${n(show.a.n)}, ${show.b.label} ${n(show.b.n)} · ${ready}.`;
      meaning = diff ? (ta ? "இரண்டும் சமம்." : "Both have the same number.")
        : ta ? `${show.a.n > show.b.n ? show.a.label_ta : show.b.label_ta} இல் அதிகம்.`
          : `${show.a.n > show.b.n ? show.a.label : show.b.label} has ${n(Math.abs(show.a.n - show.b.n))} more.`;
      break;
    }
    case "change": {
      if (show.type !== "change") break;
      const a = show.now.hits.length, b = show.before.hits.length;
      fact("now", a, periodWords(show.now.period, "en"));
      fact("before", b, periodWords(show.before.period, "en"));
      const pc = pctChange(a, b);
      if (pc != null) fact("pct", Math.abs(Math.round(pc)), "per cent");
      const subjNoPer = subject(plan, w, lang);
      const dir = a > b ? (ta ? "அதிகரிப்பு" : "up") : a < b ? (ta ? "குறைவு" : "down") : ta ? "மாற்றமில்லை" : "no change";
      headline = ta ? `${subjNoPer}: ${periodWords(show.now.period, "ta")} ${n(a)}, ${periodWords(show.before.period, "ta")} ${n(b)} (${dir}${pc != null && a !== b ? ` ${Math.abs(Math.round(pc))}%` : ""}) · ${ready}.`
        : a === b ? `${n(a)} ${subjNoPer} in the ${periodWords(show.now.period, "en")}, the same as the ${periodWords(show.before.period, "en")} · ${ready}.`
          : `${n(a)} ${subjNoPer} in the ${periodWords(show.now.period, "en")}, ${dir} from ${n(b)} in ${periodWords(show.before.period, "en")}${pc != null ? ` (${pc > 0 ? "+" : "−"}${Math.abs(Math.round(pc))} %)` : ""} · ${ready}.`;
      if (pc == null && a !== b) meaning = ta ? `ஒப்பிட எண்ணிக்கை குறைவு (${MIN_PCT_BASE} க்குக் கீழ்), எனவே சதவீதம் காட்டப்படவில்லை.` : `Too few before (under ${MIN_PCT_BASE}) for a fair percentage, so counts are given instead.`;
      break;
    }
    default: {
      fact("count", count, "results");
      headline = !count ? (ta ? `${subj} எதுவும் இல்லை${per}.` : tg ? `${subj} edhuvum illa${per}.` : `No ${subj}${per}.`)
        : ta ? `${n(count)} ${subj}${per} · ${ready}.` : tg ? `${n(count)} ${subj} irukku${per} · ${ready}.` : `${n(count)} ${subj}${per} · ${ready}.`;
      meaning = meaningOf();
    }
  }
  if (r.leftOut && !["farthest"].includes(last.op)) facts.push({ id: "unplaced", value: r.leftOut, label: "no exact place" });
  return { count, headline: headline.replace(/\s+/g, " ").trim(), meaning, depts, miss, facts, lang };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export { filterWords };
export type { Near };
