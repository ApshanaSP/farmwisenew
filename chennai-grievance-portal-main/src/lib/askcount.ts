/**
 * How many the Collector asked for: "top three congested roads", "the 3 worst areas", "first five cases", "open top 3 severe cases",
 * "three congested ones in Anna Nagar", "முதல் மூன்று", "டாப் 3", "top moonu". Null when no count is said.
 *
 * 23 Nov 2026: "Top three congested road in Chennai" and "Tell me the three congested ones in Anna Nagar" were each answered with one road (or
 * the overview), and "open top three cases" with the whole severe list: no lane read the count. One reader for every lane (Jarvis, Ask
 * District IQ, Ask the Map), pure and safe in the browser.
 *
 * A number is a count only beside a ranking word or the thing counted; a number that names something ("zone 9", "ward 12", "class 12",
 * "12th standard", "No. 3") is never one.
 */
const EN: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  // speech-to-text and Tanglish spellings
  tree: 3, rendu: 2, irandu: 2, moonu: 3, munu: 3, moonnu: 3, moona: 3, naalu: 4, nalu: 4, anju: 5, anja: 5, aindhu: 5, aaru: 6, ezhu: 7, ettu: 8, pathu: 10, paththu: 10
};
const TA: [RegExp, number][] = [
  [/ஒன்று|ஒண்ணு/, 1], [/இரண்டு|ரெண்டு/, 2], [/மூன்று|மூணு/, 3], [/நான்கு|நாலு/, 4], [/ஐந்து|அஞ்சு/, 5], [/ஆறு/, 6], [/ஏழு/, 7], [/எட்டு/, 8], [/பத்து/, 10]
];
const NUM = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|tree|rendu|irandu|moonu|munu|moonnu|moona|naalu|nalu|anju|anja|aindhu|aaru|ezhu|ettu|pathu|paththu)";
/** a ranking word just before the number: "top 3", "worst five", "first three" */
const BEFORE = new RegExp(`\\b(?:top|first|best|worst|leading|biggest|highest|lowest|least|most|bottom|heaviest|busiest|latest|main|major|key)\\s+(?:the\\s+)?${NUM}\\b`, "i");
/** the thing counted, or a ranking word, just after it: "3 severe cases", "three congested ones", "five areas", "3 most congested" */
const AFTER = new RegExp(`\\b${NUM}\\s+(?:of the\\s+|of\\s+)?(?:most|least|worst|best|biggest|highest|lowest|heaviest|busiest|top|severe|serious|urgent|important|critical|pressing|congested|jammed|busy|main|major|key|bad|big|open|pending|overdue|new|latest|recent|roads?|streets?|areas?|zones?|places?|localit(?:y|ies)|stretch(?:es)?|spots?|junctions?|wards?|cases?|incidents?|complaints?|issues?|problems?|departments?|depts?|news|stories|articles?|headlines?|items?|ones?|things?|priorities|tasks?)\\b`, "i");
/** a number that names a thing, not a count: "zone 9", "ward 12", "class 12", "12th", "No. 3", "number 3" */
const NAMING = /\b(?:zone|ward|class|std|standard|grade|division|no|number|route|bus|platform|gate|block|sector|phase|stage|street|cross|main road|avenue|road)\s*\.?\s*$/i;
/** Tamil: "முதல் மூன்று", "டாப் 3", "மூன்று சாலைகள்", "3 இடங்கள்" */
const TA_BEFORE = /(?:முதல்|டாப்|top|மிக மோசமான|அதிக)\s*(\d{1,2}|ஒன்று|ஒண்ணு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|பத்து)/;
const TA_AFTER = /(\d{1,2}|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|பத்து)\s*(?:சாலை|ரோடு|இட|பகுதி|ஏரியா|மண்டல|சம்பவ|புகார்|கேஸ்|வழக்கு|செய்தி|துறை)/;

const valueOf = (w: string): number | null => {
  const d = Number(w);
  if (Number.isInteger(d) && d > 0) return d;
  const en = EN[w.toLowerCase()];
  if (en) return en;
  for (const [re, n] of TA) if (re.test(w)) return n;
  return null;
};

/** The count the sentence asks for (1–20), or null. */
export function countAsked(text: string): number | null {
  const t = ` ${String(text ?? "").normalize("NFC").replace(/[’']/g, "").replace(/[.,!?;:…"“”()[\]]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const pick = (m: RegExpExecArray | null, idx: number): number | null => {
    if (!m) return null;
    // (an ordinal, "12th", never matches: the number must end at a word break)
    const before = t.slice(0, m.index + m[0].indexOf(m[idx]));
    if (NAMING.test(before.trimEnd())) return null;
    const v = valueOf(m[idx]);
    return v && v <= 20 ? v : null;
  };
  return pick(BEFORE.exec(t), 1) ?? pick(AFTER.exec(t), 1) ?? pick(TA_BEFORE.exec(t), 1) ?? pick(TA_AFTER.exec(t), 1);
}
