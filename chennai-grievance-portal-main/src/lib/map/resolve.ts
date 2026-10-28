/**
 * Ask the Map's place resolver. It extends the console's gazetteer (nlp.ts: localities, GCC areas, zones and taluks,
 * with their English and Tamil patterns) with ward numbers, OpenStreetMap neighbourhoods, named facilities, roads and
 * waterways, and GCC's street list (names only, no map line). Pure: the server builds the entries (world.ts), the tests
 * build a few by hand.
 *
 * Order: ward numbers, zones, taluks, localities, OSM places, facilities, roads and waterways, GCC street names. One
 * name can mean several things ("Adyar" is a locality, Zone 13 and a river): the question's verb picks ("along" a road
 * or river, "in" an area, "near" a point), and the others become chips. Never a blocking question.
 */
import { closest, allowedEdits } from "@/lib/assistant/fuzzy";
import type { LayerId } from "./types";

export type PlaceKind = "ward" | "zone" | "taluk" | "locality" | "osm_place" | "facility" | "road" | "waterway" | "street_name_only";
export type Verb = "along" | "in" | "near" | null;

export interface Entry {
  kind: PlaceKind;
  /** the plan's reference: "ward:178", "zone:13", "taluk:TLK-MYL", "loc:Adyar", "osm:n123", "fac:POL-01", a line id, "gcc:<street>" */
  ref: string;
  name_en: string;
  name_ta: string | null;
  lat: number | null;
  lon: number | null;
  layer?: LayerId;
  /** English and Tamil patterns (nlp.ts enRe / taRe) */
  res: RegExp[];
  /** how many of the first patterns are the place's own names; the rest are names it shares ("Grand Southern Trunk Road" on Anna Salai) */
  primary?: number;
  /** a tie between places of one kind and one name goes to the bigger one (a main road over a lane of the same name) */
  weight?: number;
}

export interface Match { entry: Entry; start: number; end: number; text: string; method: "number" | "name" | "fuzzy" | "street"; primary?: boolean }
export interface Found { start: number; end: number; text: string; pick: Match; alternatives: Match[] }

const PREFER: Record<"along" | "in" | "near" | "none", PlaceKind[]> = {
  along: ["road", "waterway", "street_name_only", "locality", "osm_place", "zone", "taluk", "ward", "facility"],
  in: ["ward", "zone", "taluk", "locality", "osm_place", "facility", "road", "waterway", "street_name_only"],
  near: ["locality", "osm_place", "facility", "zone", "taluk", "ward", "road", "waterway", "street_name_only"],
  none: ["ward", "locality", "osm_place", "facility", "zone", "taluk", "road", "waterway", "street_name_only"]
};
/** A point's default "near" radius: a locality or neighbourhood 1 km, a facility 500 m. */
export const NEAR_M = { locality: 1000, osm_place: 1000, facility: 500 } as const;

const ROAD_WORD = /\b(road|rd|street|st|salai|avenue|lane|high road|main road|nagar main road|cross street|trunk road|bypass|highway)\b|சாலை|தெரு/i;

/** Ward and zone numbers in English and Tamil: "ward 178", "W-178", "178வது வார்டு", "zone 13", "மண்டலம் 13". */
function numbered(text: string): Match[] {
  const out: Match[] = [];
  const add = (kind: "ward" | "zone", n: number, m: RegExpExecArray) => {
    if (kind === "ward" ? n < 1 || n > 200 : n < 1 || n > 15) return;
    out.push({ entry: { kind, ref: `${kind}:${n}`, name_en: kind === "ward" ? `Ward ${n}` : `Zone ${n}`, name_ta: kind === "ward" ? `வார்டு ${n}` : `மண்டலம் ${n}`, lat: null, lon: null, res: [] },
      start: m.index, end: m.index + m[0].length, text: m[0], method: "number" });
  };
  const pats: [RegExp, "ward" | "zone"][] = [
    [/\bward\s*(?:no\.?|number|#)?\s*-?\s*(\d{1,3})\b/gi, "ward"], [/\bw-?(\d{1,3})\b/gi, "ward"], [/\b(\d{1,3})(?:st|nd|rd|th)?\s+ward\b/gi, "ward"],
    [/வார்டு\s*(?:எண்\s*)?(\d{1,3})/g, "ward"], [/(\d{1,3})\s*(?:வது|ஆவது)?\s*வார்டு/g, "ward"],
    [/\bzone\s*(?:no\.?|number|#)?\s*-?\s*(\d{1,2})\b/gi, "zone"], [/\b(\d{1,2})(?:st|nd|rd|th)?\s+zone\b/gi, "zone"],
    [/மண்டலம்\s*(?:எண்\s*)?(\d{1,2})/g, "zone"], [/(\d{1,2})\s*(?:வது|ஆவது)?\s*மண்டல/g, "zone"]
  ];
  for (const [re, kind] of pats) for (let m = re.exec(text); m; m = re.exec(text)) add(kind, Number(m[1]), m);
  return out;
}

export interface ResolverData {
  entries: Entry[];
  /** GCC street names: normalised name -> name as written (no map line) */
  streets: Map<string, string>;
}

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[.,'’()\-_/]/g, " ").replace(/\s+/g, " ").trim()
  .replace(/\brd\b/g, "road").replace(/\bst\b/g, "street");
/** Words that are never a place on their own, even when they are spelt like one. */
const COMMON = new Set(["school", "schools", "hospital", "hospitals", "complaints", "incidents", "flooding", "waterlogging", "garbage", "accidents", "within",
  "nearest", "farthest", "compare", "station", "stations", "police", "severe", "around", "meters", "metres", "where", "which", "clustering", "hotspots",
  "theft", "thefts", "month", "today", "week", "cases", "issues", "problems", "streetlight", "pakkathula", "pakkathil", "kitta", "kitte", "lakes", "canal",
  "river", "roads", "street", "summary", "happening", "colleges", "college", "open", "closed", "near", "along", "inside", "ward", "zone", "taluk", "show",
  "water", "stagnation", "drainage", "sewage", "potholes", "pothole", "drains", "fire", "metro", "railway", "vs", "versus", "and", "with", "last", "this",
  "days", "between", "department", "officer", "visits", "plan", "these", "send", "export", "only", "make", "add", "remove", "start", "over", "again"]);

export function makeResolver(data: ResolverData) {
  const fuzzyNames = new Map<string, Entry>();
  for (const e of data.entries)
    if (["locality", "zone", "taluk", "osm_place"].includes(e.kind) && /^[a-z .]+$/i.test(e.name_en)) {
      const k = e.name_en.toLowerCase().replace(/\./g, "").trim();
      if (k.length >= 5 && !fuzzyNames.has(k)) fuzzyNames.set(k, e);
    }

  /** Every place named in `text`, overlapping matches grouped; `verb` says which kind wins a shared name. */
  return function resolve(text: string, verb: Verb = null): Found[] {
    const all: Match[] = numbered(text);
    for (const e of data.entries)
      e.res.forEach((re, k) => {
        const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
        for (let m = g.exec(text); m; m = g.exec(text)) {
          // a Tamil pattern may start with the character before the name (its word-start guard)
          const lead = m[1] && /^[^஀-௿]?$/.test(m[1]) && re.source.startsWith("(^|") ? m[1].length : 0;
          all.push({ entry: e, start: m.index + lead, end: m.index + m[0].length, text: m[0].slice(lead), method: "name", primary: k < (e.primary ?? e.res.length) });
          if (m[0].length === 0) g.lastIndex++;
        }
      });
    // GCC street names (no line): word spans with a road word, matched exactly after normalising
    const words = [...text.matchAll(/[A-Za-z0-9.]+/g)];
    for (let i = 0; i < words.length; i++)
      for (let j = Math.min(words.length, i + 6); j > i + 1; j--) {
        const span = text.slice(words[i].index!, words[j - 1].index! + words[j - 1][0].length);
        if (!ROAD_WORD.test(span)) continue;
        const hit = data.streets.get(norm(span));
        if (hit && !all.some((m) => m.start <= words[i].index! && m.end >= words[i].index! + span.length && (m.entry.kind === "road" || m.entry.kind === "waterway"))) {
          all.push({ entry: { kind: "street_name_only", ref: `gcc:${hit}`, name_en: hit, name_ta: null, lat: null, lon: null, res: [] },
            start: words[i].index!, end: words[i].index! + span.length, text: span, method: "street" });
          break;
        }
      }
    // spelling slips on single words ("velacheri", "adayar") when nothing else covers them
    for (const w of words) {
      const s = w.index!, e = s + w[0].length, word = w[0].toLowerCase();
      if (word.length < 5 || COMMON.has(word) || /\d/.test(word) || all.some((m) => m.start < e && m.end > s)) continue;
      const c = closest(word, fuzzyNames.keys(), Math.min(2, allowedEdits(word.length)));
      if (c && c !== word) all.push({ entry: fuzzyNames.get(c)!, start: s, end: e, text: w[0], method: "fuzzy" });
    }

    // group overlapping matches; the longest span wins the group, then the verb's preferred kind
    all.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const groups: Match[][] = [];
    for (const m of all) {
      const g = groups.find((x) => x.some((y) => m.start < y.end && m.end > y.start));
      if (g) g.push(m); else groups.push([m]);
    }
    const pref = PREFER[verb ?? "none"];
    const out: Found[] = [];
    for (const g of groups) {
      const longest = Math.max(...g.map((m) => m.end - m.start));
      // the word after the name says its kind: "Velachery taluk", "Adyar zone", "Adyar river", "அடையாறு ஆற்றில்"
      // (a Tamil pattern matches the name's stem, so the rest of the word is skipped first)
      const after = text.slice(Math.max(...g.map((m) => m.end)), Math.max(...g.map((m) => m.end)) + 18).toLowerCase().replace(/^[஀-௿]*/, "");
      const hinted: PlaceKind | null = /^\s*(taluk|வட்ட)/.test(after) ? "taluk" : /^\s*(zone|மண்டல)/.test(after) ? "zone"
        : /^\s*(river|canal|nullah|ஆறு|ஆற்|கால்வாய்)/.test(after) ? "waterway" : null;
      const rank = (m: Match) => (m.entry.kind === hinted ? -1 : pref.indexOf(m.entry.kind));
      // a name that is part of a longer one ("Anna Nagar" in "Anna Nagar East") loses, unless it is another kind of the same words
      const top = g.filter((m) => m.end - m.start >= longest - 2);
      top.sort((a, b) => rank(a) - rank(b) || (a.primary === false ? 1 : 0) - (b.primary === false ? 1 : 0) || (a.method === "fuzzy" ? 1 : 0) - (b.method === "fuzzy" ? 1 : 0)
        || (b.entry.weight ?? 0) - (a.entry.weight ?? 0) || a.entry.ref.localeCompare(b.entry.ref));
      const pick = top[0];
      const seen = new Set([key(pick.entry)]);
      const alternatives: Match[] = [];
      for (const m of [...top.slice(1), ...g.filter((x) => !top.includes(x))]) {
        if (seen.has(key(m.entry))) continue;
        seen.add(key(m.entry));
        alternatives.push(m);
        if (alternatives.length >= 3) break;
      }
      out.push({ start: pick.start, end: pick.end, text: pick.text, pick, alternatives });
    }
    return out.sort((a, b) => a.start - b.start);
  };
}
const key = (e: Entry) => `${e.kind}|${e.name_en.toLowerCase()}`;

/** A plan's area for a resolved place, with "near" radii for points. Lines are not areas (null). */
export function areaFor(e: Entry, radius?: number | null):
  | { kind: "ward"; id: number } | { kind: "zone"; id: number } | { kind: "taluk"; code: string } | { kind: "point"; ref: string; radius_m: number } | null {
  if (e.kind === "ward") return { kind: "ward", id: Number(e.ref.split(":")[1]) };
  if (e.kind === "zone") return { kind: "zone", id: Number(e.ref.split(":")[1]) };
  if (e.kind === "taluk") return { kind: "taluk", code: e.ref.split(":")[1] };
  if (e.kind === "locality" || e.kind === "osm_place" || e.kind === "facility") {
    if (e.lat == null) return null;
    return { kind: "point", ref: e.ref, radius_m: radius ?? NEAR_M[e.kind] };
  }
  return null;
}
export const isLine = (e: Entry) => e.kind === "road" || e.kind === "waterway" || e.kind === "street_name_only";
