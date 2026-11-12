/**
 * Inputs Ask District IQ can read but cannot apply (QA pass 4, RC-43): a zone that does not exist ("zone 99"), a place the district does not
 * have ("in Atlantis"), a period that is not a window ("last 0 days", "31 February", a whole year, a year to come). Each used to be dropped
 * and the default answered (the whole district, the last 90 days) with nothing to say the ask was refused. Here each one is named, in the
 * language of the question, so the answer says what it could not apply. Pure: no database, no model.
 * The same rule for the console's routes is in lib/collector/filters.ts (a 400), and for the Data Studio in studio/parse.ts.
 */
import type { Lang } from "@/lib/assistant/lang";
import { deptFromWords } from "@/lib/assistant/deptwords";
import type { RefNames } from "@/lib/assistant/scope";
import { unheldPhrase, windowIn, type BadRead } from "@/lib/windowspan";

export interface Unresolved { kind: "zone" | "ward" | "place" | "period" | "date" | "year"; asked: string; say: Record<Lang, string> }
const L = (en: string, ta: string, tanglish: string): Record<Lang, string> => ({ en, ta, tanglish });

export interface UnresolvedWorld {
  /** the zone numbers the district has */
  zones: number[];
  /** the store's as-of time, "YYYY-MM-DD HH:MM:SS" (IST) */
  now: string;
  /** days of records the console holds */
  days?: number;
  /** was a place found in the message (the gazetteer's answer) */
  placeFound: boolean;
  /** did a ward number resolve to a ward */
  wardFound: boolean;
  /** true when this question is answered by the rules alone (no model reads it): the place check is only made then */
  rulesOnly: boolean;
  /** words that are names of the district's own things (departments, categories, taluks) and are never an unknown place */
  known: (word: string) => boolean;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)";
const NOT_PLACES = new Set(["chennai", "madras", "tamil", "nadu", "tamilnadu", "india", "gcc", "english", "tanglish", "hindi", "telugu", "malayalam", "excel", "csv", "pdf",
  "corporation", "district", "zone", "ward", "taluk", "collector", "commissioner", "officer", "department", "city", "state", "total", "general", "public", "future", "past", "present",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "yesterday", "tomorrow", "morning", "evening", "night", "afternoon", "week", "month", "year", "quarter",
  "total", "detail", "brief", "short", "full", "both", "all", "any", "each", "every", "this", "that", "these", "those", "order", "priority", "red", "green", "yellow", "orange", "particular",
  ...MONTHS]);

const dim = (m: number, y: number) => [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
const monthIndex = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.slice(0, 3).toLowerCase()));
const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 40);

/** What a count of time that cannot be applied should say, in the three languages (windowspan.ts). */
function badWindow(w: BadRead): Record<Lang, string> {
  const a = clip(w.said);
  switch (w.why) {
    case "negative": return L(`"${a}" is not a period: time does not run backwards. Ask for the last 24 hours, 7, 30 or 90 days, or a number of days from 1.`,
      `"${a}" என்பது காலம் அல்ல: காலம் பின்னோக்கிச் செல்லாது. கடந்த 24 மணி நேரம், 7, 30 அல்லது 90 நாட்கள், அல்லது 1 முதல் நாட்களின் எண்ணிக்கையைக் கேளுங்கள்.`,
      `"${a}" oru period illa: neram pinnaadi poagaadhu. Last 24 hours, 7, 30 illa 90 naal, illa 1 la irundhu naal count kelunga.`);
    case "fraction": return L(`"${a}" is not a whole number of hours, days or weeks. Ask for the last 24 hours, 7, 30 or 90 days, or a whole number of days.`,
      `"${a}" என்பதில் முழு எண் இல்லை. கடந்த 24 மணி நேரம், 7, 30 அல்லது 90 நாட்கள், அல்லது முழு எண்ணிக்கையில் நாட்களைக் கேளுங்கள்.`,
      `"${a}" la muzhu number illa. Last 24 hours, 7, 30 illa 90 naal, illa muzhu number-la naal kelunga.`);
    case "large": return L(`"${a}" reaches back further than the records, which hold about 180 days. Ask for the last 7, 30 or 90 days.`,
      `"${a}" என்பது பதிவுகள் உள்ள காலத்தை விடப் பெரியது: சுமார் 180 நாட்கள் மட்டுமே உள்ளன. கடந்த 7, 30 அல்லது 90 நாட்களைக் கேளுங்கள்.`,
      `"${a}" records irukkura kaalatha vida periyadhu: 180 naal thaan irukku. Last 7, 30 illa 90 naal kelunga.`);
    case "unread": return L(`I could not read the number in "${a}". Say it in digits, like "last 10 days", or ask for the last 24 hours, 7, 30 or 90 days.`,
      `"${a}" என்பதில் உள்ள எண்ணைப் படிக்க முடியவில்லை. "கடந்த 10 நாட்கள்" என்பது போல் இலக்கத்தில் சொல்லுங்கள், அல்லது கடந்த 24 மணி நேரம், 7, 30, 90 நாட்களைக் கேளுங்கள்.`,
      `"${a}" la irukkura number-a padikka mudiyala. "last 10 naal" maadhiri digit-la sollunga, illa last 24 hours, 7, 30, 90 naal kelunga.`);
    default: return L(`"${a}" is not a period: it covers no time at all. Ask for the last 24 hours, 7 days, 30 days or 90 days, or a number of days from 1.`,
      `"${a}" என்பது காலம் அல்ல: அதில் நேரமே இல்லை. கடந்த 24 மணி நேரம், 7, 30 அல்லது 90 நாட்கள், அல்லது 1 முதல் நாட்களின் எண்ணிக்கையைக் கேளுங்கள்.`,
      `"${a}" oru period illa: adhula neram illa. Last 24 hours, 7, 30 illa 90 naal, illa 1 la irundhu naal count kelunga.`);
  }
}

/** What in the question cannot be applied, or null. */
export function unresolvedInput(message: string, w: UnresolvedWorld): Unresolved | null {
  const nowYear = Number(w.now.slice(0, 4));
  const days = w.days ?? 180;
  // ---- a zone number the district does not have (zone 99, zone 0, zone -1, மண்டலம் 99)
  const z = /\bzone(?:-|\s+)?(?:no\.?|number|#)?\s*(-?\s?\d{1,4})\b/i.exec(message) ?? /மண்டலம்\s*(-?\d{1,4})/.exec(message) ?? /\bmandalam\s*(-?\d{1,4})\b/i.exec(message);
  if (z) {
    const n = Number(z[1].replace(/\s/g, ""));
    if (!w.zones.includes(n)) {
      const max = Math.max(...w.zones);
      return { kind: "zone", asked: `zone ${n}`, say: L(`I did not find zone ${n}: the district has zones 1 to ${max}. Tell me which zone you mean, or ask for the whole district.`,
        `${n}-ஆம் மண்டலம் இல்லை: மாவட்டத்தில் 1 முதல் ${max} வரை மண்டலங்கள் உள்ளன. எந்த மண்டலம் என்று சொல்லுங்கள், அல்லது மாவட்டம் முழுவதற்கும் கேளுங்கள்.`,
        `Zone ${n} illa: district-la zone 1 mudhal ${max} varaikkum thaan irukku. Entha zone-nu sollunga, illa whole district-a kelunga.`) };
    }
  }
  // ---- a ward number with no ward
  const wd = /\bward\s*(?:no\.?|number|#)?\s*(-?\d{1,4})\b/i.exec(message) ?? /வார்டு\s*(-?\d{1,4})/.exec(message);
  if (wd && !w.wardFound) {
    const n = Number(wd[1]);
    return { kind: "ward", asked: `ward ${n}`, say: L(`I did not find ward ${n}: the district's wards are numbered 1 to 200. Tell me which ward you mean, or ask for a zone.`,
      `${n}-ஆம் வார்டு இல்லை: வார்டுகள் 1 முதல் 200 வரை எண்ணிடப்பட்டுள்ளன. எந்த வார்டு என்று சொல்லுங்கள், அல்லது ஒரு மண்டலத்தைக் கேளுங்கள்.`,
      `Ward ${n} illa: wards 1 mudhal 200 varaikkum number aagirukku. Entha ward-nu sollunga, illa oru zone-a kelunga.`) };
  }
  // ---- a period that is not a window
  const zero = /\b(?:last|past|previous|kadandha|kadaisi)\s+0+\s*(hours?|hrs?|days?|weeks?|months?|years?|naal|naatkal)\b/i.exec(message) ?? /(?:கடந்த|கடைசி)\s*0+\s*(மணி|நாட்கள்|நாள்|வாரங்கள்|வாரம்|மாதங்கள்|மாதம்)/.exec(message);
  if (zero) return { kind: "period", asked: clip(zero[0]), say: L(`"${clip(zero[0])}" is not a period: it covers no time at all. Ask for the last 24 hours, 7 days, 30 days or 90 days, or a number of days from 1.`,
    `"${clip(zero[0])}" என்பது காலம் அல்ல: அதில் நேரமே இல்லை. கடந்த 24 மணி நேரம், 7, 30 அல்லது 90 நாட்கள், அல்லது 1 முதல் நாட்களின் எண்ணிக்கையைக் கேளுங்கள்.`,
    `"${clip(zero[0])}" oru period illa: adhula neram illa. Last 24 hours, 7, 30 illa 90 naal, illa 1 la irundhu naal count kelunga.`) };
  // a count of time that cannot be applied, in any of the three languages (-5 days, 3.5 days, 1000 days, an unknown number word), or a time the console does not hold with no count (since monday, this year)
  const win = windowIn(message);
  if (win?.kind === "bad") return { kind: "period", asked: clip(win.said), say: badWindow(win) };
  const unheld = unheldPhrase(message);
  if (unheld) return { kind: "period", asked: clip(unheld), say: L(
    `"${clip(unheld)}" is not a window I hold: I have the last 24 hours, 7, 30 and 90 days, a month, or a number of days. Ask for one of those.`,
    `"${clip(unheld)}" என்ற காலம் என்னிடம் இல்லை: கடந்த 24 மணி நேரம், 7, 30, 90 நாட்கள், ஒரு மாதம், அல்லது நாட்களின் எண்ணிக்கை மட்டுமே உள்ளன. அவற்றில் ஒன்றைக் கேளுங்கள்.`,
    `"${clip(unheld)}" nu oru period en kitta illa: last 24 hours, 7, 30, 90 naal, oru maasam, illa naal count thaan irukku. Adhula onnu kelunga.`) };
  // an impossible day ("31 February", "Feb 30", "0 March")
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:\\s+(\\d{4}))?|\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*\\d{4}\\b)(?:,?\\s*(\\d{4}))?`, "i").exec(message);
  if (dm) {
    const day = Number(dm[1] ?? dm[5]), mi = monthIndex(dm[2] ?? dm[4]), yr = Number(dm[3] ?? dm[6] ?? nowYear);
    if (mi >= 0 && (day < 1 || day > dim(mi, yr))) {
      const what = `${day} ${MONTHS[mi][0].toUpperCase()}${MONTHS[mi].slice(1)}`;
      return { kind: "date", asked: what, say: L(`${what}${dm[3] || dm[6] ? ` ${yr}` : ""} is not a date: ${MONTHS[mi][0].toUpperCase()}${MONTHS[mi].slice(1)} has ${dim(mi, yr)} days. Give me a real date, or ask for the last 7, 30 or 90 days.`,
        `${what} என்பது தேதி அல்ல: ${MONTHS[mi]} மாதத்தில் ${dim(mi, yr)} நாட்கள் மட்டுமே. சரியான தேதியைச் சொல்லுங்கள், அல்லது கடந்த 7, 30, 90 நாட்களைக் கேளுங்கள்.`,
        `${what} oru date illa: andha maasathula ${dim(mi, yr)} naal thaan. Sariyaana date sollunga, illa last 7, 30, 90 naal kelunga.`) };
    }
  }
  // a year on its own ("complaints from 2030", "in 2019"): a window of a whole year is not one the console holds; a month with its year is read elsewhere
  const yr = new RegExp(`(?<![\\d./:-])\\b((?:19|20)\\d{2})\\b(?![\\d./:-])`).exec(message);
  if (yr && !new RegExp(`${MONTH_RE}\\s+${yr[1]}|${yr[1]}\\s*[-/]\\s*\\d{1,2}|\\d{1,2}\\s*[-/]\\s*${yr[1]}|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_RE}\\s+${yr[1]}`, "i").test(message)
    && /\b(in|from|of|during|for|since|year|ever|till|until|upto|to)\b|ஆண்டு|வருடம்|\bvarusham\b|\byear\b|\bla\b|இல்/i.test(message)) {
    const y = Number(yr[1]);
    const later = y > nowYear;
    return { kind: "year", asked: yr[1], say: L(later
      ? `${y} has not happened yet (the console's records run to ${w.now.slice(0, 10)}), so there is nothing to count for it. Ask for the last 7, 30 or 90 days.`
      : `The console holds about ${days} days of records, not the whole of ${y}. Ask for the last 7, 30 or 90 days, or one month in the last ${Math.round(days / 30)} months.`,
    later ? `${y} இன்னும் வரவில்லை (பதிவுகள் ${w.now.slice(0, 10)} வரை உள்ளன), எண்ணுவதற்கு எதுவும் இல்லை. கடந்த 7, 30 அல்லது 90 நாட்களைக் கேளுங்கள்.`
      : `கன்சோலில் சுமார் ${days} நாட்களின் பதிவுகள் மட்டுமே உள்ளன, ${y} முழுவதும் இல்லை. கடந்த 7, 30 அல்லது 90 நாட்கள், அல்லது ஒரு மாதத்தைக் கேளுங்கள்.`,
    later ? `${y} innum varala (records ${w.now.slice(0, 10)} varaikkum thaan irukku), ennuradhukku edhuvum illa. Last 7, 30 illa 90 naal kelunga.`
      : `Console-la ${days} naal records thaan irukku, ${y} muzhusa illa. Last 7, 30 illa 90 naal, illa oru maasam kelunga.`) };
  }
  // ---- a place the district does not have: said only when no model reads the question (a model looks the words up in the records' places too)
  if (w.rulesOnly && !w.placeFound) {
    const cand = /\b(?:in|at|near|around|within)\s+([A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{3,})?)(?=[\s?.!,]|$)|\b([A-Z][a-z]{3,})\s*-?\s*(?:la|il)\b(?=[\s?.!,]|$)/.exec(message);
    const raw = cand?.[1] ?? cand?.[2];
    if (raw) {
      const words = raw.split(/\s+/);
      const first = words[0].toLowerCase();
      const unknown = !words.some((x) => NOT_PLACES.has(x.toLowerCase()) || w.known(x));
      // "in Tamil Nadu", "in Ward 5": a first word that is a district word is not a place
      if (unknown && !NOT_PLACES.has(first)) return { kind: "place", asked: raw, say: L(`I did not find "${raw}" among the places in Chennai district, so I have not counted anything for it. Check the spelling, name a zone or taluk, or ask for the whole district.`,
        `"${raw}" என்ற இடம் சென்னை மாவட்டத்தில் கிடைக்கவில்லை, அதனால் அதற்கு எதையும் எண்ணவில்லை. எழுத்துப்பிழையைப் பாருங்கள், ஒரு மண்டலம் அல்லது வட்டத்தைச் சொல்லுங்கள், அல்லது மாவட்டம் முழுவதையும் கேளுங்கள்.`,
        `"${raw}" Chennai district-la kedaikkala, adhanaala edhuvum ennala. Spelling check pannunga, oru zone illa taluk sollunga, illa whole district kelunga.`) };
    }
  }
  return null;
}

/** A word that belongs to one of the district's own things (a department, a category, a taluk, a zone) or names a department: never "a place that is not there". */
export function knownWord(word: string, n: RefNames): boolean {
  const w = word.toLowerCase();
  if (deptFromWords(word, n)) return true;
  const hit = (s: string | null | undefined) => !!s && s.toLowerCase().split(/[^a-z]+/).includes(w);
  for (const d of n.depts.values()) if (hit(d.name)) return true;
  for (const c of n.cats.values()) if (hit(c.label)) return true;
  for (const t of n.taluks.values()) if (hit(t.name)) return true;
  for (const z of n.zones.values()) if (hit(z.name)) return true;
  return false;
}
