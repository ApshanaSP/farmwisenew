/**
 * "What changed since yesterday / this week", with where the change sits (ULTIMATE_JARVIS.md Pillar 3). The window the console holds
 * (the last 24 hours, 7, 30 or 90 days) against the window of the same length just before it. The change in incidents reported is split
 * three ways, by zone, by department and by kind, each split on its own: every segment's share of the change and how surprising its move
 * was (Adtributor-style, adtributor.ts), the splits ranked, and every count tested against its usual range (an exact two-count test with a
 * minimum count). A link is said as "linked with" or "after", never as a cause. Every figure comes from code and is on the screen; the
 * spoken line is 2 to 4 short sentences in English and in spoken Tamil (docs/qa/JARVIS_VOICE.md).
 *
 * Any other metric of the registry that has a figure before (metrics.ts, `slots.measure`) gets the same screen without the split.
 */
import { spoken } from "../insight";
import { computeMetric, deltaOf, metricById } from "../metrics";
import { caseRow } from "../screens";
import type { BlockT, Bilingual, NextStepT } from "../stage";
import { explanatorySet, rankSets, scoreSplit, unusual, type Band, type Dim, type ExplanatorySet, type Scored, type Segment } from "./adtributor";
import { RAIN_KINDS, bi, call, catName, clip, inTa, langFor, num, pick, scopeArg, segIn, segName, segSpoken, stepFor, windowWords, zoneName,
  type Lang, type RecipeCtx, type RecipePart, type Row } from "./common";

/** how many departments are split out (each costs one change_drivers read); the rest are "other departments" */
export const DEPTS_SPLIT = 4;

export interface Seg extends Scored { name: Bilingual; said: Bilingual }
export interface Split { dim: Dim; segs: Seg[]; set: ExplanatorySet | null; dropped: Bilingual | null }
export interface Flag { seg: Seg | null; flag: "high" | "low"; band: Band; p: number; now: number; before: number }
export interface ChangeAnalysis {
  total: { now: number; before: number; delta: number; pct: number | null; flag: "high" | "low" | null; band: Band; p: number };
  severe: { now: number; before: number | null } | null;
  rain: { days: number | null; daysBefore: number | null; linked: number | null };
  splits: Split[];
  /** each split's explanatory set, the most telling first */
  sets: ExplanatorySet[];
  /** the segments that explain the change, the most telling split first (at most 4) */
  drivers: Seg[];
  /** counts outside their usual range, the clearest first (null seg: the total) */
  flags: Flag[];
  /** the open incidents that rank highest in the scope (change_drivers.top) */
  top: Row[];
}

const DIM_WORD: Record<Dim, Bilingual> = { zone: bi("zone", "மண்டல"), dept: bi("department", "துறை"), cat: bi("kind", "வகை") };

/** Split a total into named segments plus the rest; null with a reason when the parts do not add up to the whole. */
function withRest(dim: Dim, segs: Segment[], now: number, before: number): { segs: Segment[]; dropped: Bilingual | null } {
  const sumNow = segs.reduce((a, s) => a + s.now, 0), sumBefore = segs.reduce((a, s) => a + s.before, 0);
  const restNow = now - sumNow, restBefore = before - sumBefore;
  const what = DIM_WORD[dim];
  if (restNow < 0 || restBefore < 0) return { segs: [], dropped: bi(`The ${what.en} figures do not add up to the total, so the change is not split by ${what.en}.`, `${what.ta}வாரி எண்ணிக்கைகள் மொத்தத்துடன் பொருந்தவில்லை; அதனால் ${what.ta}வாரியாகப் பிரிக்கவில்லை.`) };
  return { segs: restNow || restBefore ? [...segs, { dim, key: `other-${dim}`, now: restNow, before: restBefore, other: true }] : segs, dropped: null };
}

/**
 * The change and where it sits, computed by code from the read tools: change_drivers for the totals and the kinds, the zone table for
 * the zones (each with its count before), change_drivers once per department for the biggest departments.
 */
export async function analyseChange(c: RecipeCtx): Promise<ChangeAnalysis> {
  const { s, w } = c;
  const [drv, zr, deps] = await Promise.all([
    call(c, "change_drivers", { scope: scopeArg(s) }),
    s.zone ? Promise.resolve(null) : call(c, "zones", { scope: scopeArg({ ...s, zone: null }) }).catch(() => null),
    s.dept ? Promise.resolve(null) : call(c, "departments", { scope: scopeArg(s) }).catch(() => null)
  ]);
  const d = (drv.data ?? {}) as Row;
  const t = (d.totals ?? {}) as Row;
  const now = num(t.n), before = num(t.prev);
  if (now == null || before == null) throw new Error("change_drivers gave no totals for the two windows");
  const codes = ((deps?.data as Row | undefined)?.rows ?? []).filter((x: Row) => (num(x.n) ?? 0) > 0 && x.code)
    .sort((a: Row, b: Row) => (num(b.n) ?? 0) - (num(a.n) ?? 0)).slice(0, DEPTS_SPLIT) as Row[];
  const perDept = await Promise.all(codes.map((x) => call(c, "change_drivers", { scope: scopeArg({ ...s, dept: String(x.code) }) }).catch(() => null)));

  const raw: { dim: Dim; segs: Segment[]; labels: Map<string, string>; dropped: Bilingual | null }[] = [];
  if (!s.cat) {
    const cats = ((d.categories ?? []) as Row[]).filter((x) => x.code && num(x.n) != null && num(x.prev) != null);
    raw.push({ dim: "cat", segs: cats.map((x) => ({ dim: "cat" as Dim, key: String(x.code), now: Number(x.n), before: Number(x.prev) })), labels: new Map(cats.map((x) => [String(x.code), clip(x.label, 80)])), dropped: null });
  }
  if (!s.zone) {
    const rows = ((zr?.data as Row | undefined)?.rows ?? []) as Row[];
    const full = rows.length > 0 && rows.every((x) => num(x.zone) != null && num(x.n) != null && num(x.n_prev) != null);
    raw.push(full ? { dim: "zone", segs: rows.map((x) => ({ dim: "zone" as Dim, key: String(Number(x.zone)), now: Number(x.n), before: Number(x.n_prev) })), labels: new Map(rows.map((x) => [String(Number(x.zone)), clip(x.name, 80)])), dropped: null }
      : { dim: "zone", segs: [], labels: new Map(), dropped: zr ? bi("The zone table has no count for the window before, so the change is not split by zone.", "மண்டல அட்டவணையில் முந்தைய காலத்தின் எண்ணிக்கை இல்லை; அதனால் மண்டலவாரியாகப் பிரிக்கவில்லை.") : null });
  }
  if (!s.dept && codes.length) {
    const segs: Segment[] = [];
    let missing = false;
    codes.forEach((x, i) => {
      const tt = ((perDept[i]?.data as Row | undefined)?.totals ?? null) as Row | null;
      if (!tt || num(tt.n) == null || num(tt.prev) == null) { missing = true; return; }
      segs.push({ dim: "dept", key: String(x.code), now: Number(tt.n), before: Number(tt.prev) });
    });
    raw.push(missing ? { dim: "dept", segs: [], labels: new Map(), dropped: bi("A department's count could not be read, so the change is not split by department.", "ஒரு துறையின் எண்ணிக்கையைப் படிக்க முடியவில்லை; அதனால் துறைவாரியாகப் பிரிக்கவில்லை.") }
      : { dim: "dept", segs, labels: new Map(codes.map((x) => [String(x.code), clip(x.name, 80)])), dropped: null });
  }

  const splits: Split[] = raw.map((r) => {
    if (r.dropped || !r.segs.length) return { dim: r.dim, segs: [], set: null, dropped: r.dropped };
    const rest = withRest(r.dim, r.segs, now, before);
    if (rest.dropped) return { dim: r.dim, segs: [], set: null, dropped: rest.dropped };
    const segs = scoreSplit(rest.segs, now, before).map((x) => ({ ...x, name: x.other ? bi("Others", "மற்றவை") : segName(w, x.dim, x.key, r.labels.get(x.key)),
      said: x.other ? bi("the others", "மற்றவை") : segSpoken(w, x.dim, x.key, r.labels.get(x.key)) }));
    return { dim: r.dim, segs, set: explanatorySet(segs), dropped: null };
  });
  for (const sp of splits) if (sp.dropped) c.notes.push(pick(langFor(c), sp.dropped));

  const ranked = rankSets(splits.map((x) => x.set));
  const drivers: Seg[] = [];
  for (const set of ranked) for (const it of set.items) if (drivers.length < 4) drivers.push(it as Seg);

  const tot = unusual(now, before);
  const flags: Flag[] = [];
  if (tot.flag) flags.push({ seg: null, flag: tot.flag, band: tot.band, p: tot.p, now, before });
  for (const sp of splits) for (const x of sp.segs) {
    if (x.other) continue;
    const u = unusual(x.now, x.before);
    if (u.flag) flags.push({ seg: x, flag: u.flag, band: u.band, p: u.p, now: x.now, before: x.before });
  }
  flags.sort((a, b) => a.p - b.p);
  const sev = num(t.severe);
  return {
    total: { now, before, delta: now - before, pct: deltaOf(now, before).pct, flag: tot.flag, band: tot.band, p: tot.p },
    severe: sev == null ? null : { now: sev, before: num(t.severePrev) },
    rain: { days: num(d.rainDays), daysBefore: num(d.rainDaysPrev), linked: num(t.rainLinked) },
    splits, sets: ranked, drivers, flags, top: ((d.top ?? []) as Row[]).slice(0, 5)
  };
}

const pctOf = (ep: number | null) => (ep == null ? null : Math.round(ep * 100));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The spoken line: what moved, where most of it sits, whether anything is outside its usual range, what I'd do. 2 to 4 sentences. */
export function changeSay(a: ChangeAnalysis, c: Pick<RecipeCtx, "w" | "s">): Bilingual {
  const { w, s } = c;
  const win = windowWords(s.period);
  const T = a.total;
  const dir = T.delta > 0 ? "up" : T.delta < 0 ? "down" : "level";
  const cat = catName(w, s.cat);
  const zone = zoneName(w, s.zone);
  const subject = cat ? bi(`${cat.en} reports`, `${cat.ta} புகார்கள்`) : bi("Incidents", "சம்பவங்கள்");
  const where = zone ? bi(` in ${zone.en}`, `${inTa(zone.ta)} `) : bi("", "");
  const en: string[] = [], ta: string[] = [];
  en.push(dir === "level" ? `${subject.en}${where.en} are level: ${spoken(T.now)} ${win.inNow.en}, the same as ${win.before.en}.`
    : `${subject.en}${where.en} are ${dir}: ${spoken(T.now)} ${win.inNow.en} against ${spoken(T.before)} ${win.before.en}.`);
  ta.push(`${where.ta}${win.now.ta} ${spoken(T.now)} ${subject.ta} வந்திருக்கு, ${win.before.ta} ${spoken(T.before)}; ${dir === "up" ? "கூடியிருக்கு" : dir === "down" ? "குறைஞ்சிருக்கு" : "அதே அளவுதான்"}.`);
  const more = (x: Seg) => (x.delta > 0 ? bi("more", "கூட") : bi("fewer", "குறைவு"));
  // where most of it sits: the most telling split's first segment, then its second or the next split's first
  const lead = a.drivers.slice(0, 2);
  if (dir !== "level" && lead.length) {
    // "most" only when the lead split's set explains most of the change (each split's shares add up to 1 on their own)
    const most = (lead[0].ep ?? 0) >= 0.5 || !!a.sets[0]?.covers ? "Most" : "Part";
    const enOf = (x: Seg) => `${x.dim === "dept" ? "with" : "in"} ${x.said.en} (${spoken(Math.abs(x.delta))} ${more(x).en})`;
    en.push(`${most} of the ${dir === "up" ? "rise" : "fall"} is ${lead.map(enOf).join(", and ")}.`);
    ta.push(`${dir === "up" ? "கூடினதுல" : "குறைஞ்சதுல"} ${most === "Most" ? "பெரும்பகுதி" : "ஒரு பகுதி"} ${lead.map((x) => `${segIn(x.dim, x.said.ta)} ${spoken(Math.abs(x.delta))} ${more(x).ta}`).join("; ")}.`);
  }
  // outside the usual range, with rain said as a link in time
  const f = a.flags[0];
  const rainy = a.rain.linked != null && a.rain.linked > 0 && dir === "up" && a.drivers.some((x) => x.dim === "cat" && RAIN_KINDS.has(x.key));
  const rainEn = rainy ? `${spoken(a.rain.linked as number)} of the incidents came during or after rain` : "";
  const rainTa = rainy ? `${spoken(a.rain.linked as number)} சம்பவங்கள் மழை நேரத்துலயோ அதுக்கு அப்புறமோ வந்திருக்கு` : "";
  if (f) {
    const name = f.seg ? f.seg.said : bi(`${subject.en.toLowerCase()}${where.en || " across the district"}`, `${where.ta}${subject.ta}`);
    const cap = name.en.charAt(0).toUpperCase() + name.en.slice(1);
    en.push(`${cap} ${f.seg ? "is" : "are"} ${f.flag === "high" ? "above" : "below"} the usual range${rainEn ? `, and ${rainEn}` : ""}.`);
    ta.push(`${f.seg ? segIn(f.seg.dim, f.seg.said.ta) : name.ta} வழக்கமான அளவை விட ${f.flag === "high" ? "அதிகம்" : "குறைவு"}${rainTa ? `; ${rainTa}` : ""}.`);
  } else if (dir !== "level") {
    en.push(`None of it is outside the usual range${rainEn ? `, though ${rainEn}` : ""}.`);
    ta.push(`இதுல எதுவும் வழக்கமான அளவுக்கு வெளியே இல்லை${rainTa ? `; ஆனா ${rainTa}` : ""}.`);
  }
  // what I'd do
  const top = a.drivers[0];
  const kind = a.drivers.find((x) => x.dim === "cat");
  const holder = a.drivers.find((x) => x.dim === "dept");
  const placeSeg = a.drivers.find((x) => x.dim === "zone");
  if (dir === "up" && top) {
    const step = kind ? stepFor(kind.key) : holder ? stepFor(null, holder.key, holder.name.en) : null;
    if (step && placeSeg) { en.push(`I'd ${step.en}, starting in ${placeSeg.said.en}.`); ta.push(`${inTa(placeSeg.said.ta)} இருந்து ஆரம்பிக்கலாம்: ${step.ta}.`); }
    else if (step) { en.push(`I'd ${step.en}.`); ta.push(`${step.ta}.`); }
    else if (placeSeg) { en.push(`I'd start with ${placeSeg.said.en}; say "explain" and I'll go through it.`); ta.push(`${inTa(placeSeg.said.ta)} இருந்து ஆரம்பிக்கலாம்; "விளக்கு"ன்னு சொன்னா விவரமா சொல்றேன்.`); }
  } else if (dir === "down") {
    const riser = a.splits.flatMap((x) => x.segs).filter((x) => !x.other && x.delta > 0).sort((x, y) => y.delta - x.delta)[0];
    if (riser) { en.push(`I'd keep an eye on ${riser.said.en}, which went the other way.`); ta.push(`${riser.dim === "zone" ? inTa(riser.said.ta) : riser.said.ta} மட்டும் கூடியிருக்கு; அதைக் கவனிக்கலாம்.`); }
  }
  return bi(en.slice(0, 4).join(" "), ta.slice(0, 4).join(" "));
}

/** The screen's blocks, in the language asked; every figure the spoken line uses is on them. */
export function changeBlocks(a: ChangeAnalysis, c: Pick<RecipeCtx, "w" | "s">, lang: Lang): BlockT[] {
  const { w, s } = c;
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const win = windowWords(s.period);
  const T = a.total;
  const unit = L("incidents", "சம்பவங்கள்");
  const blocks: BlockT[] = [];
  blocks.push({ kind: "Kpis", id: "kpis", title: L("What changed", "என்ன மாறியிருக்கு"), items: [
    { key: "now", label: clip(L(`Reported, ${win.now.en}`, `பதிவானவை, ${win.now.ta}`), 80), value: T.now, unit: null, prev: T.before, delta: T.delta, pct: T.pct, tone: T.delta > 0 ? "bad" : T.delta < 0 ? "good" : "neutral", spark: [] },
    { key: "before", label: clip(L(`Reported, ${win.before.en}`, `பதிவானவை, ${win.before.ta}`), 80), value: T.before, unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
    ...(a.severe ? [{ key: "severe", label: L("Severe", "கடுமையானவை"), value: a.severe.now, unit: null, prev: a.severe.before, delta: a.severe.before == null ? null : a.severe.now - a.severe.before, tone: "bad" as const, spark: [] }] : []),
    ...(a.rain.linked ? [{ key: "rain", label: L("During or after rain", "மழையின் போது அல்லது பிறகு"), value: a.rain.linked, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }] : [])
  ] });
  const items: Extract<BlockT, { kind: "Findings" }>["items"] = [];
  const named = a.splits.filter((x) => x.segs.length);
  for (const x of a.drivers) {
    const pct = pctOf(x.ep);
    const n = a.splits.find((sp) => sp.dim === x.dim)?.segs.length ?? 0;
    items.push({ title: clip(L(`${x.name.en}: ${spoken(Math.abs(x.delta))} ${x.delta > 0 ? "more" : "fewer"}${pct != null ? `, ${pct}% of the change` : ""}`,
      `${x.name.ta}: ${spoken(Math.abs(x.delta))} ${x.delta > 0 ? "கூடுதல்" : "குறைவு"}${pct != null ? `, மாற்றத்தில் ${pct}%` : ""}`), 240),
      value: x.delta, unit, method: clip(L(`Share of the total change${pct != null ? ` ${pct}%` : ""}, surprise ${r2(x.surprise)} (Jensen-Shannon term of its share before and now; Adtributor-style, NSDI 2014), within the ${DIM_WORD[x.dim].en} split`,
        `மொத்த மாற்றத்தில் பங்கு${pct != null ? ` ${pct}%` : ""}, எதிர்பாராமை ${r2(x.surprise)} (முன்பும் இப்போதும் அதன் பங்கின் Jensen-Shannon அளவு), ${DIM_WORD[x.dim].ta}வாரியாக`), 200),
      n, caveat: L("Shows where the change sits, not what is behind it.", "மாற்றம் எங்கே என்று மட்டும் காட்டுகிறது, அதன் பின்னணியை அல்ல."), tone: x.delta > 0 ? "bad" : "ok" });
  }
  for (const f of a.flags.slice(0, 3)) {
    const name = f.seg ? f.seg.name : bi("All incidents", "எல்லாச் சம்பவங்களும்");
    items.push({ title: clip(L(`${name.en}: ${f.flag === "high" ? "above" : "below"} the usual range`, `${name.ta}: வழக்கமான அளவை விட ${f.flag === "high" ? "அதிகம்" : "குறைவு"}`), 240),
      value: f.now, unit, method: clip(L(`Exact test of two Poisson counts: ${f.now} now against ${f.before} before; 99% band ${f.band.lo} to ${f.band.hi}`,
        `இரண்டு Poisson எண்ணிக்கைகளின் சோதனை: இப்போது ${f.now}, முன்பு ${f.before}; 99% வரம்பு ${f.band.lo}–${f.band.hi}`), 200),
      n: f.now + f.before, caveat: L("The window before is a rough baseline on its own.", "முந்தைய காலம் மட்டுமே ஒரு தோராயமான அடிப்படை."), tone: "warn" });
  }
  if (!items.length) items.push({ title: L(T.delta === 0 ? "No change against the window before" : "No split explains most of the change", T.delta === 0 ? "முந்தைய காலத்தை விட மாற்றம் இல்லை" : "எந்தப் பிரிவும் மாற்றத்தின் பெரும்பகுதியை விளக்கவில்லை"),
    value: T.delta, unit, method: L(`${T.now} now against ${T.before} before`, `இப்போது ${T.now}, முன்பு ${T.before}`), n: named.length, caveat: L("The change is spread thin across zones, departments and kinds.", "மாற்றம் மண்டலங்கள், துறைகள், வகைகள் முழுவதும் பரவியுள்ளது."), tone: "ok" });
  blocks.push({ kind: "Findings", id: "drivers", title: L("Where the change sits", "மாற்றம் எங்கே"), items: items.slice(0, 8) });
  // numbered as "explain the second one" reads them: the drivers first (the most telling first), then the rest by the size of their move
  const isDriver = (x: Seg) => a.drivers.some((y) => y.dim === x.dim && y.key === x.key);
  const rest = named.flatMap((x) => x.segs).filter((x) => !x.other && x.delta !== 0 && !isDriver(x)).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.key.localeCompare(y.key));
  const movers = [...a.drivers, ...rest].slice(0, 12);
  if (movers.length) blocks.push({ kind: "Ranking", id: "movers", title: L("What moved, the most telling first", "மாறியவை, முக்கியமானவை முதலில்"), unit, order: "top",
    method: L("Change against the window before, each split (zone, department, kind) on its own; the share is of the total change.", "முந்தைய காலத்தை விட மாற்றம், ஒவ்வொரு பிரிவும் (மண்டலம், துறை, வகை) தனித்தனியாக; பங்கு மொத்த மாற்றத்தில்."),
    items: movers.map((x, i) => ({ key: x.key, label: clip(pick(lang, x.name), 120), value: x.delta, rank: i + 1,
      sub: clip(L(`${x.now} now, ${x.before} before${pctOf(x.ep) != null ? ` · ${pctOf(x.ep)}% of the change` : ""}`, `இப்போது ${x.now}, முன்பு ${x.before}${pctOf(x.ep) != null ? ` · மாற்றத்தில் ${pctOf(x.ep)}%` : ""}`), 160),
      zone: x.dim === "zone" ? Number(x.key) : null, lat: null, lon: null, action: x.dim === "zone" ? "zone" as const : x.dim === "dept" ? "dept" as const : "none" as const })) });
  const chartSplit = named.find((x) => x.dim === "zone") ?? named.find((x) => x.dim === "cat");
  if (chartSplit) {
    const xs = chartSplit.segs.filter((x) => !x.other).sort((x, y) => y.delta - x.delta).slice(0, 15);
    blocks.push({ kind: "Chart", id: "chart", title: chartSplit.dim === "zone" ? L("Change by zone (now minus before)", "மண்டலவாரியாக மாற்றம் (இப்போது கழித்தல் முன்பு)") : L("Change by kind (now minus before)", "வகைவாரியாக மாற்றம் (இப்போது கழித்தல் முன்பு)"),
      chart: "hbar", unit, labels: xs.map((x) => clip(pick(lang, x.name), 80)), values: xs.map((x) => x.delta) });
  }
  const top = a.top.map((x) => caseRow({ ...x, sev: x.severity ?? x.sev, why: null, reasons: x.reasons }, w));
  if (top.length) blocks.push({ kind: "CaseList", id: "top", title: L("The open incidents that rank highest here", "இங்கே முன்னுரிமை உள்ள திறந்த சம்பவங்கள்"), source: "list", sev: null, total: top.length, rows: top });
  return blocks.slice(0, 6);
}

/** Any other registry metric with a figure before: its change, and where it moved when it has rows. No split, no guess. */
async function metricChange(c: RecipeCtx, id: string): Promise<RecipePart> {
  const lang = langFor(c);
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const def = metricById(id);
  const res = await computeMetric(id, c.s, c.h);
  c.runs.push(def?.source.tool ?? "metric");
  if (def) c.sources.add(def.source.tool);
  // an id the registry does not hold is never shown: it came from a model and may carry a figure of its own
  const title = L(`What changed${def ? ` · ${def.label.en}` : ""}`, `என்ன மாறியிருக்கு${def ? ` · ${def.label.ta}` : ""}`);
  if (!res.ok || res.value == null || res.prev == null) {
    const why = !res.ok ? res.message : "This figure has nothing before it to compare with.";
    return { title, takeaway: null, say: bi(`I can't show a change for that: ${!res.ok && res.error === "unknown_metric" ? "it is not a figure I know" : "there is no figure before to compare with"}.`,
      `அதற்கு மாற்றத்தைக் காட்ட முடியாது: ${!res.ok && res.error === "unknown_metric" ? "அது எனக்குத் தெரிந்த அளவு இல்லை" : "ஒப்பிட முந்தைய எண்ணிக்கை இல்லை"}.`),
      blocks: [{ kind: "Note", id: "none", text: clip(why, 400) }] };
  }
  c.asOf ??= res.asOf;
  const label = def ? pick(lang, def.label) : id;
  const unit = def ? pick(lang, def.unit) : null;
  const delta = res.delta ?? 0;
  const worse = def?.worse === "up" ? delta > 0 : def?.worse === "down" ? delta < 0 : false;
  const blocks: BlockT[] = [{ kind: "Kpis", id: "kpis", title: L("What changed", "என்ன மாறியிருக்கு"), items: [
    { key: "now", label: clip(label, 80), value: res.value, unit: clip(unit, 20) || null, prev: res.prev, delta: res.delta, pct: res.pct, tone: worse ? "bad" : delta ? "good" : "neutral", spark: [] },
    { key: "before", label: clip(L(`${def?.label.en ?? id}, before`, `${def?.label.ta ?? id}, முன்பு`), 80), value: res.prev, unit: clip(unit, 20) || null, prev: null, delta: null, tone: "neutral", spark: [] }
  ] }];
  const moved = res.rows.filter((x) => x.prev != null).map((x) => ({ ...x, d: Math.round((x.value - (x.prev as number)) * 10) / 10 })).filter((x) => x.d !== 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 12);
  if (moved.length) blocks.push({ kind: "Ranking", id: "movers", title: L("Biggest movers", "அதிகம் மாறியவை"), unit: clip(unit, 30) || null, order: "top", method: clip(res.method, 240),
    items: moved.map((x, i) => ({ key: x.key, label: x.label, value: x.d, rank: i + 1, sub: clip(L(`${x.value} now, ${x.prev} before`, `இப்போது ${x.value}, முன்பு ${x.prev}`), 160),
      zone: def?.grain === "zone" ? Number(x.key) : null, lat: null, lon: null, action: def?.grain === "zone" ? "zone" as const : def?.grain === "dept" ? "dept" as const : "none" as const })) });
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "level";
  const u = unit && def?.unit.en !== "incidents" ? ` ${unit}` : "";
  const first = moved[0];
  const say = bi(`${def?.label.en ?? id} ${dir === "level" ? "is level" : `went ${dir}`}: ${spoken(res.value)}${u} now against ${spoken(res.prev)} before.${first ? ` The biggest move is ${first.label}, ${spoken(first.value)} against ${spoken(first.prev as number)}.` : ""}`,
    `${def?.label.ta ?? id}: இப்போது ${spoken(res.value)}${u}, முன்பு ${spoken(res.prev)}; ${dir === "up" ? "கூடியிருக்கு" : dir === "down" ? "குறைஞ்சிருக்கு" : "அதே அளவுதான்"}.${first ? ` அதிகம் மாறியது ${first.label}, ${spoken(first.value)}, முன்பு ${spoken(first.prev as number)}.` : ""}`);
  return { title, takeaway: say, say, blocks };
}

/** The recipe: registered in screens.ts as `changed` (slots: period, zones, dept, cat, taluk, measure = a metric id; default incidents_reported). */
export async function changedRecipe(c: RecipeCtx): Promise<RecipePart> {
  // the metric: a registry id in `metricId` (a slot the coordinator adds) or in `measure` (the ranking ids are registry ids too)
  const id = String((c.slots as { metricId?: unknown }).metricId ?? c.slots.measure ?? "").trim();
  if (id && id !== "incidents_reported") return metricChange(c, id);
  const lang = langFor(c);
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const a = await analyseChange(c);
  const win = windowWords(c.s.period);
  const zone = zoneName(c.w, c.s.zone), cat = catName(c.w, c.s.cat);
  const scopeEn = [zone?.en, cat?.en].filter(Boolean).join(" · "), scopeTa = [zone?.ta, cat?.ta].filter(Boolean).join(" · ");
  const title = L(`What changed${scopeEn ? ` · ${scopeEn}` : ""} · ${win.label.en}`, `என்ன மாறியிருக்கு${scopeTa ? ` · ${scopeTa}` : ""} · ${win.label.ta}`);
  const blocks = changeBlocks(a, c, lang);
  if (!a.total.now && !a.total.before) {
    return { title, takeaway: null, blocks: blocks.slice(0, 1),
      say: bi(`No incidents in either window: none ${win.inNow.en} and none ${win.before.en}.`, `${win.now.ta}யும் ${win.before.ta}யும் சம்பவம் எதுவும் இல்லை.`) };
  }
  const say = changeSay(a, c);
  const d0 = a.drivers[0];
  const pct = d0 ? pctOf(d0.ep) : null;
  const takeaway = d0 ? bi(`${d0.name.en}: ${spoken(Math.abs(d0.delta))} ${d0.delta > 0 ? "more" : "fewer"}${pct != null ? `, ${pct}% of the change` : ""}.`,
    `${d0.name.ta}: ${spoken(Math.abs(d0.delta))} ${d0.delta > 0 ? "கூடுதல்" : "குறைவு"}${pct != null ? `, மாற்றத்தில் ${pct}%` : ""}.`) : null;
  c.notes.push(L("Counts of reports in two windows of the same length; where a change sits is not why it happened.", "ஒரே நீளமுள்ள இரண்டு காலங்களின் பதிவு எண்ணிக்கை; மாற்றம் எங்கே என்பது அது ஏன் நடந்தது என்பதல்ல."));
  const zoneDriver = a.drivers.find((x) => x.dim === "zone");
  const next: NextStepT[] = zoneDriver ? [{ label: bi(`Reasons in ${zoneDriver.name.en}`, `${zoneDriver.name.ta}: விவரம்`), kind: "direct", recipe: "why",
    slots: { zones: [Number(zoneDriver.key)], period: c.s.period, cat: c.s.cat }, ids: [], text: null }] : [];
  return { title, takeaway, say, blocks, next };
}
