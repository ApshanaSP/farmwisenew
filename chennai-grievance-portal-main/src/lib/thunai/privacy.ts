/**
 * Privacy, in code, before anything else: no citizen's words, phone number or Aadhaar in speech or on screen. A request for
 * them is refused here, with no model involved, and every tool result is redacted on its way out (so neither the model nor
 * the Stage ever sees them). Also: Jarvis never sends, approves or deletes, whatever it is told. Pure and tested.
 */
export const PRIVACY_REPLY = {
  en: "I can't share a citizen's name, phone number, Aadhaar or their own words. I can show the case, its place, its department and how long it has been open.",
  ta: "குடிமக்களின் பெயர், தொலைபேசி எண், ஆதார் அல்லது அவர்கள் சொன்ன வார்த்தைகளை என்னால் தர முடியாது. சம்பவம், இடம், துறை, எவ்வளவு காலமாகத் திறந்துள்ளது என்பதைக் காட்டலாம்."
};
export const NEVER_REPLY = {
  en: "I never send, approve or delete. I can draft it for your tray, and the tap is yours.",
  ta: "அனுப்புவது, ஒப்புதல், நீக்குவது என் வேலை அல்ல. வரைவைத் தட்டில் வைக்கிறேன்; தட்டுவது உங்கள் கையில்."
};

const PERSON = /(citizen(?!s?\s+complaints?)|complainant|complainer|petitioner|caller|reporter|person|people|resident|residents|applicant|informant|victim|who\s+(?:complained|filed|lodged|called|reported|raised|sent|wrote)|whoever\s+complained|the\s+one\s+who\s+complained|whose|(?:^|\s)யாரு?\s*(?:புகார்|கூப்பிட்)|புகார்\s*(?:தந்த|கொடுத்த|குடுத்த|அளித்த|செய்த|பண்ண)|புகார்தாரர்|மனுதாரர்|குடிமக|(?:pugar|complaint)\s*(?:kuduthavar|kuduthavanga|kuduthadhu|panninavar|panninavanga|pannavar|pannavanga)|yaaru\s+(?:pugar|complaint|complain))/i;
const IDENTIFIER = /(phone|mobile|contact\s*(?:number|no|details)|whatsapp\s*number|number\s+of|\bnumber\b|\bdetails\b|\baddress\b|aadhaar|aadhar|aadar|voter\s*id|home\s*address|house\s*address|residential\s*address|e-?mail\s*(?:id|address|of)|\b(?:their|his|her)\s+e-?mail|personal\s*details|personal\s*info|தொலைபேசி|போன்\s*நம்பர்|நம்பர்|மொபைல்|கைபேசி|ஆதார்|வீட்டு\s*முகவரி|முகவரி|(?:^|\s)எண்(?=$|\s)|phone\s*number|number\s*kudu|number\s*sollu)/i;
const THEIR_WORDS = /((?:read|show|tell|give|what\s+did|what\s+exactly).{0,40}(?:complaint\s*text|what\s+(?:they|he|she)\s+(?:said|wrote)|exact\s+words|their\s+words|original\s+complaint|(?:what|words|written|said|wrote|says?).{0,15}in\s+the\s+(?:original\s+)?complaint|word\s+for\s+word|citizen(?:'s|s')\s+(?:complaint|message|words)\b|citizens?\s+(?:message|words))|\bread\b.{0,40}citizen'?s?'?\s+complaints?|what\s+did\s+the\s+citizen|(?:they|he|she)\s+say\s+in\s+the\s+complaint|புகாரில்\s*என்ன\s*(?:எழுதி|சொல்லி)|complaint\s*la\s*enna\s*(?:ezhudhi|sonna))/i;
const NAME_OF = /\bnames?\s+of\b.{0,30}(?:person|people)|(name|names|பெயர்|\bperu\b).{0,30}(citizen(?!s?\s+complaints?)|complainant|caller|who\s+complained|resident|victim|petitioner|புகார்|குடிமக|pugar|complaint\s*kuduth)|(citizen(?!s?\s+complaints?)|complainant|caller|resident|victim|petitioner|புகார்தாரர்|புகார்\s*(?:கொடுத்தவர்|தந்தவர்|செய்தவர்)|குடிமக|குடிமகன்|pugar\s*kuduthavar).{0,30}(name|names|பெயர்|\bper\s*(?:enna|sollu|kudu|kaattu|$)|\bperu\b)/i;
const STATE_ID = /(aadhaar|aadhar|aadar|voter\s*id|ஆதார்)/i;
const PRIVATE_ID = /(home\s*address|residential\s*address|வீட்டு\s*முகவரி|முகவரி|personal\s*(details|info))/i;
const DIALLED = /(?:phone|mobile|contact|whatsapp)\s*(?:numbers?|nos?|details)/i;
/** a head-count, not somebody's number: "the number of people evacuated", "number of citizen complaints" */
const HEAD_COUNT = /(?<!(?:phone|mobile|contact|whatsapp|aadhaar|aadhar)\s+)\bnumber\s+of\s+(?:(?!the\b)[\w'-]+\s+){0,2}(?:people|persons|residents|citizens|victims|applicants|callers|complainants|petitioners|complaints|grievances|cases|incidents)\b/gi;
/** "who wrote it" and "who sent this complaint" ask for a citizen; "who wrote the book Mahabharata" does not: these verbs need a citizen's thing, or a bare pointer, after them */
const WHO_MADE = /^\s*(?:show me\s+)?who\s+(?:raised|sent|wrote|gave|made)\b.*\b(?:complaints?|grievances?|petitions?|tickets?|issues?|letters?|messages?|e-?mails?|mails?|reports?|this|that|it|them|these|those|one)\b|^\s*(?:show me\s+)?who\s+(?:raised|sent|wrote|gave|made)\s*[?.!]*\s*$/i;
const WHO_DID = /^\s*(?:show me\s+)?who\s+(?:complained|complains|filed|lodged|reported|called|rang)\b|^\s*(?:show me\s+)?who\b.*\b(?:complainant|complainer|caller|petitioner|informant|reporter)\b|^\s*(?:show me\s+)?yaaru\b.*(?:complain|pugar|kuduth)/i;
const WHO_TA = /(?:^|\s)(?:யார்|யாரு|யாருடைய|யாரது)(?=$|[\s,.!?])/;

/** one complaint, by number or as "the complaint" */
const ONE_FILING = /\binc-[a-z0-9-]+|\b(?:this|that|the)\s+(?:complaint|grievance|petition)\b|\bcomplaint\s*(?:no\.?|number|#)?\s*\d+|அந்த\s*புகார்|இந்த\s*புகார்/i;
/** what belongs to whoever filed it: their contact, name, address, or the complaint's own text */
const FILER_THING = /\b(phone|mobile|contact|number|whatsapp|e-?mail|address|name|aadhaar|aadhar|description|text|wording|message|filed\s+(?:it|this)|who\s+filed)\b|தொலைபேசி|நம்பர்|எண்|முகவரி|பெயர்|பேர்/i;

/** Asks for a private fact about a citizen: refused in code. An officer's contact is a different thing (contacts tool). */
export function asksPrivate(text: string): boolean {
  const t = text.trim();
  if (/\bwhose\b.{0,40}(complaint|grievance|petition|inc-)|யாருடைய\s*புகார்|\byaar\w*\s+(kuduth|pannin|koduth)/i.test(t)) return true;
  if (/(புகார்தாரர்|புகார்\s*கொடுத்தவர்|மனுதாரர்).{0,20}(பேர்|பெயர்|எண்|நம்பர்|முகவரி)/.test(t)) return true;
  // "how many people", "the people's complaints": people as a count or a subject is not a request for a person's details
  const counting = /^(how many|count)\b/i.test(t) && !/\b(their|his|her|whose)\b/i.test(t);
  if (THEIR_WORDS.test(t) || (STATE_ID.test(t) && !counting)) return true;
  if (/(officer|engineer|commissioner|department|dept|helpline|control room|call cent(?:re|er)|complaint cell|அதிகாரி|துறை)/i.test(t) && !PERSON.test(t)) return false;
  // asked about one complaint by its number or as "the complaint": its filer, their contact, its own text (red team, BUG-010)
  if (ONE_FILING.test(t) && FILER_THING.test(t)) return true;
  if (NAME_OF.test(t)) return true;
  const c = t.replace(HEAD_COUNT, "a count");
  if (IDENTIFIER.test(c) && (PERSON.test(c) || PRIVATE_ID.test(c))) return !counting;
  if (DIALLED.test(c) && /(complaint|புகார|pugar)/i.test(c)) return !counting;
  // "who complained about the drain in Adyar", "yaaru complaint kuduthadhu"
  if (WHO_DID.test(t) || WHO_MADE.test(t)) return true;
  if (WHO_TA.test(t) && /புகார/.test(t) && !/பொறுப்பு/.test(t)) return true;
  if (/\bcaller\b.*\b(mobile|number)\b|\b(pugar|complaint)\s+kuduth|yaaru\s+pugar/i.test(t) && /(per|peru|address|number|enna|kuduthadhu|pannadhu)/i.test(t)) return true;
  return false;
}

/** removing or closing everything: the forbidden act only when it names records; a filter or a panel is console work */
const WIPES = /\b(remove|close all)\b/i;
const RECORDS = /\b(complaints?|cases?|incidents?|records?|data|reports?|drafts?|entries|entry|files?|tickets?|grievances?|everything|everyone)\b|all\s+of\s+them|\b(?:them|these|those)\s*$|புகார்|சம்பவ|அறிக்கை|வரைவ/i;
const CONSOLE_THING = /\b(filters?|panels?|chips?|layers?|highlights?|pins?|windows?)\b/i;

/** Tells Jarvis to do what it never does: send, approve or delete (or to ignore its rules). */
export function asksForbidden(text: string): boolean {
  const t = text.trim();
  if (/(ignore|forget|disregard|override|bypass)\s+.{0,30}(rules|instructions|prompt|system|policy|restrictions)|you are now|pretend (you|to)|developer mode|jailbreak|முன்பு சொன்ன.*புறக்கணி/i.test(t)) return true;
  if (WIPES.test(t) && RECORDS.test(t) && !CONSOLE_THING.test(t)) return true;
  // "issue" alone is a noun here ("what is the issue in this case"); only issuing something outward counts
  const verb = /\b(send|approve|authorise|authorize|sanction|delete|erase|wipe|purge|dispatch|forward|e-?mail|sms|reject|submit|publish|mark .{0,20}resolved)\b|\bissue\s+(?:an?\s+|the\s+|this\s+|that\s+)?(?:notices?|orders?|instructions?|alerts?|letters?|circulars?|memos?|directives?|statements?|press\s+release)\b|(அனுப்பு|அனுப்பி|அனுப்புங்க|ஒப்புதல் கொடு|ஒப்புதல் தா|அங்கீகரி|நீக்கு|நீக்குங்க|அழி|அழிங்க)|\b(delete pannu|anuppu|anupu|approve pannu|azhi|neekku)\b/i;
  if (!verb.test(t)) return false;
  // "send" in the sense of a draft to the tray is still only a draft: the tray gate handles it; these name the outward act itself
  return /\b(all|every|old|complaints?|cases?|incidents?|records?|data|report|alert|message|notice|letter|mail|email|sms|it|this|that|them|these|the\s+drafts?|officers?|departments?|engineers?|commissioner|citizens?|press|media)\b|(எல்லா|புகார்|சம்பவ|அறிக்கை|செய்தி|கடிதம்|அதிகாரி|துறை|வரைவ|இதை|அதை)|(ellam|pugar|complaint|case|report|message|draft|officer)/i.test(t);
}

// ---- redaction: every tool result, every string --

// counted by digits, in any grouping; never the rest of a number, an INC- id or a date and time
const PHONE = /(?<!\d)(?<!\d[.,:/-])(?<!\binc-)(?:(?:\+?91|0{1,2}(?:91)?)[ .-]?)?[6-9]\d(?:[ .-]?\d){8}(?![\d:])/gi;
const LANDLINE = /(?<!\d)(?<!\d[.,:/-])(?<!\binc-)(?:\+91[ .-]?[1-9]\d(?:[ .-]?\d){8}|0[1-9](?:[ .-]?\d){8,9})(?![\d:])/gi;
/** a list of small numbers or a date is not a phone: no group of one digit, no dd-mm-yyyy */
const dialled = (m: string) => {
  const groups = m.replace(/^(?:\+?91|0{1,2}(?:91)?)[ .-]/, "").split(/[ .-]/);
  return groups.length <= 5 && groups.every((g) => g.length >= 2) && !/^\d{1,2}[-. ]\d{1,2}[-. ]\d{4}/.test(m);
};
const maskPhone = (m: string) => (dialled(m) ? "[hidden]" : m);
const AADHAAR = /(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}(?!\d)|(?<![\d-])\d{12}(?![\d-])/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w.-]+)?/g;
/** "ramesh [at] gmail [dot] com", "ramesh at gmail dot com" */
const EMAIL_SPOKEN = /[\w.+-]+\s*(?:\[at\]|\(at\)|\s+at\s+)\s*[\w-]+\s*(?:\[dot\]|\(dot\)|\s+dot\s+)\s*[a-z]{2,}/gi;
/** a number said as words, eight digits or more: "nine eight four zero one ..." */
const SPELLED = /(?:\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple)\b[\s,.-]*){8,}/gi;
/** digits in any grouping (spaces, dots, dashes, slashes, brackets): counted, then judged as a phone or an Aadhaar */
const RUN = /(?<![\w-])\+?\(?\d[\d .\/()-]{7,24}\d(?![\w])/g;
const ODD_DIGITS = /[\uFF10-\uFF19\u0BE6-\u0BEF]/g;
/** fields that hold a citizen's own words or identity: they never leave a tool */
const PRIVATE_KEY = /^(complainant|complainant_.*|citizen|citizen_.*|reporter|reporter_.*|caller|caller_.*|phone|mobile|contact_no|contact_number|aadhaar|aadhar|email|name_of_.*|raw_text|complaint_text|complaint_body|description|description_raw|address_line.*|house_no)$/i;

/** A run of digits that is someone's number: 10 from 6-9 (a mobile, with or without +91 / 0), a landline from 0, or 12 (Aadhaar). */
function personalRun(m: string, before: string): boolean {
  if (/:/.test(m) || /inc-$/i.test(before) || /\d{4}-\d{2}-\d{2}/.test(m) || /(?:^|\D)\d{1,2}[-./]\d{1,2}[-./]\d{2,4}(?:\D|$)/.test(m)) return false;
  // a list of small numbers said with spaces or commas ("zones 6 7 8 9 10") is not a phone; single digits joined by dots or dashes are
  const groups = m.trim().split(/[\s,]+/);
  if (groups.length > 1 && groups.some((g) => /^\d$/.test(g))) return false;
  const d = m.replace(/\D/g, "");
  if (d.length === 12 && !/^91[6-9]/.test(d)) return true;
  const local = d.replace(/^(?:0091|091|91|0)(?=[6-9]\d{9}$)/, "");
  if (local.length === 10 && /^[6-9]/.test(local)) return true;
  return /^0[1-9]\d{8,9}$/.test(d);
}

export function redactText(s: string): string {
  const t = s.replace(ODD_DIGITS, (c) => String((c.charCodeAt(0) - (c >= "\uFF10" && c <= "\uFF19" ? 0xFF10 : 0x0BE6)) % 10));
  return t.replace(EMAIL_SPOKEN, "[hidden]").replace(EMAIL, "[hidden]").replace(SPELLED, "[hidden] ").replace(AADHAAR, "[hidden]").replace(PHONE, maskPhone).replace(LANDLINE, maskPhone)
    .replace(RUN, (m, off: number, all: string) => (personalRun(m, all.slice(Math.max(0, off - 4), off)) ? "[hidden]" : m));
}

/** A deep copy with citizens' identifiers masked and their private fields dropped. */
export function redact<T>(v: T, depth = 0): T {
  if (depth > 8) return v;
  if (typeof v === "string") return redactText(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1)) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (PRIVATE_KEY.test(k)) continue;
      out[k] = redact(x, depth + 1);
    }
    return out as T;
  }
  return v;
}

/**
 * Hands whose every result is redacted on its way out (the same rule round.ts's safeHands applies, without its cache), for any
 * path that reads tools: no route may hand a model or the Stage a citizen's number, Aadhaar or own words (BUG-009).
 */
export function redactHands<H extends { tool: (n: string, a: Record<string, unknown>) => Promise<unknown>; severe: (s: never) => Promise<unknown>; news: (s: never) => Promise<unknown>; map: (q: string) => Promise<unknown>; dataset?: (n: string) => Promise<unknown> }>(h: H): H {
  return {
    ...h,
    tool: (n: string, a: Record<string, unknown>) => h.tool(n, a).then((r) => redact(r)),
    severe: (s: never) => h.severe(s).then((r) => redact(r)),
    news: (s: never) => h.news(s).then((r) => redact(r)),
    map: (q: string) => h.map(q).then((r) => redact(r)),
    dataset: h.dataset ? (n: string) => h.dataset!(n).then((r) => redact(r)) : undefined
  } as H;
}
