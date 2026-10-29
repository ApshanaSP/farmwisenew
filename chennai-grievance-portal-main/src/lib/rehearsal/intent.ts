/**
 * Ask the Map's rain-rehearsal questions, in English, Tamil and Tanglish: "what will flood tomorrow?", "which
 * hospitals get cut off?", "dry schools near Velachery", "how did we do last rain?", "replay 21 October",
 * "நாளை எங்கே வெள்ளம் வரும்?". A match opens Rain Rehearsal (at the right clock stop) instead of a map answer. Pure.
 */
export interface RehearsalAsk {
  replay: string | null;
  manual: boolean;
  stop: "warn" | "act" | "rain" | "check" | "learn" | null;
  focus: "streets" | "help" | "schools" | "drains" | null;
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const WILL_FLOOD = /\b(will|would|could|going to|may|might)\b.{0,30}\b(flood|go under|waterlog)|\b(flood|waterlog)\w*\b.{0,25}\b(tomorrow|tonight|next rain|heavy rain|this rain|if it rains|monsoon)\b|\brain rehearsal\b|\brehears/i;
const TA_WILL_FLOOD = /(நாளை|மழை வந்தால்|கனமழை).{0,30}(வெள்ள|தண்ணீர் தேங்|மூழ்க)|மழை ஒத்திகை|(naalaiku|nalaiku|naalai|mazhai vandha).{0,30}(thanni|vellam|flood)/i;
const CUT_OFF = /\b(cut off|cut-off|lose (quick )?help|can'?t reach|cannot reach)\b.{0,40}\b(hospital|fire|ambulance|ward)|\b(hospital|fire station)s?\b.{0,30}\b(cut off|flood|under water|reach)\b|\bwards?\b.{0,30}\b(lose|losing|without)\b.{0,25}\b(help|fire|cover|ambulance)|\bfire cover\b|துண்டிக்கப்ப/i;
const DRY = /\bdry (school|shelter|place)|\brelief cent(re|er)s?\b.{0,20}\b(dry|open|where)|உலர்ந்த பள்ளி|நிவாரண மைய/i;
const HOW_DID = /\bhow (did|was) (we|it)\b.{0,30}\brain\b|\blast rain\b.{0,20}\b(report|check|how)|கடந்த மழை/i;
const REPLAY = /\breplay\b|\bmeendum\b|மீண்டும் காட்டு/i;

/** "21 October", "21 Oct", "Oct 21" → "2026-10-21" (the year of the rains in the record) */
export function dayIn(text: string, year = "2026"): string | null {
  const t = text.toLowerCase();
  let m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/.exec(t);
  if (m) return `${year}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`;
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/.exec(t);
  if (m) return `${year}-${MONTHS[m[1]]}-${m[2].padStart(2, "0")}`;
  return null;
}

/** null when the question is not about rehearsing a rain */
export function rehearsalIntent(text: string): RehearsalAsk | null {
  const t = text.trim();
  if (!t) return null;
  if (REPLAY.test(t) && (/\brain\b|மழை/i.test(t) || dayIn(t))) {
    const d = dayIn(t);
    return { replay: d ? `rain-${d}` : null, manual: false, stop: "warn", focus: null };
  }
  if (HOW_DID.test(t)) return { replay: null, manual: false, stop: "check", focus: null };
  if (CUT_OFF.test(t)) return { replay: null, manual: false, stop: "warn", focus: "help" };
  if (DRY.test(t)) return { replay: null, manual: false, stop: "warn", focus: "schools" };
  if (WILL_FLOOD.test(t) || TA_WILL_FLOOD.test(t)) return { replay: null, manual: false, stop: "warn", focus: "streets" };
  return null;
}
