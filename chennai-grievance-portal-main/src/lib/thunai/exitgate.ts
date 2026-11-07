/**
 * One exit gate for every line Jarvis says or shows as its own (QA pass 4, RC-19). Before this, each kind of line (chat, refuse,
 * clarify question, clarify button, do reply, answer, general, the older /plan route) had its own copy of some of the checks, and
 * a kind that was left out said whatever the model wrote. Now there is one question and every route asks it:
 *   contact   the line spells a phone, an email or an Aadhaar (privacy.ts redaction changes it)
 *   citizen   the line names whoever filed (a name after "filed by", "புகார் கொடுத்தவர்", "<Name> dhaan complaint", an address)
 *   copy      the line repeats six or more words of something it read (a record, the screen, an earlier turn)
 *   order     the line itself tells the Collector to send, approve or delete (the forbidden-act rule, run on the model's words)
 * Pure. A refusal may say "I never send, approve or delete": the order check does not run on a refusal or on a negated line.
 */
import { echoesRecords } from "./injection";
import { asksForbidden, redactText } from "./privacy";

const NEGATED = /\b(?:never|cannot|can't|can not|won't|will not|don't|do not|not allowed|unable)\b|முடியாது|மாட்டேன்|கூடாது|வேண்டாம்|\b(?:mudiyaadhu|mudiyathu|maatten|kudaadhu|venaam)\b/i;

/** capitalised words that start an organisation or a place, not a person */
const NOT_A_PERSON = String.raw`(?!(?:The|This|That|Chennai|Greater|Metro|Tamil|Police|Corporation|Collector|Commissioner|Officer|Engineer|Department|Dept|Ward|Zone|Public|Municipal|District|State|Central|National|Health|Water|Fire|Traffic|Rescue|GCC|GCP|CMWSSB|TNEB|PWD|Citizen|Citizens|Resident|Residents|Caller|Complainant|Team|Staff|Control|Helpline|Office|Board|Authority)\b)`;
const CAP = String.raw`[A-Z][\p{L}.'-]+`;
const TITLE = String.raw`(?:(?:Mr|Mrs|Ms|Miss|Smt|Shri|Thiru|Tmt|Dr)\.?\s+)?`;
const FILED_BY = new RegExp(String.raw`\b(?:filed|reported|raised|lodged|submitted|written|complained|made|sent|called|registered|given|posted)\s+by\s+${TITLE}${NOT_A_PERSON}${CAP}(?:\s+${CAP})?`, "u");
const NAME_OF_ADDRESS = new RegExp(String.raw`\b${NOT_A_PERSON}${CAP}\s+${CAP}\s+(?:of|from|at|living\s+(?:at|in)|residing\s+(?:at|in))\s+(?:(?:No|Door|D)\.?\s*\d+[A-Za-z]?,?\s+)?${CAP}\s+(?:Street|St|Road|Rd|Nagar|Colony|Lane|Avenue|Main|Cross|Salai|Veedhi)\b`, "u");
const ADDRESS_LINE = /\b(?:door|d\.?|house|flat|plot)\s*no\.?\s*\d+|\b\d+[A-Za-z]?,?\s+[A-Z][a-z]+\s+(?:Street|St\.?|Road|Rd\.?|Lane|Avenue|Cross)\b/;
const NAMED = new RegExp(String.raw`\b(?:named|name\s+is|name's|called)\s+${TITLE}${NOT_A_PERSON}${CAP}\s+${CAP}`, "u");
/** Tanglish: "Ramesh Kumar dhaan complaint kuduthaar", "pugar kuduthavar Ramesh" */
const TANGLISH_FILER = new RegExp(String.raw`\b${NOT_A_PERSON}${CAP}(?:\s+${CAP})?\s+(?:dhaan|thaan|dhan|than)\s+(?:complaint|pugar|call|phone|mail)`, "u");
const TANGLISH_FILER2 = new RegExp(String.raw`\b(?:complaint|pugar)\s+(?:kudutha|koduth|pannina|panna)\w*\s*[:,-]?\s*${NOT_A_PERSON}${CAP}`, "u");
/** Tamil: a name straight after "the one who filed" */
const TAMIL_FILER = /(?:புகார்\s*(?:கொடுத்தவர்|தந்தவர்|செய்தவர்|அளித்தவர்)|புகார்தாரர்|மனுதாரர்)\s*[:\-–]?\s*(?!(?:ஒருவர்|யாரும்|பலர்|எவரும்|பற்றி|கள்|\d))[\p{L}\p{M}]{3,}/u;

/** a line that names a citizen: who filed, a private address */
export function namesCitizen(line: string): boolean {
  return FILED_BY.test(line) || NAME_OF_ADDRESS.test(line) || ADDRESS_LINE.test(line) || NAMED.test(line) || TANGLISH_FILER.test(line) || TANGLISH_FILER2.test(line) || TAMIL_FILER.test(line);
}

export interface LineContext {
  /** what the model read: tool results, the screen's digest, the Stage's title, earlier spoken turns */
  records: string[];
  /** a refusal may name the acts it refuses */
  refusal?: boolean;
}

/** Why a model's line may not be said as Jarvis's own, or null. */
export function lineProblem(line: string | null | undefined, ctx: LineContext): string | null {
  const s = (line ?? "").trim();
  if (!s) return null;
  if (redactText(s) !== s) return "contact";
  if (namesCitizen(s)) return "citizen";
  if (echoesRecords(s, ctx.records)) return "copy";
  if (!ctx.refusal && !NEGATED.test(s) && asksForbidden(s)) return "order";
  return null;
}

/** What the browser sent as the Collector's recent turns: what Jarvis answered is something a later line may not repeat. */
export const turnRecords = (turns: { heard?: string; did?: string }[] | null | undefined): string[] => (turns ?? []).map((t) => t.did ?? "").filter(Boolean);

/** The model's clarify buttons that pass: both the label and the request are checked. */
export function safeOptions<T extends { label: string; request: string }>(options: T[] | null | undefined, ctx: LineContext): T[] {
  return (options ?? []).filter((o) => !lineProblem(o.label, ctx) && !lineProblem(o.request, ctx));
}
