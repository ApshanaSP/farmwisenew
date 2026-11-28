/**
 * Why an incident has its severity, priority and deadline, read from the build (district_intel/dintel/scorewhy.py):
 * incidents.score_why holds every named point with its basis (the BNS section, a citizen's charter clause, or "District IQ
 * default"), incidents.sla_source where the deadline comes from. A build made before those columns existed, or an incident
 * the website added itself (a Manu petition), has neither: the points are then read back from severity_reasons
 * ("Assault (+20); 1 injured (+10)") and the priority shows its reasons without points. Pure: no database here, so the
 * component and the API route share it and a unit test can run it.
 */
import { SEV_BANDS_TEXT, sevOfScore } from "@/lib/sev-label";

type Row = Record<string, unknown>;

export interface SevItem { what: string; points: number | null; basis: string | null }
export interface PriTerm { key: string; words: string; points: number | null }
export interface Related { source: string; clause: string; rule: string; url: string | null; official: boolean }
export interface Deadline {
  hours: number | null;
  /** "response": the deadline is on the first response (police cases), else on resolution */
  basis: "response" | "resolution";
  /** an official service timeline (source, clause, rule, link, date read), not a District IQ default */
  official: boolean;
  /** "TNERC Distribution Standards of Performance Regulations, 2004", "District IQ default", or null when the build does not say */
  source: string | null;
  clause: string | null;
  rule: string | null;
  url: string | null;
  checked: string | null;
  /** how far the published rule fits: it is set per kind of fault, the deadline per category and level */
  fit: string | null;
  related: Related[];
}
export interface ScoreWhy {
  severity: { score: number | null; level: string; items: SevItem[]; capped: string | null; bands: string };
  priority: { score: number | null; terms: PriTerm[]; withPoints: boolean; setLater: boolean };
  deadline: Deadline;
  /** the build stored the breakdown (score_why); false: read back from the reasons text */
  stored: boolean;
  /** a step on this website changed the case after the build (a Manu petition raised it, set a sooner deadline): the parts
   *  that no longer match were rebuilt from the row itself, and this says so */
  editedLater: string | null;
  /** scored on a generated record (the police, PWD, hospital and grievance datasets are demonstration data) */
  generated: boolean;
  /** the case comes from news reports only: its kind and its death and injury counts were read from the articles (AI-assisted) */
  fromNews: boolean;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const ITEM = /^(.*?)\s*\(([+-])(\d+(?:\.\d+)?)\)\s*$/;
const LEGACY = /^(.*?)\s*\(([^()]*)\)\s*$/;

/** "Assault (+20); 1 injured (+10); 1 fatality (Severe)" -> [{what, points}], points null when the item has none. */
export function parseReasons(text: unknown): { what: string; points: number | null }[] {
  if (typeof text !== "string") return [];
  return text.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(ITEM);
    if (m) return { what: m[1], points: Number(m[3]) * (m[2] === "-" ? -1 : 1) };
    const l = s.match(LEGACY);
    return { what: l ? l[1] : s, points: null };
  });
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function parseStored(v: unknown): Record<string, any> | null {
  if (v && typeof v === "object") return v as Record<string, any>;
  if (typeof v !== "string" || !v.trim().startsWith("{")) return null;
  try {
    const d = JSON.parse(v);
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}

/** The breakdown of one incidents row (SELECT * FROM incidents). */
export function scoreWhy(r: Row): ScoreWhy {
  const d = parseStored(r.score_why);
  const sevScore = num(r.severity_score);
  const level = str(r.severity_level) ?? sevOfScore(sevScore);

  let items: SevItem[] = Array.isArray(d?.sev)
    ? d!.sev.filter((x: unknown) => Array.isArray(x)).map((x: unknown[]) => ({ what: String(x[0] ?? ""), points: num(x[1]), basis: str(x[2]) }))
    : parseReasons(r.severity_reasons).map((x) => ({ ...x, basis: null }));
  let sum = items.reduce((a, x) => a + (x.points ?? 0), 0);
  const edits: string[] = [];
  // the stored points add up to LESS than the score now: a later step raised it (the Manu desk raises an urgent petition's case);
  // the reasons text on the row is current, so the points are read from it, and the screen says the score was raised later
  if (d && sevScore != null && items.some((x) => x.points != null) && sum + 0.5 < sevScore) {
    const now = parseReasons(r.severity_reasons).map((x) => ({ ...x, basis: null as string | null }));
    if (now.length) { items = now; sum = items.reduce((a, x) => a + (x.points ?? 0), 0); }
    edits.push("the severity was raised on this website after the build");
  }
  const capNote = items.find((x) => /^capped at/i.test(x.what));
  const capped = sevScore != null && items.some((x) => x.points != null) && sum > sevScore + 0.5
    ? (capNote ? capNote.what : `Capped at ${sevScore}: the score never goes above 100`)
    : null;

  const priScore = num(r.priority_score);
  let terms: PriTerm[];
  let withPoints = false;
  if (Array.isArray(d?.pri) && d!.pri.length) {
    terms = d!.pri.filter((x: unknown) => Array.isArray(x)).map((x: unknown[]) => ({ key: String(x[0] ?? ""), words: String(x[1] ?? ""), points: num(x[2]) }));
    withPoints = true;
  } else {
    // the reasons text: the severity first, then the signals in words (no points stored). The pipeline's first reason is the
    // severity ("High Waterlogging (55)"); a case this website made (a Manu petition) starts with its real reason ("Urgent")
    const why = String(r.priority_reasons ?? "").split(";").map((s) => s.trim()).filter(Boolean);
    const sevFirst = !!why[0] && /^(Severe|High|Medium|Low)\b.*\(\d+(\.\d+)?\)$/.test(why[0]);
    terms = [{ key: "severity", words: `Severity${level ? ` (${level})` : ""}`, points: sevScore },
      ...why.slice(sevFirst ? 1 : 0).map((w) => ({ key: "reason", words: cap(w), points: null }))];
  }
  const tsum = terms.reduce((a, t) => a + (t.points ?? 0), 0);
  // a later step set the priority itself (an urgent petition is 90 on the Manu desk): the points no longer add up to it
  const setLater = withPoints && priScore != null && Math.abs(tsum - priScore) > 0.6;

  let s = (d?.sla ?? {}) as Record<string, any>;
  // the row's deadline is the truth: when it differs from the stored one (the Manu desk sets the petitioner's sooner deadline)
  // or the case's kind changed since the build, the stored source and clause no longer apply
  const rowH = num(r.sla_hours);
  if (d && ((rowH != null && num(s.h) != null && Math.abs(rowH - num(s.h)!) > 0.01) || (str(d.cat) && str(d.cat) !== str(r.category_code)))) {
    s = { h: rowH, basis: s.basis, official: false, source: "Set on this website (the petitioner's deadline)" };
    edits.push("the deadline was set on this website after the build");
  }
  const deadline: Deadline = {
    hours: rowH ?? num(s.h),
    basis: (str(s.basis) ?? str(r.sla_basis)) === "response" ? "response" : "resolution",
    official: s.official === true,
    source: str(s.source) ?? str(r.sla_source),
    clause: str(s.clause), rule: str(s.rule), url: str(s.url), checked: str(s.checked), fit: str(s.fit),
    related: Array.isArray(s.related)
      ? s.related.map((x: Record<string, unknown>) => ({ source: String(x.source ?? ""), clause: String(x.clause ?? ""), rule: String(x.rule ?? ""),
        url: str(x.url), official: x.official === true }))
      : []
  };
  return { severity: { score: sevScore, level, items, capped, bands: SEV_BANDS_TEXT }, priority: { score: priScore, terms, withPoints, setLater }, deadline, stored: !!d,
    editedLater: edits.length ? `${edits.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()) : null,
    generated: Number(r.is_synthetic_any) === 1,
    fromNews: Number(r.media_only) === 1 || String(r.sources ?? "") === "news" };
}

/** "+15", "−5", "" (no points). */
export function pointsText(p: number | null): string {
  if (p == null) return "";
  const v = Math.round(p * 10) / 10;
  return v < 0 ? `−${Math.abs(v)}` : `+${v}`;
}

/** "2 h to restore" / "6 h to first response" / "5 days to resolve". */
export function deadlineWords(d: Deadline): string {
  if (d.hours == null) return "Not set";
  const h = d.hours;
  const span = h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} h`;
  return d.basis === "response" ? `${span} to first response` : `${span} to resolve`;
}

/** The one line beside the deadline: where it comes from. */
export function deadlineSource(d: Deadline): string {
  if (d.official && d.source) return d.clause ? `${d.source}, ${d.clause}` : d.source;
  if (d.source) return d.source;
  return "Source not recorded in this build";
}

/**
 * The breakdown as plain sentences for the assistants (Jarvis and the chatbot read an incident through brain/tools/records.ts):
 * every severity point with its rule, every priority term, and the deadline with its source. Empty when the build stored no
 * breakdown (the reasons text is given there already).
 */
export function scoreWhyFacts(w: ScoreWhy): string[] {
  if (!w.stored) return [];
  const out: string[] = [];
  const sev = w.severity.items.filter((x) => !/^capped at/i.test(x.what));
  if (sev.length)
    out.push(`Severity ${w.severity.score ?? ""} (${w.severity.level || "not rated"}) is the sum of: ${sev.map((x) => `${x.what} ${pointsText(x.points)}${x.basis ? ` [${x.basis}]` : ""}`.trim()).join("; ")}${w.severity.capped ? `; ${w.severity.capped}` : ""}.`);
  if (w.priority.withPoints && w.priority.terms.length)
    out.push(`Priority ${w.priority.score ?? ""} is the sum of: ${w.priority.terms.map((t) => `${t.words} ${t.key === "severity" ? (t.points ?? "") : pointsText(t.points)}`.trim()).join("; ")}${w.priority.setLater ? " (the priority was set later by another step)" : ""}.`);
  const d = w.deadline;
  if (d.hours != null)
    out.push(`Deadline ${deadlineWords(d)}: ${deadlineSource(d)}${d.official && d.rule ? ` ("${d.rule}"${d.fit ? `; ${d.fit}` : ""})` : ""}.`);
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-28" -> "28 Nov 2026" (anything else as it is). */
export function dayWords(iso: string | null): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : String(iso ?? "");
}
