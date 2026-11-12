/**
 * Text people typed into an uploaded file (a status, a type, a place, a column name) is data. It is shown, and it is written into the
 * sentences the platform computes, but it must never act as an instruction to the AI that writes the Collector's brief, and what the AI
 * writes back must never carry contact details or ask for personal data (QA pass 6 hunt2-sec-14; QA pass 7 reviewer 2):
 *
 *   - said(): how a file value is SHOWN inside a sentence: one line (control, format, invisible and separator characters become a
 *     space), no double quotes or angle brackets, phone numbers / e-mail / ID numbers masked, at most 40 characters
 *   - plain(): a value short and plain enough for the model to READ (a few words, a few digits, no link); any other value reaches the
 *     model only as a token ([value A]) it can refer to but not read (ai.ts), so an instruction written in a cell never reaches it
 *   - guarded(): what the model wrote, refused when it carries a phone number (in any spelling, script or spacing), an e-mail address,
 *     a link, an ID number, look-alike letters, or ASKS someone to pass on personal data or use an outside channel. Mentioning a subject
 *     ("Aadhaar seeding is pending") is not an ask.
 */

export const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
export const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
export const AADHAAR = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
// eight or more digits close together (a phone number however it is spaced: "98765 432 10", "044 2538 4520"); a date is not one
const DIGIT_RUN = /\d(?:[ ()-]{0,2}\d){7,}/g;
const DATE = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2}-\d{4})$/;

// control, format (zero-width, soft hyphen, bidi, tag characters), line and paragraph separators
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu;

/** Personal details masked: phone numbers (however spaced), e-mail addresses, ID numbers. */
export const scrub = (s: string) => String(s ?? "")
  .replace(EMAIL, "[email]").replace(AADHAAR, "[id number]").replace(PHONE, "[phone]")
  .replace(DIGIT_RUN, (m) => (DATE.test(m.trim()) ? m : "[phone]"));

/** One line: invisible and separator characters become one space. */
export const oneLine = (s: string) => String(s ?? "").replace(INVISIBLE, " ").replace(/ {2,}/g, " ").trim();

/** A file value as shown inside a sentence. */
export function said(v: unknown, max = 40): string {
  const s = scrub(oneLine(String(v ?? "").normalize("NFKC"))).replace(/["<>`]/g, "'");
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** A value plain enough for the model to read: at most 4 words and 32 characters, at most 4 digits, letters and simple punctuation. */
export function plain(v: string): boolean {
  return v.length <= 32 && /^[\p{L}\p{M}\p{N} &'(),./-]+$/u.test(v) && v.trim().split(/\s+/).length <= 4 && (v.match(/\d/g) ?? []).length <= 4
    && !/[a-z0-9-]\.[a-z]{2,}/i.test(v) && !/\.\.|\/\//.test(v);
}

// ---------------------------------------------------------------------------------------------------------------- the reply --

const PHONE1 = new RegExp(PHONE.source), EMAIL1 = new RegExp(EMAIL.source), AADHAAR1 = new RegExp(AADHAAR.source);
// letters from scripts that imitate Latin ones (a Cyrillic А in "Aadhaar")
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Cherokee}]/u;
// a number character that is not 0-9 after NFKC: other scripts' digits, dingbat and circled digits the figure checks cannot read
const OTHER_NUMBER = /[^\P{N}0-9]/u;
const SPELLED = /\b(?:(?:zero|oh|nil|one|two|three|four|five|six|seven|eight|nine|double|triple)\b[\s,.-]*){4,}/i;
const LINK = /\b(?:https?|ftp)\s*:\/\/|\bwww\.|@|\b\d{1,3}(?:\.\d{1,3}){3}\b|\b[a-z0-9-]+\.[a-z]{2,}\b|\bdot\s+(?:com|in|org|net|co|me|io|info)\b/i;
// personal data, sign-ins, lists of people, outside channels
const NOUN = "(?:aadh?aa?r|otp|one[- ]time (?:password|code)|pass(?:word|code)s?|credentials?|pin(?! ?codes?\\b)|pan (?:cards?|numbers?)|bank (?:accounts?|details)|"
  + "account numbers?|ifsc|upi (?:ids?|pins?)|cvv|(?:phone|mobile|cell|contact) (?:numbers?|nos?\\b)|voter ?ids?|ration card numbers?|dates? of birth|"
  + "(?:(?:home|residence|residential|postal) address(?:es)?|addresses)|personal (?:details|data|information)|"
  + "(?:citizen|complainant|petitioner|beneficiar(?:y|ie)|resident|caller)(?:'s|s'|s)? (?:lists?|registers?|names|details|data|numbers|records|contacts)|"
  + "whats ?app|telegram|signal (?:group|app|chat)|gmail|yahoo|hotmail|protonmail)";
// passing something on, or reaching someone through a channel
const VERB = "(?:shar(?:e|es|ed|ing)|send(?:s|ing)?|sent|forward(?:s|ed|ing)?|collect(?:s|ed|ing)?|gather(?:s|ed|ing)?|read(?:s|ing)? out|post(?:s|ed|ing)?|"
  + "upload(?:s|ed|ing)?|publish(?:es|ed|ing)?|hand(?:s|ed|ing)? over|disclos(?:e|es|ed|ing)|e-?mail(?:s|ed|ing)?|messag(?:e|es|ed|ing)|text(?:s|ed|ing)?|"
  + "call(?:s|ed|ing)?|ring(?:s|ing)?|rang|rung|dial(?:s|led|ing)?|writ(?:e|es|ing) to|wrote to|pass(?:es|ed|ing)? on|leak(?:s|ed|ing)?|list(?:s|ed|ing)? out|"
  + "not(?:e|es|ed|ing) down|ask(?:s|ed|ing)? for|giv(?:e|es|ing) out|gave out|join(?:s|ed|ing)?)";
const ASK = new RegExp(`\\b${VERB}\\b(?:\\W+\\w+){0,8}?\\W+${NOUN}\\b`, "i");
const ASKED = new RegExp(`\\b${NOUN}\\b(?:\\W+\\w+){0,6}?\\W+(?:to be |be )?${VERB}\\b`, "i");

/** What a model wrote, fit to show the Collector: false when it carries or asks for personal details, a link, or what the checks cannot read. */
export function guarded(s: string): boolean {
  const n = String(s ?? "").normalize("NFKC");
  if (LOOKALIKE.test(n) || OTHER_NUMBER.test(n)) return false;
  const t = n.replace(INVISIBLE, "").replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ");
  if (PHONE1.test(t) || EMAIL1.test(t) || AADHAAR1.test(t) || new RegExp(DIGIT_RUN.source).test(t) || SPELLED.test(t) || LINK.test(t)) return false;
  return !(ASK.test(t) || ASKED.test(t));
}

// ------------------------------------------------------------------------------------------------------- hidden values --

/** File values the model must not read, each with the token it reads instead ([value A], [value B], ...). */
export class Hidden {
  private tokens = new Map<string, string>();
  private order: string[] = [];
  add(v: string) {
    if (!v || plain(v) || this.tokens.has(v)) return;
    const k = this.tokens.size;
    const name = k < 26 ? String.fromCharCode(65 + k) : `${String.fromCharCode(65 + Math.floor(k / 26) - 1)}${String.fromCharCode(65 + (k % 26))}`;
    this.tokens.set(v, `[value ${name}]`);
    this.order = [...this.tokens.keys()].sort((a, b) => b.length - a.length);
  }
  /** the text the model reads */
  hide(s: string): string {
    let t = String(s ?? "");
    for (const v of this.order) if (t.includes(v)) t = t.split(v).join(this.tokens.get(v)!);
    return t;
  }
  /** what the model wrote, with each token back as the value shown */
  show(s: string): string {
    let t = String(s ?? "");
    for (const [v, tok] of this.tokens) if (t.includes(tok)) t = t.split(tok).join(`"${v}"`);
    return t;
  }
  get size() { return this.tokens.size; }
}
