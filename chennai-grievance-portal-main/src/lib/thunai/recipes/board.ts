/**
 * 28 Nov: the comparison dashboard. The owner: "When I asked Jarvis to create a comparative dashboard of two areas, with its incidents, news,
 * etc., it didn't create a summary of those"; "if I ask for a comparison of two areas with the severe incidents, the dashboard should be
 * customised for severe incident comparison, not the overall everything, news and everything".
 *
 * Two to four places (zones or localities) or departments side by side over any window (v18 window reads, the same reads as the summary
 * dashboard, so a side's figure here is its own summary's figure): the measures in one table and on one scale, the kinds, the departments and
 * who reported them as grouped bars on one scale, day by day as lines, then each side's most urgent cases, its news, its air, rain and market
 * prices, and the map. Only what was asked: severe incidents only, a group of kinds, one kind, or only the news; nothing narrowed, the overall
 * set. Every figure is code's; the spoken line says only figures on the screen (the brain writes its own summary from the same figures).
 */
import { spoken } from "../insight";
import { CAT_LABEL_TA } from "../narrate";
import { DEPT_TA, ZONES } from "../lexicon";
import { caseRow } from "../screens";
import type { Bilingual, BlockT, NextStepT, PointT, StageDocT } from "../stage";
import type { PeriodSpec } from "@/lib/period/read";
import { TOPICS, isTopic, topicCats } from "../v18/topics";
import { OutsideRecords, boundWords, overWords, windowOf, type Win } from "../v18/when";
import type { WinIncidents, WinNews, WinPrices, WinReading, WinScope } from "../v18/window";
import type { BoardPart } from "../board";
import { bi, clip, zoneName, type RecipeCtx } from "./common";
import type { SummaryPart } from "./summary";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const Over = (l: string) => { const o = overWords(l); return o.charAt(0).toUpperCase() + o.slice(1); };
const whenOf = (w: Win): StageDocT["when"] => (w.custom ? { en: clip(w.label.en, 160), ta: clip(w.label.ta, 200), from: w.from, to: w.to } : null);
const rupees = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ""));
const AQI_BANDS: [number, string, string][] = [[50, "good", "நல்லது"], [100, "satisfactory", "திருப்திகரம்"], [200, "moderate", "மிதமானது"], [300, "poor", "மோசம்"], [400, "very poor", "மிக மோசம்"], [1e9, "severe", "கடுமையானது"]];
const aqiBand = (v: number) => AQI_BANDS.find(([hi]) => v <= hi)!;

/** one side of the comparison: what it is, how its incidents and news are read, and its zone for the stations and the market */
export interface Side { key: string; name: Bilingual; scope: WinScope; zone: number | null; words: string[]; dept: string | null; drill: Record<string, unknown> }

/** the measures a comparison may show, in the screen's order */
const MEASURE: Record<string, Bilingual> = {
  n: bi("Reported", "பதிவானவை"), severe: bi("Severe", "கடுமையானவை"), open: bi("Still open", "நிலுவையில்"), overdue: bi("Past deadline", "கெடு தாண்டியவை"),
  resolved: bi("Resolved in this window", "தீர்க்கப்பட்டவை"), dead: bi("Deaths reported", "உயிரிழப்புகள்"), injured: bi("Injured", "காயமடைந்தோர்"),
  complaints: bi("Open citizen complaints", "நிலுவைப் புகார்கள்"), news: bi("News stories", "செய்திகள்"), prev: bi("The window before", "முந்தைய காலம்")
};
const FROM: [keyof NonNullable<WinIncidents["from"]>, Bilingual][] = [["citizens", bi("Citizen complaints", "குடிமக்கள் புகார்")], ["police", bi("Police reports", "காவல் அறிக்கை")],
  ["pwd", bi("PWD records", "பொதுப்பணித் துறை")], ["hospital", bi("Hospital records", "மருத்துவமனை")], ["news", bi("Newspapers", "செய்தித்தாள்கள்")]];

/** words that name a zone in a news report: its names in both languages and the gazetteer's places inside it */
function zoneWords(c: RecipeCtx, zone: number): string[] {
  const z = ZONES[zone];
  const out = [...(z?.en ?? []), ...(z?.ta ?? []), c.w.zones.find((x) => x.n === zone)?.name ?? ""];
  for (const p of c.w.places) if (p.zone === zone) out.push(p.name, ...p.aliases);
  return [...new Set(out.map((x) => x.toLowerCase().trim()).filter((x) => x.length >= 4))];
}

/** the sides the slots name: two to four zones, localities, or both; else two to four departments */
export function sidesOf(c: RecipeCtx): Side[] {
  const sl = c.slots;
  const fam = isTopic(sl.family) ? sl.family : null;
  const cats = fam ? topicCats(fam, c.w.cats) : sl.cat ? [sl.cat] : null;
  const sev = sl.sev === "Severe" || sl.sev === "High" ? sl.sev : null;
  const status = sl.status ?? null;
  const base = (o: Partial<WinScope>): WinScope => ({ zone: null, zones: null, place: null, exact: false, dept: sl.dept ?? null, cats, sev, taluk: null, status, ...o });
  const subj = { ...(fam ? { family: fam } : sl.cat ? { cat: sl.cat } : {}), ...(sev ? { sev } : {}), ...(status ? { status } : {}) };
  const places = sl.places ?? [];
  const out: Side[] = [];
  for (const z of sl.zones.slice(0, 4)) {
    const nm = zoneName(c.w, z);
    if (nm) out.push({ key: `z${z}`, name: nm, scope: base({ zone: z }), zone: z, words: zoneWords(c, z), dept: sl.dept ?? null, drill: { zones: [z], ...(sl.dept ? { dept: sl.dept } : {}), ...subj } });
  }
  for (const p of places.slice(0, 4 - out.length)) {
    const z = c.w.places.find((x) => x.name.toLowerCase() === p.toLowerCase())?.zone ?? null;
    out.push({ key: `p${out.length}`, name: bi(p, p), scope: base({ place: p }), zone: z, words: [p.toLowerCase()], dept: sl.dept ?? null, drill: { zones: [], place: p, ...(sl.dept ? { dept: sl.dept } : {}), ...subj } });
  }
  if (out.length >= 2) return out;
  if (sl.depts.length >= 2) return sl.depts.slice(0, 4).map((d) => {
    const en = c.w.depts.find((x) => x.code === d)?.name ?? d;
    return { key: `d${d}`, name: bi(en, DEPT_TA[d] ?? en), scope: base({ dept: d }), zone: null, words: [], dept: d, drill: { zones: [], dept: d, ...subj } };
  });
  return out;
}

/** the parts the dashboard holds: as asked; a subject alone (severe, a kind) is its incidents; nothing narrowed, all but live traffic */
export function partsFor(c: RecipeCtx): Set<BoardPart> {
  const asked = c.slots.parts ?? [];
  if (asked.length) return new Set(asked);
  const narrowed = !!(c.slots.sev || c.slots.family || c.slots.cat || c.slots.status);
  return new Set<BoardPart>(narrowed ? ["incidents"] : ["incidents", "news", "complaints", "reports", "prices", "air", "rain"]);
}

export async function compareBoard(c: RecipeCtx): Promise<SummaryPart> {
  const ta = !!c.ta;
  const L = (en: string, t: string) => (ta ? t : en);
  const win = c.h.win!;
  const now = await win.now();
  c.asOf ??= now;
  const spec = (c.slots.span ?? null) as PeriodSpec | null;
  const w = windowOf(spec, c.s.period, now);
  if (w.outside === "all" || w.outside === "future") throw new OutsideRecords(w);
  if (w.note) c.notes.push(L(w.note, "பதிவுகள் சுமார் 180 நாட்கள் மட்டுமே; அதற்கு முந்தையவை இல்லை."));
  const when = bi(w.label.en, w.label.ta);
  const over = overWords(when.en);
  const sides = sidesOf(c);
  if (sides.length < 2) return { title: bi("Compare", "ஒப்பீடு"), takeaway: null, when: whenOf(w), say: bi("Which two areas should I compare?", "எந்த இரண்டு பகுதிகளை ஒப்பிட வேண்டும்?"),
    blocks: [{ kind: "Note", id: "two", text: L("Name two to four areas, localities or departments to compare.", "ஒப்பிட இரண்டு முதல் நான்கு பகுதிகள் அல்லது துறைகளைச் சொல்லுங்கள்.") }] };
  const parts = partsFor(c);
  const wantInc = parts.has("incidents") || parts.has("complaints") || parts.has("reports");
  const fam = isTopic(c.slots.family) ? c.slots.family : null;
  const sev = c.slots.sev === "Severe" || c.slots.sev === "High" ? c.slots.sev : null;
  const catLabel = fam ? bi(TOPICS[fam].en, TOPICS[fam].ta) : c.slots.cat ? bi(c.w.cats.find((x) => x.code === c.slots.cat)?.label ?? c.slots.cat, CAT_LABEL_TA[c.slots.cat] ?? c.slots.cat) : null;
  const deptSides = sides.every((s) => s.key.startsWith("d"));
  const safe = <T>(p: Promise<T>, src: string): Promise<T | null> => p.then((x) => { c.runs.push(src); c.sources.add(src); return x; }).catch(() => null);
  if (wantInc) { c.runs.push("window_incidents"); c.sources.add("incidents (window)"); }
  const reads = await Promise.all(sides.map((s) => Promise.all([
    wantInc ? win.incidents(w, s.scope, 5) : Promise.resolve(null),
    parts.has("news") ? safe(win.news(w, { words: s.words, cats: s.scope.cats, dept: s.dept }, 5), "news (window)") : Promise.resolve(null),
    parts.has("air") && s.zone ? safe(win.readings("aqi", w, s.zone), "air quality") : Promise.resolve(null),
    parts.has("rain") && s.zone ? safe(win.readings("rainfall_24h_mm", w, s.zone), "rainfall") : Promise.resolve(null),
    parts.has("prices") && !deptSides ? safe(win.prices(w, s.zone, null, { fetch: false }), "Uzhavar Sandhai prices") : Promise.resolve(null),
    parts.has("traffic") && w.partial && s.zone ? safe(win.traffic(s.zone), "live traffic") : Promise.resolve(null)
  ] as const)));
  const inc = reads.map((r) => r[0] as WinIncidents | null);
  const news = reads.map((r) => r[1] as WinNews | null);

  // ---- the measures, side by side
  const keys: string[] = [];
  if (wantInc) {
    keys.push("n");
    if (sev !== "Severe") keys.push("severe");
    keys.push("open", "overdue", "resolved");
    if (inc.some((x) => (x?.dead ?? 0) > 0)) keys.push("dead");
    if (parts.has("complaints")) keys.push("complaints");
  }
  if (parts.has("news")) keys.push("news");
  if (wantInc && w.prevHeld) keys.push("prev");
  const what = bi(`${sev === "Severe" ? "severe " : sev === "High" ? "serious " : ""}${catLabel ? `${catLabel.en.toLowerCase().replace(/&/g, "and")} ` : ""}incidents`,
    `${sev === "Severe" ? "கடுமையான " : ""}${catLabel ? `${catLabel.ta} ` : ""}சம்பவங்கள்`);
  const label = (k: string) => (k === "n" && (sev || catLabel) ? bi(`${what.en.charAt(0).toUpperCase()}${what.en.slice(1)} reported`, `பதிவான ${what.ta}`) : MEASURE[k]);
  const allDays = [...new Set(inc.flatMap((x) => x?.buckets.map((b) => b.at) ?? []))].sort();
  const cmpSides = sides.map((s, i) => {
    const x = inc[i];
    const values: Record<string, number> = {};
    for (const k of keys) values[k] = k === "news" ? news[i]?.total ?? 0 : Number((x as unknown as Record<string, number> | null)?.[k] ?? 0);
    return {
      key: s.key, label: clip(L(s.name.en, s.name.ta), 80), zone: s.zone, values,
      cats: (x?.kinds ?? []).slice(0, 12).map((k) => ({ code: clip(k.cat, 40), label: clip(ta ? CAT_LABEL_TA[k.cat] ?? k.label : k.label, 80), n: k.n })),
      series: allDays.map((d) => x?.buckets.find((b) => b.at === d)?.n ?? 0).slice(-60),
      ...(wantInc && !deptSides && !c.slots.dept ? { depts: (x?.depts ?? []).slice(0, 10).map((d) => ({ code: clip(d.code, 40), label: clip(ta ? DEPT_TA[d.code] ?? d.name : d.name, 80), n: d.n })) } : {}),
      ...(parts.has("reports") && x?.from ? { from: FROM.map(([k, l]) => ({ key: k, label: clip(L(l.en, l.ta), 60), n: x.from![k] })) } : {}),
      drill: { recipe: "summary" as const, slots: { ...s.drill, period: w.key, ...(w.custom && spec ? { span: spec } : {}), fresh: true }, label: clip(`${s.name.en} · summary`, 160) }
    };
  });
  const diffs: Extract<BlockT, { kind: "Compare" }>["diffs"] = [];
  for (const k of keys.filter((x) => x !== "prev" && x !== "resolved")) {
    const vals = cmpSides.map((s) => ({ l: s.label, v: s.values[k] ?? 0 })).sort((a, b) => b.v - a.v);
    if (vals.length >= 2 && vals[0].v > vals[1].v) diffs.push({ metric: k, label: clip(L(label(k).en, label(k).ta), 60), hi: vals[0].l, lo: vals.at(-1)!.l, ratio: vals.at(-1)!.v > 0 ? Math.round((vals[0].v / vals.at(-1)!.v) * 10) / 10 : null, gap: vals[0].v - vals.at(-1)!.v });
  }
  const names = sides.map((s) => s.name);
  const subjectWords = [sev ? L(sev === "Severe" ? "Severe incidents" : "Severe and high", sev === "Severe" ? "கடுமையான சம்பவங்கள்" : "கடுமையான, அதிக முக்கியத்துவம்") : null, catLabel ? L(catLabel.en, catLabel.ta) : null,
    parts.size === 1 && parts.has("news") ? L("News", "செய்திகள்") : null].filter(Boolean).join(" · ");
  const head = bi(`${names.map((n) => n.en).join(" vs ")}${subjectWords && !ta ? ` · ${subjectWords}` : ""} · ${when.en}`, `${names.map((n) => n.ta).join(" / ")} ஒப்பீடு${subjectWords && ta ? ` · ${subjectWords}` : ""} · ${when.ta}`);
  const blocks: BlockT[] = [];
  blocks.push({ kind: "Compare", id: "cmp", title: clip(L(`Side by side · ${when.en}`, `ஒப்பீடு · ${when.ta}`), 160), metrics: keys.map((k) => ({ key: k, label: clip(L(label(k).en, label(k).ta), 60) })),
    sides: cmpSides, seriesLabels: allDays.map((d) => boundWords(d.length > 10 ? `${d}:00`.slice(0, 16) : `${d} 00:00`)).slice(-60), diffs: diffs.slice(0, 6), chart: keys.filter((k) => k !== "prev") });

  // ---- each side's most urgent cases, and its news
  if (wantInc) sides.forEach((s, i) => {
    const rows = (inc[i]?.top ?? []).slice(0, 5).map((r: Row) => caseRow({ ...r, why: null, reasons: r.priority_reasons ? String(r.priority_reasons).split(";").slice(1).join(";").trim() || null : null }, c.w));
    if (rows.length) blocks.push({ kind: "CaseList", id: `top-${s.key}`, title: clip(L(`${sev ? "Most urgent severe cases" : "Most urgent"} · ${s.name.en}`, `முதலில் கவனிக்க வேண்டியவை · ${s.name.ta}`), 160), source: "list", sev, total: inc[i]?.n ?? rows.length, rows });
  });
  if (parts.has("news")) sides.forEach((s, i) => {
    const r = news[i];
    if (r?.rows?.length) blocks.push({ kind: "NewsReader", id: `news-${s.key}`, title: clip(L(`In the news · ${s.name.en}`, `செய்திகளில் · ${s.name.ta}`), 160), total: r.total,
      items: r.rows.slice(0, 5).map((x: Row) => ({ id: clip(x.id, 120), title: clip(ta ? x.title : x.title_en || x.title, 300), source: clip(x.publisher, 80) || null, t: x.t ?? null, place: clip(x.loc, 120) || null,
        incidentId: x.incident ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null, summary: clip(x.summary, 600) || null })) });
  });

  // ---- air, rain and market prices, a row each, a column a side
  const env: { label: string; cells: (string | null)[] }[] = [];
  const aqiOf = (r: { rows: WinReading[]; nearest: { id: string; km: number } | null } | null) => {
    const x = r?.rows?.[0];
    if (!x) return null;
    const v = x.inWindow ? x.avg : x.last, [, en, t] = aqiBand(v);
    const far = r?.nearest && r.nearest.id === x.id ? L(`, nearest, ${r.nearest.km} km`, `, அருகில், ${r.nearest.km} கி.மீ`) : "";
    return clip(L(`${spoken(v)} ${x.inWindow ? "average" : `(last reading ${boundWords(`${x.lastAt}:00`)})`}, ${en} · ${x.name.replace(/, Chennai - (TNPCB|CPCB)$/, "").replace(/^Chennai-/, "")}${far}`,
      `${spoken(v)}, ${t} · ${x.name.replace(/, Chennai - (TNPCB|CPCB)$/, "").replace(/^Chennai-/, "")}${far}`), 300);
  };
  if (parts.has("air") && reads.some((r) => r[2])) env.push({ label: L("Air quality (AQI)", "காற்றுத் தரம் (AQI)"), cells: reads.map((r) => aqiOf(r[2] as never)) });
  // (each side's own gauges, else its nearest: the district's wettest gauge put under every side compared nothing; no rain is said only where
  // the gauges reported in the window and every reading was 0; no reading at all is a dash)
  const rainCells = reads.map((r, i) => {
    const all = ((r[3] as { rows: WinReading[] } | null)?.rows ?? []).filter((x) => x.inWindow);
    const own = all.filter((x) => x.zone != null && x.zone === sides[i].zone);
    const inside = own.length ? own : all.slice(0, 1);
    const wet = [...inside].sort((a, b) => b.max - a.max)[0];
    const near = own.length ? "" : L(", nearest gauge", ", அருகிலுள்ள மழைமானி");
    return !inside.length ? null : wet && wet.max > 0 ? clip(`${spoken(Math.round(wet.max * 10) / 10)} mm · ${wet.name.replace(/^Chennai-/, "")}${near}`, 300) : L(`No rain recorded${own.length ? " at its gauges" : " at the nearest gauge"}`, "மழை பதிவாகவில்லை");
  });
  if (parts.has("rain") && rainCells.some(Boolean)) env.push({ label: L("Rain, most in a day", "ஒரு நாளில் அதிக மழை"), cells: rainCells });
  const pr = reads.map((r) => r[4] as WinPrices | null);
  const fresh = (p: WinPrices | null) => !!p?.latest && Date.parse(`${w.to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${p.latest}T00:00:00Z`) <= 21 * 864e5;
  if (parts.has("prices") && pr.some((p) => p?.rows?.length && fresh(p))) {
    for (const item of ["tomato", "onion", "potato"]) {
      const cells = pr.map((p) => {
        const x = fresh(p) ? p!.rows.find((r) => r.commodity.toLowerCase().includes(item)) : undefined;
        return x ? clip(L(`₹${rupees(x.perKg)} a kg · ${p!.market ? `${p!.market} market` : "Chennai markets"} · ${boundWords(`${x.date} 00:00`)}`, `கிலோ ₹${rupees(x.perKg)} · ${p!.market ?? "சென்னைச் சந்தைகள்"} · ${boundWords(`${x.date} 00:00`)}`), 300) : null;
      });
      if (cells.some(Boolean)) env.push({ label: L(item.charAt(0).toUpperCase() + item.slice(1), item === "tomato" ? "தக்காளி" : item === "onion" ? "வெங்காயம்" : "உருளைக்கிழங்கு"), cells });
    }
  }
  // (a market report weeks older than the window is not this window: said in a note, never as its price)
  const stale = pr.filter((p) => p?.rows?.length && !fresh(p)).map((p) => p!.latest).filter((x): x is string => !!x).sort().at(-1);
  if (parts.has("prices") && stale && !env.some((e) => /₹/.test(e.cells.join(" ")))) c.notes.push(L(`Vegetable prices are left out: the Uzhavar Sandhai markets last reported prices on ${boundWords(`${stale} 00:00`)}.`, `காய்கறி விலை இல்லை: சந்தைகளின் கடைசி அறிக்கை ${boundWords(`${stale} 00:00`)}.`));
  if (parts.has("traffic") && reads.some((r) => (r[5] as { say?: string } | null)?.say)) env.push({ label: L("Traffic now", "இப்போது போக்குவரத்து"), cells: reads.map((r) => clip((r[5] as { say?: string } | null)?.say, 300) || null) });
  if (env.length) blocks.push({ kind: "Table", id: "env", title: clip(L(`Air, rain and prices · ${when.en}`, `காற்று, மழை, விலை · ${when.ta}`), 160),
    cols: [{ key: "m", label: L("Measure", "அளவு"), unit: null, num: false }, ...sides.map((s) => ({ key: s.key, label: clip(L(s.name.en, s.name.ta), 60), unit: null, num: false }))], total: env.length,
    rows: env.map((e) => ({ id: null, url: null, cells: [clip(e.label, 300), ...e.cells.map((x) => x ?? "—")] })) });

  // ---- where they are
  if (wantInc && !deptSides) {
    const pts: PointT[] = inc.flatMap((x) => (x?.points ?? []).slice(0, 80)).slice(0, 200).map((p, i) => ({ n: null, id: p.id, lat: p.lat, lon: p.lon, label: clip(p.title, 160), sev: p.sev, value: null, hot: p.sev === "Severe" && i < 6 }));
    const outline = sides.map((s) => s.zone).filter((z): z is number => z != null);
    if (pts.length || outline.length) blocks.push({ kind: "MapView", id: "map", title: L(sides.length === 2 ? "Both, on the map" : `The ${sides.length}, on the map`, "வரைபடத்தில்"), rule: L("Each point is an incident of this window; red is severe.", "ஒவ்வொரு புள்ளியும் இந்தக் காலச் சம்பவம்; சிவப்பு = கடுமையானது."),
      shade: null, points: pts, outline: [...new Set(outline)].slice(0, 15) });
  }

  // ---- what each part shows
  const ABOUT: Record<string, string> = {
    cmp: L(`Each column is one ${deptSides ? "department" : "place"}, counted ${over} by the same rules as its own summary; the larger of each measure is marked. The bars below put the sides on one scale.`, "ஒவ்வொரு நெடுவரிசையும் ஒரு பகுதி; ஒரே அளவுகோலில்."),
    env: L("The nearest air-quality station (CPCB and TNPCB), the most rain in a day at the nearest IMD gauge, and the latest Uzhavar Sandhai prices of the side's own market (or the Chennai markets' average).", "அருகிலுள்ள நிலையங்களின் அளவுகள் மற்றும் சந்தை விலை."),
    map: L("Each point is an incident of this window, for every side.", "ஒவ்வொரு புள்ளியும் ஒரு சம்பவம்.")
  };
  for (const b of blocks) (b as { about?: string | null }).about = clip(ABOUT[b.id] ?? (b.kind === "CaseList" ? L("Open first, then by priority score. Click a case for its details.", "முன்னுரிமைப்படி; தொட்டால் விவரம்.") : b.kind === "NewsReader" ? L(`News reports ${over} that name this side.`, "இந்தக் காலச் செய்திகள்.") : ""), 300) || null;
  if (parts.has("reports") || parts.has("complaints")) c.notes.push(L("Citizen complaints, police, PWD and hospital records in this console are generated sample data; the news, CPCB air quality and Uzhavar Sandhai prices are real feeds.",
    "இந்தக் கன்சோலின் குடிமக்கள் புகார், காவல், பொதுப்பணி, மருத்துவமனை பதிவுகள் மாதிரித் தரவு; செய்திகள், காற்றுத் தரம், சந்தை விலை உண்மையான தரவு."));
  if (sides.some((s) => s.key.startsWith("p"))) c.notes.push(L("A locality is matched on the place written in each incident and news report.", "ஒவ்வொரு பதிவின் இடப் பெயரால் பொருத்தப்பட்டது."));

  // ---- the spoken line, every figure on the screen
  const lead = [...cmpSides.keys()].sort((a, b) => (cmpSides[b].values[keys[0]] ?? 0) - (cmpSides[a].values[keys[0]] ?? 0))[0];
  const tie = cmpSides.filter((s) => (s.values[keys[0]] ?? 0) === (cmpSides[lead].values[keys[0]] ?? 0)).length > 1;
  let say: Bilingual;
  if (wantInc) {
    const secondKey = sev === "Severe" ? "open" : "severe";
    const second = bi(sev === "Severe" ? "still open" : "severe", sev === "Severe" ? "நிலுவையில்" : "கடுமை");
    say = bi(`${Over(when.en)}, ${cmpSides.map((s, i) => `${names[i].en} had ${spoken(s.values.n ?? 0)}${i === 0 && (sev || catLabel) ? ` ${what.en}` : ""} (${spoken(s.values[secondKey] ?? 0)} ${second.en})`).join(", ")}.${tie ? " They are level." : ` ${names[lead].en} had the most.`}`,
      `${when.ta}: ${cmpSides.map((s, i) => `${names[i].ta} ${spoken(s.values.n ?? 0)} (${spoken(s.values[secondKey] ?? 0)} ${second.ta})`).join(", ")}.${tie ? " சமம்." : ` அதிகம் ${names[lead].ta}.`}`);
  } else {
    say = bi(`${Over(when.en)}, ${cmpSides.map((s, i) => `${spoken(s.values.news ?? 0)} ${(s.values.news ?? 0) === 1 ? "news story" : "news stories"} named ${names[i].en}`).join(" and ")}.`,
      `${when.ta}: ${cmpSides.map((s, i) => `${names[i].ta} பற்றி ${spoken(s.values.news ?? 0)} செய்திகள்`).join(", ")}.`);
  }
  const g = diffs[0];
  const NOUN: Record<string, string> = { n: what.en, severe: "severe incidents", open: "open incidents", overdue: "incidents past their deadline", dead: "deaths", complaints: "open citizen complaints", news: "news stories" };
  const gl = g ? label(g.metric) : null;
  const noun = g ? NOUN[g.metric] ?? gl!.en.toLowerCase() : "";
  const takeaway = g && gl ? bi(g.ratio && g.ratio >= 1.2 ? `${g.hi} had ${spoken(g.ratio)} times the ${noun} of ${g.lo} ${over}.` : `${g.hi} had ${spoken(g.gap)} more ${noun} than ${g.lo} ${over}.`,
    `${when.ta} ${g.hi}, ${g.lo}-ஐ விட ${g.ratio && g.ratio >= 1.2 ? `${spoken(g.ratio)} மடங்கு` : `${spoken(g.gap)} கூடுதல்`} ${gl.ta}.`) : null;
  const next: NextStepT[] = sides.slice(0, 3).map((s) => ({ label: bi(`${s.name.en}: its own summary`, `${s.name.ta}: முழுச் சுருக்கம்`), kind: "direct" as const, recipe: "summary" as const, ids: [], text: null,
    slots: { ...s.drill, period: w.key, ...(w.custom && spec ? { span: spec } : {}), fresh: true } }));
  return { title: head, takeaway, say, blocks, next, when: whenOf(w) };
}
