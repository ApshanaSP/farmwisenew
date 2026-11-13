/**
 * Text people typed into an uploaded file (a status, a type, a place, a column name, a caption) is data. The Studio shows it, and writes
 * it into the sentences it computes, but it must never instruct the AI that writes the Collector's brief or note (QA pass 6 hunt2-sec-14;
 * QA pass 7, reviewers 2 and 3 of studio-egress). The defence is on what the model READS, by allowlist, not on what it writes:
 *
 *   - forModel(): a computed sentence as the model may read it. Only the words the platform's own sentence templates use (vocab.ts,
 *     generated from the template files, with every word an instruction to pass on personal data or reach someone would need taken out),
 *     the district's zone names, and short or platform-formatted numbers are read as they are. Every other run of words, with the numbers
 *     next to it, is a token ([value A]): it came from the file, however it got into the sentence (a cell, a column name, a caption, a value
 *     changed on the way), and the model can name it but never read it. So nothing written in a file can tell the model anything, and no
 *     number from a file becomes a figure the model may write.
 *   - what the model writes is checked (guarded()) for what must never be shown in its voice: phone numbers in any spacing, script or
 *     spelling, e-mail addresses, links, ID numbers, and characters that hide or imitate letters; then the tokens are put back as the
 *     values, quoted, and the result is checked again.
 *   - said() / scrub(): how a file value is SHOWN: one line, no quotes or angle brackets, phone numbers / e-mail / links / ID numbers masked.
 */
import { TEMPLATE_WORDS } from "@/lib/studio/vocab";

export const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
export const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
export const AADHAAR = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

// control, format (zero-width, soft hyphen, bidi, tag characters), line and paragraph separators
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu;

// eight or more digits written close together, with any dash, dot, comma or bracket between: a phone number however it is written.
// A figure the platform formats (1,84,029 or 12,345,678) and a date are not.
const DIGITS_CLOSE = /\d(?:[\s()\-.,·–—−‒‐‑。]{0,3}\d){7,}/g;
const FIGURE = /^(\d{1,3}(,\d{2})*,\d{3}|\d{1,3}(,\d{3})+)(\.\d+)?$/;
const DATE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/;
const phoneLike = (m: string) => !FIGURE.test(m.trim()) && !DATE.test(m.trim()) && (m.match(/\d/g) ?? []).length >= 8;

// a web address, written plainly or dodged: a scheme, www, a path, or a name and a common ending joined by a dot written as a dot
// (with no space), "dot", [.] or (.). "T.Nagar", "No.of" and "St.Thomas" are not addresses.
const ENDINGS = "com|in|org|net|ly|gle|me|io|site|xyz|app|link|info|gov|nic|edu|ai|gg|to|tk|cc|biz|online|top|live|page|dev|club|store|shop|lk|pk|uk|us";
const LINK = new RegExp(`\\b(?:https?|ftp)\\s*:\\s*/\\s*/\\S*|\\bwww\\s*[.。·]\\S*|\\b[a-z0-9-]+(?:(?:[.。·]|\\s*\\[\\s*[.]\\s*\\]\\s*|\\s*\\(\\s*[.]\\s*\\)\\s*|\\s+dot\\s+)[a-z0-9-]+)*(?:[.。·]|\\s*\\[\\s*[.]\\s*\\]\\s*|\\s*\\(\\s*[.]\\s*\\)\\s*|\\s+dot\\s+)(?:${ENDINGS})\\b(?:/\\S*)?|\\b[a-z0-9-]+[.。·][a-z0-9-]+/\\S*`, "gi");

/** Personal details and addresses masked: phone numbers (however written), e-mail addresses, links, ID numbers. */
export const scrub = (s: string) => String(s ?? "")
  .replace(EMAIL, "[email]").replace(LINK, "[link]").replace(AADHAAR, "[id number]").replace(PHONE, "[phone]")
  .replace(DIGITS_CLOSE, (m) => (phoneLike(m) ? "[phone]" : m))
  .replace(SPELLED4, "[phone] ");

/** One line: invisible and separator characters become one space. */
export const oneLine = (s: string) => String(s ?? "").replace(INVISIBLE, " ").replace(/ {2,}/g, " ").trim();

/** A file value as shown inside a sentence. */
export function said(v: unknown, max = 40): string {
  const s = scrub(oneLine(String(v ?? "").normalize("NFKC"))).replace(/["<>`]/g, "'");
  // a value that reads as a request for people's identifiers is data no one should see repeated in the Collector's brief
  if (asks(s)) return "[a request, not shown]";
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ---------------------------------------------------------------------------------------------------------- what the model reads --

/** File values the model must not read, each with the token it reads instead ([value A], [value B], ...). */
export class Hidden {
  private tokens = new Map<string, string>();
  token(run: string): string {
    let t = this.tokens.get(run);
    if (!t) {
      const k = this.tokens.size;
      t = `[value ${k < 26 ? String.fromCharCode(65 + k) : `${String.fromCharCode(65 + Math.floor(k / 26) - 1)}${String.fromCharCode(65 + (k % 26))}`}]`;
      this.tokens.set(run, t);
    }
    return t;
  }
  /** what the model wrote, each token back as the value it stands for, quoted */
  show(s: string): string {
    let out = String(s ?? "");
    for (const [run, tok] of this.tokens) {
      const pieces = out.split(tok);
      let acc = pieces[0];
      for (let i = 1; i < pieces.length; i++) acc += (/["'“‘]$/.test(acc) ? run : `"${run}"`) + pieces[i];
      out = acc;
    }
    return out;
  }
  get size() { return this.tokens.size; }
}

// a part of a sentence: a mask the platform wrote, a word (letters of any script), a number, white space, or one other character
const PART = /\[(?:phone|link|email|id number)\]|[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|\d+(?:[,.]\d+)*%?|\s+|[^]/gu;
const YEAR = /^(19|20)\d\d$/;
/** a number the model may read: short, a figure the platform formats, a percentage, a decimal, a year */
const readableNumber = (n: string) => {
  const digits = (n.match(/\d/g) ?? []).length;
  const bare = n.replace(/%$/, "").replace(/\.$/, "");
  return digits <= 3 || FIGURE.test(bare) || YEAR.test(bare) || /^\d{1,3}\.\d{1,2}$/.test(bare);
};

/**
 * A sentence as the model may read it. `extra` adds words the caller knows are the platform's own (an insight's label, the
 * department's name from the fixed list). Every other run of words, and a number next to one, becomes a token of `hidden`.
 */
export function forModel(s: string, hidden: Hidden, extra: ReadonlySet<string> = new Set()): string {
  const text = oneLine(String(s ?? "").normalize("NFKC"));
  const parts = text.match(PART) ?? [];
  type Kind = "read" | "hide" | "gap";
  const kind: Kind[] = parts.map((p) => {
    if (/^\s+$/.test(p) || /^[^\p{L}\p{M}\p{N}]$/u.test(p)) return "gap";
    if (/^\[(phone|link|email|id number)\]$/.test(p)) return "hide";
    if (/^\d/.test(p)) return readableNumber(p) ? "read" : "hide";
    const w = p.toLowerCase().replace(/’/g, "'");
    return /^[a-z']+$/.test(w) && w.split("'").every((x) => !x || TEMPLATE_WORDS.has(x) || extra.has(x)) ? "read" : "hide";
  });
  // a number written next to a hidden word belongs to it ("Helpline 9876", "Unit 10" when "unit" is not the platform's)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < parts.length; i++) {
      if (kind[i] !== "read" || !/^\d/.test(parts[i])) continue;
      const near = (step: number) => { let j = i + step; while (j >= 0 && j < parts.length && kind[j] === "gap" && /^[\s\-–—./:]+$/.test(parts[j])) j += step; return j >= 0 && j < parts.length && kind[j] === "hide"; };
      if (near(-1) || near(1)) kind[i] = "hide";
    }
  }
  // a run: from a hidden part to the last hidden part reached through gaps (spaces and joining punctuation only)
  let out = "";
  for (let i = 0; i < parts.length; ) {
    if (kind[i] !== "hide") { out += parts[i]; i++; continue; }
    let end = i, j = i + 1;
    while (j < parts.length && (kind[j] === "hide" || (kind[j] === "gap" && /^[\s\-–—'’/&()]+$/.test(parts[j])))) { if (kind[j] === "hide") end = j; j++; }
    out += hidden.token(parts.slice(i, end + 1).join(""));
    i = end + 1;
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------- what the model wrote --

const PHONE1 = new RegExp(PHONE.source), EMAIL1 = new RegExp(EMAIL.source), AADHAAR1 = new RegExp(AADHAAR.source);
// a number character that is not 0-9 after NFKC: other scripts' digits, dingbat and circled digits the figure checks cannot read
const OTHER_NUMBER = /[^\P{N}0-9]/u;
// a word mixing plain letters with letters of another alphabet or unusual Latin forms (a Greek or Cyrillic "a" in "Aadhaar")
const OTHER_ALPHABET = /[\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Cherokee}]/u;
const MIXED = /(?=\S*[A-Za-z])\S*[^\sA-Za-zÀ-ÿ\P{L}]/u;
// a phone number in words: five or more number words in a row (English, and Hindi or Tamil in Latin letters)
const NUMBER_WORD = "zero|oh|nil|nought|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|" +
  "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|double|triple|shunya|ek|do|teen|char|chaar|paanch|panch|chhe|chhah|saat|aath|nau|das|" +
  "poojyam|onnu|ondru|rendu|irandu|moonu|moondru|naalu|naangu|anju|ainthu|aaru|ezhu|yezhu|ettu|onbadhu|onpathu|pathu";
const SPELLED4 = new RegExp(`\\b(?:(?:${NUMBER_WORD})\\b(?:[\\s,.\\-–—]|and)*){4,}`, "gi");
const SPELLED = new RegExp(`\\b(?:(?:${NUMBER_WORD})\\b(?:[\\s,.\\-–—]|and)*){5,}`, "i");

// an ask for people's identifiers or lists of people: a verb of passing on or collecting near such a noun, either order. A subject alone
// ("Aadhaar seeding is pending", "voter ID applications", "sent through WhatsApp") is not one.
const IDENT = "(?:a{1,2}dh?a{1,2}r|uidai|epic|voter ?ids?)(?:[\\s-]+(?:card|seeding status))?[\\s-]+(?:numbers?|nos?\\b|lists?|details|copies|cards?|data)|" +
  "(?:phone|mobile|cell|contact|whats ?app)[\\s-]+(?:numbers?|nos?\\b|details|list)|contact details|pass(?:words?|codes?)|otp(?:s|[\\s-]+codes?)|login(?:[\\s-]+(?:details|credentials))?|credentials|" +
  "bank[\\s-]+account[\\s-]+(?:numbers?|details)|account numbers?|(?:home|residential|residence|house)[\\s-]+address(?:es)?|date of birth|" +
  "(?:citizen|complainant|petitioner|beneficiar(?:y|ie)|resident|caller|applicant)(?:'s|s'|s)?[\\s-]+(?:lists?|registers?|names|details|data|numbers|records|contacts|addresses|phone numbers|mobile numbers)|complainant register";
const PASS_ON = "(?:shar(?:e|es|ed|ing)|send(?:s|ing)?|sent|forward(?:s|ed|ing)?|collect(?:s|ed|ing)?|gather(?:s|ed|ing)?|obtain(?:s|ed|ing)?|compil(?:e|es|ed|ing)|" +
  "submit(?:s|ted|ting)?|furnish(?:es|ed|ing)?|provid(?:e|es|ed|ing)|giv(?:e|es|en|ing)|read(?:s|ing)? out|post(?:s|ed|ing)?|upload(?:s|ed|ing)?|publish(?:es|ed|ing)?|" +
  "hand(?:s|ed|ing)?(?: over)?|not(?:e|es|ed|ing)|anupp\\w*|kodu\\w*|kudu\\w*|disclos(?:e|es|ed|ing)|e-?mail(?:s|ed|ing)?|messag(?:e|es|ed|ing)|text(?:s|ed|ing)?|leak(?:s|ed|ing)?|list(?:s|ed|ing)? out|" +
  "ask(?:s|ed|ing)? for|bhej\\w*|de ?do|batao|dijiye)";
const PASS_BASE = "(?:share|send|forward|collect|gather|obtain|compile|submit|furnish|provide|give|read out|post|upload|publish|hand(?: over)?|disclose|e-?mail|message|text|leak|list out|note|ask for|anupp\\w*|kodu\\w*|kudu\\w*|bhej\\w*|de ?do|batao|dijiye)";
const BARE_ID = "(?:a{1,2}dh?a{1,2}r|uidai|epic|voter ?ids?|smart ?cards?|ration ?cards?|pan ?cards?)(?![\\s-]+seeding)";
const CHANNEL = "(?:to|on|in|via|into|onto)\\s+(?:the\\s+|a\\s+|our\\s+)?(?:whats ?app|telegram|signal)";
/** Whether a text asks for people's identifiers or lists of people (see ASK). */
export function asks(s: string): boolean { return ASK.test(String(s ?? "").normalize("NFKC").replace(INVISIBLE, "")); }
const ASK = new RegExp(`\\b${PASS_ON}\\b(?:\\W+\\w+){0,8}?\\W+(?:${IDENT})\\b|\\b(?:${IDENT})\\b(?:\\W+\\w+){0,6}?\\W+${PASS_ON}\\b|\\b${PASS_BASE}\\b(?:\\W+\\w+){0,3}?\\W+${BARE_ID}\\b|\\b${BARE_ID}\\b(?:\\W+\\w+){0,3}?\\W+${PASS_BASE}\\b|\\b${PASS_ON}\\b(?:\\W+\\w+){0,8}?\\W+${CHANNEL}\\b`, "i");

/**
 * What a model wrote, fit to show the Collector in its own voice: false when it carries a phone number (however written), an e-mail
 * address, a link, an ID number, a number the checks cannot read, a word that hides or imitates letters, or an ask for people's
 * identifiers or lists of people. A subject is not refused:
 * "Aadhaar seeding is pending", "complaints sent through WhatsApp", "T.Nagar" all pass.
 */
export function guarded(s: string): boolean {
  const n = String(s ?? "").normalize("NFKC").replace(/μ/g, "u");
  if (OTHER_NUMBER.test(n)) return false;
  // invisible characters and marks put inside a word are taken out before reading it; the word is then read as it renders
  const t = n.replace(INVISIBLE, "").replace(/(?<=[A-Za-z])\p{M}+/gu, "");
  if (MIXED.test(t) || OTHER_ALPHABET.test(t) || /\w@\w/.test(t)) return false;
  if (PHONE1.test(t) || EMAIL1.test(t) || AADHAAR1.test(t) || SPELLED.test(t)) return false;
  if ([...t.matchAll(DIGITS_CLOSE)].some((m) => phoneLike(m[0]))) return false;
  return !new RegExp(LINK.source, "i").test(t) && !ASK.test(t);
}
