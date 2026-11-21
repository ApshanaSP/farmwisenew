/**
 * v15 (22 Nov): the "focus" screen. Where to concentrate, which areas are improving, which are getting worse, and where problems keep
 * coming back, from the past (the focus_trends tool; the analysis is v15/focus.ts). One screen answers all four: the lens the question asked
 * (read from its own words) orders the blocks and decides what is said; every figure said is on the screen.
 */
import { call, catName, clip, langFor, num, scopeArg, type Lang, type RecipeCtx, type RecipePart, type Row } from "./common";
import type { BlockT, NextStepT } from "../stage";
import { analyseFocus, focusAsk, focusSay, windowWords, type FocusRows, type Lens, type ZoneFocus } from "../v15/focus";

/** The lenses a screen's words ask (the planner may build it for any of them): attention when none is named. */
export function lensesOf(heard: string): Lens[] {
  const f = focusAsk(heard, null);
  return f?.lenses.length ? f.lenses : ["attention"];
}

export async function focusRecipe(c: RecipeCtx): Promise<RecipePart> {
  const lang: Lang = langFor(c);
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const lenses = lensesOf(c.heard);
  const asked = focusAsk(c.heard, null);
  // the window: the question's own ("this week", "monthly", "3 months"), else the screen's slot when the planner named one, else 4 weeks
  const days: 7 | 28 | 84 = asked && /\b(?:week|month|quarter|days?)\b|வார|மாச|மாத|காலாண்டு/iu.test(c.heard) ? asked.days
    : c.slots.period === "weekly" ? 7 : c.slots.period === "quarterly" ? 84 : 28;
  const r = await call(c, "focus_trends", { scope: scopeArg({ ...c.s, zone: null }), days });
  const d = (r.data ?? {}) as Row;
  // the tool's analysis carries the store's zone names; the screen gives this world's (Tamil included): the same rows, the same numbers
  const a = analyseFocusFrom((d.zones ?? []) as ZoneFocus[], d, c, days, (d.spots ?? []) as FocusRows["repeats"]);
  const win = windowWords(days);
  const nm = (z: ZoneFocus) => (lang === "ta" ? z.name.ta : z.name.en);
  const kindName = (cat: string | undefined, label: string) => { const k = catName(c.w, cat, label); return k ? (lang === "ta" ? k.ta : k.en) : label; };
  for (const z of a.zones) {
    if (z.rise) z.rise.label = kindName(z.rise.cat, z.rise.label);
    if (z.fall) z.fall.label = kindName(z.fall.cat, z.fall.label);
  }
  const blocks: BlockT[] = [];
  const top = a.attention[0];
  blocks.push({ kind: "Kpis", id: "kpis", title: L(`Focus and trends · ${win.now.en}`, `கவனம், போக்கு · ${win.short.ta}`), items: [
    ...(top ? [{ key: "focus", label: clip(L(`Concentrate first: ${top.name.en}`, `முதல் கவனம்: ${top.name.ta}`), 80), value: top.overdue, unit: L("overdue", "தாமதம்"), prev: null, delta: null, tone: "bad" as const, spark: top.weekly.slice(-12) }] : []),
    { key: "worse", label: L("Areas getting worse", "மோசமாகும் பகுதிகள்"), value: a.worse.length, unit: null, prev: null, delta: null, tone: a.worse.length ? "bad" as const : "neutral" as const, spark: [] },
    { key: "better", label: L("Areas improving", "முன்னேறும் பகுதிகள்"), value: a.better.length, unit: null, prev: null, delta: null, tone: a.better.length ? "good" as const : "neutral" as const, spark: [] },
    { key: "district", label: clip(L(`All reports, ${win.now.en}`, `மொத்தப் பதிவுகள், ${win.short.ta}`), 80), value: a.district.now, unit: null, prev: a.district.prev, delta: a.district.delta, pct: a.district.pct, tone: a.district.delta > 0 ? "bad" as const : a.district.delta < 0 ? "good" as const : "neutral" as const, spark: a.district.weekly }
  ] });
  const attention: BlockT = { kind: "Ranking", id: "focus", title: L("Where to concentrate, first to last", "எங்கே முதலில் கவனிக்கணும்"), unit: L("score of 100", "100-க்கு மதிப்பெண்"), order: "top",
    method: L("Overdue backlog 30%, severe 20%, reports 15%, a rise beyond ordinary ups and downs 20%, repeat reports 15%; each against the highest zone.", "தாமதமான நிலுவை 30%, கடுமையானவை 20%, பதிவுகள் 15%, வழக்கத்தை மீறிய உயர்வு 20%, திரும்ப வந்தவை 15%."),
    items: a.attention.slice(0, 8).map((z, i) => ({ key: String(z.zone), label: clip(nm(z), 120), value: z.score, rank: i + 1, sub: clip(z.reasons.map((x) => (lang === "ta" ? x.ta : x.en)).join(" · "), 160), zone: z.zone, lat: null, lon: null, action: "zone" as const })) };
  const findings: BlockT = { kind: "Findings", id: "trends", title: L(`Getting worse and improving · ${win.now.en} against ${win.before.en}`, `மோசமாகுது, முன்னேறுது · ${win.short.ta}`), items: [
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
  const moved = a.byChange.filter((z) => z.pct != null).slice(0, 15);
  const chart: BlockT = { kind: "Chart", id: "change", title: L(`Change by zone, % (${win.now.en} against ${win.before.en})`, `மண்டலவாரியாக மாற்றம், % (${win.short.ta})`), chart: "hbar", unit: "%",
    labels: moved.map((z) => clip(nm(z), 80)), values: moved.map((z) => z.pct ?? 0) };
  // the week-by-week line of the zone the answer is about: the first to concentrate on, the worst mover, or the best one
  const lead = lenses[0] === "improving" ? a.better[0] ?? top : lenses[0] === "worsening" ? a.worse[0] ?? top : top;
  const trend: BlockT | null = lead ? { kind: "Trend", id: "weeks", title: clip(L(`${lead.name.en}, reports week by week (12 weeks)`, `${lead.name.ta}, வாரவாரியாகப் பதிவுகள் (12 வாரம்)`), 160), unit: L("reports", "பதிவுகள்"),
    labels: a.weekLabels, values: lead.weekly, marks: [], normal: null } : null;
  const spots: BlockT | null = a.spots.length ? { kind: "Ranking", id: "repeat", title: L(`Where problems keep coming back · ${win.now.en}`, `திரும்பத் திரும்ப வரும் இடங்கள் · ${win.short.ta}`), unit: L("reports", "புகார்கள்"), order: "top",
    method: L("Places with 3 or more reports of one kind in the window.", "ஒரே வகையில் 3 அல்லது அதற்கு மேல் புகார் வந்த இடங்கள்."),
    items: a.spots.slice(0, 8).map((s, i) => ({ key: `${s.zone}-${i}`, label: clip(`${s.place}`, 120), value: s.n, rank: i + 1,
      sub: clip(`${a.zones.find((z) => z.zone === s.zone) ? nm(a.zones.find((z) => z.zone === s.zone) as ZoneFocus) : s.name} · ${kindName(s.cat, s.label)}${s.open ? L(` · ${s.open} still open`, ` · ${s.open} திறந்திருக்கு`) : ""}`, 160),
      zone: s.zone, lat: null, lon: null, action: "zone" as const })) } : null;
  const map: BlockT = { kind: "MapView", id: "map", title: L("Where to concentrate (darker: first)", "கவனிக்க வேண்டிய இடங்கள் (அடர்: முதலில்)"), rule: null,
    shade: { geo: "zone", label: L("score", "மதிப்பெண்"), values: a.zones.map((z) => ({ key: z.zone, value: z.score })) }, points: [], outline: [] };
  // the order: what was asked first
  const order: (BlockT | null)[] = lenses[0] === "repeat" ? [spots, attention, findings, chart, map]
    : lenses[0] === "improving" || lenses[0] === "worsening" ? [findings, chart, trend, attention, spots]
    : [attention, findings, chart, trend, spots, map];
  for (const b of order) if (b && blocks.length < 6) blocks.push(b);
  const say = focusSay(a, lenses);
  const takeaway = top ? { en: `Concentrate first on ${top.name.en}: ${top.reasons.slice(0, 2).map((x) => x.en).join(", ")}.`, ta: `முதல்ல ${top.name.ta}: ${top.reasons.slice(0, 2).map((x) => x.ta).join(", ")}.` } : null;
  c.notes.push(L(`Reports in ${win.now.en} against ${win.before.en}; "getting worse" and "improving" only beyond ordinary ups and downs (2 standard deviations).`,
    `${win.now.ta} பதிவுகள், ${win.before.ta} உடன் ஒப்பிட்டு; வழக்கமான ஏற்ற இறக்கத்தைத் தாண்டினால் மட்டுமே "மோசம்", "முன்னேற்றம்".`));
  c.notes.push(L("A rise in reports is not proof that things are worse on the ground: more reporting, or rain, raises counts too.", "பதிவுகள் கூடினால் நிலைமை மோசம் என்று உறுதியில்லை: அதிகப் புகார்களும் மழையும் எண்ணிக்கையைக் கூட்டும்."));
  const next: NextStepT[] = top ? [{ label: { en: `Why ${top.name.en}?`, ta: `${top.name.ta}: ஏன்?` }, kind: "direct", recipe: "why", slots: { zones: [top.zone], period: days === 7 ? "weekly" : days === 84 ? "quarterly" : "monthly" }, ids: [], text: null },
    ...(a.worse[0] && a.worse[0].zone !== top.zone ? [{ label: { en: `What is rising in ${a.worse[0].name.en}?`, ta: `${a.worse[0].name.ta}-ல என்ன கூடுது?` }, kind: "direct" as const, recipe: "why" as const, slots: { zones: [a.worse[0].zone], period: days === 7 ? "weekly" : "monthly" }, ids: [], text: null }] : [])] : [];
  const title = L(lenses[0] === "improving" ? `Which areas are improving · ${win.now.en}` : lenses[0] === "worsening" ? `Which areas are getting worse · ${win.now.en}` : lenses[0] === "repeat" ? `Where problems keep coming back · ${win.now.en}` : `Where to concentrate · ${win.now.en}`,
    lenses[0] === "improving" ? `எந்தப் பகுதிகள் முன்னேறுது · ${win.short.ta}` : lenses[0] === "worsening" ? `எந்தப் பகுதிகள் மோசமாகுது · ${win.short.ta}` : lenses[0] === "repeat" ? `திரும்பத் திரும்ப வரும் இடங்கள் · ${win.short.ta}` : `எங்கே கவனம் செலுத்தணும் · ${win.short.ta}`);
  c.asOf ??= r.asOf ?? null;
  return { title, takeaway, say, blocks, next };
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
  return { days, weekLabels: ((d.weekLabels ?? []) as string[]).map((x) => clip(x, 40)), zones: named, attention, worse, better, byChange, district, spots: spots.filter((s) => num(s.n) != null) };
}
