/**
 * v18 (24 Nov): every insight on every screen leads somewhere. The owner: "only insights are given; I cannot click it to see the further
 * details of that. Not alone insights, everything." The summary dashboard sets its own drills (recipes/summary.ts); the older screens (focus,
 * brief, ranking, trend, situation, changed, compare) are given theirs here, after they are built, from what each item names: a tile opens the
 * records behind its number, a zone or a department its summary, a kind its summary, a day on a trend that day's summary, all in the
 * screen's own window. An item that names nothing the console knows is left as it is.
 */
import type { BlockT, DrillT, StageDocT } from "../stage";
import type { World } from "../types";
import { CAT_LABEL_TA } from "../narrate";
import { DEPT_TA } from "../lexicon";
import { isWindowSpec } from "./when";
import { checkSpec } from "@/lib/period/read";

/**
 * the screen's own scope and window, as the slots of a summary (v18 round 2's review: its status, taluk and several zones too, and "open now"
 * as the open cases, so a click never widens the filter behind the number clicked)
 */
function baseOf(d: StageDocT): Record<string, unknown> {
  const s = d.slots as Record<string, unknown>;
  const span = checkSpec(s.span);
  const zs = Array.isArray(s.zones) ? (s.zones as unknown[]).filter((z): z is number => typeof z === "number") : [];
  const status = s.status === "open" || s.status === "overdue" || s.status === "resolved" ? s.status : span?.kind === "now" ? "open" : null;
  return { zones: zs.length > 1 ? zs.slice(0, 4) : d.scope.zone ? [d.scope.zone] : [], ...(d.scope.dept ? { dept: d.scope.dept } : {}), ...(d.scope.cat ? { cat: d.scope.cat } : {}),
    ...(typeof s.family === "string" ? { family: s.family } : {}), ...(d.scope.sev === "Severe" || d.scope.sev === "High" ? { sev: d.scope.sev } : {}),
    ...(d.scope.taluk ? { taluk: d.scope.taluk } : {}), ...(status ? { status } : {}),
    period: d.scope.period, ...(span && isWindowSpec(span) ? { span } : {}) };
}
/** a ranking or chart of things that are not the console's zones, kinds or departments (a taluk, a station, a hotspot, a road): no name-drill */
const NOT_ENTITIES = /taluk|station|hotspot|cluster|place|localit|road|stretch|street|market|ward|spot|வட்ட|நிலைய|சாலை|சந்தை/i;
/** a name-drill only when the item IS the name ("Adyar", "Flooding & waterlogging"), not a thing that mentions one ("Flooding · Guindy Estate") */
function namedAs(label: string, w: World): ReturnType<typeof namedIn> {
  const n = namedIn(label, w);
  const bare = label.replace(/\s*\(.*\)\s*$/, "").replace(/^\s*(?:zone\s+\d+\s*[·:-]\s*)/i, "").trim().toLowerCase();
  return n && bare === n.label.trim().toLowerCase() ? n : null;
}
const to = (base: Record<string, unknown>, extra: Record<string, unknown>, label: string): DrillT => ({ recipe: "summary", slots: { ...base, ...extra, fresh: true }, label: label.slice(0, 160) });

/** what a piece of text names: a zone, a kind, a department (the longest name found first) */
export function namedIn(text: string, w: World): { zone?: number; cat?: string; dept?: string; label: string } | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { zone?: number; cat?: string; dept?: string; label: string; len: number } | null = null;
  const consider = (name: string, hit: { zone?: number; cat?: string; dept?: string }) => {
    const n = name.trim().toLowerCase();
    if (n.length < 4 || !t.includes(n)) return;
    if (!best || n.length > best.len) best = { ...hit, label: name, len: n.length };
  };
  for (const z of w.zones) { consider(z.name, { zone: z.n }); if (z.ta) consider(z.ta, { zone: z.n }); }
  for (const c of w.cats) { consider(c.label, { cat: c.code }); if (CAT_LABEL_TA[c.code]) consider(CAT_LABEL_TA[c.code], { cat: c.code }); }
  for (const d of w.depts) { consider(d.name, { dept: d.code }); if (DEPT_TA[d.code]) consider(DEPT_TA[d.code], { dept: d.code }); }
  if (!best) return null;
  const { len: _len, ...rest } = best as { len: number; zone?: number; cat?: string; dept?: string; label: string };
  return rest;
}
const drillFor = (base: Record<string, unknown>, n: ReturnType<typeof namedIn>): DrillT | null =>
  n ? to(base, n.zone ? { zones: [n.zone] } : n.cat ? { cat: n.cat, family: null } : { dept: n.dept }, n.label) : null;

/**
 * The filter of the records behind a count tile, or null when no list holds exactly what it counts (v18 round 2's review: a tile the rules did
 * not know, "Deaths", "Injured", "Complaints", "Severe or high", opened the whole window's list, whose total is not the tile's number)
 */
const tileExtra = (key: string, label: string): Record<string, unknown> | null => {
  const s = `${key} ${label}`.toLowerCase();
  if (/high/.test(s) && /sev/.test(s)) return null;
  if (/death|dead|died|injur|hurt|complain|citizen|share|rate|%|avg|average|median|days|hours|uyir|இறப்பு|காய|புகார்/.test(s)) return null;
  const x: Record<string, unknown> = {};
  if (/sev|கடுமை/.test(s)) x.sev = "Severe";
  if (/overdue|deadline|late|கெடு/.test(s)) x.status = "overdue";
  else if (/resolv|closed|தீர்/.test(s)) x.status = "resolved";
  else if (/open|pending|ongoing|still|நிலுவை/.test(s)) x.status = "open";
  if (Object.keys(x).length) return x;
  return /^(?:n|total|reported|incidents?|cases?|reports?)$/.test(key.toLowerCase()) || /reported|incidents|total|பதிவான|சம்பவ/.test(label.toLowerCase()) ? {} : null;
};
/** tiles that count incidents (not a rain gauge, a price, a share) */
const COUNTS = (unit: string | null) => !unit || /^(incidents?|cases?|reports?|complaints?)$/i.test(unit);

/**
 * v18 round 2: what each part of an older screen shows, one line under its title, where its builder wrote none (the summary and the window screens
 * write their own). In the screen's language; a click hint only where the part's items open something.
 */
export function withAbout(d: StageDocT): StageDocT {
  const ta = d.lang === "ta";
  const L = (en: string, t: string) => (ta ? t : en);
  const blocks = d.blocks.map((b): BlockT => {
    if ((b as { about?: string | null }).about) return b;
    let a: string | null = null;
    switch (b.kind) {
      case "Kpis": a = b.items.some((k) => k.drill) ? L("The key figures of this screen. Click a tile for the records behind it.", "இந்தத் திரையின் முக்கிய எண்கள். தொட்டால் அதன் பதிவுகள்.") : L("The key figures of this screen.", "இந்தத் திரையின் முக்கிய எண்கள்."); break;
      case "Chart": {
        // (the review: a line or a donut is not bars)
        const click = b.drills?.some(Boolean);
        const u = b.unit ?? "figure";
        a = b.chart === "line" ? L(`The ${u} at each point, in order.${click ? " Click a point to open it." : ""}`, `ஒவ்வொரு புள்ளியிலும் உள்ள எண்ணிக்கை.${click ? " தொட்டால் திறக்கும்." : ""}`)
          : b.chart === "donut" ? L(`Each slice: one item's share of the ${u}.${click ? " Click a slice to open it." : ""}`, `ஒவ்வொரு பகுதியும் ஒரு பொருளின் பங்கு.${click ? " தொட்டால் திறக்கும்." : ""}`)
          : L(`Each bar: the ${u} for one item.${click ? " Click a bar to open it." : ""}`, `ஒவ்வொரு பட்டையும் ஒரு பொருளின் எண்ணிக்கை.${click ? " தொட்டால் திறக்கும்." : ""}`);
        break;
      }
      case "Trend": a = L(`${b.unit.charAt(0).toUpperCase()}${b.unit.slice(1)} over time.${b.drills?.some(Boolean) ? " Click a point for that day." : ""}`, `காலப்போக்கில் மாற்றம்.${b.drills?.some(Boolean) ? " ஒரு புள்ளியைத் தொட்டால் அந்த நாள்." : ""}`); break;
      case "Ranking": a = b.items.some((x) => x.drill || x.action !== "none") ? L("Click an item for its own records.", "தொட்டால் அதன் பதிவுகள்.") : null; break;
      case "CaseList": a = L("Cases, the most urgent first. Click a case for its details.", "சம்பவங்கள், முதலில் கவனிக்க வேண்டியவை முதலில். தொட்டால் விவரம்."); break;
      case "NewsReader": a = L("News reports, one line a story. Click a headline for its summary, or open the article.", "செய்திகள். தலைப்பைத் தொட்டால் சுருக்கம்."); break;
      case "Readings": a = L("The reading at each station, with when it was taken.", "ஒவ்வொரு நிலையத்தின் அளவு, அது எடுக்கப்பட்ட நேரத்துடன்."); break;
      case "Findings": a = L("What stands out, each with how it was worked out and what it rests on.", "முக்கியமானவை, எப்படிக் கணக்கிடப்பட்டது என்பதுடன்."); break;
      case "Brief": a = b.points.some((p) => p.drill || p.incidentId) ? L("The key points. Click a point for its details.", "முக்கியக் குறிப்புகள். தொட்டால் விவரம்.") : null; break;
      case "Compare": a = L("The areas side by side; the most of each measure is underlined.", "பகுதிகள் அருகருகே."); break;
      default: a = null;
    }
    return a ? ({ ...b, about: a } as BlockT) : b;
  });
  return { ...d, blocks };
}

/** The screen with a drill on every item that names something the console can open. The summary sets its own. */
export function withDrills(d: StageDocT, w: World): StageDocT {
  if (d.recipe === "summary" || d.recipe === "dataset" || d.recipe === "case" || d.recipe === "city" || d.recipe === "nearby" || d.recipe === "ask") return d;
  const base = baseOf(d);
  const blocks = d.blocks.map((b): BlockT => {
    switch (b.kind) {
      case "Kpis":
        return { ...b, items: b.items.map((k) => {
          if (k.drill || !COUNTS(k.unit)) return k;
          const extra = tileExtra(k.key, k.label);
          return extra ? { ...k, drill: to(base, { ...extra, view: "cases" }, k.label) } : k;
        }) };
      case "Ranking": {
        const things = NOT_ENTITIES.test(`${b.id} ${b.title} ${b.unit ?? ""}`) || !COUNTS(b.unit);
        return { ...b, items: b.items.map((x) => {
          if (x.drill || x.action === "station") return x;
          if (x.action === "zone" && x.zone && !things) return { ...x, drill: to(base, { zones: [x.zone] }, x.label) };
          if (x.action === "dept" && w.depts.some((y) => y.code === x.key)) return { ...x, drill: to(base, { dept: x.key }, x.label) };
          if (things) return x;
          const n = namedAs(x.label, w);
          return n ? { ...x, drill: drillFor(base, n) } : x;
        }) };
      }
      case "Chart": {
        if (b.drills?.length || !COUNTS(b.unit) || NOT_ENTITIES.test(`${b.id} ${b.title}`)) return b;
        const drills = b.labels.map((l) => drillFor(base, namedAs(l, w)));
        return drills.some(Boolean) ? { ...b, drills } : b;
      }
      // (v18 round 2's review: the older screens' trends are rolling 24-hour or 7-day slices, not calendar days: a point opened a day that
      // was not the one counted. Only the window screens' own trends, by calendar day, carry drills: they set them themselves)
      case "Trend":
        return b;
      case "Brief":
        return { ...b, points: b.points.map((p) => (p.drill || p.incidentId ? p : { ...p, drill: drillFor(base, namedIn(p.text, w)) })) };
      case "Findings":
        return { ...b, items: b.items.map((f) => (f.drill ? f : { ...f, drill: drillFor(base, namedIn(f.title, w)) })) };
      default:
        return b;
    }
  });
  return { ...d, blocks };
}
