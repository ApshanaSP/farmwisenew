/**
 * The Relevance gate: is this the district's data? A Collector's console is not a place for a student's marks or a
 * cricket score card, but state-wide data that includes Chennai is welcome, kept to Chennai's rows.
 *
 *   stateWide()  a table of Tamil Nadu's districts (one row per district, or per district per year): the column that
 *                names them, so the run keeps Chennai's rows and says so
 *   judge()      the verdict, from evidence first and the Profiler AI's reading second:
 *                  - rows that land on Chennai's map, Chennai named in the link, title or cells, a matched department
 *                  - the AI's verdict ("district", "partly", "unrelated") with its reason
 *                A run is stopped only when the AI reads it as unrelated AND no evidence says otherwise; the Collector
 *                can still add it ("Use anyway"). With no AI, nothing is stopped: the rules alone only warn.
 */
import type { DRow } from "@/lib/studio/clean";
import type { Table } from "@/lib/studio/parse";
import type { Relevance, Spec } from "@/lib/studio/types";
import { normKey } from "@/lib/studio/values";

const TN_DISTRICTS = ["ariyalur", "chengalpattu", "chennai", "coimbatore", "cuddalore", "dharmapuri", "dindigul", "erode", "kallakurichi", "kanchipuram", "kancheepuram",
  "kanniyakumari", "kanyakumari", "karur", "krishnagiri", "madurai", "mayiladuthurai", "nagapattinam", "namakkal", "nilgiris", "the nilgiris", "perambalur", "pudukkottai",
  "ramanathapuram", "ranipet", "salem", "sivaganga", "sivagangai", "tenkasi", "thanjavur", "theni", "thoothukudi", "tuticorin", "tiruchirappalli", "trichy", "tirunelveli",
  "tirupathur", "tiruppur", "tiruvallur", "thiruvallur", "tiruvannamalai", "tiruvarur", "vellore", "viluppuram", "villupuram", "virudhunagar"];
const DIST = new Set(TN_DISTRICTS.map(normKey));
const CHENNAI = /\b(chennai|madras)\b|சென்னை/i;

/** The column of a state-wide table that names Tamil Nadu's districts, when Chennai is one of them. */
export function stateWide(t: Table, spec: Spec): { index: number; key: string; label: string } | null {
  for (const c of spec.columns) {
    if (!["place", "category", "taluk", "id", "text", "zone"].includes(c.role)) continue;
    const i = Number(c.key.slice(1));
    const vals = new Set<string>();
    for (const r of t.rows) { const v = r[i]; if (v != null && v !== "") vals.add(normKey(String(v).replace(/\bdistrict\b/i, ""))); }
    const dists = [...vals].filter((v) => DIST.has(v)).length;
    if (dists >= 5 && dists >= vals.size * 0.6 && [...vals].some((v) => v === normKey("chennai") || v === normKey("madras"))) return { index: i, key: c.key, label: c.label };
  }
  return null;
}

/** Chennai's rows of a state-wide table. */
export function keepChennai(t: Table, index: number): Table {
  return { ...t, rows: t.rows.filter((r) => { const v = normKey(String(r[index] ?? "").replace(/\bdistrict\b/i, "")); return v === normKey("chennai") || v === normKey("madras"); }) };
}

export function judge(p: {
  spec: Spec; rows: DRow[]; table: Table; source: { url: string | null; file: string; caption: string | null };
  filtered: Relevance["filtered"]; forced: boolean;
}): { relevance: Relevance; block: boolean } {
  const { spec, rows } = p;
  const n = rows.length || 1;
  const placed = rows.filter((r) => r._z != null || r._w != null || r._t != null).length / n;
  const text = [p.source.url ?? "", p.source.file, p.source.caption ?? "", spec.title, spec.summary].join(" ");
  const cellHits = p.table.rows.slice(0, 500).filter((r) => r.some((c) => typeof c === "string" && CHENNAI.test(c))).length;
  const named = CHENNAI.test(text) || cellHits >= 3;
  const signals: string[] = [];
  if (p.filtered) signals.push(`A Tamil Nadu table by ${p.filtered.column.toLowerCase()}: kept Chennai's ${p.filtered.kept} of ${p.filtered.of} rows`);
  if (placed > 0) signals.push(`${Math.round(placed * 100)}% of rows placed on Chennai's map`);
  else signals.push("No row matches a Chennai ward, zone or taluk");
  if (named) signals.push("Chennai is named in the source or its rows");
  if (spec.deptName) signals.push(`Matches a district department: ${spec.deptName}`);
  const ai = spec.by === "ai" ? spec.aiRelevance ?? null : null;
  if (ai) signals.push(`AI reading: ${ai.verdict}${ai.why ? ` (${ai.why})` : ""}`);

  const evidence = placed >= 0.3 || (named && placed >= 0.05) || !!p.filtered;
  let verdict: Relevance["verdict"];
  if (p.filtered) verdict = "partly";
  else if (evidence) verdict = "district";
  else if (ai) verdict = ai.verdict === "district" && !named && !spec.deptName && placed < 0.05 ? "partly" : ai.verdict;
  else verdict = named || spec.deptName || placed > 0 ? "district" : "partly";
  const why = p.filtered ? `State-wide data: only Chennai's rows are kept.`
    : verdict === "district" ? (evidence ? `${placed >= 0.3 ? `${Math.round(placed * 100)}% of its rows are places in Chennai` : "It names Chennai and its places"}.` : ai?.why || "It reads as the district's data.")
    : ai?.why || (verdict === "partly" ? "Wider data that may concern Chennai." : "It does not read as Chennai district data.");
  // stopped only when the AI says unrelated and nothing in the rows says otherwise
  const block = !p.forced && verdict === "unrelated" && !!ai && !named && !spec.deptName && placed < 0.1;
  return { relevance: { verdict, why, by: ai ? "ai" : "rules", filtered: p.filtered, forced: p.forced && verdict === "unrelated", signals }, block };
}
