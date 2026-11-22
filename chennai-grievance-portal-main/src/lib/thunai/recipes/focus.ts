/**
 * v15 (22 Nov): the "focus" screen. Where to concentrate, which areas are improving, which are getting worse, and where problems keep
 * coming back, from the past (the focus_trends tool; the analysis is v15/focus.ts). One screen answers all four: the lens the question asked
 * orders the blocks and decides what is said; every figure said is on the screen.
 *
 * v16 (22 Nov): the screen reads what the reader understood (v16/reader.ts), not only the words: its slots carry the lenses (`lens`), what
 * the question is about (`about`: areas, places or kinds) and the zones named. The owner's examples, each a shape of its own now:
 *   - two to four zones ("compare Alandur and Adyar, which should I concentrate on"): those zones side by side and which needs the Collector
 *     more, and why (backlog past its deadline, severe reports, the move against the window before, the kind behind it);
 *   - one zone ("is Adyar getting worse?"): that zone's own trend, the kinds moving in it, its backlog and its place among the zones;
 *   - places ("which road keeps having problems"): the spots where one kind of problem keeps coming back first;
 *   - kinds ("which kinds of complaints are rising"): the kinds of report rising and falling, beyond ordinary ups and downs;
 *   - a kind named ("where are the murders"): every count is that kind's (focus_trends' scope cat).
 */
import { call, catName, clip, langFor, num, scopeArg, type Lang, type RecipeCtx, type RecipePart, type Row } from "./common";
import type { BlockT, NextStepT } from "../stage";
import { analyseFocus, focusAsk, focusSay, kindsOf, trendOf, windowWords, zOf, type FocusAnalysis, type FocusRows, type Lens, type ZoneFocus } from "../v15/focus";
import { DEPT_TA } from "../lexicon";

const LENS_SET = new Set<Lens>(["attention", "improving", "worsening", "repeat"]);
/** The lenses a screen's words ask (the planner may build it for any of them): attention when none is named. */
export function lensesOf(heard: string): Lens[] {
  const f = focusAsk(heard, null);
  return f?.lenses.length ? f.lenses : ["attention"];
}
/** v16: the reader's lenses when it sent them, else the words' */
export function lensesFor(c: Pick<RecipeCtx, "slots" | "heard">): Lens[] {
  const l = ((c.slots as unknown as { lens?: unknown }).lens ?? null) as unknown[] | null;
  const ok = Array.isArray(l) ? (l.filter((x) => LENS_SET.has(x as Lens)) as Lens[]) : [];
  return ok.length ? [...new Set(ok)] : lensesOf(c.heard);
}
type About = "areas" | "places" | "kinds";
const aboutOf = (c: Pick<RecipeCtx, "slots">, lenses: Lens[]): About => {
  const a = (c.slots as unknown as { about?: unknown }).about;
  return a === "places" || a === "kinds" || a === "areas" ? a : lenses[0] === "repeat" ? "places" : "areas";
};
const list = (xs: string[], and: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);
const pctWord = (p: number | null, up: string, down: string) => (p == null ? "" : p >= 0 ? `${up} ${p}%` : `${down} ${Math.abs(p)}%`);

/**
 * v16: the screen carries what Jarvis says as its key points (a Brief block), so the Collector can read the reasons, and every figure said
 * is on the screen by construction (the browser's number gate drops a sentence whose figure is not: the 22 Nov probe lost "what rose most"
 * and "who holds the overdue cases" that way).
 */
export async function focusRecipe(c: RecipeCtx): Promise<RecipePart> {
  const lang: Lang = langFor(c);
  const p = await focusPart(c);
  const said = (lang === "ta" ? p.say.ta : p.say.en).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  if (!said.length) return p;
  const points: BlockT = { kind: "Brief", id: "points", title: lang === "ta" ? "முக்கியமானவை" : "Key points", points: said.map((t) => ({ text: clip(t, 400), incidentId: null })) };
  const at = p.blocks[0]?.kind === "Kpis" ? 1 : 0;
  return { ...p, blocks: [...p.blocks.slice(0, at), points, ...p.blocks.slice(at)].slice(0, 6) };
}

async function focusPart(c: RecipeCtx): Promise<RecipePart> {
  const lang: Lang = langFor(c);
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const lenses = lensesFor(c);
  const about = aboutOf(c, lenses);
  const asked = focusAsk(c.heard, null);
  // the window: the question's own ("this week", "monthly", "3 months"), else the screen's slot, else 4 weeks
  const days: 7 | 28 | 84 = c.slots.period === "weekly" ? 7 : c.slots.period === "quarterly" ? 84 : c.slots.period === "monthly" ? 28
    : asked && /\b(?:week|month|quarter|days?)\b|வார|மாச|மாத|காலாண்டு/iu.test(c.heard) ? asked.days : 28;
  const r = await call(c, "focus_trends", { scope: scopeArg({ ...c.s, zone: null }), days });
  const d = (r.data ?? {}) as Row;
  // the tool's analysis carries the store's zone names; the screen gives this world's (Tamil included): the same rows, the same numbers
  const a = analyseFocusFrom((d.zones ?? []) as ZoneFocus[], d, c, days, (d.spots ?? []) as FocusRows["repeats"]);
  const win = windowWords(days);
  const nm = (z: ZoneFocus) => (lang === "ta" ? z.name.ta : z.name.en);
  const kindName = (cat: string | undefined, label: string) => { const k = catName(c.w, cat, label); return k ? (lang === "ta" ? k.ta : k.en) : label; };
  const kindEn = (cat: string | undefined, label: string) => catName(c.w, cat, label)?.en ?? label;
  const kindTa = (cat: string | undefined, label: string) => catName(c.w, cat, label)?.ta ?? label;
  for (const z of a.zones) {
    if (z.rise) z.rise.label = kindName(z.rise.cat, z.rise.label);
    if (z.fall) z.fall.label = kindName(z.fall.cat, z.fall.label);
  }
  // a kind named: every count is that kind's, said so in the title
  const theKind = c.s.cat ? catName(c.w, c.s.cat, c.s.cat) : null;
  const ofKind = theKind ? L(` · ${theKind.en}`, ` · ${theKind.ta}`) : "";
  const period = days === 7 ? "weekly" : days === 84 ? "quarterly" : "monthly";
  // the zones the question named, in the order said (v16)
  const namedZones = (c.slots.zones ?? []).map((n) => a.zones.find((z) => z.zone === n) ?? emptyZone(n, c)).filter(Boolean) as ZoneFocus[];
  c.notes.push(L(`Reports in ${win.now.en} against ${win.before.en}; "getting worse" and "improving" only beyond ordinary ups and downs (2 standard deviations).`,
    `${win.now.ta} பதிவுகள், ${win.before.ta} உடன் ஒப்பிட்டு; வழக்கமான ஏற்ற இறக்கத்தைத் தாண்டினால் மட்டுமே "மோசம்", "முன்னேற்றம்".`));
  c.notes.push(L("A rise in reports is not proof that things are worse on the ground: more reporting, or rain, raises counts too.", "பதிவுகள் கூடினால் நிலைமை மோசம் என்று உறுதியில்லை: அதிகப் புகார்களும் மழையும் எண்ணிக்கையைக் கூட்டும்."));
  c.asOf ??= r.asOf ?? null;

  if (namedZones.length >= 2) return between(namedZones, a, c, { lang, L, nm, win, days, period, ofKind, kindEn, kindTa, lenses });
  if (namedZones.length === 1) return oneZone(namedZones[0], a, c, { lang, L, nm, win, days, period, ofKind, kindEn, kindTa, lenses });
  if (about === "kinds") return byKinds(a, c, { lang, L, win, days, period, ofKind, kindEn, kindTa, lenses });

  const blocks: BlockT[] = [];
  const top = a.attention[0];
  blocks.push({ kind: "Kpis", id: "kpis", title: clip(L(`Focus and trends · ${win.now.en}${ofKind}`, `கவனம், போக்கு · ${win.short.ta}${ofKind}`), 120), items: [
    ...(top ? [{ key: "focus", label: clip(L(`Concentrate first: ${top.name.en}`, `முதல் கவனம்: ${top.name.ta}`), 80), value: top.overdue, unit: L("overdue", "தாமதம்"), prev: null, delta: null, tone: "bad" as const, spark: top.weekly.slice(-12) }] : []),
    { key: "worse", label: L("Areas getting worse", "மோசமாகும் பகுதிகள்"), value: a.worse.length, unit: null, prev: null, delta: null, tone: a.worse.length ? "bad" as const : "neutral" as const, spark: [] },
    { key: "better", label: L("Areas improving", "முன்னேறும் பகுதிகள்"), value: a.better.length, unit: null, prev: null, delta: null, tone: a.better.length ? "good" as const : "neutral" as const, spark: [] },
    { key: "district", label: clip(L(`All reports, ${win.now.en}`, `மொத்தப் பதிவுகள், ${win.short.ta}`), 80), value: a.district.now, unit: null, prev: a.district.prev, delta: a.district.delta, pct: a.district.pct, tone: a.district.delta > 0 ? "bad" as const : a.district.delta < 0 ? "good" as const : "neutral" as const, spark: a.district.weekly }
  ] });
  const attention = attentionBlock(a.attention, L, nm, lang, undefined, c);
  const findings = findingsBlock(a, L, win);
  const moved = a.byChange.filter((z) => z.pct != null).slice(0, 15);
  const chart: BlockT = { kind: "Chart", id: "change", title: clip(L(`Change by zone, % (${win.now.en} against ${win.before.en})`, `மண்டலவாரியாக மாற்றம், % (${win.short.ta})`), 160), chart: "hbar", unit: "%",
    labels: moved.map((z) => clip(`${nm(z)} (${z.prev}→${z.now})`, 40)), values: moved.map((z) => z.pct ?? 0) };
  // the week-by-week line of the zone the answer is about: the first to concentrate on, the worst mover, or the best one
  const lead = lenses[0] === "improving" ? a.better[0] ?? top : lenses[0] === "worsening" ? a.worse[0] ?? top : top;
  const trend: BlockT | null = lead ? { kind: "Trend", id: "weeks", title: clip(L(`${lead.name.en}, reports week by week (12 weeks)`, `${lead.name.ta}, வாரவாரியாகப் பதிவுகள் (12 வாரம்)`), 160), unit: L("reports", "பதிவுகள்"),
    labels: a.weekLabels, values: lead.weekly, marks: [], normal: null } : null;
  const spots = spotsBlock(a, L, nm, win, kindName);
  const map: BlockT = { kind: "MapView", id: "map", title: L("Where to concentrate (darker: first)", "கவனிக்க வேண்டிய இடங்கள் (அடர்: முதலில்)"), rule: null,
    shade: { geo: "zone", label: L("score", "மதிப்பெண்"), values: a.zones.map((z) => ({ key: z.zone, value: z.score })) }, points: [], outline: [] };
  // the order: what was asked first
  const order: (BlockT | null)[] = about === "places" || lenses[0] === "repeat" ? [spots, attention, findings, chart, map]
    : lenses[0] === "improving" || lenses[0] === "worsening" ? [findings, chart, trend, attention, spots]
    : [attention, findings, chart, trend, spots, map];
  for (const b of order) if (b && blocks.length < 6) blocks.push(b);
  // v16: code's own answer, with the reasons (what drives the first zone, who holds its overdue cases, what else moved): every figure on the
  // screen. The aide does not rewrite it (aide7/index.ts aideWanted): its rewrites of 22 Nov dropped the point (a roads question answered
  // with backlog counts, "0 areas improving")
  const say = districtSay(a, about === "places" && lenses[0] !== "attention" ? ["repeat"] : lenses, { kindEn, kindTa, deptEn: (d) => deptName(c, d).en, deptTa: (d) => deptName(c, d).ta, kindAsked: !!c.s.cat });
  void focusSay;
  // v16 (the browser drive): the line under the title answers the question asked; "Concentrate first on Royapuram" sat on a getting-worse screen
  const first = (s: string) => s.split(/(?<=[.!?])\s+/)[0] ?? s;
  const takeaway = lenses[0] !== "attention" || about !== "areas" ? { en: first(say.en), ta: first(say.ta) }
    : top ? { en: `Concentrate first on ${top.name.en}: ${top.reasons.slice(0, 2).map((x) => x.en).join(", ")}.`, ta: `முதல்ல ${top.name.ta}: ${top.reasons.slice(0, 2).map((x) => x.ta).join(", ")}.` } : null;
  const next: NextStepT[] = top ? [{ label: { en: `Why ${top.name.en}?`, ta: `${top.name.ta}: ஏன்?` }, kind: "direct", recipe: "why", slots: { zones: [top.zone], period }, ids: [], text: null },
    { label: { en: `What needs me first in ${top.name.en}?`, ta: `${top.name.ta}-ல முதல்ல என்ன?` }, kind: "direct", recipe: "advise", slots: { zones: [top.zone], period: "weekly" }, ids: [], text: null },
    ...(a.worse[0] && a.worse[0].zone !== top.zone ? [{ label: { en: `What is rising in ${a.worse[0].name.en}?`, ta: `${a.worse[0].name.ta}-ல என்ன கூடுது?` }, kind: "direct" as const, recipe: "why" as const, slots: { zones: [a.worse[0].zone], period }, ids: [], text: null }] : [])] : [];
  const title = L(lenses[0] === "repeat" ? `Where problems keep coming back · ${win.now.en}` : lenses[0] === "improving" ? `Which areas are improving · ${win.now.en}` : lenses[0] === "worsening" ? `Which areas are getting worse · ${win.now.en}` : `Where to concentrate · ${win.now.en}`,
    lenses[0] === "repeat" ? `திரும்பத் திரும்ப வரும் இடங்கள் · ${win.short.ta}` : lenses[0] === "improving" ? `எந்தப் பகுதிகள் முன்னேறுது · ${win.short.ta}` : lenses[0] === "worsening" ? `எந்தப் பகுதிகள் மோசமாகுது · ${win.short.ta}` : `எங்கே கவனம் செலுத்தணும் · ${win.short.ta}`) + ofKind;
  return { title, takeaway, say, blocks, next };
}

const deptName = (c: RecipeCtx, code: string): { en: string; ta: string } => {
  const d = c.w.depts.find((x) => x.code === code);
  return { en: d?.name ?? code, ta: DEPT_TA[code] ?? d?.name ?? code };
};

interface SayWords { kindEn: (cat: string | undefined, label: string) => string; kindTa: (cat: string | undefined, label: string) => string; deptEn: (code: string) => string; deptTa: (code: string) => string; kindAsked?: boolean }

/**
 * v16: the district's answer for the lenses asked, 2 to 5 sentences, every figure on the screen. Each lens says what was asked and the
 * reason behind it: where to concentrate says why (its biggest parts), what drives it and who holds the overdue cases; improving and
 * getting worse name the real moves, or say none passed ordinary ups and downs and name the biggest moves anyway; what keeps coming back
 * names the spots first; better-or-worse-overall starts with the district's own change.
 */
export function districtSay(a: Pick<FocusAnalysis, "days" | "attention" | "worse" | "better" | "byChange" | "zones" | "district" | "spots">, lenses: Lens[], w: SayWords): { en: string; ta: string } {
  const win = windowWords(a.days);
  const en: string[] = [], ta: string[] = [];
  const said = new Set<number>();
  const ls = lenses.length ? lenses : ["attention" as Lens];
  const both = ls.includes("improving") && ls.includes("worsening");
  if (both) {
    const d = a.district;
    if (d.pct != null) {
      en.push(`Across the district, reports are ${d.delta >= 0 ? `up ${d.pct}%` : `down ${Math.abs(d.pct)}%`} on ${win.before.en}: ${d.now} against ${d.prev}.`);
      ta.push(`மாவட்டம் முழுக்க ${win.before.ta} விட பதிவுகள் ${d.delta >= 0 ? `${d.pct}% கூடியிருக்கு` : `${Math.abs(d.pct)}% குறைஞ்சிருக்கு`}: ${d.prev}லிருந்து ${d.now}.`);
    }
  }
  const moveEn = (z: ZoneFocus, up: boolean) => `${z.name.en}, ${up ? "up" : "down"} ${Math.abs(z.pct ?? 0)}% (${z.prev} to ${z.now})${up && z.rise ? `, mostly ${w.kindEn(z.rise.cat, z.rise.label)}` : !up && z.fall ? `, mostly fewer ${w.kindEn(z.fall.cat, z.fall.label)}` : ""}`;
  const moveTa = (z: ZoneFocus, up: boolean) => `${z.name.ta}, ${Math.abs(z.pct ?? 0)}% ${up ? "கூடியிருக்கு" : "குறைஞ்சிருக்கு"} (${z.prev}லிருந்து ${z.now})${up && z.rise ? `, பெரும்பாலும் ${w.kindTa(z.rise.cat, z.rise.label)}` : !up && z.fall ? `, ${w.kindTa(z.fall.cat, z.fall.label)} குறைவு` : ""}`;
  for (const lens of ls) {
    if (lens === "attention") {
      const [z1, z2, z3] = a.attention;
      if (!z1) continue;
      const why = z1.reasons.slice(0, 2);
      const kind = w.kindAsked ? null : z1.trend === "worse" && z1.rise ? z1.rise : z1.top?.[0] ?? null;
      en.push(`Concentrate first on ${z1.name.en}: ${why.map((r) => r.en).join(", ")}${kind ? `; mostly ${w.kindEn(kind.cat, kind.label)}` : ""}.`);
      ta.push(`முதல்ல ${z1.name.ta}-ல கவனம் செலுத்தணும்: ${why.map((r) => r.ta).join(", ")}${kind ? `; பெரும்பாலும் ${w.kindTa(kind.cat, kind.label)}` : ""}.`);
      if (z1.owner && z1.owner.n >= 2) {
        en.push(`${w.deptEn(z1.owner.dept)} holds ${z1.owner.n} of its cases past their deadline: ask them for a status.`);
        ta.push(`காலக்கெடு தாண்டிய ${z1.owner.n} புகார்கள் ${w.deptTa(z1.owner.dept)} வசம் உள்ளன: அவர்களிடம் நிலவரம் கேளுங்கள்.`);
      }
      const next = [z2, z3].filter(Boolean) as ZoneFocus[];
      if (next.length) { en.push(`Then ${list(next.map((z) => z.name.en), "and")}.`); ta.push(`அடுத்தது ${list(next.map((z) => z.name.ta), "மற்றும்")}.`); }
      [z1, ...next].forEach((z) => said.add(z.zone));
    } else if (lens === "improving") {
      const b = a.better.slice(0, 2);
      if (b.length) {
        en.push(`Improving beyond ordinary ups and downs over ${win.now.en}: ${list(b.map((z) => moveEn(z, false)), "and")}.`);
        ta.push(`${win.now.ta} உண்மையிலேயே முன்னேறியிருக்கும் பகுதிகள்: ${list(b.map((z) => moveTa(z, false)), "மற்றும்")}.`);
      } else {
        const falls = [...a.byChange].reverse().filter((z) => z.delta < 0).slice(0, 2);
        // v16 (the grader): with no fall at all, the closest to improving is the smallest rise, and the district's own rise says why none did
        const least = falls.length ? null : [...a.byChange].filter((z) => z.pct != null).sort((p, q) => (p.pct ?? 0) - (q.pct ?? 0))[0] ?? null;
        const d = a.district;
        en.push(`No area has improved beyond ordinary ups and downs over ${win.now.en}${falls.length ? `; the biggest falls are ${list(falls.map((z) => `${z.name.en} (${z.prev} to ${z.now})`), "and")}`
          : `: reports rose in every area${d.pct != null && d.delta > 0 ? `, up ${d.pct}% across the district (${d.prev} to ${d.now})` : ""}${least ? `; the smallest rise is ${least.name.en}, ${least.prev} to ${least.now}` : ""}`}.`);
        ta.push(`${win.now.ta} வழக்கமான ஏற்ற இறக்கத்தைத் தாண்டி எந்தப் பகுதியும் முன்னேறலை${falls.length ? `; அதிகம் குறைஞ்சது ${list(falls.map((z) => `${z.name.ta} (${z.prev}லிருந்து ${z.now})`), "மற்றும்")}`
          : `: எல்லாப் பகுதியிலும் பதிவுகள் கூடியிருக்கு${d.pct != null && d.delta > 0 ? `, மாவட்டம் முழுக்க ${d.pct}% (${d.prev}லிருந்து ${d.now})` : ""}${least ? `; குறைவா கூடியது ${least.name.ta}, ${least.prev}லிருந்து ${least.now}` : ""}`}.`);
      }
      // week by week: a zone whose last 8 weeks fall steadily, though the window's change is within ordinary ups and downs
      const steady = a.zones.filter((z) => z.slopePct != null && z.slopePct <= -6 && !a.better.some((x) => x.zone === z.zone)).sort((p, q) => (p.slopePct ?? 0) - (q.slopePct ?? 0))[0];
      if (steady) { en.push(`${steady.name.en} has been falling week by week for two months.`); ta.push(`${steady.name.ta} இரண்டு மாதமா வாரா வாரம் குறைஞ்சிட்டு வருது.`); }
    } else if (lens === "worsening") {
      const x = a.worse.slice(0, 2);
      if (x.length) {
        en.push(`Getting worse beyond ordinary ups and downs: ${list(x.map((z) => moveEn(z, true)), "and")}.`);
        ta.push(`வழக்கத்தை மீறி மோசமாகிட்டு வர்றது: ${list(x.map((z) => moveTa(z, true)), "மற்றும்")}.`);
      } else {
        const rises = a.byChange.filter((z) => z.delta > 0).slice(0, 2);
        en.push(`No area is getting worse beyond ordinary ups and downs over ${win.now.en}${rises.length ? `; the biggest rises are ${list(rises.map((z) => `${z.name.en} (${z.prev} to ${z.now})`), "and")}` : ""}.`);
        ta.push(`${win.now.ta} வழக்கமான ஏற்ற இறக்கத்தைத் தாண்டி எந்தப் பகுதியும் மோசமாகலை${rises.length ? `; அதிகம் கூடினது ${list(rises.map((z) => `${z.name.ta} (${z.prev}லிருந்து ${z.now})`), "மற்றும்")}` : ""}.`);
      }
    } else if (lens === "repeat") {
      const [s1, s2, s3] = a.spots;
      const zn = (zone: number, fallback: string) => a.zones.find((z) => z.zone === zone)?.name ?? { en: fallback, ta: fallback };
      if (s1) {
        // (a spot named as its zone, "Manali" in Manali, is said once)
        const same = s1.place.trim().toLowerCase() === zn(s1.zone, s1.name).en.trim().toLowerCase();
        en.push(`Problems keep coming back most at ${s1.place}${same ? "" : ` in ${zn(s1.zone, s1.name).en}`}: ${s1.n} ${w.kindEn(s1.cat, s1.label)} reports in ${win.now.en}${s1.open ? `, ${s1.open} still open` : ""}.`);
        ta.push(`${same ? zn(s1.zone, s1.name).ta : `${zn(s1.zone, s1.name).ta}-ல ${s1.place}`}-ல தான் திரும்பத் திரும்ப அதிகம் வருது: ${win.now.ta} ${s1.n} ${w.kindTa(s1.cat, s1.label)} புகார்கள்${s1.open ? `, ${s1.open} இன்னும் திறந்திருக்கு` : ""}.`);
        const more = [s2, s3].filter(Boolean) as typeof a.spots;
        if (more.length) {
          en.push(`Then ${list(more.map((s) => `${s.place} (${s.n} ${w.kindEn(s.cat, s.label)})`), "and")}.`);
          ta.push(`அடுத்தது ${list(more.map((s) => `${s.place} (${s.n} ${w.kindTa(s.cat, s.label)})`), "மற்றும்")}.`);
        }
      } else {
        en.push(`No single place had the same kind of problem 3 or more times in ${win.now.en}.`);
        ta.push(`${win.now.ta} ஒரே இடத்துல ஒரே பிரச்சனை 3 தடவைக்கு மேல வரலை.`);
      }
      const top = [...a.zones].sort((p, q) => q.repeat - p.repeat)[0];
      if (top?.repeat) { en.push(`By area, ${top.name.en} has the most repeat reports, ${top.repeat}.`); ta.push(`பகுதிவாரியா, ${top.name.ta}-ல தான் அதிகம்: ${top.repeat} திரும்ப வந்த புகார்கள்.`); }
    }
  }
  // the one move a where-to-concentrate answer did not cover: a worsening area outside the list, and the best improver
  if (ls.length === 1 && ls[0] === "attention") {
    const w0 = a.worse.find((z) => !said.has(z.zone));
    if (w0) { en.push(`Watch ${w0.name.en} too: up ${w0.pct ?? 0}% on ${win.before.en}.`); ta.push(`${w0.name.ta}-யும் கவனிக்கணும்: ${win.before.ta} விட ${w0.pct ?? 0}% கூடியிருக்கு.`); }
    const b0 = a.better[0];
    if (b0) { en.push(`${b0.name.en} is improving, down ${Math.abs(b0.pct ?? 0)}%.`); ta.push(`${b0.name.ta} முன்னேறியிருக்கு, ${Math.abs(b0.pct ?? 0)}% குறைஞ்சிருக்கு.`); }
  }
  return { en: en.slice(0, 5).join(" "), ta: ta.slice(0, 5).join(" ") };
}

interface Words {
  lang: Lang; L: (en: string, ta: string) => string; win: ReturnType<typeof windowWords>; days: number; period: string; ofKind: string;
  kindEn: (cat: string | undefined, label: string) => string; kindTa: (cat: string | undefined, label: string) => string;
}

/** v16: two to four zones the question named, side by side, and which of them needs the Collector more, with the reasons in figures. */
function between(zs: ZoneFocus[], a: ReturnType<typeof analyseFocusFrom>, c: RecipeCtx, o: Words & { nm: (z: ZoneFocus) => string; lenses: Lens[] }): RecipePart {
  const { L, nm, win, period } = o;
  // the score is each part against the highest zone of the district (as on the district's list), so the named zones keep their real weights
  const order = [...zs].sort((p, q) => q.score - p.score || q.overdue - p.overdue || q.now - p.now);
  const [first, ...rest] = order;
  const rank = (z: ZoneFocus) => a.attention.findIndex((x) => x.zone === z.zone) + 1;
  const metrics = [
    { key: "now", label: clip(L(`Reports, ${win.now.en}`, `பதிவுகள், ${win.short.ta}`), 60) },
    { key: "prev", label: clip(L(`Reports, ${win.before.en}`, `முந்தைய ${win.short.ta}`), 60) },
    { key: "overdue", label: L("Open past deadline", "காலக்கெடு தாண்டியவை") },
    { key: "open", label: L("Open now", "திறந்திருப்பவை") },
    { key: "severe", label: clip(L(`Severe, ${win.now.en}`, `கடுமையானவை, ${win.short.ta}`), 60) },
    { key: "repeat", label: L("Repeat reports", "திரும்ப வந்தவை") },
    { key: "change", label: L("Change, %", "மாற்றம், %") },
    { key: "rank", label: L(`Rank for attention (of ${a.attention.length})`, `கவனத் தரவரிசை (${a.attention.length})`) }
  ];
  const sides = zs.map((z) => ({ key: String(z.zone), label: clip(nm(z), 80), zone: z.zone,
    values: { now: z.now, prev: z.prev, overdue: z.overdue, open: z.open, severe: z.severe, repeat: z.repeat, change: z.pct ?? 0, rank: rank(z) || a.attention.length },
    // (the kind that rose most and the one that fell most, with both counts: an answer says them)
    cats: [...[z.rise, z.fall].filter((m): m is NonNullable<typeof m> => !!m).map((m) => ({ code: clip(m.cat, 40), label: clip(`${o.lang === "ta" ? o.kindTa(m.cat, m.label) : o.kindEn(m.cat, m.label)} (${m.prev}→${m.now})`, 80), n: m.now })),
      ...(z.top ?? []).map((k) => ({ code: clip(k.cat, 40), label: clip(o.lang === "ta" ? o.kindTa(k.cat, k.label) : o.kindEn(k.cat, k.label), 80), n: k.now }))].slice(0, 8),
    series: z.weekly.slice(-12) }));
  const diffs = metrics.filter((m) => m.key !== "score").map((m) => {
    const vals = zs.map((z) => ({ z, v: Number((sides.find((s) => s.zone === z.zone)?.values as Record<string, number>)[m.key] ?? 0) })).sort((p, q) => q.v - p.v);
    const hi = vals[0], lo = vals[vals.length - 1];
    return { metric: m.key, label: m.label, hi: clip(nm(hi.z), 80), lo: clip(nm(lo.z), 80), ratio: lo.v > 0 ? Math.round((hi.v / lo.v) * 10) / 10 : null, gap: hi.v - lo.v };
  }).filter((x) => x.gap > 0).slice(0, 8);
  const blocks: BlockT[] = [
    { kind: "Compare", id: "between", title: clip(L(`${list(zs.map((z) => z.name.en), "and")} · ${win.now.en}${o.ofKind}`, `${list(zs.map((z) => z.name.ta), "மற்றும்")} · ${win.short.ta}${o.ofKind}`), 160),
      metrics, sides, seriesLabels: a.weekLabels.slice(-12), diffs },
    attentionBlock(order, L, nm, o.lang, L("Which needs you more, first to last", "எது அதிக கவனம் தேவை, முதல் முதல் கடைசி வரை"), c),
    { kind: "Trend", id: "weeks", title: clip(L(`${first.name.en}, reports week by week (12 weeks)`, `${first.name.ta}, வாரவாரியாகப் பதிவுகள் (12 வாரம்)`), 160), unit: L("reports", "பதிவுகள்"),
      labels: a.weekLabels, values: first.weekly, marks: [], normal: null }
  ];
  const spots = a.spots.filter((s) => zs.some((z) => z.zone === s.zone));
  if (spots.length) blocks.push({ kind: "Ranking", id: "repeat", title: L(`Where problems keep coming back in these areas · ${win.now.en}`, `இந்தப் பகுதிகளில் திரும்ப வரும் இடங்கள் · ${win.short.ta}`), unit: L("reports", "புகார்கள்"), order: "top",
    method: L("Places with 3 or more reports of one kind in the window.", "ஒரே வகையில் 3 அல்லது அதற்கு மேல் புகார் வந்த இடங்கள்."),
    items: spots.slice(0, 6).map((s, i) => ({ key: `${s.zone}-${i}`, label: clip(s.place, 120), value: s.n, rank: i + 1, sub: clip(`${nm(zs.find((z) => z.zone === s.zone)!)} · ${o.lang === "ta" ? o.kindTa(s.cat, s.label) : o.kindEn(s.cat, s.label)}`, 160), zone: s.zone, lat: null, lon: null, action: "zone" as const })) });
  // the spoken answer: the one to concentrate on, why (each reason against the other zone's own figure), how each is moving, what drives it
  const other = rest[0];
  // the reasons are only the parts where the first zone leads the next one, the heaviest first; a part where the other leads is said after,
  // as what to watch there (so "Teynampet first" never comes with "50 overdue against 194")
  const PARTS: { key: "overdue" | "severe" | "now" | "rise" | "repeat"; w: number }[] = [{ key: "overdue", w: 0.3 }, { key: "rise", w: 0.2 }, { key: "severe", w: 0.2 }, { key: "now", w: 0.15 }, { key: "repeat", w: 0.15 }];
  const val = (z: ZoneFocus, k: (typeof PARTS)[number]["key"]) => (k === "rise" ? Math.max(0, z.z) : z[k]);
  const partEn = (k: (typeof PARTS)[number]["key"], z: ZoneFocus, o2: ZoneFocus | undefined) => k === "overdue" ? `${z.overdue} open past their deadline against ${o2?.overdue ?? 0}`
    : k === "severe" ? `${z.severe} severe in ${win.now.en} against ${o2?.severe ?? 0}` : k === "now" ? `${z.now} reports in ${win.now.en} against ${o2?.now ?? 0}`
    : k === "repeat" ? `${z.repeat} repeat reports against ${o2?.repeat ?? 0}` : `reports ${pctWord(z.pct, "up", "down")} (${z.prev} to ${z.now})${o2 ? ` while ${o2.name.en} is ${o2.pct == null ? "flat" : pctWord(o2.pct, "up", "down")}` : ""}`;
  const partTa = (k: (typeof PARTS)[number]["key"], z: ZoneFocus, o2: ZoneFocus | undefined) => k === "overdue" ? `காலக்கெடு தாண்டித் திறந்திருப்பவை ${z.overdue}, ${o2 ? `${o2.name.ta}-ல ${o2.overdue}` : ""}`
    : k === "severe" ? `${win.now.ta} கடுமையானவை ${z.severe}, ${o2 ? `${o2.name.ta}-ல ${o2.severe}` : ""}` : k === "now" ? `${win.now.ta} பதிவுகள் ${z.now}, ${o2 ? `${o2.name.ta}-ல ${o2.now}` : ""}`
    : k === "repeat" ? `திரும்ப வந்தவை ${z.repeat}, ${o2 ? `${o2.name.ta}-ல ${o2.repeat}` : ""}` : `பதிவுகள் ${z.prev}லிருந்து ${z.now}${z.pct != null ? ` (${Math.abs(z.pct)}% ${z.pct >= 0 ? "கூடுதல்" : "குறைவு"})` : ""}`;
  const leads0 = other ? PARTS.filter((p) => val(first, p.key) > val(other, p.key) && (p.key !== "rise" || first.trend === "worse")).sort((p, q) => q.w - p.w) : PARTS.slice(0, 2);
  // (the rise already says the zone's count: the count is not said again as a reason of its own)
  const leads = leads0.some((p) => p.key === "rise") ? leads0.filter((p) => p.key !== "now") : leads0;
  const lags = other ? PARTS.filter((p) => p.key !== "rise" && val(other, p.key) > val(first, p.key) && p.w >= 0.2) : [];
  const why = (en: boolean) => leads.slice(0, 2).map((p) => (en ? partEn(p.key, first, other) : partTa(p.key, first, other))).join(en ? ", and " : "; ");
  const counter = other && lags[0] ? { en: `${other.name.en} has more ${lags[0].key === "overdue" ? `open past their deadline (${other.overdue} against ${first.overdue})` : `severe reports (${other.severe} against ${first.severe})`}: chase that too.`,
    ta: `${other.name.ta}-ல ${lags[0].key === "overdue" ? `காலக்கெடு தாண்டியவை அதிகம் (${other.overdue}, இங்கே ${first.overdue})` : `கடுமையானவை அதிகம் (${other.severe}, இங்கே ${first.severe})`}: அதையும் கவனிக்கணும்.` } : null;
  const owner = first.owner && first.owner.n >= 2 ? { en: `${deptName(c, first.owner.dept).en} holds ${first.owner.n} of ${first.name.en}'s overdue cases.`, ta: `${first.name.ta}-ன் காலக்கெடு தாண்டிய ${first.owner.n} புகார்கள் ${deptName(c, first.owner.dept).ta} வசம்.` } : null;
  const move = (z: ZoneFocus, en: boolean) => z.trend === "worse" ? (en ? `${z.name.en} is getting worse, ${z.prev} to ${z.now}` : `${z.name.ta} மோசமாகுது, ${z.prev}லிருந்து ${z.now}`)
    : z.trend === "better" ? (en ? `${z.name.en} is improving, ${z.prev} to ${z.now}` : `${z.name.ta} முன்னேறுது, ${z.prev}லிருந்து ${z.now}`)
    // a change within ordinary ups and downs is said as the counts it is, never as "steady (90 to 115)"
    : z.delta === 0 ? (en ? `${z.name.en} is unchanged at ${z.now}` : `${z.name.ta} மாறலை (${z.now})`)
    : (en ? `${z.name.en} ${z.delta > 0 ? "rose" : "fell"} from ${z.prev} to ${z.now}, within ordinary ups and downs` : `${z.name.ta} ${z.prev}லிருந்து ${z.now} ஆச்சு, வழக்கமான ஏற்ற இறக்கத்துக்குள்`);
  const driver = first.rise && first.trend === "worse" ? first.rise : first.top?.[0] ? { cat: first.top[0].cat, label: first.top[0].label, now: first.top[0].now, prev: null as number | null } : null;
  // "which of the two is getting worse / improving": the trends first, side by side, then where to concentrate
  const trendAsk = o.lenses[0] === "worsening" || o.lenses[0] === "improving";
  const byMove = [...zs].sort((p, q) => (o.lenses[0] === "improving" ? p.z - q.z : q.z - p.z));
  const real = byMove.filter((z) => z.trend === (o.lenses[0] === "improving" ? "better" : "worse"));
  const trendEn = real.length ? `${list(real.map((z) => z.name.en), "and")} ${real.length > 1 ? "are" : "is"} ${o.lenses[0] === "improving" ? "improving" : "getting worse"} beyond ordinary ups and downs: ${list(zs.map((z) => move(z, true)), "and")}.`
    : `Neither is ${o.lenses[0] === "improving" ? "improving" : "getting worse"} beyond ordinary ups and downs over ${win.now.en}: ${list(zs.map((z) => move(z, true)), "and")}.`;
  const trendTa = real.length ? `${list(real.map((z) => z.name.ta), "மற்றும்")} ${o.lenses[0] === "improving" ? "உண்மையிலேயே முன்னேறுது" : "வழக்கத்தை மீறி மோசமாகுது"}: ${list(zs.map((z) => move(z, false)), "மற்றும்")}.`
    : `${win.now.ta} எதுவும் வழக்கத்தை மீறி ${o.lenses[0] === "improving" ? "முன்னேறலை" : "மோசமாகலை"}: ${list(zs.map((z) => move(z, false)), "மற்றும்")}.`;
  // (the grader, 22 Nov: a trend question answered with the trends and then a where-to-concentrate verdict was "muddled": it gets the trends
  // and what moved most in the zone that moved most, nothing else)
  const mover = [...zs].sort((p, q) => (o.lenses[0] === "improving" ? p.delta - q.delta : q.delta - p.delta))[0];
  const moved = mover ? (o.lenses[0] === "improving" ? mover.fall : mover.rise) : null;
  if (trendAsk && mover) {
    const enT = [trendEn, moved && (o.lenses[0] === "improving" ? mover.delta < 0 : mover.delta > 0)
      ? `${mover.name.en} ${o.lenses[0] === "improving" ? "fell" : "rose"} more, mostly ${o.kindEn(moved.cat, moved.label)} (${moved.prev} to ${moved.now}).` : ""].filter(Boolean);
    const taT = [trendTa, moved && (o.lenses[0] === "improving" ? mover.delta < 0 : mover.delta > 0)
      ? `${mover.name.ta}-ல ${o.lenses[0] === "improving" ? "அதிகம் குறைஞ்சிருக்கு" : "அதிகம் கூடியிருக்கு"}, பெரும்பாலும் ${o.kindTa(moved.cat, moved.label)} (${moved.prev}லிருந்து ${moved.now}).` : ""].filter(Boolean);
    return { title: L(`${list(zs.map((z) => z.name.en), "or")}: which is ${o.lenses[0] === "improving" ? "improving" : "getting worse"} · ${win.now.en}`, `${list(zs.map((z) => z.name.ta), "அல்லது")}: எது ${o.lenses[0] === "improving" ? "முன்னேறுது" : "மோசமாகுது"} · ${win.short.ta}`) + o.ofKind,
      takeaway: { en: enT[0], ta: taT[0] }, say: { en: enT.join(" "), ta: taT.join(" ") }, blocks: blocks.slice(0, 6), next: [] };
  }
  const en = [`Of ${list(zs.map((z) => z.name.en), "and")}, concentrate on ${first.name.en} first${why(true) ? `: ${why(true)}` : ""}.`,
    driver ? `In ${first.name.en} it is mostly ${o.kindEn(driver.cat, driver.label)}${driver.prev != null ? ` (${driver.prev} to ${driver.now})` : ` (${driver.now})`}.` : "",
    owner?.en ?? "",
    counter?.en ?? (trendAsk ? "" : `${move(first, true)}; ${list(rest.map((z) => move(z, true)), "and")}.`),
    rank(first) ? `${first.name.en} is number ${rank(first)} of ${a.attention.length} zones for attention.` : ""].filter(Boolean);
  const ta = [`${list(zs.map((z) => z.name.ta), "மற்றும்")} இதுல முதல்ல ${first.name.ta}-ல கவனம் செலுத்தணும்${why(false) ? `: ${why(false)}` : ""}.`,
    driver ? `${first.name.ta}-ல பெரும்பாலும் ${o.kindTa(driver.cat, driver.label)}${driver.prev != null ? ` (${driver.prev}லிருந்து ${driver.now})` : ` (${driver.now})`}.` : "",
    owner?.ta ?? "",
    counter?.ta ?? (trendAsk ? "" : `${move(first, false)}; ${list(rest.map((z) => move(z, false)), "மற்றும்")}.`),
    rank(first) ? `கவனத்துக்கு ${a.attention.length} மண்டலங்களில் ${first.name.ta} ${rank(first)}-வது.` : ""].filter(Boolean);
  const next: NextStepT[] = [{ label: { en: `What needs me first in ${first.name.en}?`, ta: `${first.name.ta}-ல முதல்ல என்ன?` }, kind: "direct", recipe: "advise", slots: { zones: [first.zone], period: "weekly" }, ids: [], text: null },
    { label: { en: `Why ${first.name.en}?`, ta: `${first.name.ta}: ஏன்?` }, kind: "direct", recipe: "why", slots: { zones: [first.zone], period }, ids: [], text: null }];
  return { title: (trendAsk ? L(`${list(zs.map((z) => z.name.en), "or")}: which is ${o.lenses[0] === "improving" ? "improving" : "getting worse"} · ${win.now.en}`, `${list(zs.map((z) => z.name.ta), "அல்லது")}: எது ${o.lenses[0] === "improving" ? "முன்னேறுது" : "மோசமாகுது"} · ${win.short.ta}`)
    : L(`${list(zs.map((z) => z.name.en), "or")}: where to concentrate · ${win.now.en}`, `${list(zs.map((z) => z.name.ta), "அல்லது")}: எங்கே கவனம் · ${win.short.ta}`)) + o.ofKind,
    takeaway: { en: en[0], ta: ta[0] }, say: { en: en.slice(0, 4).join(" "), ta: ta.slice(0, 4).join(" ") }, blocks: blocks.slice(0, 6), next };
}

/** v16: one zone's own trend: its count against the window before, week by week, the kinds moving in it, its backlog and its rank. */
function oneZone(z: ZoneFocus, a: ReturnType<typeof analyseFocusFrom>, c: RecipeCtx, o: Words & { nm: (z: ZoneFocus) => string; lenses: Lens[] }): RecipePart {
  const { L, win, period } = o;
  const rank = a.attention.findIndex((x) => x.zone === z.zone) + 1;
  const others = (z.moves ?? []).filter((m) => !c.s.cat || m.cat !== c.s.cat);
  const ups = others.filter((m) => m.delta > 0), downs = others.filter((m) => m.delta < 0);
  const place = typeof c.slots.q === "string" && c.slots.q.trim() && !new RegExp(z.name.en, "i").test(c.slots.q) ? c.slots.q.trim() : null;
  const blocks: BlockT[] = [
    { kind: "Kpis", id: "kpis", title: clip(L(`${z.name.en} · ${win.now.en}${o.ofKind}`, `${z.name.ta} · ${win.short.ta}${o.ofKind}`), 120), items: [
      { key: "now", label: clip(L(`Reports, ${win.now.en}`, `பதிவுகள், ${win.short.ta}`), 80), value: z.now, unit: null, prev: z.prev, delta: z.delta, pct: z.pct, tone: z.trend === "worse" ? "bad" as const : z.trend === "better" ? "good" as const : "neutral" as const, spark: z.weekly.slice(-12) },
      { key: "overdue", label: clip(L(`Open past deadline${z.owner && z.owner.n >= 2 ? ` (${z.owner.n} with ${deptName(c, z.owner.dept).en})` : ""}`, `காலக்கெடு தாண்டியவை${z.owner && z.owner.n >= 2 ? ` (${z.owner.n} ${deptName(c, z.owner.dept).ta})` : ""}`), 80), value: z.overdue, unit: null, prev: null, delta: null, tone: z.overdue ? "bad" as const : "neutral" as const, spark: [] },
      { key: "severe", label: clip(L(`Severe, ${win.now.en} (${z.severeOpen} open)`, `கடுமையானவை, ${win.short.ta} (${z.severeOpen} திறந்தவை)`), 80), value: z.severe, unit: null, prev: null, delta: null, tone: z.severe ? "bad" as const : "neutral" as const, spark: [] },
      { key: "rank", label: L("Rank for attention", "கவனத் தரவரிசை"), value: rank || a.attention.length, unit: L(`of ${a.attention.length}`, `/ ${a.attention.length}`), prev: null, delta: null, tone: rank && rank <= 3 ? "bad" as const : "neutral" as const, spark: [] }
    ] },
    { kind: "Trend", id: "weeks", title: clip(L(`${z.name.en}, reports week by week (12 weeks)`, `${z.name.ta}, வாரவாரியாகப் பதிவுகள் (12 வாரம்)`), 160), unit: L("reports", "பதிவுகள்"), labels: a.weekLabels, values: z.weekly, marks: [], normal: null }
  ];
  const mv = (z.moves ?? []).filter((m) => m.delta !== 0);
  if (mv.length) blocks.push({ kind: "Chart", id: "kinds", title: clip(L(`${z.name.en}: what moved, ${win.now.en} against ${win.before.en}`, `${z.name.ta}: எது மாறியது`), 160), chart: "hbar", unit: L("reports", "பதிவுகள்"),
    labels: mv.map((m) => clip(`${o.lang === "ta" ? o.kindTa(m.cat, m.label) : o.kindEn(m.cat, m.label)} (${m.prev}→${m.now})`, 40)), values: mv.map((m) => m.delta) });
  const spots = a.spots.filter((s) => s.zone === z.zone);
  if (spots.length) blocks.push({ kind: "Ranking", id: "repeat", title: L(`Where problems keep coming back in ${z.name.en}`, `${z.name.ta}-ல திரும்ப வரும் இடங்கள்`), unit: L("reports", "புகார்கள்"), order: "top",
    method: L("Places with 3 or more reports of one kind in the window.", "ஒரே வகையில் 3 அல்லது அதற்கு மேல் புகார் வந்த இடங்கள்."),
    items: spots.slice(0, 6).map((s, i) => ({ key: `${s.zone}-${i}`, label: clip(s.place, 120), value: s.n, rank: i + 1, sub: clip(o.lang === "ta" ? o.kindTa(s.cat, s.label) : o.kindEn(s.cat, s.label), 160), zone: s.zone, lat: null, lon: null, action: "zone" as const })) });
  const moveEn = z.trend === "worse" ? `getting worse beyond ordinary ups and downs: ${z.now} reports in ${win.now.en} against ${z.prev} before, ${pctWord(z.pct, "up", "down")}`
    : z.trend === "better" ? `improving beyond ordinary ups and downs: ${z.now} reports in ${win.now.en} against ${z.prev} before, ${pctWord(z.pct, "up", "down")}`
    : `steady: ${z.now} reports in ${win.now.en} against ${z.prev} before, within ordinary ups and downs`;
  const moveTa = z.trend === "worse" ? `மோசமாகுது: ${win.now.ta} ${z.now} பதிவு, முன்பு ${z.prev}` : z.trend === "better" ? `முன்னேறுது: ${win.now.ta} ${z.now} பதிவு, முன்பு ${z.prev}` : `நிலையா இருக்கு: ${win.now.ta} ${z.now} பதிவு, முன்பு ${z.prev}`;
  const en = [`${place ? `${place} is in ${z.name.en} zone; ` : ""}${z.name.en}${o.ofKind ? `'s ${o.ofKind.replace(/^ · /, "").toLowerCase()}` : ""} is ${moveEn}.`,
    ups[0] ? `${o.kindEn(ups[0].cat, ups[0].label)} rose most (${ups[0].prev} to ${ups[0].now})${downs[0] ? `; ${o.kindEn(downs[0].cat, downs[0].label)} fell (${downs[0].prev} to ${downs[0].now})` : ""}.` : downs[0] ? `${o.kindEn(downs[0].cat, downs[0].label)} fell most (${downs[0].prev} to ${downs[0].now}).` : "",
    z.overdue ? `${z.overdue} cases there are open past their deadline${z.owner && z.owner.n >= 2 ? `, ${z.owner.n} of them with ${deptName(c, z.owner.dept).en}` : ""}${z.severeOpen ? `; ${z.severeOpen} open ones are severe` : ""}.` : "",
    rank ? `It is number ${rank} of ${a.attention.length} zones for attention.` : ""].filter(Boolean);
  const ta = [`${place ? `${place} ${z.name.ta} மண்டலத்துல இருக்கு; ` : ""}${z.name.ta}${o.ofKind ? ` ${o.ofKind.replace(/^ · /, "")}` : ""} ${moveTa}.`,
    ups[0] ? `அதிகம் கூடியது ${o.kindTa(ups[0].cat, ups[0].label)} (${ups[0].prev}லிருந்து ${ups[0].now})${downs[0] ? `; ${o.kindTa(downs[0].cat, downs[0].label)} குறைஞ்சிருக்கு (${downs[0].prev}லிருந்து ${downs[0].now})` : ""}.` : downs[0] ? `அதிகம் குறைஞ்சது ${o.kindTa(downs[0].cat, downs[0].label)} (${downs[0].prev}லிருந்து ${downs[0].now}).` : "",
    z.overdue ? `அங்கே ${z.overdue} காலக்கெடு தாண்டித் திறந்திருக்கு${z.owner && z.owner.n >= 2 ? `, அதில் ${z.owner.n} ${deptName(c, z.owner.dept).ta} வசம்` : ""}.` : "",
    rank ? `கவனத்துக்கு ${a.attention.length} மண்டலங்களில் ${rank}-வது.` : ""].filter(Boolean);
  const next: NextStepT[] = [{ label: { en: `What needs me first in ${z.name.en}?`, ta: `${z.name.ta}-ல முதல்ல என்ன?` }, kind: "direct", recipe: "advise", slots: { zones: [z.zone], period: "weekly" }, ids: [], text: null },
    { label: { en: `Why is ${z.name.en} moving?`, ta: `${z.name.ta}: ஏன்?` }, kind: "direct", recipe: "why", slots: { zones: [z.zone], period }, ids: [], text: null }];
  return { title: L(`${z.name.en}: how it is trending · ${win.now.en}`, `${z.name.ta}: போக்கு · ${win.short.ta}`) + o.ofKind, takeaway: { en: en[0], ta: ta[0] },
    say: { en: en.slice(0, 4).join(" "), ta: ta.slice(0, 4).join(" ") }, blocks: blocks.slice(0, 6), next };
}

/** v16: the kinds of report rising and falling across the district, each tested as the zones are. */
function byKinds(a: ReturnType<typeof analyseFocusFrom>, c: RecipeCtx, o: Words & { lenses: Lens[] }): RecipePart {
  const { L, win } = o;
  const kinds = a.kinds ?? [];
  const up = kinds.filter((k) => k.trend === "worse"), down = [...kinds].reverse().filter((k) => k.trend === "better");
  const nameOf = (k: { cat: string; label: string }) => (o.lang === "ta" ? o.kindTa(k.cat, k.label) : o.kindEn(k.cat, k.label));
  const shown = kinds.filter((k) => k.delta !== 0).slice(0, 15);
  const blocks: BlockT[] = [
    { kind: "Findings", id: "kinds", title: clip(L(`Kinds of report rising and falling · ${win.now.en} against ${win.before.en}`, `கூடும், குறையும் புகார் வகைகள் · ${win.short.ta}`), 160), items: [
      ...up.slice(0, 4).map((k) => ({ title: clip(L(`${o.kindEn(k.cat, k.label)} is rising: ${k.prev} to ${k.now}${k.pct != null ? `, up ${k.pct}%` : ""}`, `${o.kindTa(k.cat, k.label)} கூடுது: ${k.prev}லிருந்து ${k.now}`), 240), value: k.pct ?? k.delta, unit: k.pct != null ? "%" : null,
        method: clip(L(`${Math.round(zOf(k.now, k.prev) * 10) / 10} standard deviations above the window before (Poisson)`, "முந்தைய காலத்தை விட அதிகம் (Poisson)"), 200), n: k.now + k.prev, caveat: L("More reports can also mean more reporting.", "அதிகப் பதிவு என்றால் அதிகம் புகார் செய்யப்பட்டது என்றும் இருக்கலாம்."), tone: "bad" as const })),
      ...down.slice(0, 4).map((k) => ({ title: clip(L(`${o.kindEn(k.cat, k.label)} is falling: ${k.prev} to ${k.now}${k.pct != null ? `, down ${Math.abs(k.pct)}%` : ""}`, `${o.kindTa(k.cat, k.label)} குறையுது: ${k.prev}லிருந்து ${k.now}`), 240), value: k.pct ?? k.delta, unit: k.pct != null ? "%" : null,
        method: clip(L(`${Math.abs(Math.round(zOf(k.now, k.prev) * 10) / 10)} standard deviations below the window before (Poisson)`, "முந்தைய காலத்தை விட குறைவு (Poisson)"), 200), n: k.now + k.prev, caveat: L("Fewer reports can also mean less reporting.", "குறைவான பதிவு என்றால் குறைவாகப் புகார் செய்யப்பட்டது என்றும் இருக்கலாம்."), tone: "ok" as const }))
    ] },
    { kind: "Chart", id: "change", title: clip(L(`Change by kind (${win.now.en} against ${win.before.en})`, `வகைவாரியாக மாற்றம் (${win.short.ta})`), 160), chart: "hbar", unit: L("reports", "பதிவுகள்"), labels: shown.map((k) => clip(nameOf(k), 80)), values: shown.map((k) => k.delta) }
  ];
  if (!(blocks[0] as { items: unknown[] }).items.length) (blocks[0] as { items: unknown[] }).items.push({ title: L(`No kind of report moved beyond ordinary ups and downs over ${win.now.en}`, `${win.now.ta} எந்த வகையும் வழக்கமான ஏற்ற இறக்கத்தைத் தாண்டலை`), value: null, unit: null,
    method: L(`${a.district.now} reports now against ${a.district.prev} before`, `இப்போது ${a.district.now}, முன்பு ${a.district.prev}`), n: kinds.length, caveat: L("Each kind's change was within 2 standard deviations.", "ஒவ்வொரு வகையின் மாற்றமும் 2 திட்ட விலக்கத்துக்குள்."), tone: "ok" });
  // where the biggest riser comes from: the zones with the most of it now
  const lead = up[0] ?? shown[0];
  const zonesOfLead = lead ? a.zones.map((z) => ({ z, k: (z.moves ?? []).find((m) => m.cat === lead.cat) })).filter((x) => x.k && x.k.delta > 0).sort((p, q) => q.k!.delta - p.k!.delta).slice(0, 2) : [];
  const en = [up.length ? `Rising beyond ordinary ups and downs over ${win.now.en}: ${list(up.slice(0, 2).map((k) => `${o.kindEn(k.cat, k.label)}, ${k.prev} to ${k.now}`), "and")}.` : `No kind of report is rising beyond ordinary ups and downs over ${win.now.en}${shown[0] && shown[0].delta > 0 ? `; the biggest rise is ${o.kindEn(shown[0].cat, shown[0].label)}, ${shown[0].prev} to ${shown[0].now}` : ""}.`,
    zonesOfLead.length && lead ? `Most of the rise in ${o.kindEn(lead.cat, lead.label)} is in ${list(zonesOfLead.map((x) => x.z.name.en), "and")}.` : "",
    down.length ? `Falling: ${list(down.slice(0, 2).map((k) => `${o.kindEn(k.cat, k.label)}, ${k.prev} to ${k.now}`), "and")}.` : ""].filter(Boolean);
  const ta = [up.length ? `${win.now.ta} கூடிட்டு வர்றது: ${list(up.slice(0, 2).map((k) => `${o.kindTa(k.cat, k.label)}, ${k.prev}லிருந்து ${k.now}`), "மற்றும்")}.` : `${win.now.ta} எந்த வகையும் வழக்கத்தை மீறிக் கூடலை.`,
    zonesOfLead.length && lead ? `${o.kindTa(lead.cat, lead.label)} அதிகம் கூடியது ${list(zonesOfLead.map((x) => x.z.name.ta), "மற்றும்")}-ல.` : "",
    down.length ? `குறைஞ்சிட்டு வர்றது: ${list(down.slice(0, 2).map((k) => `${o.kindTa(k.cat, k.label)}, ${k.prev}லிருந்து ${k.now}`), "மற்றும்")}.` : ""].filter(Boolean);
  return { title: L(`Which kinds of problem are rising · ${win.now.en}`, `எந்த வகைப் பிரச்சனை கூடுது · ${win.short.ta}`), takeaway: { en: en[0], ta: ta[0] }, say: { en: en.join(" "), ta: ta.join(" ") }, blocks, next: [] };
}

function attentionBlock(zs: ZoneFocus[], L: (en: string, ta: string) => string, nm: (z: ZoneFocus) => string, lang: Lang, title?: string, c?: RecipeCtx): BlockT {
  return { kind: "Ranking", id: "focus", title: title ?? L("Where to concentrate, first to last", "எங்கே முதலில் கவனிக்கணும்"), unit: L("score of 100", "100-க்கு மதிப்பெண்"), order: "top",
    method: L("Overdue backlog 30%, severe 20%, reports 15%, a rise beyond ordinary ups and downs 20%, repeat reports 15%; each against the highest zone.", "தாமதமான நிலுவை 30%, கடுமையானவை 20%, பதிவுகள் 15%, வழக்கத்தை மீறிய உயர்வு 20%, திரும்ப வந்தவை 15%."),
    items: zs.slice(0, 8).map((z, i) => ({ key: String(z.zone), label: clip(nm(z), 120), value: z.score, rank: i + 1, sub: clip([...z.reasons.map((x) => (lang === "ta" ? x.ta : x.en)), ...(z.owner && z.owner.n >= 2 ? [lang === "ta" ? `${z.owner.n} ${DEPT_TA[z.owner.dept] ?? z.owner.dept} வசம்` : `${z.owner.n} with ${c ? deptName(c, z.owner.dept).en : z.owner.dept}`] : [])].join(" · "), 160) || null, zone: z.zone, lat: null, lon: null, action: "zone" as const })) };
}

function findingsBlock(a: ReturnType<typeof analyseFocusFrom>, L: (en: string, ta: string) => string, win: ReturnType<typeof windowWords>): BlockT {
  const findings: Extract<BlockT, { kind: "Findings" }> = { kind: "Findings", id: "trends", title: clip(L(`Getting worse and improving · ${win.now.en} against ${win.before.en}`, `மோசமாகுது, முன்னேறுது · ${win.short.ta}`), 160), items: [
    ...a.worse.slice(0, 4).map((z) => ({ title: clip(L(`${z.name.en} is getting worse: ${z.prev} to ${z.now}, up ${z.pct ?? 0}%${z.rise ? `; mostly ${z.rise.label} (${z.rise.prev} to ${z.rise.now})` : ""}`,
      `${z.name.ta} மோசமாகுது: ${z.prev}லிருந்து ${z.now}, ${z.pct ?? 0}% கூடுதல்${z.rise ? `; பெரும்பாலும் ${z.rise.label} (${z.rise.prev}லிருந்து ${z.rise.now})` : ""}`), 240),
      value: z.pct ?? 0, unit: "%", method: clip(L(`${z.z} standard deviations above the window before (Poisson)`, `முந்தைய காலத்தை விட ${z.z} திட்ட விலக்கம் அதிகம்`), 200), n: z.now + z.prev,
      caveat: L("More reports can also mean more reporting.", "அதிகப் பதிவு என்றால் அதிகம் புகார் செய்யப்பட்டது என்றும் இருக்கலாம்."), tone: "bad" as const })),
    ...a.better.slice(0, 4).map((z) => ({ title: clip(L(`${z.name.en} is improving: ${z.prev} to ${z.now}, down ${Math.abs(z.pct ?? 0)}%${z.fall ? `; mostly ${z.fall.label} (${z.fall.prev} to ${z.fall.now})` : ""}`,
      `${z.name.ta} முன்னேறுது: ${z.prev}லிருந்து ${z.now}, ${Math.abs(z.pct ?? 0)}% குறைவு${z.fall ? `; பெரும்பாலும் ${z.fall.label} (${z.fall.prev}லிருந்து ${z.fall.now})` : ""}`), 240),
      value: z.pct ?? 0, unit: "%", method: clip(L(`${Math.abs(z.z)} standard deviations below the window before (Poisson)`, `முந்தைய காலத்தை விட ${Math.abs(z.z)} திட்ட விலக்கம் குறைவு`), 200), n: z.now + z.prev,
      caveat: L("Fewer reports can also mean less reporting.", "குறைவான பதிவு என்றால் குறைவாகப் புகார் செய்யப்பட்டது என்றும் இருக்கலாம்."), tone: "ok" as const }))
  ] };
  if (!findings.items.length) findings.items.push({ title: L(`No area moved beyond ordinary ups and downs over ${win.now.en}`, `${win.now.ta} எந்தப் பகுதியும் வழக்கமான ஏற்ற இறக்கத்தைத் தாண்டலை`), value: a.district.delta, unit: null,
    method: L(`${a.district.now} reports now against ${a.district.prev} before`, `இப்போது ${a.district.now}, முன்பு ${a.district.prev}`), n: a.zones.length, caveat: L("Each zone's change was within 2 standard deviations.", "ஒவ்வொரு மண்டலத்தின் மாற்றமும் 2 திட்ட விலக்கத்துக்குள்."), tone: "ok" });
  return findings;
}

function spotsBlock(a: ReturnType<typeof analyseFocusFrom>, L: (en: string, ta: string) => string, nm: (z: ZoneFocus) => string, win: ReturnType<typeof windowWords>, kindName: (cat: string | undefined, label: string) => string): BlockT | null {
  if (!a.spots.length) return null;
  return { kind: "Ranking", id: "repeat", title: L(`Where problems keep coming back · ${win.now.en}`, `திரும்பத் திரும்ப வரும் இடங்கள் · ${win.short.ta}`), unit: L("reports", "புகார்கள்"), order: "top",
    method: L("Places with 3 or more reports of one kind in the window.", "ஒரே வகையில் 3 அல்லது அதற்கு மேல் புகார் வந்த இடங்கள்."),
    items: a.spots.slice(0, 8).map((s, i) => ({ key: `${s.zone}-${i}`, label: clip(`${s.place}`, 120), value: s.n, rank: i + 1,
      sub: clip(`${a.zones.find((z) => z.zone === s.zone) ? nm(a.zones.find((z) => z.zone === s.zone) as ZoneFocus) : s.name} · ${kindName(s.cat, s.label)}${s.open ? L(` · ${s.open} still open`, ` · ${s.open} திறந்திருக்கு`) : ""}`, 160),
      zone: s.zone, lat: null, lon: null, action: "zone" as const })) };
}

/** a zone named with no report in either window: all zeros, so the comparison still says so */
function emptyZone(n: number, c: RecipeCtx): ZoneFocus | null {
  const w = c.w.zones.find((x) => x.n === n);
  if (!w) return null;
  return { zone: n, name: { en: w.name, ta: w.ta || w.name }, now: 0, prev: 0, delta: 0, pct: null, z: 0, trend: "steady", weekly: new Array(12).fill(0), slopePct: null,
    severe: 0, repeat: 0, open: 0, overdue: 0, severeOpen: 0, rise: null, fall: null, moves: [], top: [], score: 0, reasons: [] };
}

/** The tool's zones again with this world's names (Tamil included); its analysis is otherwise the same numbers. */
function analyseFocusFrom(zones: ZoneFocus[], d: Row, c: RecipeCtx, days: 7 | 28 | 84, spots: FocusRows["repeats"]) {
  const named = zones.map((z) => {
    const w = c.w.zones.find((x) => x.n === z.zone);
    return { ...z, name: { en: w?.name || z.name.en, ta: w?.ta || w?.name || z.name.ta }, reasons: z.reasons };
  });
  // the reasons carry the zone's name nowhere, so they stand; the lists keep the tool's order
  const byId = new Map(named.map((z) => [z.zone, z]));
  const pickIds = (ids: unknown) => ((ids ?? []) as number[]).map((id) => byId.get(id)).filter((z): z is ZoneFocus => !!z);
  const attention = pickIds(d.attention), worse = pickIds(d.worse), better = pickIds(d.better);
  const byChange = named.filter((z) => z.now + z.prev > 0).sort((a, b) => b.z - a.z || b.delta - a.delta);
  const district = (d.district ?? { now: 0, prev: 0, delta: 0, pct: null, weekly: [], overdue: 0, open: 0 }) as ReturnType<typeof analyseFocus>["district"];
  // v16: the kinds across the district (the tool's), or recomputed from its raw rows
  const kinds = Array.isArray(d.kinds) ? (d.kinds as NonNullable<ReturnType<typeof analyseFocus>["kinds"]>) : Array.isArray(d.rawKinds) ? kindsOf(d.rawKinds as FocusRows["kinds"]) : [];
  void trendOf;
  return { days, weekLabels: ((d.weekLabels ?? []) as string[]).map((x) => clip(x, 40)), zones: named, attention, worse, better, byChange, district, spots: spots.filter((s) => num(s.n) != null && (/AIR/i.test(c.s.cat ?? "") || !/\b(?:TNPCB|CPCB|IMD)\b/.test(s.place))), kinds };
}
