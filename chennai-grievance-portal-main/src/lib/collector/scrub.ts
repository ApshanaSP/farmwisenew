/**
 * What an officer writes in a completion report is the officer's own words, and officers sometimes name the complainant
 * ("called Ravi Kumar on 98400 12345, house 12 Gandhi Street"). The Collector, the analysis prompt and the instruction
 * email get the report without those details (QA4 gate, redteam-final-10). Phones, emails and Aadhaar numbers go through the
 * same masking Jarvis uses (lib/thunai/privacy.ts); a name after a title or "complainant", and a house number with its
 * street, are hidden by pattern. A pattern cannot find every name: this lowers the chance and is not a guarantee, so the
 * officer's own console still holds the original text and the report form asks for the work done, not for who asked.
 */
import { redactText } from "@/lib/thunai/privacy";

/** how the decision written by an officer's closing step starts (lib/officer/data.ts recordStep) */
export const CLOSED_BY_DEPARTMENT = "Closed by the department:";

const CAP = "[A-Z][A-Za-z.'-]*";
/** a title or role word, then one to three capitalised words: "complainant Ravi Kumar", "Mr. S. Murugan", "Smt Lakshmi Devi" */
const NAME = new RegExp(
  "\\b((?:complainant|complainer|petitioner|caller|informant|Mrs?\\.?|Ms\\.?|Smt\\.?|Tmt\\.?|Thiru|Thirumathi|Selvi|Shri|Sri)\\s+)" +
    `((?:${CAP})(?:\\s+${CAP}){0,2})`,
  "g"
);
/** the same in Tamil: a title word, then one or two Tamil words */
const NAME_TA = /((?:புகார்தாரர்|புகாரளித்தவர்|திருமதி|திரு|செல்வி)\s+)([\u0B80-\u0BFF]+(?:\s+[\u0B80-\u0BFF]+)?)/g;
const STREET = "(?:Street|St|Road|Rd|Lane|Nagar|Colony|Avenue|Ave|Cross|Salai|Layout|Garden|Gardens|Apartments?|Flats?|Kudiyiruppu|Puram)";
const DOOR = "\\d{1,4}[A-Za-z]?(?:[/-]\\d{1,4}[A-Za-z]?)?";
/** "house 12 Gandhi Street", "No. 4/2, Anna Salai", "door no 9, Periyar Nagar": a door number and the street it is on */
const HOUSE = new RegExp(
  `\\b(?:(?:house|door|flat|plot)\\s*)?(?:no\\.?\\s*|number\\s*|#\\s*)?${DOOR},?\\s+(?:${CAP}\\s+){1,3}${STREET}\\b\\.?` +
    `|\\b(?:house|door|flat|plot)\\s*(?:no\\.?|number)?\\s*${DOOR},?\\s+(?:${CAP}\\s+){0,3}${STREET}\\b`,
  "g"
);
const HOUSE_TA = /வீடு\s*(?:எண்)?\s*\d+[\u0B80-\u0BFF\s]{0,24}?(?:தெரு|சாலை|நகர்)/g;

export function scrubCitizenDetails(text: string): string {
  if (typeof text !== "string" || !text) return "";
  return redactText(text)
    .replace(NAME, (_m, cue: string) => `${cue}[name hidden]`)
    .replace(NAME_TA, (_m, cue: string) => `${cue}[name hidden]`)
    .replace(HOUSE, "[address hidden]")
    .replace(HOUSE_TA, "[address hidden]");
}
