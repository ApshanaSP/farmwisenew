/**
 * v18 (24 Nov): "summary of Anna Nagar", "summary of the police department", "summary of crimes", "what happened in Adyar in the last 2 days",
 * "everything on flooding on 20 November": one dashboard of everything the console holds about one area, department, kind of problem or the
 * whole district, over any window the Collector names.
 *
 * The owner (24 Nov): "it should take out all the information of Anna Nagar starting from incidents to news, air quality, vegetable prices";
 * "if I ask the summary of crimes it's giving the overall summary"; "whatever time period we are giving, Jarvis should answer with that
 * period"; "I cannot click an insight to see further details".
 *
 * Every figure is code's, counted over the window's own IST bounds (v18/window.ts) against the window of the same length just before it.
 * Every tile, key point, bar, day, area, department and row leads somewhere (stage.ts Drill): the same summary narrowed to it, so a click
 * always shows the records behind a number, in the same window. The spoken line is code's (2 to 4 sentences), every figure on the screen.
 */
import { spoken } from "../insight";
import { CAT_LABEL_TA } from "../narrate";
import { DEPT_TA, ZONES } from "../lexicon";
import { caseRow, type Slots } from "../screens";
import type { Bilingual, BlockT, DrillT, NextStepT, PointT, StageDocT } from "../stage";
import type { PeriodSpec } from "@/lib/period/read";
import { TOPICS, isTopic, topicCats, type Topic } from "../v18/topics";
import { beforeRecords, boundWords, daySpec, overWords, windowOf, type Win } from "../v18/when";
import type { WinIncidents, WinReading, WinScope } from "../v18/window";
import { bi, clip, inTa, zoneName, type RecipeCtx } from "./common";
import { wholeDays } from "./window18";
import type { AideExtras } from "../aide7/extras";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SummaryPart {
  title: Bilingual; takeaway: Bilingual | null; say: Bilingual; blocks: BlockT[]; next?: NextStepT[];
  when: StageDocT["when"];
  /** v19: facts for the answer's writer (v19/doc.ts) */
  aide?: AideExtras;
}

const AQI_BANDS: [number, string, string][] = [[50, "good", "நல்லது"], [100, "satisfactory", "திருப்திகரம்"], [200, "moderate", "மிதமானது"], [300, "poor", "மோசம்"], [400, "very poor", "மிக மோசம்"], [1e9, "severe", "கடுமையானது"]];
const aqiBand = (v: number) => AQI_BANDS.find(([hi]) => v <= hi)!;
const rupees = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ""));
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

/** words that name a zone in a news report: its names in both languages and the gazetteer's places inside it */
function zoneWords(c: RecipeCtx, zone: number): string[] {
  const z = ZONES[zone];
  const out = [...(z?.en ?? []), ...(z?.ta ?? []), c.w.zones.find((x) => x.n === zone)?.name ?? ""];
  for (const p of c.w.places) if (p.zone === zone) out.push(p.name, ...p.aliases);
  return [...new Set(out.map((x) => x.toLowerCase().trim()).filter((x) => x.length >= 4))];
}

/** what a summary is about, read from its slots */
interface Subject {
  zones: number[]; place: string | null; dept: string | null; topic: Topic | null; cat: string | null; cats: string[] | null; sev: "Severe" | "High" | null;
  status: "open" | "overdue" | "resolved" | null; name: Bilingual; area: boolean; district: boolean;
  /** v18 round 2: the place is a locality exactly as the "By locality" ranking counts it */
  exact: boolean;
  /** the parts a sentence names apart: where ("Velachery, Adyar"), what kind ("crime"), whose ("Greater Chennai Police") */
  whereW: Bilingual | null; kindW: Bilingual | null; deptW: Bilingual | null;
}

function subjectOf(c: RecipeCtx): Subject {
  const sl = c.slots;
  const zones = sl.zones.length ? sl.zones.slice(0, 4) : c.s.zone ? [c.s.zone] : [];
  const zoneNames = zones.map((z) => zoneName(c.w, z)!).filter(Boolean);
  // a locality that is itself a zone's name is that zone
  // (v18 round 2: a locality clicked on the ranking is that locality, whatever zone shares its name)
  const exact = !!sl.place && sl.exact === true;
  const placeRaw = sl.place && (exact || !c.w.zones.some((z) => z.name.toLowerCase() === sl.place!.toLowerCase())) ? sl.place : null;
  const dept = sl.dept ?? c.s.dept ?? null;
  const topic = isTopic(sl.family) ? sl.family : null;
  const cat = topic ? null : sl.cat ?? c.s.cat ?? null;
  const cats = topic ? topicCats(topic, c.w.cats) : cat ? [cat] : null;
  const sev = sl.sev === "Severe" || sl.sev === "High" ? sl.sev : c.s.sev === "Severe" || c.s.sev === "High" ? c.s.sev : null;
  const status = sl.status ?? null;
  const en: string[] = [], ta: string[] = [];
  // a locality with its zone ("Velachery, Adyar"); two to four zones together ("Adyar and Anna Nagar")
  const zEn = zoneNames.map((z) => z.en).join(" and "), zTa = zoneNames.map((z) => z.ta).join(", ");
  const whereW = placeRaw ? bi(zEn ? `${placeRaw}, ${zEn}` : placeRaw, zTa ? `${placeRaw}, ${zTa}` : placeRaw) : zoneNames.length ? bi(zEn, zTa) : null;
  if (whereW) { en.push(whereW.en); ta.push(whereW.ta); }
  const deptW = dept ? bi(c.w.depts.find((x) => x.code === dept)?.name ?? dept, DEPT_TA[dept] ?? c.w.depts.find((x) => x.code === dept)?.name ?? dept) : null;
  if (deptW) { en.push(deptW.en); ta.push(deptW.ta); }
  const kindW = topic ? bi(TOPICS[topic].en, TOPICS[topic].ta) : cat ? bi(c.w.cats.find((x) => x.code === cat)?.label ?? cat, CAT_LABEL_TA[cat] ?? c.w.cats.find((x) => x.code === cat)?.label ?? cat) : null;
  if (kindW) { en.push(kindW.en); ta.push(kindW.ta); }
  if (sev) { en.push(sev === "Severe" ? "severe only" : "severe and high"); ta.push(sev === "Severe" ? "கடுமையானவை மட்டும்" : "கடுமையான, அதிக முக்கியத்துவம்"); }
  if (!en.length) { en.push("Chennai district"); ta.push("சென்னை மாவட்டம்"); }
  return { zones, place: placeRaw, dept, topic, cat, cats, sev, status, name: bi(en.join(" · "), ta.join(" · ")), area: zones.length > 0 || !!placeRaw, district: !zones.length && !placeRaw && !dept && !cats,
    whereW, kindW, deptW, exact: exact && !!placeRaw };
}

/**
 * How many came in, said whole: "In Anna Nagar, 34 incidents", "Across the district, 224 crime incidents", "In Adyar, 12 flooding and
 * waterlogging incidents for Storm Water Drain"; in Tamil, "அண்ணா நகர்ல 34 சம்பவங்கள்".
 */
function countWords(s: Subject, n: number, what: Bilingual | null = null): Bilingual {
  const kind = what ?? (s.kindW ? bi(`${s.kindW.en.toLowerCase().replace(/&/g, "and")} `, `${s.kindW.ta} `) : bi("", ""));
  const unit = n === 1 ? "incident" : "incidents";
  return bi(`${s.whereW ? `In ${s.whereW.en}, ` : "Across the district, "}${spoken(n)} ${what ? what.en : `${kind.en}${unit}`}${s.deptW ? ` for ${s.deptW.en}` : ""}`,
    `${s.whereW ? `${inTa(s.whereW.ta)} ` : "மாவட்டம் முழுக்க "}${what ? what.ta : `${kind.ta}`}${spoken(n)} ${what ? "" : "சம்பவங்கள்"}${s.deptW ? ` (${s.deptW.ta})` : ""}`.replace(/\s+/g, " ").trim());
}

/** a drill to this same summary, narrowed: the window kept (its own span, or the console's window) */
function drillTo(base: Record<string, unknown>, extra: Record<string, unknown>, label: string): DrillT {
  return { recipe: "summary", slots: { ...base, ...extra, fresh: true }, label: clip(label, 160) };
}

export async function summaryRecipe(c: RecipeCtx): Promise<SummaryPart> {
  const ta = !!c.ta;
  const L = (en: string, t: string) => (ta ? t : en);
  const win = c.h.win;
  const subj = subjectOf(c);
  if (!win) {
    return { title: bi(`Summary · ${subj.name.en}`, `சுருக்கம் · ${subj.name.ta}`), takeaway: null, when: null,
      say: bi("I can't read the data for that window from here.", "அந்தக் காலத்துக்கான தரவை இங்கிருந்து படிக்க முடியவில்லை."),
      blocks: [{ kind: "Note", id: "nowin", text: L("The window reads are not available here.", "இந்தக் காலத் தரவு இங்கே கிடைக்கவில்லை.") }] };
  }
  const now = await win.now();
  const spec = (c.slots.span ?? null) as PeriodSpec | null;
  const w: Win = windowOf(spec, c.s.period, now);
  c.asOf ??= now;
  // v18 round 2: a window wholly before the records begin is said to be so, never answered with another window (the owner's "from March 30
  // to April 30", 24 Nov: the screen showed the last 7 days)
  // (and a date to come, said with its year, is said to be so: review of 24 Nov)
  if (w.outside === "future") {
    const why = beforeRecords(w);
    return { title: bi(`Summary · ${subj.name.en} · ${w.label.en}`, `சுருக்கம் · ${subj.name.ta} · ${w.label.ta}`), takeaway: null, say: bi(why.en, why.ta), when: whenOf(w),
      blocks: [{ kind: "Note", id: "ahead", text: clip(L(why.en, why.ta), 400) }] };
  }
  if (w.outside === "all") {
    const why = beforeRecords(w);
    return { title: bi(`Summary · ${subj.name.en} · ${w.label.en}`, `சுருக்கம் · ${subj.name.ta} · ${w.label.ta}`), takeaway: null, say: bi(why.en, why.ta), when: whenOf(w),
      blocks: [{ kind: "Note", id: "before", text: clip(L(why.en, why.ta), 400) }],
      next: [{ label: bi("The earliest 30 days held", "பதிவுகளின் முதல் 30 நாட்கள்"), kind: "direct", recipe: "summary", ids: [], text: null,
        slots: { zones: subj.zones, ...(subj.place ? { place: subj.place } : {}), ...(subj.dept ? { dept: subj.dept } : {}), ...(subj.topic ? { family: subj.topic } : subj.cat ? { cat: subj.cat } : {}),
          span: { kind: "days", from: dayOf(w.heldFrom), to: dayOf(new Date(Date.parse(`${w.heldFrom.replace(" ", "T")}+05:30`) + 29 * 864e5 + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ")) }, fresh: true } }] };
  }
  const when = bi(w.label.en, w.label.ta);
  // a count back from now says where it starts ("last 2 days (since 22 Nov, 3 PM)"); a calendar day or range is its own dates already
  const whenLine = w.custom && spec?.kind === "hours" ? bi(`${w.label.en} (since ${boundWords(w.from)})`, `${w.label.ta} (${boundWords(w.from)} முதல்)`) : when;
  const over = overWords(whenLine.en);
  if (w.note) c.notes.push(L(w.note, "பதிவுகள் சுமார் 180 நாட்கள் மட்டுமே; அதற்கு முந்தையவை இல்லை."));

  // the drills keep the window: its own span, or the console's window
  // (v18 round 2's review: and the status, the taluk and an exact locality, so a click on an "open cases" screen never widens to every status)
  const base: Record<string, unknown> = { zones: subj.zones, ...(subj.place ? { place: subj.place } : {}), ...(subj.exact ? { exact: true } : {}), ...(subj.dept ? { dept: subj.dept } : {}),
    ...(subj.topic ? { family: subj.topic } : subj.cat ? { cat: subj.cat } : {}), ...(subj.sev ? { sev: subj.sev } : {}), ...(subj.status ? { status: subj.status } : {}),
    ...(c.s.taluk ? { taluk: c.s.taluk } : {}), period: w.key, ...(w.custom && spec ? { span: spec } : {}) };
  const scope: WinScope = { zone: subj.zones.length === 1 ? subj.zones[0] : null, zones: subj.zones.length > 1 ? subj.zones : null, place: subj.place, exact: subj.exact, dept: subj.dept, cats: subj.cats, sev: subj.sev, taluk: c.s.taluk ?? null, status: subj.status };
  const listView = c.slots.view === "cases";

  // what goes on this dashboard: incidents always; the news; air, rain, lakes, prices and traffic where they belong to the subject
  const fam = subj.topic, cats = new Set(subj.cats ?? []);
  const wantsWater = subj.district || subj.area || fam === "FLOOD" || fam === "DRAINAGE" || [...cats].some((x) => /FLOOD|DRAIN|WATER/.test(x)) || /SWD|WRD|CMWSSB|DIST-DM/.test(subj.dept ?? "");
  const wantsAir = subj.district || subj.area || fam === "ENVIRONMENT" || fam === "HEALTH" || cats.has("AIR_POLLUTION") || subj.dept === "TNPCB";
  const wantsPrices = (subj.district || subj.area) && !subj.dept && !subj.cats;
  const wantsTraffic = w.partial && (subj.district || subj.area || fam === "ROADS_TRAFFIC" || subj.dept === "POL-GCP");
  const zone1 = subj.zones.length === 1 ? subj.zones[0] : null;
  const words = subj.place ? [subj.place.toLowerCase()] : subj.zones.flatMap((z) => zoneWords(c, z));
  c.runs.push("window_incidents");
  c.sources.add("incidents (window)");
  const safe = <T>(p: Promise<T>, src: string): Promise<T | null> => p.then((x) => { c.runs.push(src); c.sources.add(src); return x; }).catch(() => null);
  const [inc, news, aqi, rain, lakes, warn, prices, traffic] = await Promise.all([
    win.incidents(w, scope, listView ? 30 : 8),
    listView ? Promise.resolve(null) : safe(win.news(w, { words, cats: subj.cats, dept: subj.dept }, 10), "news (window)"),
    !listView && wantsAir ? safe(win.readings("aqi", w, zone1), "air quality") : Promise.resolve(null),
    !listView && wantsWater ? safe(win.readings("rainfall_24h_mm", w, zone1), "rainfall") : Promise.resolve(null),
    !listView && wantsWater && (subj.district || fam === "FLOOD" || /WRD/.test(subj.dept ?? "") || zone1) ? safe(win.readings("lake_pct_full", w, zone1), "lake storage") : Promise.resolve(null),
    !listView && wantsWater ? safe(win.warning(w), "IMD warning") : Promise.resolve(null),
    // (v18 round 2's review: the summary reads the prices held; only the prices screen asks data.gov.in for a missing day, so a summary never waits on it)
    !listView && wantsPrices ? safe(win.prices(w, zone1, null, { fetch: false }), "Uzhavar Sandhai prices") : Promise.resolve(null),
    !listView && wantsTraffic ? safe(win.traffic(zone1), "live traffic") : Promise.resolve(null)
  ]);

  const blocks: BlockT[] = [];
  const points: Bilingual[] = [];
  const pointDrills: (DrillT | null)[] = [];
  const addPoint = (b: Bilingual, d: DrillT | null) => { points.push(b); pointDrills.push(d); };
  const where = subj.name;
  const label = (en: string, t: string) => bi(en, t);

  // ---- the tiles: each one opens its own records
  const casesDrill = (extra: Record<string, unknown>, l: string) => drillTo(base, { ...extra, view: "cases" }, l);
  // (v18 round 2's review: a window before that reaches before the records is short or empty: no change is set against it)
  const held = w.prevHeld;
  const delta = inc.n - inc.prev;
  const tiles: Extract<BlockT, { kind: "Kpis" }>["items"] = [
    { key: "reported", label: clip(L("Incidents reported", "பதிவான சம்பவங்கள்"), 80), value: inc.n, unit: null, prev: held ? inc.prev : null, delta: held ? delta : null, pct: held ? pct(inc.n, inc.prev) : null, tone: !held ? "neutral" : delta > 0 ? "bad" : delta < 0 ? "good" : "neutral", spark: inc.buckets.slice(-60).map((b) => b.n),
      drill: casesDrill({}, L("All incidents", "எல்லா சம்பவங்களும்")) },
    { key: "severe", label: L("Severe events", "கடுமையான நிகழ்வுகள்"), value: inc.severe, unit: null, prev: held ? inc.prevSevere : null, delta: held ? inc.severe - inc.prevSevere : null, tone: held && inc.severe > inc.prevSevere ? "bad" : "neutral", spark: inc.buckets.slice(-60).map((b) => b.severe),
      drill: casesDrill({ sev: "Severe" }, L("Severe incidents", "கடுமையான சம்பவங்கள்")) },
    { key: "open", label: L("Ongoing incidents", "நடப்பிலுள்ள சம்பவங்கள்"), value: inc.open, unit: null, prev: null, delta: null, tone: "neutral", spark: [], drill: casesDrill({ status: "open" }, L("Still open", "நிலுவையில் உள்ளவை")) },
    { key: "overdue", label: L("Past their deadline", "காலக்கெடு தாண்டியவை"), value: inc.overdue, unit: null, prev: null, delta: null, tone: inc.overdue ? "bad" : "good", spark: [], drill: casesDrill({ status: "overdue" }, L("Past their deadline", "காலக்கெடு தாண்டியவை")) },
    { key: "resolved", label: L("Resolved in this window", "இந்தக் காலத்தில் தீர்க்கப்பட்டவை"), value: inc.resolved, unit: null, prev: null, delta: null, tone: "good", spark: [], drill: casesDrill({ status: "resolved" }, L("Resolved", "தீர்க்கப்பட்டவை")) },
    ...(inc.complaints ? [{ key: "complaints", label: L("Open citizen complaints", "நிலுவையிலுள்ள குடிமக்கள் புகார்கள்"), value: inc.complaints, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }] : []),
    ...(inc.dead ? [{ key: "dead", label: L("Deaths reported", "உயிரிழப்புகள்"), value: inc.dead, unit: null, prev: null, delta: null, tone: "bad" as const, spark: [] }] : []),
    ...(inc.injured ? [{ key: "injured", label: L("Injured", "காயமடைந்தோர்"), value: inc.injured, unit: null, prev: null, delta: null, tone: "bad" as const, spark: [] }] : [])
  ];
  blocks.push({ kind: "Kpis", id: "kpis", title: clip(L(`Key numbers · ${whenLine.en}`, `முக்கிய எண்கள் · ${whenLine.ta}`), 120), items: tiles.slice(0, 8) });

  // ---- the list view (a tile clicked): the records themselves, then where they are
  const rows = inc.top.map((r) => caseRow({ ...r, why: null, reasons: r.priority_reasons ? String(r.priority_reasons).split(";").slice(1).join(";").trim() || null : null }, c.w));
  const mapBlock = (): BlockT | null => inc.points.length ? { kind: "MapView", id: "map", title: L("Where they are", "எங்கே உள்ளன"), rule: L("Each point is an incident in this window; red is severe.", "ஒவ்வொரு புள்ளியும் இந்தக் காலச் சம்பவம்; சிவப்பு = கடுமையானது."),
    shade: null, points: inc.points.slice(0, 150).map((p, i): PointT => ({ n: i < 9 ? i + 1 : null, id: p.id, lat: p.lat, lon: p.lon, label: clip(p.title, 160), sev: p.sev, value: null, hot: i < 3 })), outline: subj.zones.slice(0, 4) } : null;
  const statusWord = subj.status === "open" ? bi("still open", "நிலுவையில் உள்ள") : subj.status === "overdue" ? bi("past their deadline", "காலக்கெடு தாண்டிய") : subj.status === "resolved" ? bi("resolved", "தீர்க்கப்பட்ட") : null;
  if (listView) {
    const kindEn = subj.kindW ? `${subj.kindW.en.toLowerCase().replace(/&/g, "and")} ` : "", kindTa0 = subj.kindW ? `${subj.kindW.ta} ` : "";
    const many = inc.n === 1 ? "incident" : "incidents";
    const what = bi(`${subj.sev === "Severe" ? "severe " : subj.sev === "High" ? "serious " : ""}${kindEn}${many}${statusWord ? `, ${statusWord.en},` : ""}`,
      `${subj.sev === "Severe" ? "கடுமையான " : ""}${kindTa0}சம்பவங்கள்${statusWord ? ` (${statusWord.ta})` : ""}`);
    const head = bi(`${what.en.replace(/,$/, "").replace(/^./, (x) => x.toUpperCase())}`, what.ta);
    // (the place and the department only: the kind and the severity are in the head already)
    const at = bi([subj.whereW?.en, subj.deptW?.en].filter(Boolean).join(" · ") || "Chennai district", [subj.whereW?.ta, subj.deptW?.ta].filter(Boolean).join(" · ") || "சென்னை மாவட்டம்");
    blocks.push({ kind: "CaseList", id: "list", title: clip(L(`${head.en} · ${at.en} · ${when.en}`, `${head.ta} · ${at.ta} · ${when.ta}`), 160), source: "list", sev: subj.sev, total: inc.n, rows });
    const m = mapBlock(); if (m) blocks.push(m);
    const top = rows[0];
    const lead = countWords(subj, inc.n, what);
    const say = inc.n
      ? bi(`${lead.en} ${over}.${top ? ` The most urgent is ${clip(top.title, 120)}${top.place ? ` at ${clip(top.place, 60)}` : ""}.` : ""}`,
        `${whenLine.ta} ${lead.ta}.${top ? ` முதலில் கவனிக்க வேண்டியது: ${clip(top.title, 120)}.` : ""}`)
      : bi(`${subj.whereW ? `In ${subj.whereW.en}, no` : "No"} ${what.en.replace(/,$/, "")}${subj.deptW ? ` for ${subj.deptW.en}` : ""} ${over}.`, `${whenLine.ta} ${subj.whereW ? `${inTa(subj.whereW.ta)} ` : ""}${what.ta} எதுவும் இல்லை.`);
    // (what each part shows, as on the summary)
    for (const b of blocks) (b as { about?: string | null }).about = b.kind === "Kpis" ? L(`Each tile counts the incidents reported ${over}${held ? `; the arrow compares with ${w.prev.label.en}` : ""}.`, "இந்தக் காலத்தில் பதிவானவை.")
      : b.kind === "CaseList" ? L("The cases behind the number you clicked, open first, then by priority score. Click a case for its details.", "நீங்கள் தொட்ட எண்ணுக்குரிய சம்பவங்கள்; தொட்டால் விவரம்.")
        : b.kind === "MapView" ? L("Each point is one of these cases (red severe). Click a point for its case.", "ஒவ்வொரு புள்ளியும் ஒரு சம்பவம்.") : null;
    return { title: bi(`${head.en} · ${at.en} · ${when.en}`, `${head.ta} · ${at.ta} · ${when.ta}`), takeaway: null, say, blocks, when: whenOf(w) };
  }

  // ---- key points: what matters in this window, each one a way in
  const up = pct(inc.n, inc.prev);
  const lead = countWords(subj, inc.n);
  addPoint(held
    ? bi(`${lead.en} ${over}, ${inc.prev === inc.n ? "the same as" : inc.n > inc.prev ? "up from" : "down from"} ${spoken(inc.prev)} ${inBefore(w.prev.label.en)}${up != null && inc.prev !== inc.n ? ` (${up > 0 ? "+" : ""}${up}%)` : ""}.`,
      `${whenLine.ta} ${lead.ta}; ${w.prev.label.ta} ${spoken(inc.prev)}${up != null && inc.prev !== inc.n ? ` (${up > 0 ? "+" : ""}${up}%)` : ""}.`)
    : bi(`${lead.en} ${over} (no change is given: the window before reaches back before the records begin).`, `${whenLine.ta} ${lead.ta}.`), casesDrill({}, L("All incidents", "எல்லா சம்பவங்களும்")));
  const kindTa = (k: { cat: string; label: string }) => CAT_LABEL_TA[k.cat] ?? k.label;
  if (inc.kinds.length && inc.n >= 3 && !(subj.cats?.length === 1)) {
    const [k1, k2] = inc.kinds;
    addPoint(bi(`Most reported: ${k1.label} (${spoken(k1.n)})${k2 ? `, then ${k2.label} (${spoken(k2.n)})` : ""}.`, `அதிகம் பதிவானது: ${kindTa(k1)} (${spoken(k1.n)})${k2 ? `, அடுத்து ${kindTa(k2)} (${spoken(k2.n)})` : ""}.`),
      drillTo(base, { cat: k1.cat, family: null }, k1.label));
  }
  const riser = !held ? undefined : [...inc.kinds].filter((k) => k.n - k.prev >= 2 && k.n >= 3).sort((a, b) => (b.n - b.prev) - (a.n - a.prev))[0];
  if (riser && riser !== inc.kinds[0]) addPoint(bi(`Rising fastest: ${riser.label}, ${spoken(riser.n)} against ${spoken(riser.prev)} before.`, `வேகமாக உயர்வது: ${kindTa(riser)}, ${spoken(riser.n)}; முன்பு ${spoken(riser.prev)}.`),
    drillTo(base, { cat: riser.cat, family: null }, riser.label));
  const spot = inc.places.find((p) => p.n >= 2 && !(subj.place && p.place.toLowerCase().includes(subj.place.toLowerCase())));
  if (spot) addPoint(bi(`Hotspot: ${clip(spot.place, 60)}, ${spoken(spot.n)} reports${spot.open ? ` (${spoken(spot.open)} still open)` : ""}.`, `அதிகம் புகார் வரும் இடம்: ${clip(spot.place, 60)}, ${spoken(spot.n)}${spot.open ? ` (${spoken(spot.open)} நிலுவையில்)` : ""}.`),
    drillTo(base, { place: spot.place, exact: true, zones: spot.zone && !subj.zones.length ? [spot.zone] : subj.zones }, spot.place));
  const top = rows[0];
  if (inc.severe && top) addPoint(bi(`${spoken(inc.severe)} severe; the most urgent: ${clip(top.title, 110)}${top.place ? ` at ${clip(top.place, 50)}` : ""}.`, `${spoken(inc.severe)} கடுமையானவை; முதலில் கவனிக்க வேண்டியது: ${clip(top.title, 110)}.`),
    { recipe: "case", slots: { id: top.id }, label: clip(top.title, 160) });
  else if (top) addPoint(bi(`The most urgent open case: ${clip(top.title, 110)}${top.place ? ` at ${clip(top.place, 50)}` : ""}.`, `முதலில் கவனிக்க வேண்டியது: ${clip(top.title, 110)}.`), { recipe: "case", slots: { id: top.id }, label: clip(top.title, 160) });
  const lateDept = [...inc.depts].sort((a, b) => b.overdue - a.overdue)[0];
  if (inc.overdue && lateDept?.overdue) addPoint(bi(`${spoken(inc.overdue)} past their deadline, most with ${lateDept.name} (${spoken(lateDept.overdue)}).`, `${spoken(inc.overdue)} காலக்கெடு தாண்டியவை; அதிகம் ${DEPT_TA[lateDept.code] ?? lateDept.name} வசம் (${spoken(lateDept.overdue)}).`),
    casesDrill({ status: "overdue" }, L("Past their deadline", "காலக்கெடு தாண்டியவை")));
  const busiest = !subj.zones.length && inc.zones[0];
  if (busiest && subj.district === false && !subj.area) addPoint(bi(`Most of it in ${busiest.name} (${spoken(busiest.n)}).`, `அதிகம் ${zoneName(c.w, busiest.zone)?.ta ?? busiest.name}-ல (${spoken(busiest.n)}).`), drillTo(base, { zones: [busiest.zone] }, busiest.name));
  else if (busiest && subj.district) addPoint(bi(`Busiest area: ${busiest.name} with ${spoken(busiest.n)}, ${spoken(busiest.severe)} severe.`, `அதிகம் பதிவான பகுதி: ${zoneName(c.w, busiest.zone)?.ta ?? busiest.name}, ${spoken(busiest.n)}; ${spoken(busiest.severe)} கடுமையானவை.`), drillTo(base, { zones: [busiest.zone] }, busiest.name));
  if (inc.dead || inc.injured) addPoint(bi(`${inc.dead ? `${spoken(inc.dead)} ${inc.dead === 1 ? "death" : "deaths"}` : ""}${inc.dead && inc.injured ? " and " : ""}${inc.injured ? `${spoken(inc.injured)} injured` : ""} reported.`,
    `${inc.dead ? `${spoken(inc.dead)} உயிரிழப்பு` : ""}${inc.dead && inc.injured ? ", " : ""}${inc.injured ? `${spoken(inc.injured)} பேர் காயம்` : ""} பதிவாகியுள்ளது.`), casesDrill({ sev: "Severe" }, L("Severe incidents", "கடுமையான சம்பவங்கள்")));

  // the readings, in a line each
  const aqiNear = aqi?.rows?.[0];
  if (aqiNear) {
    const [, en, t] = aqiBand(aqiNear.avg);
    const far = aqi?.nearest && aqi.nearest.id === aqiNear.id ? ` (nearest station, ${aqi.nearest.km} km away)` : "";
    addPoint(bi(aqiNear.inWindow ? `Air quality at ${clip(aqiNear.name, 60)}${far}: ${spoken(aqiNear.avg)} on average (${en}), highest ${spoken(aqiNear.max)}.` : `Air quality at ${clip(aqiNear.name, 60)}${far}: ${spoken(aqiNear.last)} (${en}), its last reading on ${boundWords(aqiNear.lastAt + ":00")}.`,
      aqiNear.inWindow ? `${clip(aqiNear.name, 60)} காற்றுத் தரம்: சராசரி ${spoken(aqiNear.avg)} (${t}), அதிகபட்சம் ${spoken(aqiNear.max)}.` : `${clip(aqiNear.name, 60)} காற்றுத் தரம்: ${spoken(aqiNear.last)} (${t}).`),
      { recipe: "readings", slots: { metric: "aqi", ...(zone1 ? { zones: [zone1] } : {}), ...(w.custom && spec ? { span: spec } : {}), period: w.key }, label: L("Air quality", "காற்றுத் தரம்") });
  }
  const wet = (rain?.rows ?? []).filter((r) => r.inWindow).sort((a, b) => b.max - a.max)[0];
  if (wet && wet.max > 0) addPoint(bi(`Rain: up to ${spoken(Math.round(wet.max * 10) / 10)} mm in a day at ${clip(wet.name.replace(/^Chennai-/, ""), 40)} in this window.`, `மழை: ${clip(wet.name.replace(/^Chennai-/, ""), 40)}-ல ஒரு நாளில் அதிகபட்சம் ${spoken(Math.round(wet.max * 10) / 10)} மி.மீ.`),
    { recipe: "readings", slots: { metric: "rain", ...(zone1 ? { zones: [zone1] } : {}), ...(w.custom && spec ? { span: spec } : {}), period: w.key }, label: L("Rainfall", "மழை") });
  else if (rain?.rows?.some((r) => r.inWindow)) addPoint(bi("No rain recorded at the gauges in this window.", "இந்தக் காலத்தில் மழைமானிகளில் மழை பதிவாகவில்லை."), { recipe: "readings", slots: { metric: "rain", ...(zone1 ? { zones: [zone1] } : {}), ...(w.custom && spec ? { span: spec } : {}), period: w.key }, label: L("Rainfall", "மழை") });
  if (warn && warn.level >= 1) addPoint(bi(`IMD ${["green", "yellow", "orange", "red"][Math.min(3, warn.level)]} warning in force (${boundWords(warn.t + ":00")}).`, `வானிலை மையத்தின் ${["பச்சை", "மஞ்சள்", "ஆரஞ்சு", "சிவப்பு"][Math.min(3, warn.level)]} எச்சரிக்கை (${boundWords(warn.t + ":00")}).`), { recipe: "readings", slots: { metric: "rain", ...(zone1 ? { zones: [zone1] } : {}), ...(w.custom && spec ? { span: spec } : {}), period: w.key }, label: L("Rainfall", "மழை") });
  // (a market report weeks older than the window is not this window: said in a note, never as its price)
  const fresh = !!prices?.latest && Date.parse(`${w.to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${prices.latest}T00:00:00Z`) <= 21 * 864e5;
  if (prices?.rows?.length && !fresh) c.notes.push(L(`Vegetable prices are left out: the Uzhavar Sandhai markets last reported prices on ${boundWords(`${prices.latest} 00:00`)}.`, `காய்கறி விலை இல்லை: சந்தைகளின் கடைசி அறிக்கை ${boundWords(`${prices.latest} 00:00`)}.`));
  const staple = fresh ? prices?.rows?.[0] : undefined;
  if (staple) {
    const mk = prices!.market ? `the ${prices!.market} market` : "the Chennai markets";
    const was = staple.firstDate !== staple.date && staple.firstPerKg !== staple.perKg ? `, ₹${rupees(staple.firstPerKg)} on ${boundWords(staple.firstDate + " 00:00")}` : "";
    addPoint(bi(`${staple.commodity} at ${mk}: ₹${rupees(staple.perKg)} a kilo on ${boundWords(staple.date + " 00:00")}${was}.`, `${staple.commodity} (${prices!.market ?? "சென்னைச் சந்தைகள்"}): கிலோ ₹${rupees(staple.perKg)}, ${boundWords(staple.date + " 00:00")}.`),
      { recipe: "prices", slots: { ...(zone1 ? { zones: [zone1] } : {}), ...(w.custom && spec ? { span: spec } : {}), period: w.key }, label: L("Vegetable prices", "காய்கறி விலை") });
  }
  if (news?.total) addPoint(bi(`In the news: ${spoken(news.total)} ${news.total === 1 ? "story" : "stories"}${subj.district ? "" : ` about ${where.en}`}; latest: ${clip(news.rows[0]?.title_en || news.rows[0]?.title, 120)}.`,
    `செய்திகளில்: ${spoken(news.total)} செய்திகள்; சமீபத்தியது: ${clip(news.rows[0]?.title, 120)}.`),
    { recipe: "news", slots: { ...base, fresh: true }, label: L("The news", "செய்திகள்") });
  if (traffic?.say) addPoint(bi(`Traffic now: ${clip(traffic.say, 220)}`, `இப்போது போக்குவரத்து: ${clip(traffic.say, 220)}`), { recipe: "city", slots: { q: "traffic", ...(zone1 ? { zones: [zone1] } : {}) }, label: L("Live traffic", "நேரலை போக்குவரத்து") });
  if (!inc.n) points.splice(1, points.length - 1), pointDrills.splice(1, pointDrills.length - 1);
  blocks.push({ kind: "Brief", id: "points", title: L("Key points", "முக்கியக் குறிப்புகள்"), points: points.slice(0, 12).map((p, i) => ({ text: clip(p.en, 400), ta: clip(p.ta, 400), incidentId: pointDrills[i]?.recipe === "case" ? String(pointDrills[i]!.slots.id) : null, drill: pointDrills[i] })) });

  // ---- the shape of it: kinds, days, areas, departments
  if (inc.kinds.length > 1) blocks.push({ kind: "Chart", id: "kinds", title: L("By kind", "வகை வாரியாக"), chart: "hbar", unit: "incidents",
    labels: inc.kinds.slice(0, 10).map((k) => clip(ta ? kindTa(k) : k.label, 80)), values: inc.kinds.slice(0, 10).map((k) => k.n),
    drills: inc.kinds.slice(0, 10).map((k) => drillTo(base, { cat: k.cat, family: null }, k.label)) });
  if (inc.buckets.length > 1) {
    const labels = inc.buckets.map((b) => (inc.byHour ? b.at.slice(5).replace(/^(\d{2})-(\d{2}) (\d{2}):00$/, (_m, mo, d, h) => `${Number(d)}/${Number(mo)} ${Number(h) % 12 || 12}${Number(h) < 12 ? "am" : "pm"}`) : boundWords(`${b.at} 00:00`)));
    blocks.push({ kind: "Trend", id: "days", title: L(inc.byHour ? "Hour by hour" : "Day by day", inc.byHour ? "மணி வாரியாக" : "நாள் வாரியாக"), unit: "incidents", labels: labels.slice(-120), values: inc.buckets.map((b) => b.n).slice(-120), marks: [], normal: null,
      drills: inc.buckets.map((b) => { const d = daySpec(b.at.slice(0, 10)); return d ? drillTo(base, { span: d, period: "daily" }, boundWords(`${b.at.slice(0, 10)} 00:00`)) : null; }).slice(-120) });
  }
  if (!subj.zones.length && inc.zones.length > 1) blocks.push({ kind: "Ranking", id: "zones", title: L("By area", "பகுதி வாரியாக"), unit: "incidents", order: "top",
    method: L(`Incidents reported in each zone, ${when.en}${held ? `; "before" is ${w.prev.label.en}` : ""}.`, `ஒவ்வொரு மண்டலத்திலும் பதிவான சம்பவங்கள், ${when.ta}.`),
    items: inc.zones.slice(0, 15).map((z, i) => ({ key: `z${z.zone}`, label: clip(zoneName(c.w, z.zone)?.[ta ? "ta" : "en"] ?? z.name, 120), value: z.n, rank: i + 1,
      sub: clip(L(`${z.severe} severe · ${z.open} open${z.overdue ? ` · ${z.overdue} past deadline` : ""}${held ? ` · ${z.prev} before` : ""}`, `${z.severe} கடுமை · ${z.open} நிலுவை${held ? ` · முன்பு ${z.prev}` : ""}`), 160),
      zone: z.zone, lat: null, lon: null, action: "zone" as const, drill: drillTo(base, { zones: [z.zone] }, z.name) })) });
  else if (inc.places.length > 1) blocks.push({ kind: "Ranking", id: "places", title: L("By locality", "இடம் வாரியாக"), unit: "incidents", order: "top",
    method: L(`Incidents by the locality in their place, ${when.en}.`, `இடம் வாரியாகச் சம்பவங்கள், ${when.ta}.`),
    items: inc.places.slice(0, 10).map((p, i) => ({ key: `p${i}`, label: clip(p.place, 120), value: p.n, rank: i + 1, sub: clip(L(`${p.open} open · ${p.severe} severe`, `${p.open} நிலுவை · ${p.severe} கடுமை`), 160),
      zone: p.zone, lat: null, lon: null, action: "none" as const, drill: drillTo(base, { place: p.place, exact: true }, p.place) })) });
  if (!subj.dept && inc.depts.length > 1) blocks.push({ kind: "Ranking", id: "depts", title: L("By department", "துறை வாரியாக"), unit: "incidents", order: "top",
    method: L("The department that leads each incident; open and past-deadline counts beside it.", "ஒவ்வொரு சம்பவத்துக்கும் பொறுப்பான துறை."),
    items: inc.depts.slice(0, 10).map((d, i) => ({ key: d.code, label: clip(ta ? DEPT_TA[d.code] ?? d.name : d.name, 120), value: d.n, rank: i + 1,
      sub: clip(L(`${d.open} open · ${d.overdue} past deadline · ${d.severe} severe`, `${d.open} நிலுவை · ${d.overdue} கெடு தாண்டியவை`), 160), zone: null, lat: null, lon: null, action: "dept" as const,
      drill: drillTo(base, { dept: d.code }, d.name) })) });

  // ---- the cases, and where they are
  if (rows.length) blocks.push({ kind: "CaseList", id: "top", title: L("Most urgent in this window", "இந்தக் காலத்தில் முதலில் கவனிக்க வேண்டியவை"), source: "list", sev: subj.sev, total: inc.n, rows });
  const m = mapBlock();
  if (m) blocks.push(m);

  // ---- the news
  if (news?.rows?.length) blocks.push({ kind: "NewsReader", id: "news", title: L(`In the news · ${when.en}`, `செய்திகளில் · ${when.ta}`), total: news.total,
    items: news.rows.map((x: Row) => ({ id: clip(x.id, 120), title: clip(ta ? x.title : x.title_en || x.title, 300), source: clip(x.publisher, 80) || null, t: x.t ?? null, place: clip(x.loc, 120) || null,
      incidentId: x.incident ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null, summary: clip(x.summary, 600) || null })) });

  // ---- the readings
  const readBlock = (id: string, title: Bilingual, metric: string, unit: string, rs: WinReading[] | undefined, n: number, value: (r: WinReading) => number, detail: (r: WinReading) => string | null) => {
    if (!rs?.length) return;
    blocks.push({ kind: "Readings", id, title: clip(ta ? title.ta : title.en, 160), metric, unit, items: rs.slice(0, n).map((r) => ({ id: clip(r.id, 80), name: clip(r.name.replace(/, Chennai - (TNPCB|CPCB)$/, "").replace(/^Chennai-/, ""), 120), value: Math.round(value(r) * 10) / 10,
      t: r.lastAt ?? null, mean28: null, z: null, anomaly: false, detail: clip(detail(r), 200) || null })) });
  };
  readBlock("aqi", bi(`Air quality (AQI) · ${when.en}`, `காற்றுத் தரம் · ${when.ta}`), "aqi", "AQI", aqi?.rows, zone1 ? 3 : 8, (r) => (r.inWindow ? r.avg : r.last),
    (r) => (r.inWindow ? L(`average; highest ${spoken(Math.round(r.max))}, ${aqiBand(r.avg)[1]}`, `சராசரி; அதிகபட்சம் ${spoken(Math.round(r.max))}`) : L(`last reading ${boundWords(r.lastAt + ":00")}`, `கடைசி அளவு ${boundWords(r.lastAt + ":00")}`)));
  readBlock("rain", bi(`Rainfall · ${when.en}`, `மழை · ${when.ta}`), "rain", "mm", rain?.rows?.filter((r) => r.inWindow), 6, (r) => r.max, () => L("the most in a day", "ஒரு நாளில் அதிகபட்சம்"));
  readBlock("lakes", bi("Lake storage", "ஏரி இருப்பு"), "lakes", "% full", lakes?.rows?.filter((r) => !zone1 || r.zone === zone1 || subj.district).slice(0, 8), 8, (r) => r.last,
    (r) => (r.first !== r.last ? L(`${r.last > r.first ? "up" : "down"} from ${spoken(Math.round(r.first))}% at the window's start`, `தொடக்கத்தில் ${spoken(Math.round(r.first))}%`) : null));

  // ---- prices at the area's market
  if (prices?.rows?.length && fresh) {
    const mk = prices.market ? bi(`${prices.market} Uzhavar Sandhai`, `${prices.market} உழவர் சந்தை`) : bi("Chennai markets (average)", "சென்னைச் சந்தைகள் (சராசரி)");
    blocks.push({ kind: "Answer", id: "prices", title: clip(L(`Vegetable prices · ${mk.en}`, `காய்கறி விலை · ${mk.ta}`), 160),
      text: clip(L(`Modal price a kilo on ${boundWords((prices.latest ?? "") + " 00:00")}${prices.inWindow ? "" : " (the latest report held: the markets' prices are read once a day)"}.`,
        `${boundWords((prices.latest ?? "") + " 00:00")} அன்று கிலோ விலை${prices.inWindow ? "" : " (சமீபத்திய அறிக்கை)"}.`), 900),
      facts: prices.rows.slice(0, 12).map((p) => ({ label: clip(`${p.commodity}${p.firstDate !== p.date && p.firstPerKg !== p.perKg ? ` (was ₹${rupees(p.firstPerKg)})` : ""}`, 160), value: p.perKg, unit: "₹/kg" })) });
  }
  if (traffic?.say) blocks.push({ kind: "Answer", id: "traffic", title: L("Traffic right now", "இப்போது போக்குவரத்து"), text: clip(traffic.say, 900), facts: [] });
  // v18 round 2: traffic over the window, from the readings the website keeps every 10 minutes (lib/city/history.ts)
  if (win.trafficHistory && (subj.district || subj.area || fam === "ROADS_TRAFFIC" || subj.dept === "POL-GCP") && !subj.place) {
    const hist = await win.trafficHistory(w, zone1).catch(() => null);
    const jammed = (hist?.stretches ?? []).filter((s) => s.seen > 0).slice(0, 8);
    if (hist?.readings && jammed.length) {
      c.sources.add("TomTom readings (kept every 10 min)");
      blocks.push({ kind: "Ranking", id: "trafficPast", title: L(`Most often jammed roads · ${when.en}`, `அடிக்கடி நெரிசல் உள்ள சாலைகள் · ${when.ta}`), unit: L("readings", "அளவீடுகள்"), order: "top",
        method: clip(L(`How many of the ${hist.readings} ten-minute ${hist.readings === 1 ? "reading" : "readings"} of live traffic ${wholeDays(w, hist)} saw each stretch jammed${hist.since && hist.since > w.from ? ` (TomTom keeps no history: this website has kept its readings since ${boundWords(hist.since)})` : ""}.`, `இந்தக் காலத்தின் ${hist.readings} அளவீடுகளில் நெரிசலாக இருந்த முறை.`), 240),
        items: jammed.map((s, i) => ({ key: clip(s.stretch, 60), label: clip(s.name, 120), value: s.seen, rank: i + 1, sub: clip(L(`${s.very} very congested · worst ${Math.round(s.maxDelayS / 60)} min delay`, `${s.very} மிகக் கடும்`), 160),
          zone: s.zone, lat: s.lat, lon: s.lon, action: "none" as const, drill: { recipe: "city" as const, slots: { q: "traffic", past: true, ...(s.zone ? { zones: [s.zone] } : {}), period: w.key, ...(w.custom && spec ? { span: spec } : {}), fresh: true }, label: L("Traffic in this window", "இந்தக் கால போக்குவரத்து") } })) });
    }
  }

  // ---- what each part shows (the owner: "I don't know what each tile is describing; simply a chart, we cannot identify what it is saying")
  const subjEn = subj.district ? "the district" : subj.name.en;
  const ABOUT: Record<string, Bilingual> = {
    kpis: bi(`Each tile counts the incidents reported ${over} for ${subjEn}${held ? `; the arrow compares with ${w.prev.label.en}` : ""}. Click a tile for those cases.`, `ஒவ்வொரு கட்டமும் ${whenLine.ta} பதிவான சம்பவங்கள்; தொட்டால் அந்தச் சம்பவங்கள்.`),
    points: bi("What stands out in this window, worked out from the records on this screen. Click a point for its details.", "இந்தக் காலத்தில் முக்கியமானவை. விவரத்துக்கு தொடுங்கள்."),
    kinds: bi(`Each bar: the incidents of one kind reported ${over}. Click a bar for that kind's own summary.`, "ஒவ்வொரு பட்டையும் ஒரு வகைச் சம்பவங்கள். தொட்டால் அந்த வகையின் சுருக்கம்."),
    days: bi(inc.byHour ? `Incidents reported each hour ${over}. Click a point for that day's summary.` : `Incidents reported each day ${over}. Click a point for that day's summary.`, "நேரம் வாரியாகப் பதிவானவை. ஒரு புள்ளியைத் தொட்டால் அந்த நாள்."),
    zones: bi(`Incidents reported in each zone ${over}; beside each, severe, still open, past deadline and the window before. Click a zone for its summary.`, "ஒவ்வொரு மண்டலத்திலும் பதிவானவை. தொட்டால் அந்த மண்டலத்தின் சுருக்கம்."),
    places: bi(`Incidents by the locality named in their place ${over}. Click one for its summary.`, "இடம் வாரியாகச் சம்பவங்கள். தொட்டால் அதன் சுருக்கம்."),
    depts: bi(`Incidents by the department that leads them ${over}, with how many are still open and past their deadline. Click one for its summary.`, "துறை வாரியாகச் சம்பவங்கள். தொட்டால் அந்தத் துறையின் சுருக்கம்."),
    top: bi("Open cases first, then by priority score (severity, time past the deadline, how many sources and complaints). Click a case for its details.", "முன்னுரிமைப்படி திறந்த சம்பவங்கள். தொட்டால் விவரம்."),
    list: bi("The cases behind the number you clicked, open first, then by priority score.", "நீங்கள் தொட்ட எண்ணுக்குரிய சம்பவங்கள்."),
    map: bi("Each point is an incident of this window (red severe); the numbered ones rank highest. Click a point for its case.", "ஒவ்வொரு புள்ளியும் ஒரு சம்பவம்; சிவப்பு = கடுமை."),
    news: bi(`News reports ${over} that name ${subjEn}, one line a story, the ones about incidents first. Click a headline for its summary.`, "இந்தக் காலச் செய்திகள். தலைப்பைத் தொட்டால் சுருக்கம்."),
    aqi: bi("The air-quality index at the nearest monitoring stations (CPCB and TNPCB): the window's average, its highest reading, and the band.", "அருகிலுள்ள நிலையங்களின் காற்றுத் தரக் குறியீடு."),
    rain: bi("Rain at the IMD gauges: the most recorded in one day within this window.", "இந்தக் காலத்தில் ஒரு நாளின் அதிகபட்ச மழை."),
    lakes: bi("Storage of the lakes and reservoirs, as a share of full, at their latest reading.", "ஏரிகளின் இருப்பு, நிரம்பிய அளவின் சதவீதம்."),
    prices: bi("The retail price a kilo at the area's Uzhavar Sandhai (the middle of its low and high), latest report, from the TN Agricultural Marketing department.", "உழவர் சந்தையின் கிலோ விலை."),
    traffic: bi("TomTom's live traffic now in this area.", "இப்போதைய போக்குவரத்து."),
    trafficPast: bi("Live traffic as this website reads and keeps it every 10 minutes: how often each stretch was seen jammed. Click a stretch for traffic in this window.", "ஒவ்வொரு 10 நிமிட அளவீட்டிலும் நெரிசல் கண்ட முறை.")
  };
  for (const b of blocks) { const a = ABOUT[b.id]; if (a && !(b as { about?: string | null }).about) (b as { about?: string | null }).about = clip(ta ? a.ta : a.en, 300); }

  // ---- the spoken line: how it stands, the leading kind, the urgent one, one reading
  const enS: string[] = [], taS: string[] = [];
  enS.push(inc.n ? `${lead.en} came in ${over}${held ? `, against ${spoken(inc.prev)} ${inBefore(w.prev.label.en.replace(/ \(.*\)$/, ""))}` : ""}.` : `Nothing was reported${subj.whereW ? ` in ${subj.whereW.en}` : ""}${subj.kindW ? ` for ${subj.kindW.en.toLowerCase()}` : ""}${subj.deptW ? ` for ${subj.deptW.en}` : ""} ${over}.`);
  taS.push(inc.n ? `${whenLine.ta} ${lead.ta} வந்திருக்கு; முன்னாடி ${spoken(inc.prev)}.` : `${whenLine.ta} ${subj.whereW ? `${inTa(subj.whereW.ta)} ` : ""}எதுவும் பதிவாகல.`);
  if (inc.kinds[0] && inc.n >= 3 && inc.kinds[0].n >= 2 && !(subj.cats?.length === 1)) { enS.push(`Most were ${inc.kinds[0].label.toLowerCase().replace(/&/g, "and")}, ${spoken(inc.kinds[0].n)}.`); taS.push(`அதிகம் ${kindTa(inc.kinds[0])}, ${spoken(inc.kinds[0].n)}.`); }
  if (inc.severe || inc.overdue) { enS.push(`${spoken(inc.severe)} ${inc.severe === 1 ? "is" : "are"} severe and ${spoken(inc.overdue)} ${inc.overdue === 1 ? "is" : "are"} past ${inc.overdue === 1 ? "its" : "their"} deadline.`); taS.push(`${spoken(inc.severe)} கடுமையானவை, ${spoken(inc.overdue)} கெடு தாண்டியவை.`); }
  if (aqiNear) { const [, en, t] = aqiBand(aqiNear.inWindow ? aqiNear.avg : aqiNear.last); enS.push(`Air quality is ${en}.`); taS.push(`காற்றுத் தரம் ${t}.`); }
  else if (staple) { enS.push(`${staple.commodity} is ${rupees(staple.perKg)} rupees a kilo.`); taS.push(`${staple.commodity} கிலோ ${rupees(staple.perKg)} ரூபாய்.`); }

  const next: NextStepT[] = [];
  // (v18 round 2's review: only a window before that falls on whole days, which a span of days opens exactly, and one the records hold;
  // a rolling one starts at a clock time no span of days can carry, so its step opened a longer window than the one counted)
  const wholeDay = (t: string) => t.endsWith(" 00:00:00");
  if ((w.custom || w.key !== "weekly") && w.prevHeld && wholeDay(w.prev.from) && wholeDay(w.prev.to)) next.push({ label: bi("The window before", "அதற்கு முந்தைய காலம்"), kind: "direct", recipe: "summary", ids: [], text: null,
    slots: { ...base, span: { kind: "days", from: dayOf(w.prev.from), to: dayOf(lastDay(w.prev.to)) }, fresh: true } });
  if (!subj.sev) next.push({ label: bi("Only the severe ones", "கடுமையானவை மட்டும்"), kind: "direct", recipe: "summary", ids: [], text: null, slots: { ...base, sev: "Severe", fresh: true } });
  if (inc.overdue) next.push({ label: bi("Past their deadline", "காலக்கெடு தாண்டியவை"), kind: "direct", recipe: "summary", ids: [], text: null, slots: { ...base, status: "overdue", view: "cases", fresh: true } });

  return {
    title: bi(`Summary · ${where.en} · ${when.en}`, `சுருக்கம் · ${where.ta} · ${when.ta}`),
    takeaway: points[0] ? bi(points[1]?.en ?? points[0].en, points[1]?.ta ?? points[0].ta) : null,
    say: bi(enS.slice(0, 4).join(" "), taS.slice(0, 4).join(" ")), blocks, next: next.slice(0, 3), when: whenOf(w)
  };
}

const dayOf = (t: string) => { const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)!; return { day: Number(m[3]), month: Number(m[2]) - 1, year: Number(m[1]) }; };
/** the last whole day before an exclusive bound */
const lastDay = (to: string) => new Date(Date.parse(`${to.replace(" ", "T")}+05:30`) - 1000 + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
/** "in the 7 days before", "yesterday by this time" (the Daily window's comparison takes no "in") */
const inBefore = (label: string): string => (/ by this time$/.test(label) ? label : `in ${label}`);
const whenOf = (w: Win): StageDocT["when"] => (w.custom ? { en: clip(w.label.en, 160), ta: clip(w.label.ta, 200), from: w.from, to: w.to } : null);

/** the summary's own slots, as checkScreen keeps them (screens.ts Slots) */
export type SummarySlots = Pick<Slots, "zones" | "dept" | "cat" | "sev" | "status" | "span" | "place" | "family" | "view">;
