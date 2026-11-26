/**
 * v19 (25 Nov): the analyst's screen: what was asked, and nothing else. The owner: "it should make a screen of what I am asking and not the
 * general overall screen". Pure over the results (run.ts): one number is a tile and the records it counts; a ranking is the positions asked
 * for; the second one is that one, with its own records; a trend is its line; two sides are side by side. Every figure is a result's, every
 * item leads to its own records through the same analyst ("ask" with that item's request), and the spoken line here is code's, used when the
 * writer (say.ts) cannot be reached. English and Tamil.
 */
import type { BlockT, Bilingual, DrillT, NextStepT, PointT, StageDocT } from "../stage";
import { caseRow } from "../screens";
import { figuresIn } from "../numbergate";
import { CAT_LABEL_TA } from "../narrate";
import { bi, clip, type RecipeCtx } from "../recipes/common";
import type { World } from "../types";
import { boundWords, overWords } from "../v18/when";
import { TOPICS, type Topic } from "../v18/topics";
import type { AideExtras } from "../aide7/extras";
import { planFromSlots, planKey, type Plan, type Query } from "./shape";
import { WHOLE_SAID } from "./whole";
import type { AskCtx, Group, Result } from "./run";
import { lastDayOf } from "./days";
import { DEPT_ALIASES } from "../lexicon";

export interface AskPart { title: Bilingual; takeaway: Bilingual | null; say: Bilingual; blocks: BlockT[]; next?: NextStepT[]; when: StageDocT["when"]; aide?: AideExtras; /** the plan with the windows really counted */ slotsOut?: { plan: Plan } }
/** how the screen reads the data (data.ts gives the server's; a test its own) */
export type AskHand = (q: Query, c: Omit<AskCtx, "lockDept">) => Promise<Result>;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-IN") : (Math.round(v * 100) / 100).toLocaleString("en-IN"));
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const ordinal = (k: number) => ORD[k] ?? `number ${k}`;
const ordinalTa = (k: number) => ["", "முதல்", "இரண்டாவது", "மூன்றாவது", "நான்காவது", "ஐந்தாவது"][k] ?? `${k}-வது`;
/** "12 severe incidents", "₹34 a kilo", "AQI 71", "6 min of delay", "43% full" */
export function valueWords(r: Result, v: number): Bilingual {
  const s = fmt(v);
  switch (r.q.of) {
    case "prices": return r.q.measure === "change" ? bi(`${v > 0 ? "up" : v < 0 ? "down" : "no change,"} ₹${fmt(Math.abs(v))} a kilo`, `கிலோவுக்கு ₹${fmt(Math.abs(v))} ${v > 0 ? "உயர்வு" : "குறைவு"}`) : bi(`₹${s} a kilo`, `கிலோ ₹${s}`);
    case "air": return bi(`AQI ${s}`, `AQI ${s}`);
    case "rain": return bi(`${s} mm`, `${s} மி.மீ`);
    case "lakes": return bi(`${s}% full`, `${s}% நிறைவு`);
    case "weather": return r.unit === "%" ? bi(`${s}% humidity`, `ஈரப்பதம் ${s}%`) : bi(`${s} °C`, `${s} °C`);
    case "news": return bi(`${s} ${v === 1 ? "report" : "reports"}`, `${s} செய்திகள்`);
    case "traffic": {
      if (!r.live) { const lv = r.q.level === "very" ? "very congested" : r.q.level === "closed" ? "closed" : r.q.level === "flood" ? "flooded" : r.q.level === "accident" ? "with an accident" : "jammed", lvTa = r.q.level === "closed" ? "மூடல்" : r.q.level === "flood" ? "வெள்ளம்" : r.q.level === "accident" ? "விபத்து" : "நெரிசல்"; return r.q.by === "day" || r.q.by === "hour" ? bi(`${s} ${lv} stretches on average`, `சராசரியாக ${s} ${lvTa}`) : bi(`${lv} in ${s} readings`, `${s} பதிவுகளில் ${lvTa}`); }
      if (r.q.level && r.q.by !== "road" && !["very", "congested", "slow"].includes(r.q.level)) return r.q.level === "closed" ? bi(`${s} closed ${v === 1 ? "road" : "roads"}`, `${s} மூடப்பட்ட சாலைகள்`) : r.q.level === "flood" ? bi(`${s} flooded ${v === 1 ? "road" : "roads"}`, `${s} தண்ணீர் தேங்கிய சாலைகள்`) : bi(`${s} road ${v === 1 ? "accident" : "accidents"}`, `${s} விபத்துகள்`);
      if (r.q.by === "road" && (r.q.level === "closed" || r.q.level === "flood" || r.q.level === "accident")) { const en = r.q.level === "closed" ? "closed" : r.q.level === "flood" ? "flooded" : "an accident", ta1 = r.q.level === "closed" ? "மூடப்பட்டது" : r.q.level === "flood" ? "தண்ணீர் தேங்கியது" : "விபத்து"; return bi(v ? `${en}, ${s} min delay` : en, v ? `${ta1}, ${s} நிமிடத் தாமதம்` : ta1); }
      return r.q.by === "road" ? bi(v ? `${s} min delay` : "under a minute of delay", v ? `${s} நிமிடத் தாமதம்` : "ஒரு நிமிடத்துக்கும் குறைவான தாமதம்") : bi(`${s} ${v === 1 ? "jam" : "jams"}`, `${s} நெரிசல்கள்`);
    }
    default: {
      const one = v === 1;
      switch (r.q.measure) {
        case "severe": return bi(`${s} severe ${one ? "incident" : "incidents"}`, `${s} கடுமையான சம்பவங்கள்`);
        case "open": return bi(`${s} open`, `${s} நிலுவையில்`);
        case "overdue": return bi(`${s} past deadline`, `${s} காலக்கெடு தாண்டியவை`);
        case "resolved": return bi(`${s} resolved`, `${s} தீர்க்கப்பட்டவை`);
        case "deaths": return bi(`${s} ${one ? "death" : "deaths"}`, `${s} உயிரிழப்புகள்`);
        case "injured": return bi(`${s} injured`, `${s} பேர் காயம்`);
        case "complaints": return bi(`${s} open citizen ${one ? "complaint" : "complaints"}`, `${s} மக்கள் புகார்கள்`);
        case "share": return bi(`${s}%`, `${s}%`);
        case "change": return bi(v > 0 ? `up ${fmt(v)}` : v < 0 ? `down ${fmt(-v)}` : "no change", v > 0 ? `${fmt(v)} உயர்வு` : v < 0 ? `${fmt(-v)} குறைவு` : "மாற்றமில்லை");
        case "days_to_close": return bi(`${s} days to close`, `முடிக்க ${s} நாட்கள்`);
        case "days_open": return bi(`${s} days open`, `${s} நாட்கள் நிலுவையில்`);
        default: return bi(`${s} ${one ? "incident" : "incidents"}`, `${s} சம்பவங்கள்`);
      }
    }
  }
}
/** "over the last 2 days", "now", "on 20 Nov" */
export const overEn = (r: Result) => (r.live ? "right now" : overWords(r.over.en));
const overTa = (r: Result) => (r.live ? "இப்போது" : r.over.ta);

// ------------------------------------------------------------------ blocks --

const drillOf = (plan: Plan, q: Query | null, label: Bilingual, period: string, ta: boolean): DrillT | null =>
  q ? { recipe: "ask", slots: { plan: { ...plan, understood: label.en, title: clip(label.en, 90), title_ta: clip(label.ta, 120), queries: [q] }, period, fresh: true }, label: clip(ta ? label.ta : label.en, 160) } : null;

function tileOf(r: Result, id: string, ta: boolean, label?: string): Extract<BlockT, { kind: "Kpis" }>["items"][number] {
  const prev = r.prev && r.prev.held && r.q.of === "incidents" && r.q.measure !== "days_open" && r.q.measure !== "days_to_close" ? r.prev.total : null;
  const delta = prev == null ? null : Math.round((r.total! - prev) * 10) / 10;
  const worse = r.q.measure !== "resolved";
  const name = r.q.of === "incidents" && !sameAsWhat(r) ? (ta ? `${r.measure.ta}: ${r.what.ta}` : `${cap(r.measure.en)}: ${r.what.en}`) : ta ? r.what.ta : cap(r.what.en);
  // (a share's name is its whole; its part is said beside it when both fit)
  const shown = label ?? (r.q.measure === "share" && name.length > 80 ? (ta ? r.measure.ta : cap(r.measure.en)) : name);
  return { key: id, label: clip(shown, 80), value: r.total ?? 0, unit: r.q.measure === "share" ? "%" : r.q.of === "incidents" && (r.q.measure === "days_open" || r.q.measure === "days_to_close") ? "days" : r.q.of === "incidents" || r.q.of === "traffic" || r.q.of === "news" ? null : r.unit,
    prev, delta, pct: prev ? Math.round((delta! / prev) * 100) : null, tone: delta == null || delta === 0 ? "neutral" : (delta > 0) === worse ? "bad" : "good", spark: [] };
}
const pointsOf = (rows: { lat: number | null; lon: number | null; id: string; title: string; sev: string | null }[]): PointT[] =>
  rows.map((x, i) => ({ x, i })).filter(({ x }) => x.lat != null && x.lon != null).slice(0, 200).map(({ x, i }) => ({ n: i + 1, id: x.id, lat: x.lat!, lon: x.lon!, label: clip(x.title, 160), sev: x.sev, value: null, hot: i < 3 }));

function caseBlocks(r: Result, w: World, ta: boolean, id: string, title: string): BlockT[] {
  if (!r.rows.length) return [];
  const rows = r.rows.map((x) => caseRow(x, w)).slice(0, 60);
  const out: BlockT[] = [{ kind: "CaseList", id: `${id}-cases`, title: clip(title, 160), source: "list", sev: r.q.sev.length === 1 ? r.q.sev[0] : null, total: r.rowsTotal, rows,
    about: ta ? `${rows.length < r.rowsTotal ? `${r.rowsTotal} இல் முதல் ${rows.length}. ` : ""}ஒரு சம்பவத்தைத் தொட்டால் விவரம்.` : `${rows.length < r.rowsTotal ? `The first ${rows.length} of ${fmt(r.rowsTotal)}. ` : ""}Click a case for its details.` }];
  const pts = pointsOf(rows);
  if (pts.length) out.push({ kind: "MapView", id: `${id}-map`, title: ta ? "இவை எங்கே" : "Where they are", rule: null, shade: null, points: pts, outline: r.q.zones.slice(0, 15),
    about: ta ? "மேலே உள்ள அதே சம்பவங்கள்." : "The same cases, by their number in the list." });
  return out;
}

/** the heading of one part: what is counted and over which window */
const headOf = (r: Result, ta: boolean): string => (ta ? `${r.what.ta}, ${overTa(r)}` : `${cap(r.what.en)}, ${r.live ? "now" : r.over.en}`);

/** the figure is simply how many of what is counted ("severe incidents" counted by severe) */
const sameAsWhat = (r: Result): boolean => r.q.measure === "count" || (r.q.measure === "severe" && r.q.sev.length === 1 && r.q.sev[0] === "Severe") || (r.q.measure === "open" && r.q.status === "open") || (r.q.measure === "overdue" && r.q.status === "overdue") || (r.q.measure === "resolved" && r.q.status === "resolved");
function rankTitle(r: Result, ta: boolean): string {
  const least = r.q.order === "least";
  const g = r.groupNoun;
  const plain = sameAsWhat(r);
  const scope = r.q.of !== "incidents" || plain ? r.what.en : r.q.measure === "severe" ? r.what.en.replace(/\bincidents\b/, "severe incidents") : r.q.measure === "open" ? r.what.en.replace(/\bincidents\b/, "open incidents") : `${r.measure.en}, ${r.what.en}`;
  if (r.q.of === "prices") return clip(ta ? `${r.q.measure === "change" ? "விலை மாற்றம்" : "விலை"}, ${overTa(r)}` : `${r.q.measure === "change" ? "Price changes" : "Prices"}${r.what.en.match(/ in .*$/)?.[0] ?? ""}, ${r.over.en}${least && r.q.measure === "price" ? " (cheapest first)" : ""}`, 160);
  // (a long list shows its first 25, and says so)
  const more = r.q.take && r.q.take >= 60 && r.groups.length > r.shown.length ? (ta ? ` (${r.groups.length} இல் முதல் ${r.shown.length})` : ` (the first ${r.shown.length} of ${r.groups.length})`) : "";
  if (ta) return clip(`${least ? "குறைவான" : "அதிகமான"} ${g.ta}: ${r.what.ta}${plain || r.q.of !== "incidents" ? "" : ` (${r.measure.ta})`}, ${overTa(r)}${more}`, 160);
  const plural = r.shown.length === 1 ? cap(g.en) : `${cap(g.en === "area" ? "areas" : g.en === "locality" ? "localities" : g.en === "day" ? "days" : g.en === "hour of the day" ? "hours" : g.en === "day of the week" ? "days of the week" : `${g.en}s`)}`;
  if (r.q.measure === "change" && r.q.of === "incidents") return clip(`${plural}: ${r.what.en}, ${r.over.en} against before (${least ? "biggest fall" : "biggest rise"} first)`, 160);
  if (r.q.per) return clip(`The ${least ? "least" : "top"} ${g.en} of each ${r.q.per === "dept" ? "department" : r.q.per === "kind" ? "kind" : "area"}: ${r.what.en}, ${r.over.en}`, 160);
  return clip(`${plural} by ${scope}, ${r.live ? "now" : r.over.en}${least ? " (least first)" : ""}${more}`, 160);
}
const NONE_ACTION = { zone: "zone", dept: "dept", station: "station" } as const;

function rankBlocks(r: Result, plan: Plan, w: World, ta: boolean, id: string, period: string): BlockT[] {
  const out: BlockT[] = [];
  const items = r.shown.slice(0, 25);
  if (!items.length) return out;
  const by = r.q.by!;
  // a day by day split is its line (a position or a number asked of it is a ranking)
  if ((by === "day" || by === "month" || by === "hour" || by === "weekday") && !r.q.rank && !r.q.take && !r.q.per && r.shown.length > 1) {
    const g = r.shown;
    const label = (x: Group) => clip(ta ? x.ta : by === "hour" ? x.label.replace(/ to .*/, "") : x.label, 40);
    if (by === "day" || by === "month") out.push({ kind: "Trend", id: `${id}-trend`, title: clip(headOf(r, ta), 160), unit: clip(r.unit ?? (ta ? r.measure.ta : r.measure.en), 30), labels: g.map(label), values: g.map((x) => x.value), marks: [], normal: null,
      drills: g.map((x) => drillOf(plan, x.inside, bi(`${cap(r.what.en)}, ${x.label}`, `${r.what.ta}, ${x.ta}`), period, ta)), about: ta ? "ஒவ்வொரு புள்ளியும் ஒரு நாள்/மாதம். தொட்டால் அதன் பதிவுகள்." : `Each point: one ${by}. Click a point for its records.` });
    else out.push({ kind: "Chart", id: `${id}-chart`, title: clip(headOf(r, ta), 160), chart: "bar", unit: clip(r.unit ?? r.measure.en, 30), labels: g.slice(0, 40).map(label), values: g.slice(0, 40).map((x) => x.value),
      about: ta ? "ஒவ்வொரு பட்டையும் ஒரு நேரம்." : `Each bar: one ${by === "hour" ? "hour of the day" : "day of the week"}.` });
    return out;
  }
  // ("the worst area of each department": its items are pairs, so no area, department or station of their own to open)
  const action = (r.q.per ? "none" : by === "zone" ? NONE_ACTION.zone : by === "dept" ? NONE_ACTION.dept : by === "station" ? NONE_ACTION.station : "none") as "zone" | "dept" | "station" | "none";
  out.push({ kind: "Ranking", id: `${id}-rank`, title: rankTitle(r, ta), unit: r.unit ? clip(r.unit, 30) : null, order: r.q.order === "least" ? "bottom" : "top",
    method: clip(r.method ? (ta ? r.method.ta : r.method.en) : ta ? `${overTa(r)}: ${r.what.ta}.` : `Counted ${overEn(r)} by the dashboard's own rules.`, 240),
    about: items.some((x) => x.inside) ? (ta ? "தொட்டால் அதன் பதிவுகள்." : "Click one for its own records.") : null,
    items: items.map((x, i) => ({ key: clip(x.key, 60), label: clip(ta ? x.ta : x.label, 120), value: x.value, rank: r.from + i, sub: x.sub ? clip(ta ? x.sub.ta : x.sub.en, 160) : null, zone: x.zone, lat: x.lat, lon: x.lon, action,
      drill: drillOf(plan, x.inside, bi(!r.q.per && (by === "zone" || by === "place") ? `${cap(r.what.en)} in ${x.label}` : `${x.label}: ${r.what.en}`, `${x.ta}: ${r.what.ta}`), period, ta) })) });
  // where they are: areas shaded by their figure, roads and places as points
  if (by === "zone" && r.q.of === "incidents" && !r.q.per) out.push({ kind: "MapView", id: `${id}-map`, title: ta ? "எங்கே" : "Where", rule: null, shade: { geo: "zone", label: clip(ta ? r.measure.ta : cap(r.measure.en), 80), values: items.map((x) => ({ key: Number(x.key), value: x.value })) }, points: [], outline: items.map((x) => Number(x.key)).slice(0, 15) });
  else {
    const pts: PointT[] = items.map((x, i) => ({ x, i })).filter(({ x }) => x.lat != null && x.lon != null && !r.q.per && by !== "ward" && by !== "dept" && by !== "kind" && by !== "group" && by !== "severity" && by !== "status" && by !== "day" && by !== "hour" && by !== "weekday" && by !== "month" && by !== "taluk")
      .map(({ x, i }) => ({ n: r.from + i, id: clip(x.key, 120), lat: x.lat!, lon: x.lon!, label: clip(ta ? x.ta : x.label, 160), sev: null, value: x.value, hot: i === 0 }));
    if (pts.length) out.push({ kind: "MapView", id: `${id}-map`, title: ta ? "எங்கே" : "Where", rule: null, shade: null, points: pts, outline: by === "zone" && !r.q.per ? items.map((x) => Number(x.key)).slice(0, 15) : r.q.zones.slice(0, 15) });
  }
  // the roads of the one area asked about (live traffic)
  if (r.q.of === "traffic" && by === "zone" && r.readings.length) out.push({ kind: "Ranking", id: `${id}-roads`, title: clip(ta ? `${r.shown[0].ta}: நெரிசலான சாலைகள்` : `Jammed roads in ${r.shown[0].label}`, 160), unit: "min", order: "top", method: ta ? "தாமத நிமிடங்கள், TomTom நேரடி." : "Minutes of delay, TomTom live.", about: null,
    items: r.readings.slice(0, 8).map((x, i) => ({ key: clip(x.id, 60), label: clip(x.name, 120), value: x.value, rank: i + 1, sub: x.detail ? clip(x.detail, 160) : null, zone: x.zone, lat: x.lat, lon: x.lon, action: "none" as const })) });
  // its own records, when one is asked for
  if (r.q.of === "incidents" && r.shown.length === 1 && r.rows.length) out.push(...caseBlocks(r, w, ta, `${id}-own`, ta ? `${r.shown[0].ta}: ${r.what.ta}` : `${r.shown[0].label}: ${r.what.en}`).filter((b) => b.kind === "CaseList"));
  return out;
}

function newsBlocks(r: Result, ta: boolean, id: string): BlockT[] {
  if (!r.news.length) return [{ kind: "Note", id: `${id}-none`, text: ta ? "இந்தக் காலத்தில் இதைப் பற்றிய செய்தி இல்லை." : `No news report on this ${overEn(r)}.` }];
  return [{ kind: "NewsReader", id: `${id}-news`, title: clip(headOf(r, ta), 160), total: r.newsTotal, items: r.news.slice(0, 30).map((x) => ({ id: clip(x.id, 120), title: clip(x.title_en && !ta ? x.title_en : x.title, 300), source: x.publisher ? clip(x.publisher, 80) : null, t: x.t ? clip(x.t, 30) : null,
    place: x.loc ? clip(x.loc, 120) : null, incidentId: x.incident ? clip(x.incident, 80) : null, url: typeof x.url === "string" && /^https?:/.test(x.url) ? x.url.slice(0, 2000) : null, summary: x.summary ? clip(x.summary, 600) : null })) }];
}

function blocksOf(r: Result, plan: Plan, w: World, ta: boolean, id: string, period: string, many: boolean): BlockT[] {
  if (r.cannot) return [{ kind: "Note", id: `${id}-note`, text: clip(ta ? r.cannot.ta : r.cannot.en, 400) }];
  if (r.q.of === "news") return newsBlocks(r, ta, id);
  if (r.q.by) {
    // one station, one vegetable: its number
    if (r.shown.length === 1 && !r.q.rank && !r.q.take && (r.q.of === "air" || r.q.of === "rain" || r.q.of === "lakes" || r.q.of === "weather" || r.q.of === "prices") && r.groups.length === 1) {
      const g = r.shown[0];
      return [{ kind: "Kpis", id: `${id}-kpi`, title: clip(headOf(r, ta), 120), items: [{ key: "v", label: clip(ta ? g.ta : g.label, 80), value: g.value, unit: r.unit, prev: null, delta: null, tone: "neutral", spark: [] }],
        about: g.sub ? clip(ta ? g.sub.ta : g.sub.en, 300) : null }];
    }
    const b = rankBlocks(r, plan, w, ta, id, period);
    return b.length ? b : [{ kind: "Note", id: `${id}-none`, text: clip(ta ? nothing(r).ta : nothing(r).en, 400) }];
  }
  const out: BlockT[] = [];
  if (!many && !(r.q.take && r.q.of === "incidents")) out.push({ kind: "Kpis", id: `${id}-kpi`, title: clip(headOf(r, ta), 120), items: [tileOf(r, "total", ta)],
    about: ta ? `${overTa(r)} கணக்கிடப்பட்டது.` : clip(`Counted ${overEn(r)}${r.prev?.held && r.q.of === "incidents" ? `, against ${r.prev.label.en}` : ""}, by the dashboard's own rules.`, 300) });
  if (r.q.of === "incidents") out.push(...caseBlocks(r, w, ta, id, r.q.take && r.rows.length < r.rowsTotal ? (ta ? `${r.what.ta}: ${r.rows.length}` : `${r.rows.length} of ${fmt(r.rowsTotal)} ${r.what.en}`) : headOf(r, ta)));
  return out;
}

// -------------------------------------------------------------------- said --

const sevWord = (x: string | null | undefined) => (x ? x.toLowerCase() : "");
/** the first case in words, by its kind and place (never a citizen's words) */
function caseWords(x: Result["rows"][number], w: World, ta: boolean): string {
  const r = caseRow(x, w);
  return ta ? `${(x.cat ? CAT_LABEL_TA[String(x.cat)] : null) ?? r.cat ?? ""}${r.place ? `, ${r.place.split(",")[0]}` : ""}`.trim() : `${clip(r.title, 90).replace(/\.$/, "")}${r.place && !r.title.toLowerCase().includes(r.place.split(",")[0].toLowerCase()) ? ` (${r.place.split(",")[0]})` : ""}`;
}

/** the days or months of a split that are over: today, still running, is never the least */
const running = (r: Result): string | null => (!r.win?.partial || !r.asOf ? null : r.q.by === "day" ? r.asOf.slice(0, 10) : r.q.by === "month" ? r.asOf.slice(0, 7) : null);
const full = (r: Result): boolean => { const k = running(r); return !k || !r.shown.some((g) => g.key === k); };
/** (nor a month the window holds only a part of) */
const cutMonth = (r: Result, key: string): boolean => { if (r.q.by !== "month" || !r.win) return false; const [y, m] = key.split("-").map(Number), last = `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; return r.win.from.slice(0, 10) > `${key}-01` || lastDayOf(r.win) < last; };
const wholeBuckets = (r: Result): Group[] => { const k = running(r); const x = r.shown.filter((g) => g.key !== k && !cutMonth(r, g.key)); return x.length ? x : r.shown; };
/** nothing to rank, said as it is: none of what is counted, or none of what it is ranked by */
const pastEnd = (r: Result) => r.notes.find((n) => /^(?:There are only|Only) \d+/.test(n.en)) ?? null;
const nothing = (r: Result): Bilingual => {
  // (a position past the end, or a price that did not rise, is not "nothing": the records hold the others)
  const end = r.q.rank && r.q.rank > 1 && r.groups.some((g) => g.value !== 0 || g.spot) ? pastEnd(r) : null;
  if (end) return bi(end.en, end.ta);
  if (r.q.measure === "change") { const up = r.q.order !== "least"; return bi(`Nothing ${up ? "rose" : "fell"} ${r.q.of === "prices" ? "in price " : ""}${overEn(r)}.`, `${overTa(r)}: எதுவும் ${up ? "உயரவில்லை" : "குறையவில்லை"}.`); }
  if (r.q.of === "incidents" && (r.totals?.n ?? 0) > 0 && !sameAsWhat(r)) return bi(`There are no ${r.measure.en} among the ${fmt(r.totals!.n)} ${r.what.en} ${overEn(r)}, so there is nothing to rank.`, `${overTa(r)}: ${r.what.ta} ${fmt(r.totals!.n)}; அவற்றில் ${r.measure.ta} எதுவும் இல்லை.`);
  return r.live ? bi(`There are no ${r.what.en} right now.`, `இப்போது ${r.what.ta} எதுவும் இல்லை.`) : bi(`Nothing to rank: no ${r.what.en} ${overEn(r)}.`, `${overTa(r)}: ${r.what.ta} எதுவும் இல்லை.`);
};
const nothingEn = (r: Result): string => nothing(r).en;
/** What one result says, in code's own words: the answer first. */
export function sayOf(r: Result, w: World): Bilingual {
  if (r.cannot) return bi(r.cannot.en, r.cannot.ta);
  const what = r.what, over = overEn(r), ov = overTa(r);
  if (r.q.of === "news") return r.newsTotal ? bi(`${fmt(r.newsTotal)} ${r.newsTotal === 1 ? what.en.replace("reports", "report") : what.en} ${over}. The ${r.q.sort === "oldest" ? "oldest" : "latest"}: ${clip(r.news[0]?.title_en ?? r.news[0]?.title, 120)}.`, `${ov} ${r.newsTotal} செய்திகள். ${r.q.sort === "oldest" ? "பழையது" : "சமீபத்தியது"}: ${clip(r.news[0]?.title, 120)}.`)
    : bi(`There is no news report on this ${over}.`, `${ov} இதைப் பற்றிய செய்தி இல்லை.`);
  if (r.q.by) {
    const s = r.shown;
    if (!s.length) return nothing(r);
    const val = (g: Group) => valueWords(r, g.value);
    const sub = (g: Group, ta = false) => (g.sub && (r.q.of === "traffic" || s.length <= 3) ? `, ${ta ? g.sub.ta : g.sub.en}` : "");
    const least = r.q.order === "least";
    if (r.q.rank && r.q.rank > 1) {
      const g = s[0];
      const thing = r.q.of === "traffic" ? `${least ? "least" : "most"} congested ${r.groupNoun.en}` : `${r.groupNoun.en} with the ${least ? "fewest" : "most"}`;
      return bi(r.q.of === "traffic" ? `The ${ordinal(r.q.rank)} ${thing} ${over} is ${g.label}: ${val(g).en}${sub(g)}.` : `${cap(ordinal(r.q.rank))} is ${g.label}, ${r.q.measure === "change" ? "" : "with "}${val(g).en} ${over}${sub(g)}.`,
        `${ordinalTa(r.q.rank)}: ${g.ta}, ${val(g).ta}${sub(g, true)} (${ov}).`);
    }
    if (r.q.per) return bi(`${s.slice(0, 5).map((x) => `${x.label}, ${val(x).en}`).join("; ")}${s.length > 5 ? `; and ${s.length - 5} more` : ""} (${over}).`, `${s.slice(0, 5).map((x) => `${x.ta}, ${val(x).ta}`).join("; ")} (${ov}).`);
    const time = r.q.by === "day" || r.q.by === "hour" || r.q.by === "weekday" || r.q.by === "month";
    if (time && !r.q.take) {
      const full = wholeBuckets(r);
      const hi = [...s].sort((a, b) => b.value - a.value)[0], lo = [...full].sort((a, b) => a.value - b.value)[0];
      return bi(`${cap(what.en)} ${over}: most on ${hi.label} (${val(hi).en}), least on ${lo.label} (${val(lo).en}).`, `${what.ta}, ${ov}: அதிகம் ${hi.ta} (${val(hi).ta}), குறைவு ${lo.ta} (${val(lo).ta}).`);
    }
    if (s.length === 1) { const same = r.notes.find((n) => n.en.startsWith("The same figure")); return bi(`${s[0].label}: ${val(s[0]).en} ${over}${sub(s[0])}.${same ? ` ${same.en}` : ""}`, `${s[0].ta}: ${val(s[0]).ta}${sub(s[0], true)} (${ov}).${same ? ` ${same.ta}` : ""}`); }
    // (said as a person lists: "Royapuram with 4, then Kodambakkam with 3"; a numbered list was cut at its numbers when it was spoken)
    const list = (ta: boolean) => s.slice(0, r.q.take ? Math.min(s.length, 8) : 3).map((g) => (ta ? `${g.ta} ${val(g).ta}` : `${g.label}, ${val(g).en}`)).join(ta ? ", அடுத்து " : "; then ");
    const lead = r.q.take && s.length < r.q.take && r.q.take < 99 ? `Only ${s.length} ${s.length === 1 ? "has" : "have"} any ${over}` : r.q.of === "traffic" && r.live && r.q.level !== "closed" && r.q.level !== "flood" && r.q.level !== "accident" ? `${s.length < r.groups.length ? "The worst" : "All the jams"} now` : `${cap(what.en)} ${over}`;
    return bi(`${lead}: ${list(false)}.`, `${what.ta}, ${ov}: ${list(true)}.`);
  }
  if (r.q.of === "traffic") {
    const extra = r.notes.map((x) => x.en).join(" "), extraTa = r.notes.map((x) => x.ta).join(" ");
    const n = r.total, at = what.en.replace(/^.*?(?= (?:on|in) )|^.*$/, "");
    const LV: Record<string, [string, string, string]> = { very: ["very congested stretch", "very congested stretches", "கடும் நெரிசலான இடங்கள்"], congested: ["congested stretch", "congested stretches", "நெரிசலான இடங்கள்"], slow: ["slow stretch", "slow stretches", "மெதுவான இடங்கள்"], closed: ["closed road", "closed roads", "மூடப்பட்ட சாலைகள்"], flood: ["flooded road", "flooded roads", "தண்ணீர் தேங்கிய சாலைகள்"], accident: ["road accident or breakdown", "road accidents and breakdowns", "விபத்துகள்"] };
    const [one1, many1, ta1] = LV[r.q.level ?? ""] ?? ["jam", "jams", "நெரிசல்கள்"];
    return n ? bi(`${n === 1 ? "There is 1" : `There are ${fmt(n)}`} ${n === 1 ? one1 : many1}${at} right now. ${extra}`.trim(), `இப்போது ${ta1} ${fmt(n)}. ${extraTa}`.trim()) : bi(`There are no ${many1}${at} right now.`, `இப்போது ${ta1} எதுவும் இல்லை.`);
  }
  const t = r.total ?? 0;
  // one case, or the two asked for: they are the answer, not how many there are in all
  if (r.q.take && r.q.take < 60 && r.q.list) {
    if (!r.rows.length) return bi(`There are no ${what.en} ${over}.`, `${ov}: ${what.ta} எதுவும் இல்லை.`);
    const c = r.rows.slice(0, Math.min(r.q.take, 5));
    // (a case asked for by its time is said with it)
    const at = (x: Result["rows"][number], ta1: boolean) => (c.length <= 2 && x.t ? (ta1 ? `, ${boundWords(String(x.t))}` : `, reported ${boundWords(String(x.t))}`) : "");
    return bi(`${c.map((x) => `${caseWords(x, w, false)}${at(x, false)}`).join("; then ")}.`, `${c.map((x) => `${caseWords(x, w, true)}${at(x, true)}`).join("; அடுத்து ")}.`);
  }
  if (r.q.measure === "share") { const n0 = r.notes.find((x) => / of \d+ /.test(x.en)); return bi(`${fmt(t)}%.${n0 ? ` ${n0.en}` : ""}`, `${fmt(t)}%.${n0 ? ` ${n0.ta}` : ""}`); }
  const count = sameAsWhat(r);
  const one = t === 1 ? what.en.replace(/\bincidents\b/, "incident") : what.en;
  let en = count ? `${t ? fmt(t) : "No"} ${one} ${over}.` : t ? `${cap(valueWords(r, t).en)} among ${what.en} ${over}.` : `None ${r.q.measure === "deaths" ? "died" : "found"} among ${what.en} ${over}.`;
  let ta = count ? `${ov}: ${what.ta} ${fmt(t)}.` : `${ov}: ${what.ta}, ${valueWords(r, t).ta}.`;
  if (r.q.before && r.prev) {
    const d = t - r.prev.total;
    en += r.prev.held ? ` ${d === 0 ? "The same as" : d > 0 ? `Up from ${fmt(r.prev.total)}${/^(?:yesterday|the day before)/.test(r.prev.label.en) ? "" : " in"}` : `Down from ${fmt(r.prev.total)}${/^(?:yesterday|the day before)/.test(r.prev.label.en) ? "" : " in"}`} ${r.prev.label.en}.` : " The window before is not fully in the records, so no change is given.";
    ta += r.prev.held ? ` ${r.prev.label.ta}: ${fmt(r.prev.total)}.` : "";
  }
  if (t && r.rows.length && r.q.list) { en += ` ${r.rows.length > 1 ? "First on the list" : "It is"}: ${caseWords(r.rows[0], w, false)}.`; ta += ` முதலில்: ${caseWords(r.rows[0], w, true)}.`; }
  return bi(en, ta);
}

// ------------------------------------------------------------------- facts --

/**
 * The results as the writer reads them: what was counted, over which window, the figures, the items in order, the cases, the limits. Titles
 * are the records' own words (untrusted data); no other figure is in it, so a figure the writer says is checked against this text.
 */
export function factsOf(results: Result[], w: World, ta = false, question = ""): string {
  const one = (r: Result, k: number): string => {
    const L: string[] = [`RESULT ${"ABC"[k] ?? ""}: ${cap(r.what.en)}; ${r.live ? `live now` : `window: ${r.over.en}`}.`];
    if (r.cannot) return `${L[0]}\n- cannot be answered: ${r.cannot.en}`;
    if (r.q.of === "news") L.push(`- ${r.newsTotal} reports`, ...(r.q.take && r.news.length ? [`- the ${r.news.length} asked for, ${r.q.sort === "oldest" ? "oldest" : "newest"} first:`] : []), ...r.news.slice(0, 8).map((x) => `  * "${clip(x.title_en ?? x.title, 140)}" (${clip(x.publisher ?? "a report", 40)}, ${x.t ? boundWords(String(x.t)) : ""})${x.summary ? `: ${clip(x.summary, 200)}` : ""}`));
    else if (r.q.by) {
      const ordered = r.q.by === "day" || r.q.by === "hour" || r.q.by === "month" || r.q.by === "weekday" ? (r.q.take || r.q.rank ? `ranked, ${r.q.order} first` : "in time order") : `ranked, ${r.q.measure === "change" ? (r.q.order === "least" ? "the biggest fall" : "the biggest rise") : r.q.order === "least" ? "least" : "most"} first${r.q.order === "least" && r.q.measure !== "change" ? (FEWER_BETTER.has(r.q.measure) && r.q.of !== "lakes" ? " (the first has the FEWEST: it is the lowest, safest, best one)" : " (the first has the LEAST)") : ""}`;
      L.push(`- by ${r.groupNoun.en}, ${ordered}${r.q.rank && r.q.rank > 1 ? `; ONLY the ${ordinal(r.q.rank)} was asked for` : r.q.take && r.q.take < 99 ? `; ${r.q.take} asked for` : ""}; ${r.groups.length} ${r.groupNoun.en}s in all`);
      const timed = r.q.by === "day" || r.q.by === "hour" || r.q.by === "month" || r.q.by === "weekday";
      if (timed && !r.q.take && !r.q.rank && r.shown.length > 1) { const s = [...r.shown].sort((a, b) => b.value - a.value), lo = [...wholeBuckets(r)].sort((a, b) => a.value - b.value)[0]; L.push(`- the most: ${s[0].label}, ${valueWords(r, s[0].value).en}; next: ${s[1].label}, ${valueWords(r, s[1].value).en}; the least: ${lo.label}, ${valueWords(r, lo.value).en}${full(r) ? "" : ` (${r.shown.at(-1)!.label} is not over yet)`}`); }
      L.push(...r.shown.slice(0, timed ? 31 : 15).map((g, i) => timed && !r.q.take && !r.q.rank ? `- ${g.label}: ${valueWords(r, g.value).en}` : `- ${ordinal(r.from + i)}: ${g.label}${ta && g.ta !== g.label ? ` (${g.ta})` : ""}: ${valueWords(r, g.value).en}${g.sub ? `; ${g.sub.en}` : ""}`));
      if (r.q.of === "incidents" && r.totals && r.q.measure !== "share" && r.q.measure !== "days_open" && !r.q.per) L.push(`- all together: ${valueWords(r, r.total ?? 0).en}`);
      if (r.q.of === "traffic" && r.readings.length) L.push(...r.readings.slice(0, 4).map((x) => `- a jammed road there: ${x.name}, ${x.value} min delay, ${x.detail ?? ""}`));
      if (!r.shown.length) L.push(`- ${nothing(r).en}`);
    } else {
      L.push(`- ${r.q.measure === "share" ? "share" : "total"}: ${valueWords(r, r.total ?? 0).en}`);
      if (r.prev && r.q.of === "incidents") L.push(r.prev.held ? `- ${r.prev.label.en}: ${fmt(r.prev.total)}${r.prev.total ? ` (${(r.total ?? 0) >= r.prev.total ? "up" : "down"} ${Math.abs(Math.round((((r.total ?? 0) - r.prev.total) / r.prev.total) * 100))}%)` : ""}` : "- the window before is not fully in the records: no change can be given");
      const m = r.totals;
      const of = m ? [m.severe && !r.q.sev.length ? `${m.severe} severe` : "", m.open && !r.q.status ? `${m.open} open` : "", m.overdue && r.q.status !== "overdue" && r.q.status !== "resolved" ? `${m.overdue} past their deadline` : "", m.dead ? `${m.dead} deaths` : "", m.injured ? `${m.injured} injured` : ""].filter(Boolean) : [];
      if (of.length && sameAsWhat(r) && m!.n) L.push(`- of them: ${of.join(", ")}`);
    }
    if (r.rows.length && r.q.of === "incidents") {
      L.push(`- ${r.q.take && !r.q.by ? `the ${r.rows.length} asked for` : `the first of the cases${r.q.by ? ` of ${r.shown[0]?.label ?? ""}` : ""}`}, ${r.q.sort === "newest" ? "newest first" : r.q.sort === "oldest" ? "oldest first" : r.q.sort === "complaints" ? "most complaints first" : r.q.sort === "deaths" ? "most deaths first" : "most urgent first (not by time)"}; ${r.rowsTotal} in all:`);
      L.push(...r.rows.slice(0, 8).map((x) => { const c = caseRow(x, w); return `  * "${clip(c.title, 120)}"; ${[c.place ?? c.zoneName, sevWord(c.sev), c.status, c.overdue ? "past deadline" : "", c.deptName, c.complaints > 1 ? `${c.complaints} complaints` : "", c.t ? `reported ${boundWords(c.t)}` : ""].filter(Boolean).join("; ")}`; }));
    }
    for (const n of r.notes) L.push(`- note${/^(?:No record of this kind|No report here|None among|The website has kept|The latest readings|The markets last|Counted for|No station|No vegetable market|The same figure|Fewer than|The records begin|The records hold no)/.test(n.en) ? " (say this in a few words)" : ""}: ${n.en}`);
    if (r.method) L.push(`- how: ${r.method.en}`);
    return L.join("\n");
  };
  const v = verdictOf(results, w, question);
  return `${v ? `VERDICT (the answer to which is more, worse or better, worked out by code): ${v.en}\n\n` : ""}${results.map(one).join("\n\n")}`;
}

const FEWER_BETTER = new Set<Query["measure"]>(["count", "severe", "open", "overdue", "deaths", "injured", "complaints", "days_to_close", "days_open", "delay", "jams", "latest", "average", "highest"]);
/** asked which of two or more is more, less, worse or better */
const COMPARES = /\b(?:more|less|fewer|worse|worst|better|best|safer|safest|higher|highest|lower|lowest|most|least|versus|vs|than|compare[ds]?|comparison|against|difference)\b|ஒப்பி|அதிக(?!ார)|குறை|மோசம|பாதுகாப்ப|கம்பேர்|compare|adhiga|athiga/i;
/** the smaller side is the answer */
const FEWER_ASKED = /\b(?:less|fewer|lower|least|fewest|lowest|better|best|safer|safest)\b|குறை|பாதுகாப்ப|நல்ல/i;
const MORE_ASKED = /\b(?:more|worse|worst|higher|highest|most)\b|அதிக(?!ார)|மோசம/i;
/** one side is the other with more limits ("how many, and how many severe"): a total and a part, never a contest */
function partOf(a: Query, b: Query): boolean {
  const sub = (x: unknown[], y: unknown[]) => !x.length || JSON.stringify(x) === JSON.stringify(y);
  const one = (x: unknown, y: unknown) => x == null || x === y;
  return sub(a.zones, b.zones) && sub(a.depts, b.depts) && sub(a.cats, b.cats) && sub(a.words, b.words) && sub(a.sev, b.sev) && one(a.group, b.group) && one(a.place, b.place) && one(a.status, b.status) && one(a.harm, b.harm) && one(a.from, b.from) && one(a.ward, b.ward) && JSON.stringify(a.time) === JSON.stringify(b.time);
}
/** two sides or more of one measure: which has more, and by what, worked out here (never by the writer) */
export function verdictOf(results: Result[], w: World, question = "compare"): (Bilingual & { names: string[] }) | null {
  if (!COMPARES.test(question)) return null;
  for (let i = 0; i < results.length; i++) for (let j = 0; j < results.length; j++) if (i !== j && partOf(results[i].q, results[j].q)) return null;
  if (results.length < 2 || !results.every((r) => !r.q.by && r.q.of === "incidents" && !r.cannot && r.q.measure === results[0].q.measure) || results.some((r) => r.total == null)) return null;
  void w;
  const s = results.map((r, i) => ({ en: sideName(r, results, i, false), ta: sideName(r, results, i, true), v: r.total!, r })).sort((a, b) => b.v - a.v);
  const fewer = results[0].q.measure !== "resolved" && FEWER_ASKED.test(question) && !MORE_ASKED.test(question);
  if (fewer) s.reverse();
  const list = (ta: boolean) => s.map((x) => `${ta ? x.ta : x.en} ${ta ? valueWords(x.r, x.v).ta : valueWords(x.r, x.v).en}`).join(", ");
  // (two windows set side by side are named by their windows; one window is said once)
  const sameWin = new Set(results.map((r) => r.over.en)).size === 1;
  const over = sameWin ? ` ${overEn(results[0])}` : "", ov = sameWin ? `${overTa(results[0])}: ` : "";
  if (s[0].v === s[1].v) return { en: `They are level${over}: ${list(false)}.`, ta: `${ov}சமம்: ${list(true)}.`, names: [] };
  return { en: `${s[0].en} has ${fewer ? "fewer" : "more"}${over}: ${list(false)}.`, ta: `${ov}${s[0].ta} ${fewer ? "குறைவு" : "அதிகம்"}: ${list(true)}.`, names: s.flatMap((x, k) => (k ? [x.en, x.ta] : [x.en, x.ta])) };
}
/**
 * What the spoken answer is held to (say.ts), from code's own results: the name that must come first, the figures that may be said, which figure is
 * whose, the dates and times, whether nothing was found, and which way a ranking runs.
 */
export interface AskCheck {
  first: string[]; others: string[];
  /** every other name is exactly as the records have it (an area): one said without the first is wrong */
  strict: boolean;
  /** the results without their case and news lines: every figure in it is code's */
  core: string;
  /** the case and news lines: a figure in a headline may be said only beside its own words */
  cases: string;
  labels: { names: string[]; value: number; figures: number[] }[];
  zero: boolean;
  order: "most" | "least" | null;
  fewerBetter: boolean;
  /** the one number asked for, when the answer is one number */
  total: number | null;
  /** the window's own numbers ("24" of the last 24 hours), and a ranking's sum: never an item's figure */
  win: number[]; sum: number | null;
}
export function checkOf(results: Result[], w: World, facts: string, question: string): AskCheck {
  const lines = facts.split("\n");
  const isCase = (l: string) => /^\s+\* "/.test(l);
  const v = verdictOf(results, w, question);
  const out: AskCheck = { first: [], others: [], strict: false, core: lines.filter((l) => !isCase(l)).join("\n"), cases: lines.filter(isCase).join("\n"), labels: [], order: null, fewerBetter: false,
    total: results.length === 1 && !results[0].cannot && !results[0].q.by && (results[0].q.of === "incidents" || results[0].q.of === "traffic" || results[0].q.of === "news") && ["count", "severe", "open", "overdue", "resolved", "complaints", "deaths", "injured", "jams"].includes(results[0].q.measure) && !(results[0].q.take && results[0].q.list) ? (results[0].q.of === "news" ? results[0].newsTotal : results[0].total) : null,
    win: results.flatMap((r) => figuresIn(r.over.en).map((x) => x.value)), sum: results.length === 1 && results[0].q.by ? results[0].total : null,
    zero: results.every((r) => !!r.cannot || (r.q.by ? !r.shown.length || r.shown.every((g) => g.value === 0 && !g.spot) : r.q.of === "news" ? !r.newsTotal : !(r.total ?? 0))) };
  if (v?.names.length) { out.first = v.names.slice(0, 2); out.others = v.names.slice(2); out.strict = true; return out; }
  const r = results.length === 1 ? results[0] : null;
  if (!r?.q.by || !r.shown.length || r.q.per) return out;
  const timed = ["day", "hour", "weekday", "month"].includes(r.q.by);
  if (timed && !r.q.take && !r.q.rank) return out;
  out.order = r.q.order; out.fewerBetter = FEWER_BETTER.has(r.q.measure) && r.q.of !== "lakes";
  const names = (g: Group) => [...new Set([g.label, g.ta, ...(r.q.by === "dept" ? (DEPT_ALIASES[g.key] ?? []).filter((x) => x.length >= 5) : [])])];
  const figs = (g: Group) => [g.value, ...figuresIn(g.sub?.en ?? "").map((x) => x.value), Math.abs(g.value)];
  // (a tie at the top may be said in either order, with those level with it that are not among the ones asked for)
  const top = r.shown[0], tied = r.groups.filter((x) => x.value === top.value);
  out.first = tied.flatMap(names);
  out.others = r.groups.filter((x) => x.value !== top.value).flatMap(names);
  out.strict = r.q.by === "zone" || r.q.by === "ward" || r.q.by === "taluk";
  out.labels = r.groups.slice(0, 60).map((g) => ({ names: names(g), value: g.value, figures: figs(g) }));
  return out;
}

// --------------------------------------------------------------- the screen --

/** The "ask" recipe: the plan in the slots, run and drawn. */
export async function askRecipe(c: RecipeCtx): Promise<AskPart> {
  const plan = planFromSlots((c.slots as { plan?: unknown }).plan);
  const ask = c.h.ask;
  const ta = !!c.ta;
  if (!plan || !ask) return { title: bi("Data", "தரவு"), takeaway: null, say: bi("I could not read that question again.", "அந்தக் கேள்வியை மீண்டும் படிக்க முடியவில்லை."), blocks: [{ kind: "Note", id: "none", text: ta ? "அந்தக் கேள்வியை மீண்டும் படிக்க முடியவில்லை." : "That question could not be read again." }], when: null };
  // "in Chennai", "the whole district": the dashboard's own filters do not narrow it
  const whole = WHOLE_SAID.test(`${c.heard} ${plan.understood}`) || (c.slots as { fresh?: boolean }).fresh === true;
  const s = c.s;
  // (one window for every part that says no time: a total and its own breakdown are over the same time)
  const key = planKey(plan, s.period);
  const results = await Promise.all(plan.queries.map((q) => ask(q, { world: c.w, key, dash: s.period, base: whole ? null : { zone: s.zone, dept: s.dept, cat: s.cat, taluk: s.taluk } })));
  // (something the records do not keep apart, counted by the nearest thing they do: said so)
  if (plan.kind === "answer" && plan.gap) results[0]?.notes.push(bi(`The records hold no ${plan.gap}, so ${results[0].what.en} of every department are counted.`, `பதிவுகளில் இது தனியாக இல்லை (${plan.gap}); ${results[0].what.ta} கணக்கிடப்பட்டன.`));
  for (const r of results) { c.asOf ??= r.asOf; for (const x of r.sources) c.sources.add(x); c.runs.push(`ask:${r.q.of}`); }
  const many = results.length > 1 && results.every((r) => !r.q.by && r.q.of === "incidents" && !r.cannot && r.q.measure === results[0].q.measure);
  const blocks: BlockT[] = [];
  if (many) {
    const labels = results.map((r, i) => sideName(r, results, i, ta));
    blocks.push({ kind: "Kpis", id: "sides", title: clip((ta ? plan.title_ta : plan.title) || (ta ? results[0].measure.ta : cap(results[0].measure.en)), 120), items: results.map((r, i) => tileOf(r, `s${i}`, ta, labels[i])), about: ta ? "ஒவ்வொன்றும் அதே விதிகளின்படி கணக்கிடப்பட்டது." : "Each counted by the dashboard's own rules." });
    blocks.push({ kind: "Chart", id: "sides-chart", title: clip(ta ? results[0].measure.ta : cap(results[0].measure.en), 160), chart: "bar", unit: results[0].unit, labels: labels.map((x) => clip(x, 80)), values: results.map((r) => r.total ?? 0),
      drills: results.map((r, i) => drillOf(plan, { ...r.q, list: true }, bi(sideName(r, results, i, false), sideName(r, results, i, true)), s.period, ta)) });
  }
  results.forEach((r, i) => {
    const b = blocksOf(r, plan, c.w, ta, `q${i + 1}`, s.period, many);
    // two sides of a comparison: their cases in short lists, no second map each
    blocks.push(...(many ? (r.q.list ? b.filter((x) => x.kind === "CaseList") : []) : results.length > 1 ? b.filter((x) => x.kind !== "MapView" && !(x.kind === "CaseList" && !r.q.by && !r.q.list)) : b));
  });
  for (const r of results) for (const n of r.notes) if (c.notes.length < 4) c.notes.push(ta ? n.ta : n.en);
  if (!blocks.length) blocks.push({ kind: "Note", id: "none", text: ta ? "இதற்குப் பதிவு எதுவும் இல்லை." : "No record matches this." });
  // (the Collector's own words: a paraphrase of two plain counts is no contest)
  const asked = c.heard.trim() || plan.understood;
  const verdict = verdictOf(results, c.w, asked);
  const says = verdict ? [bi(cap(verdict.en), verdict.ta)] : results.map((r) => sayOf(r, c.w));
  const say = bi(clip(says.map((x) => x.en).join(" "), 600), clip(says.map((x) => x.ta).join(" "), 900));
  // the heading the analyst wrote, unless it says a figure the Collector did not (then code's own)
  const head = (ta1: boolean) => (results[0].q.by && results[0].shown.length ? rankTitle(results[0], ta1) : headOf(results[0], ta1));
  const codeTitle = bi(clip(head(false), 160), clip(head(true), 200));
  // (the figures a heading may hold: the window's, how many and which position were asked, what a name or a word holds; "Seven severe events" over
  // eight is code's own heading, whatever was said)
  const allowed = new Set<number>(results.flatMap((r) => [...figuresIn(`${r.over.en} ${r.q.place ?? ""} ${r.q.item ?? ""} ${r.q.words.join(" ")} ${r.q.time?.said ?? ""} ${r.what.en}`).map((x) => x.value), r.q.take ?? 1, r.q.rank ?? 1, r.shown.length, r.total ?? 0, r.q.by === "zone" ? r.shown.length : 0]));
  const okTitle = (t: string) => !!t && figuresIn(t).every((x) => allowed.has(x.value));
  // (the window is shown whenever it is not the one the period buttons say: dates of its own, a backlog's 90 days; live answers say they are live)
  const win = results.find((r) => r.win && (r.win.custom || r.win.key !== s.period))?.win ?? null;
  const live = results.length > 0 && results.every((r) => r.live);
  // (the window code chose for a part, a backlog's 90 days or a widened one, is kept with the request, so a follow-up is over the same one)
  const held: Plan = { ...plan, queries: plan.queries.map((q, i) => (!q.time && results[i]?.q.time?.said && results[i].q.time!.said !== "now" && q.of === "incidents" ? { ...q, time: results[i].q.time } : q)) };
  return { ...(held.queries.some((q, i) => q !== plan.queries[i]) ? { slotsOut: { plan: held } } : {}), title: bi(okTitle(plan.title) ? plan.title : codeTitle.en, okTitle(plan.title_ta) ? plan.title_ta : codeTitle.ta), takeaway: null, say, blocks: blocks.slice(0, 14),
    when: live ? { en: "Right now, live", ta: "இப்போது, நேரடி", from: null, to: null } : win ? { en: clip(win.label.en, 160), ta: clip(win.label.ta, 200), from: win.from, to: win.to } : null, aide: (() => { const facts = factsOf(results, c.w, ta, asked); return { ask: facts, askCheck: checkOf(results, c.w, facts, asked) }; })() };
}
const SEV_TA: Record<string, string> = { Severe: "கடுமையானவை", High: "அதிக முக்கியத்துவம்", Medium: "நடுத்தரம்", Low: "குறைவு" };
const STATUS_TA: Record<string, string> = { open: "நிலுவையில்", overdue: "காலக்கெடு தாண்டியவை", resolved: "தீர்க்கப்பட்டவை" };
/** what sets one side of a comparison apart from the others (its department, its place, its kind, its window) */
function sideName(r: Result, all: Result[], i: number, ta: boolean): string {
  const diff = (f: (x: Result) => string) => new Set(all.map(f)).size > 1;
  const parts: string[] = [];
  if (diff((x) => JSON.stringify([x.q.depts]))) parts.push(r.q.depts.length ? whatPart(r, "dept", ta) : ta ? "மற்றவை" : "All departments");
  if (diff((x) => JSON.stringify([x.q.zones, x.q.place, x.q.taluk]))) parts.push(whatPart(r, "place", ta) || (ta ? "மாவட்டம்" : "Chennai district"));
  if (diff((x) => JSON.stringify([x.q.cats, x.q.group, x.q.words]))) parts.push(whatPart(r, "kind", ta) || (ta ? "எல்லா வகைகளும்" : "All kinds"));
  if (diff((x) => JSON.stringify([x.q.sev, x.q.status]))) parts.push(ta ? [...r.q.sev.map((x) => SEV_TA[x] ?? x), r.q.status ? STATUS_TA[r.q.status] : ""].filter(Boolean).join(" ") || "அனைத்தும்" : cap([...r.q.sev, r.q.status === "overdue" ? "past deadline" : r.q.status ?? ""].filter(Boolean).join(" ").toLowerCase()) || "All");
  if (diff((x) => x.over.en)) parts.push(ta ? r.over.ta : r.over.en);
  return clip(parts.filter(Boolean).join(", ") || `${i + 1}`, 80);
}
function whatPart(r: Result, part: "dept" | "place" | "kind", ta: boolean): string {
  const s = ta ? r.what.ta : r.what.en;
  if (part === "kind") return r.q.words[0] ?? (r.q.group ? (ta ? TOPICS[r.q.group as Topic].ta : TOPICS[r.q.group as Topic].en) : (r.q.cats.length ? s.replace(/ incidents.*$/, "").trim() : ""));
  if (part === "dept") return ta ? (s.match(/(\S.*?) கையாளும்/)?.[1] ?? "") : (s.match(/handled by (.*?)(?: in |$)/)?.[1] ?? "");
  return ta ? (s.match(/^(.*?) (?:பகுதியில்|வட்டத்தில்)/)?.[1] ?? "") : (s.match(/ in (.*)$/)?.[1] ?? "");
}
/** how the plan was read, for the trace */
export const planLine = (p: Plan): string => p.queries.map((q) => `${q.of}${q.by ? ` by ${q.by}` : ""} ${q.measure}${q.rank ? ` #${q.rank}` : ""}${q.take ? ` top ${q.take}` : ""}`).join(" + ");
