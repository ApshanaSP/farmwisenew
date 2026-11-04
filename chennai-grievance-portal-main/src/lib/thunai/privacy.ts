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

const PERSON = /(citizen|complainant|complainer|petitioner|caller|person|people|resident|residents|applicant|informant|victim|who\s+(?:complained|filed|lodged|called|reported|raised|sent)|whoever\s+complained|the\s+one\s+who\s+complained|whose|யார்\s*(?:புகார்|கூப்பிட்)|புகார்\s*(?:தந்த|கொடுத்த|அளித்த|செய்த)|புகார்தாரர்|மனுதாரர்|குடிமக|pugar\s*(?:kuduthavar|kuduthavanga|kuduthadhu|panninavar|pannavanga)|yaaru\s+(?:pugar|complaint|complain))/i;
const IDENTIFIER = /(phone|mobile|contact\s*(?:number|no|details)|whatsapp\s*number|number\s+of|\bnumber\b|\bdetails\b|\baddress\b|aadhaar|aadhar|aadar|voter\s*id|home\s*address|house\s*address|residential\s*address|email\s*(?:id|address)|personal\s*details|personal\s*info|தொலைபேசி|போன்\s*நம்பர்|மொபைல்|கைபேசி|ஆதார்|வீட்டு\s*முகவரி|முகவரி|phone\s*number|number\s*kudu|number\s*sollu)/i;
const THEIR_WORDS = /((?:read|show|tell|give|what\s+did|what\s+exactly).{0,40}(?:complaint\s*text|what\s+(?:they|he|she)\s+(?:said|wrote)|exact\s+words|their\s+words|original\s+complaint|in\s+the\s+(?:original\s+)?complaint|word\s+for\s+word|citizen'?s?\s+(?:complaint|message|words))|what\s+did\s+the\s+citizen|(?:they|he|she)\s+say\s+in\s+the\s+complaint|புகாரில்\s*என்ன\s*(?:எழுதி|சொல்லி)|complaint\s*la\s*enna\s*(?:ezhudhi|sonna))/i;
const NAME_OF = /(name|names|பெயர்|\bper\b|\bperu\b).{0,30}(citizen|complainant|caller|who\s+complained|person|people|resident|victim|petitioner|புகார்|குடிமக|pugar|complaint\s*kuduth)|(citizen|complainant|caller|resident|victim|petitioner|புகார்தாரர்|புகார்\s*(?:கொடுத்தவர்|தந்தவர்|செய்தவர்)|குடிமக|குடிமகன்|pugar\s*kuduthavar).{0,30}(name|names|பெயர்|\bper\b|\bperu\b)/i;

/** Asks for a private fact about a citizen: refused in code. An officer's contact is a different thing (contacts tool). */
export function asksPrivate(text: string): boolean {
  const t = text.trim();
  if (/(officer|engineer|commissioner|department|dept|helpline|control room|அதிகாரி|துறை)/i.test(t) && !PERSON.test(t)) return false;
  if (THEIR_WORDS.test(t) || NAME_OF.test(t)) return true;
  // "how many people", "the people's complaints": people as a count or a subject is not a request for a person's details
  if (IDENTIFIER.test(t) && (PERSON.test(t) || /(aadhaar|aadhar|aadar|voter\s*id|ஆதார்|home\s*address|residential\s*address|வீட்டு\s*முகவரி|முகவரி|personal\s*(details|info))/i.test(t))) return !/^(how many|count|number of)\b/i.test(t);
  // "who complained about the drain in Adyar", "yaaru complaint kuduthadhu"
  if (/^\s*(?:show me\s+)?(who|யார்|yaaru)\b/i.test(t) && /(complain|filed|lodged|reported|raised|called|this one|புகார்|pugar)/i.test(t)) return true;
  if (/யார்/.test(t) && /(புகார்)/.test(t)) return true;
  if (/\bcaller\b.*\b(mobile|number)\b|\b(pugar|complaint)\s+kuduth|yaaru\s+pugar/i.test(t) && /(per|peru|address|number|enna|kuduthadhu|pannadhu)/i.test(t)) return true;
  return false;
}

/** Tells Jarvis to do what it never does: send, approve or delete (or to ignore its rules). */
export function asksForbidden(text: string): boolean {
  const t = text.trim();
  if (/(ignore|forget|disregard|override|bypass)\s+.{0,30}(rules|instructions|prompt|system|policy|restrictions)|you are now|pretend (you|to)|developer mode|jailbreak|முன்பு சொன்ன.*புறக்கணி/i.test(t)) return true;
  const verb = /\b(send|approve|authorise|authorize|sanction|delete|erase|wipe|remove|purge|dispatch|forward|e-?mail|sms|reject|submit|issue|publish|close all|mark .{0,20}resolved)\b|(அனுப்பு|அனுப்பி|அனுப்புங்க|ஒப்புதல் கொடு|ஒப்புதல் தா|அங்கீகரி|நீக்கு|நீக்குங்க|அழி|அழிங்க|delete pannu|anuppu|anupu|approve pannu|azhi|neekku)/i;
  if (!verb.test(t)) return false;
  // "send" in the sense of a draft to the tray is still only a draft: the tray gate handles it; these name the outward act itself
  return /\b(all|every|old|complaints?|cases?|incidents?|records?|data|report|alert|message|notice|letter|mail|email|sms|it|this|that|them|these|the\s+drafts?|officers?|departments?|engineers?|commissioner|citizens?|press|media)\b|(எல்லா|புகார்|சம்பவ|அறிக்கை|செய்தி|கடிதம்|அதிகாரி|துறை|வரைவ|இதை|அதை)|(ellam|pugar|complaint|case|report|message|draft|officer)/i.test(t);
}

// ---- redaction: every tool result, every string --

const PHONE = /(?<![\d-])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\d-])/g;
const LANDLINE = /(?<![\d-])0\d{2,4}[\s-]\d{6,8}(?![\d-])/g;
const AADHAAR = /(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}(?!\d)|(?<![\d-])\d{12}(?![\d-])/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** fields that hold a citizen's own words or identity: they never leave a tool */
const PRIVATE_KEY = /^(complainant|complainant_.*|citizen|citizen_.*|reporter|reporter_.*|caller|caller_.*|phone|mobile|contact_no|contact_number|aadhaar|aadhar|email|name_of_.*|raw_text|complaint_text|complaint_body|description_raw|address_line.*|house_no)$/i;

export function redactText(s: string): string {
  return s.replace(AADHAAR, "[hidden]").replace(PHONE, "[hidden]").replace(LANDLINE, "[hidden]").replace(EMAIL, "[hidden]");
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
