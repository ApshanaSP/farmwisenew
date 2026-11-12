/**
 * The briefing's AI opening (the pipeline's stored summary of a period, briefings.ai_summary) is shown under "Written by AI from today's
 * figures; every number is checked against the data". The pipeline wrote it for the window of its own build (to its as_of), and checked
 * its numbers against that build's facts; the console shows the live figures of its own rolling window beside it. hunt2-ops-12: a
 * summary of the week to 6 Nov said "more incidents than the previous period" beside the live week's "78% fewer".
 *
 * So the stored summary is shown as today's only when (1) it is the summary of the console's window (its as_of is the console's now,
 * within a twentieth of the period), (2) every comparison with the previous period it makes says what the live change says, and (3)
 * every figure in it is one of the live figures beside it (a date or a warning level aside). Otherwise the rule-based headline, always
 * current, is shown. The Tamil text is the same summary translated; it is kept only when its figures are the English ones. Pure.
 */

export interface StoredOpening { asOf: string | null; en: string | null; ta: string | null }
export interface LiveBrief {
  /** the console's now and the period's length in hours: the window the live figures are for */
  now: string;
  hours: number;
  /** the live change in incidents against the previous period, in %, as the headline says it (null: no previous figure) */
  change: number | null;
  /** every live figure shown with the briefing (reported, previous, severe, open, overdue, ...) */
  figures: number[];
}
export interface CheckedOpening { opening: { en: string; ta: string | null } | null; why: string | null }

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const ms = (t: string) => Date.parse(t.trim().slice(0, 19).replace(" ", "T") + "Z");

/** The figures a text states: digits, commas inside a number allowed, a date ("06 Nov", "Nov 6", "2026-11-06") and a warning level left out. */
export function statedFigures(text: string): number[] {
  const t = text.replace(/\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?\b/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b`, "gi"), " ")
    .replace(new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"), " ")
    .replace(/\blevel\s+\d\b/gi, " ");
  return (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, ""))).filter((v) => Number.isFinite(v));
}

type Way = "more" | "fewer" | "same";
/** The comparisons with the previous period a text makes, sentence by sentence ("more incidents than the previous period"). */
export function claimedChanges(text: string): Way[] {
  const out: Way[] = [];
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (!/\b(previous|prior|last (?:day|week|month|quarter)|than|compared|before)\b/i.test(s)) continue;
    if (/\b(about|roughly|nearly|much) the same\b|\bsimilar (?:number|level|volume)|\bsame number\b|\bunchanged\b|\bsteady\b|\bstable\b|\bflat\b/i.test(s)) out.push("same");
    else if (/\b(more|higher|increase[sd]?|increasing|rise|rose|risen|up|grew|growth|jump(?:ed)?|surge[sd]?)\b/i.test(s)) out.push("more");
    else if (/\b(fewer|less|lower|decrease[sd]?|decreasing|decline[sd]?|fell|fallen|drop(?:ped)?|down|dip(?:ped)?)\b/i.test(s)) out.push("fewer");
  }
  return out;
}

/** Does a stated way match the live change? About the same is within 5%. */
function agrees(w: Way, change: number | null): boolean {
  if (change == null) return false;
  return w === "more" ? change > 0 : w === "fewer" ? change < 0 : Math.abs(change) <= 5;
}

export function checkOpening(s: StoredOpening, live: LiveBrief): CheckedOpening {
  const en = (s.en ?? "").trim();
  if (!en) return { opening: null, why: null };
  const at = s.asOf ? ms(String(s.asOf)) : NaN, now = ms(live.now);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return { opening: null, why: "the stored summary has no window to compare" };
  const slackH = Math.max(1, live.hours / 20);
  const lagH = (now - at) / 3_600_000;
  if (Math.abs(lagH) > slackH) return { opening: null, why: `written for the window to ${String(s.asOf).slice(0, 16)}, not the console's window to ${live.now.slice(0, 16)}` };
  const wrong = claimedChanges(en).find((w) => !agrees(w, live.change));
  if (wrong) return { opening: null, why: `it says ${wrong === "same" ? "about the same" : wrong} than the previous period; the live change is ${live.change == null ? "unknown" : `${live.change}%`}` };
  const known = new Set([...live.figures.map((v) => Number(v)), ...(live.change == null ? [] : [Math.abs(live.change)])]);
  const stale = statedFigures(en).filter((v) => !known.has(v));
  if (stale.length) return { opening: null, why: `its figures ${stale.join(", ")} are not the live figures` };
  // the Tamil names its months and levels in Tamil: compare every digit group in it with every one in the English
  const digits = (t: string) => (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, "")));
  const enFigs = new Set(digits(en));
  const ta = s.ta && digits(s.ta).every((v) => enFigs.has(v)) ? s.ta : null;
  return { opening: { en, ta }, why: null };
}
