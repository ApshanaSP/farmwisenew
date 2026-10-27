/**
 * The strict gate a link's candidate passes before it can become a dashboard (all three, no exceptions):
 *
 *   (a) a real data table: its discover score is above SCORE_MIN, it has 2+ usable columns, and it is not page
 *       furniture (a menu, a layout table, a list of links, headlines)
 *   (b) enough of it: readiness at the Small tier or above (readiness.ts)
 *   (c) Chennai's: rows that name Chennai's places, a Tamil Nadu table with Chennai's rows, or a Chennai source
 *       whose rows are not plainly another subject (a sports score card, exam marks, share prices)
 *
 * Every check here is code over the cells; the AI's reading of relevance comes later, in the run (relevance.ts).
 */
import fs from "fs";
import path from "path";
import type { Found } from "@/lib/studio/connect/discover";
import type { Table } from "@/lib/studio/parse";
import { earns, readiness, usableRows, type Readiness } from "@/lib/studio/readiness";
import { normKey } from "@/lib/studio/values";

export const SCORE_MIN = 35;

const filled = (c: unknown) => c != null && String(c).trim() !== "";

/** Why a table is page furniture (a menu, a layout, a list of links), or null when it is not. */
export function furniture(t: Table): string | null {
  const rows = usableRows(t).slice(0, 200);
  if (!rows.length) return "an empty table";
  let cells = 0, shortWords = 0, nums = 0;
  const all: string[] = [];
  for (const r of rows) for (const c of r) {
    if (!filled(c)) continue;
    cells++;
    const s = String(c).trim();
    all.push(s.toLowerCase());
    if (typeof c === "number" || /^[-+₹(]?\s*[\d,]+(\.\d+)?\s*%?\)?$/.test(s)) nums++;
    else if (s.split(/\s+/).length <= 3 && s.length <= 24) shortWords++;
  }
  const generic = t.headers.filter((h) => /^column\s*\d+$/i.test(h)).length / Math.max(1, t.headers.length);
  const menuWords = all.filter((s) => /^(home|about( us)?|contact( us)?|services?|login|sign in|register|search|sitemap|faq|news|gallery|downloads?|careers?|tenders?|rti|privacy|terms|help|feedback|menu|more|next|previous|»|«|›|‹)$/.test(s)).length;
  if (cells && menuWords >= 3 && menuWords / cells > 0.2) return "a navigation menu";
  // a layout grid: no numbers, one or two short words per cell, generic headers
  if (cells && nums === 0 && shortWords / cells > 0.8 && generic >= 0.5) return "a layout or menu table";
  // a table that is all links' text ("Click here", "View", "Download")
  if (cells && all.filter((s) => /^(click here|view|download|read more|more|details|open|pdf|link)$/.test(s)).length / cells > 0.4) return "a list of links";
  return null;
}

export interface GateA { ok: boolean; why: string }

/** Gate (a): is this candidate a real data table? */
export function gateA(f: Found, linkIsFeed: boolean): GateA {
  const c = f.cand;
  if (c.kind === "headlines") return { ok: false, why: "a list of headlines (news, not a data table)" };
  if (c.kind === "feed" && !linkIsFeed) return { ok: false, why: "the site's news feed (articles, not a data table)" };
  const r = readiness(f.table);
  if (r.cols < 2 && c.kind !== "feed") return { ok: false, why: `only ${r.cols} usable ${r.cols === 1 ? "column" : "columns"}` };
  const furn = c.kind === "table" ? furniture(f.table) : null;
  if (furn) return { ok: false, why: furn };
  if (c.score < SCORE_MIN && c.kind !== "feed") return { ok: false, why: `does not look like data (score ${c.score} of 100: ${c.why})` };
  return { ok: true, why: c.why };
}

/** Gate (b): enough rows to earn a view of charts. State-wide tables are measured whole (Chennai is compared with them). */
export function gateB(t: Table): { ok: boolean; r: Readiness } {
  const r = readiness(t);
  return { ok: earns(r.tier), r };
}

// ------------------------------------------------------------------ relevance --

const TN_DISTRICTS = ["ariyalur", "chengalpattu", "chennai", "coimbatore", "cuddalore", "dharmapuri", "dindigul", "erode", "kallakurichi", "kanchipuram", "kancheepuram",
  "kanniyakumari", "kanyakumari", "karur", "krishnagiri", "madurai", "mayiladuthurai", "nagapattinam", "namakkal", "nilgiris", "the nilgiris", "perambalur", "pudukkottai",
  "ramanathapuram", "ranipet", "salem", "sivaganga", "sivagangai", "tenkasi", "thanjavur", "theni", "thoothukudi", "tuticorin", "tiruchirappalli", "trichy", "tirunelveli",
  "tirupathur", "tiruppur", "tiruvallur", "thiruvallur", "tiruvannamalai", "tiruvarur", "vellore", "viluppuram", "villupuram", "virudhunagar", "madras"];
const DIST = new Set(TN_DISTRICTS.map(normKey));
const CHENNAI = /\b(chennai|madras|greater chennai|gcc|cmwssb|tangedco chennai)\b|சென்னை/i;
const ZONES = /\b(thiruvottiyur|tiruvottiyur|manali|madhavaram|tondiarpet|royapuram|thiru[\s.-]*vi[\s.-]*ka[\s.-]*nagar|ambattur|anna\s*nagar|teynampet|kodambakkam|valasaravakkam|alandur|adyar|perungudi|sholinganallur|velachery|egmore|mylapore|guindy|tambaram|poonamallee|chembarambakkam|chetpet|purasawalkam|aminjikarai|mambalam|maduravoyal|ayanavaram)\b/i;

let gaz: RegExp[] | null = null;
/** The console's own gazetteer (data/gcc-reference): Chennai's localities, zones and taluks, in English and Tamil. */
function gazetteer(): RegExp[] {
  if (gaz) return gaz;
  const out: RegExp[] = [ZONES];
  try {
    const ref = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "gcc-reference", "intel-reference.json"), "utf8")) as {
      places?: { aliases_en?: string[]; aliases_ta?: string[] }[]; taluks?: { name: string; name_ta?: string | null }[];
    };
    const en: string[] = [], ta: string[] = [];
    for (const p of ref.places ?? []) { en.push(...(p.aliases_en ?? [])); ta.push(...(p.aliases_ta ?? [])); }
    for (const t of ref.taluks ?? []) { en.push(t.name); if (t.name_ta) ta.push(t.name_ta); }
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const words = [...new Set(en.map((a) => a.trim()).filter((a) => a.length >= 4))].map((a) => a.split(/[\s.\-]+/).filter(Boolean).map(esc).join("[\\s.\\-]*"));
    for (let i = 0; i < words.length; i += 60) out.push(new RegExp(`\\b(${words.slice(i, i + 60).join("|")})\\b`, "i"));
    const tam = [...new Set(ta.filter((a) => [...a].length >= 3))].map(esc);
    if (tam.length) out.push(new RegExp(`(${tam.join("|")})`));
  } catch { /* the zone list alone */ }
  gaz = out;
  return out;
}
const placeHit = (s: string) => CHENNAI.test(s) || gazetteer().some((re) => re.test(s));

/** Header sets that mark a table as another subject, whatever page it sits on. */
const OFF_TOPIC: { what: string; re: RegExp; need: number }[] = [
  { what: "a cricket or sports score card", re: /^(batter|batsman|batting|bowler|bowling|r|b|4s|6s|sr|s\/r|econ|economy|o|overs?|m|maidens?|w|wkts?|wickets?|dismissal|nb|wd|team|goals?|pts|points|played|won|lost|nrr)$/i, need: 4 },
  { what: "students' exam marks", re: /^(roll\s*no\.?|reg(ister)?\.?\s*no\.?|student( name)?|marks?( obtained)?|total marks|grade|result|subject|maths?|science|english|tamil|physics|chemistry|biology|percentage|rank)$/i, need: 4 },
  { what: "share or market prices", re: /^(symbol|ticker|scrip|open|high|low|close|adj\.?\s*close|ltp|prev\.?\s*close|volume|turnover|52\s*w(ee)?k\s*(high|low)|chg|change\s*%?|%\s*chg|market\s*cap)$/i, need: 4 }
];

export interface QuickRel {
  verdict: "district" | "partly" | "unrelated";
  why: string;
  /** rows that name a Chennai place */
  chennaiRows: number;
  /** a table of Tamil Nadu's districts: its column, and how many of its rows are Chennai's */
  stateWide: { index: number; label: string; chennai: number } | null;
}

/** Gate (c), by rules: is this Chennai's data? Called on every candidate before anything is built. */
export function quickRelevance(t: Table, ctx: { url: string | null; title?: string | null }): QuickRel {
  const rows = usableRows(t).slice(0, 2000);
  const n = rows.length || 1;
  // a table of Tamil Nadu's districts
  let stateWide: QuickRel["stateWide"] = null;
  t.headers.forEach((h, i) => {
    if (stateWide) return;
    const vals = new Set<string>();
    for (const r of rows) if (filled(r[i])) vals.add(normKey(String(r[i]).replace(/\bdistrict\b/i, "")));
    const dists = [...vals].filter((v) => DIST.has(v)).length;
    if (dists >= 5 && dists >= vals.size * 0.6) {
      const chennai = rows.filter((r) => { const v = normKey(String(r[i] ?? "").replace(/\bdistrict\b/i, "")); return v === "chennai" || v === "madras"; }).length;
      stateWide = { index: i, label: h, chennai };
    }
  });
  const sw = stateWide as QuickRel["stateWide"];
  const offTopic = OFF_TOPIC.find((o) => t.headers.filter((h) => o.re.test(h.trim())).length >= o.need);
  const chennaiRows = rows.filter((r) => r.some((c) => typeof c === "string" && c.length < 400 && placeHit(c))).length;
  // a Chennai site's own address counts too (chennaicorporation.gov.in, chennaimetrowater.tn.gov.in)
  const host = (() => { try { return ctx.url ? new URL(ctx.url).hostname : ""; } catch { return ""; } })();
  const named = CHENNAI.test([ctx.url ?? "", ctx.title ?? "", t.caption ?? "", t.part ?? "", ...t.headers].join(" ")) || /chennai|madras/i.test(host);
  const wardCol = t.headers.some((h) => /\b(ward|zone|வார்டு|மண்டலம்)\b/i.test(h));
  if (sw) {
    if (sw.chennai > 0) return { verdict: "partly", why: `A Tamil Nadu table by ${sw.label.toLowerCase()}: Chennai's ${sw.chennai} of ${rows.length} rows are kept.`, chennaiRows: sw.chennai, stateWide: sw };
    return { verdict: "unrelated", why: `A table of Tamil Nadu's districts without a row for Chennai.`, chennaiRows: 0, stateWide: sw };
  }
  if (offTopic && chennaiRows / n < 0.3) return { verdict: "unrelated", why: `It holds ${offTopic.what}, not the district's data.`, chennaiRows, stateWide: null };
  if (chennaiRows / n >= 0.3) return { verdict: "district", why: `${Math.round((chennaiRows / n) * 100)}% of its rows name places in Chennai.`, chennaiRows, stateWide: null };
  if (named && (chennaiRows >= 1 || wardCol)) return { verdict: "district", why: "It names Chennai, and its rows name Chennai's places, wards or zones.", chennaiRows, stateWide: null };
  if (named) return { verdict: "partly", why: "The source names Chennai, though its rows name no place.", chennaiRows, stateWide: null };
  if (wardCol || chennaiRows >= 3) return { verdict: "partly", why: "It has wards or zones, or names a few Chennai places.", chennaiRows, stateWide: null };
  return { verdict: "unrelated", why: "Nothing in it names Chennai, its zones, wards or localities, or a Tamil Nadu district.", chennaiRows, stateWide: null };
}
