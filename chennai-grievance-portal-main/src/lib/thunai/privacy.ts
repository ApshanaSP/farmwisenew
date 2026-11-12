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

const PERSON = /(citizen(?!s?\s+complaints?)|complainants?|complainer|petitioner|caller|reporter|person(?!\s+(?:in\s*charge|responsible))|people|resident|residents|applicant|informant|victim|who\s+(?:complained|filed|lodged|called|reported|raised|sent|wrote)|whoever\s+complained|the\s+one\s+who\s+complained|whose|(?:^|\s)யாரு?\s*(?:புகார்|கூப்பிட்)|(?:மனு|புகாரை?)\s*(?:கொடுத்த|குடுத்த|அளித்த|தந்த|செய்த|போட்ட)\S*|புகார்\s*(?:தந்த|கொடுத்த|குடுத்த|அளித்த|செய்த|பண்ண)|புகார்தாரர|மனுதாரர|குடிமக|(?:pugar|complaint)\s*(?:kuduthavar|kuduthavanga|kuduthanga|kuduthaanga|koduthanga|kuduthadhu|panninavar|panninavanga|panninanga|pannavar|pannavanga|pannanga|panna\s+aal)|yaaru?\s+(?:pugar|complaint|complain))/i;
const IDENTIFIER = /(\bcontact\b|\bwhatsapp\b|\bresidence\b|\b(?:lives?|living|stays?|staying|resides?)\b|\b(?:dial|ring|reach)\b|\bcall\b|e-?mail|பேரு|பேர்|பெயர்|மின்னஞ்சல்|மெயில்|வசி|வீடு|எங்கே|யார்|யாரு|\bveedu\b|\byaaru?\b|phone|mobile|contact\s*(?:number|no|details)|whatsapp\s*number|number\s+of|\bnumber\b|\bdetails\b|\baddress\b|aadhaar|aadhar|aadar|voter\s*id|home\s*address|house\s*address|residential\s*address|e-?mail\s*(?:id|address|of)|\b(?:their|his|her)\s+e-?mail|personal\s*details|personal\s*info|தொலைபேசி|போன்\s*நம்பர்|நம்பர்|மொபைல்|கைபேசி|ஆதார்|வீட்டு\s*முகவரி|முகவரி|(?:^|\s)எண்(?=$|\s)|phone\s*number|number\s*kudu|number\s*sollu)/i;
const THEIR_WORDS = /((?:read|show|tell|give|what\s+did|what\s+exactly).{0,40}(?:complaint\s*text|what\s+(?:they|he|she)\s+(?:said|wrote)|exact\s+words|their\s+words|original\s+complaint|(?:what|words|written|said|wrote|says?).{0,15}in\s+the\s+(?:original\s+)?complaint|word\s+for\s+word|citizen(?:'s|s')\s+(?:complaint|message|words)\b|citizens?\s+(?:message|words))|\bread\b.{0,40}citizen'?s?'?\s+complaints?|what\s+did\s+the\s+citizen|(?:they|he|she)\s+say\s+in\s+the\s+complaint|புகாரில்\s*என்ன\s*(?:எழுதி|சொல்லி)|complaint\s*la\s*enna\s*(?:ezhudhi|sonna))/i;
/** what someone said or wrote: asked about a filer (a person word, a pronoun) or about "the complaint" */
const SAID_WRITE = /\b(?:what|exactly\s+what|read|tell|show)\b.{0,45}\b(?:he|she|they|citizens?|residents?|persons?|people|complainants?|callers?|reporters?)\b.{0,25}\b(?:wrote|written|write|said|says?|saying)\b|\b(?:he|she|they|citizens?|residents?|persons?|complainants?|callers?)\b.{0,20}\b(?:wrote|written|said)\b.{0,25}\b(?:complaint|petition|message)|(?:அவர்|அவங்க|அவள்|அவன்)\S*.{0,25}(?:சொன்ன|எழுதி|எழுதின)|(?:pugar|complaint)\s*la\s*enna\s*(?:ezhudhi|ezhuthi|sonna)/i;
/** he, she, they, their, avanga, அவங்க: a pronoun for whoever filed, with an ask for their details */
const FILER_POSS = /\b(?:that|the)\s+(?:girl|boy|woman|man|lady|child|kid|victim|survivor)(?:'s)?\b|அந்த\s*(?:பொண்ணு|பெண்|பையன்|குழந்தை|ஆளு?|நபர்)\S*|\b(?:their|his|her|them|avanga(?:loda)?|avarudaya|avar(?:oda)?|aval(?:oda)?|avan(?:oda)?|andha\s+(?:aal|aalu)|aalu?|aal)\b|(?:^|\s)(?:அவங்க\S*|அவர\S*|அவரு\S*|அவள\S*|அவன\S*|அவளோட|அவனோட|அவரோட|அந்த\s*(?:ஆள்|நபர்)\S*|ஆள்\S*)/i;
/** the details of a person: name, contact, home */
const DETAIL = /அட்ரஸ்\S*|\b(?:name|names|phone|mobile|number|contact|whatsapp|e-?mail|address|residence|aadhaar|aadhar|peru?|nambar)\b|பெயர்|பேரு|தொலைபேசி|போன்|நம்பர்|மொபைல்|முகவரி|மின்னஞ்சல்|வீடு/i;
/** a person who complained, as a subject: "the people who complained", "complainants in Adyar" */
const FILER_REF = /\b(?:victims?|deceased|survivors?|suicides?|missing\s+(?:persons?|people|children|girls?))\b|(?:தற்கொலை|இறந்த|பாதிக்கப்பட்ட|காணாமல்)\S*|\b(?:person|people|persons|residents?|citizens?|aal|aalu|one|guy|man|woman)s?\s+who\s+(?:complained|filed|lodged|reported|raised|called|wrote|sent|made)\b|\bcomplainants?\b|\bcomplainers?\b|\bcallers?\b/i;
const NAME_OF = /\bnames?\s+of\b.{0,30}(?:person|people)|(name|names|பெயர்|\bperu\b).{0,30}(citizen(?!s?\s+complaints?)|complainant|caller|who\s+complained|resident|victim|petitioner|புகார்|குடிமக|pugar|complaint\s*kuduth)|(citizen(?!s?\s+complaints?)|complainant|caller|resident|victim|petitioner|புகார்தாரர்|புகார்\s*(?:கொடுத்தவர்|தந்தவர்|செய்தவர்)|குடிமக|குடிமகன்|pugar\s*kuduthavar).{0,30}(name|names|பெயர்|\bper\s*(?:enna|sollu|kudu|kaattu|$)|\bperu\b)/i;
const STATE_ID = /(aadhaar|aadhar|aadar|voter\s*id|ஆதார்)/i;
const PRIVATE_ID = /(home\s*address|residential\s*address|வீட்டு\s*முகவரி|முகவரி|personal\s*(details|info))/i;
const DIALLED = /(?:phone|mobile|contact|whatsapp)\s*(?:numbers?|nos?|details)/i;
/** a head-count, not somebody's number: "the number of people evacuated", "number of citizen complaints" */
const HEAD_COUNT = /(?<!(?:phone|mobile|contact|whatsapp|aadhaar|aadhar)\s+)\bnumber\s+of\s+(?:(?!the\b)[\w'-]+\s+){0,2}(?:people|persons|residents|citizens|victims|applicants|callers|complainants|petitioners|complaints|grievances|cases|incidents)\b/gi;
/** "who wrote it" and "who sent this complaint" ask for a citizen; "who wrote the book Mahabharata" does not: these verbs need a citizen's thing, or a bare pointer, after them */
const WHO_MADE = /^\s*(?:show me\s+)?who\s+(?:raised|sent|wrote|gave|made)\b.*\b(?:complaints?|grievances?|petitions?|tickets?|issues?|letters?|messages?|e-?mails?|mails?|reports?|this|that|it|them|these|those|one)\b|^\s*(?:show me\s+)?who\s+(?:raised|sent|wrote|gave|made)\s*[?.!]*\s*$/i;
const WHO_DID = /\bwho\s+(?:all\s+)?(?:complained|complains|filed|lodged|reported|called|rang|submitted|phoned|registered|logged)\b|^\s*(?:show me\s+)?who\b.*\b(?:complainant|complainer|caller|petitioner|informant|reporter)\b|^\s*(?:show me\s+)?yaaru\b.*(?:complain|pugar|kuduth)/i;
const WHO_TA = /(?:^|\s)(?:யார்|யாரு|யாருடைய|யாரது)(?=$|[\s,.!?])/;

/** one complaint, by number or as "the complaint" */
const ONE_FILING = /\binc-[a-z0-9-]+|\b(?:this|that|the)\s+(?:complaint|grievance|petition)\b|\bcomplaint\s*(?:no\.?|number|#)?\s*\d+|அந்த\s*புகார்|இந்த\s*புகார்/i;
/** what belongs to whoever filed it: their contact, name, address, or the complaint's own text */
const FILER_THING = /\b(wrote|write|written|said|says?|content|words|exactly|(?:filed|reported|raised|registered|lodged|submitted|made)\s+by|by\s+whom|whom|yaaru?|ezhudhi|ezhuthi|sonna|live|lives|stay|residence|call|dial|reach|phone|mobile|contact|number|whatsapp|e-?mail|address|name|aadhaar|aadhar|description|text|wording|message|filed\s+(?:it|this)|who\s+filed)\b|தொலைபேசி|நம்பர்|எண்|முகவரி|பெயர்|பேர்|யார்|யாரு|எழுத|சொன்ன|கொடுத்தவர்|அளித்தவர்/i;


// ---- normalise first, then match: the same text in any digit script, separator or invisible mark is the same text ----

/** format characters: zero-width, direction and joiner marks, soft hyphen, variation selectors, tags. They are never part of a word or a number. */
const FORMAT_CHARS = /[­͏؜ᅟᅠ឴឵᠋-᠏​‎‏‪-‮⁠-⁯︀-️﻿\u{E0000}-\u{E007F}]/gu;
/** the two joiners matter between letters of an Indic or Arabic script, so they stay there; next to a Latin letter, a digit, a space or a mark they are invisible padding */
const PLAIN_SIDE = String.raw`[\p{Script=Latin}\p{Nd}\s\p{P}\p{S}]`;
const JOINERS_BY_DIGITS = new RegExp(String.raw`(?<=${PLAIN_SIDE}|^)[‌‍]+|[‌‍]+(?=${PLAIN_SIDE}|$)`, "gu");
const digitCache = new Map<number, string>();
/** the value of any Unicode decimal digit: a run of ten from the first one of its block */
function asciiDigit(ch: string): string {
  const cp = ch.codePointAt(0)!;
  const hit = digitCache.get(cp);
  if (hit) return hit;
  let start = cp;
  while (start > 0 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--;
  const v = String((cp - start) % 10);
  digitCache.set(cp, v);
  return v;
}
/** invisible marks out (privacy gates read this copy) */
export const stripFormat = (s: string): string => s.replace(FORMAT_CHARS, "").replace(JOINERS_BY_DIGITS, "");
/** for numbers: marks out, fullwidth ASCII to ASCII, every digit script to 0-9, any space or dash between digits to one space (an ASCII hyphen stays) */
export function normaliseNumbers(s: string): string {
  return stripFormat(s)
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\p{Nd}/gu, (c) => (c.charCodeAt(0) < 128 ? c : asciiDigit(c)))
    .replace(/(?<=\d)[\s\p{Z}\p{Pd}−]+(?=\d)/gu, (m) => (m === "-" ? "-" : " "));
}

/** Asks for a private fact about a citizen: refused in code. An officer's contact is a different thing (contacts tool). */
export function asksPrivate(text: string): boolean {
  const t = stripFormat(text).trim();
  if (/\bwhose\b.{0,40}(complaint|grievance|petition|inc-)|யாருடைய\s*புகார்|\byaar\w*\s+(kuduth|pannin|koduth)/i.test(t)) return true;
  if (/(புகார்தாரர்|புகார்\s*கொடுத்தவர்|மனுதாரர்).{0,20}(பேர்|பெயர்|எண்|நம்பர்|முகவரி)/.test(t)) return true;
  // "how many people", "the people's complaints": people as a count or a subject is not a request for a person's details
  const counting = (/^(how many|count)\b/i.test(t) || /எத்தனை|எவ்வளவு|\b(?:evlo|evvalavu|ethanai|ethana)\b/i.test(t)) && !/\b(their|his|her|whose)\b|(?:அவர|அவங்க)/i.test(t);
  if (THEIR_WORDS.test(t) || (STATE_ID.test(t) && !counting)) return true;
  if (/(officer|engineer|commissioner|department|dept|helpline|control room|call cent(?:re|er)|complaint cell|அதிகாரி|துறை)/i.test(t) && !PERSON.test(t)) return false;
  // asked about one complaint by its number or as "the complaint": its filer, their contact, its own text (red team, BUG-010)
  if (ONE_FILING.test(t) && FILER_THING.test(t)) return true;
  if (SAID_WRITE.test(t)) return true;
  // a pronoun or a "person who complained", with an ask for their details; a head-count is not that
  { const k = t.replace(HEAD_COUNT, "a count");
    if (!counting && DETAIL.test(k) && (FILER_POSS.test(k) || FILER_REF.test(k))) return true;
    if (/\bwho\s+is\s+behind\b|\bwhich\s+(?:citizen|resident|person|complainant|caller|reporter)\b.{0,40}\b(?:complained|filed|lodged|reported|raised|called|wrote|sent|made)\b|(?:list|names?|show|give).{0,12}\b(?:complainants|complainers|callers|petitioners)\b/i.test(t)) return true;
    if (/\byaaru?\b/i.test(t) && /(?:complaint|pugar)\s*(?:la\s+)?(?:kudu|kodu|pann|podu|potta|vech|ezhudh)/i.test(t)) return true;
    if (/(?:மனு|புகார்)\S*\s*(?:கொடுத்த|அளித்த|தந்த|செய்த)\S*/.test(t) && /(யார்|யாரு|பெயர்|பேரு|பேர்|எங்கே|வசி|எண்|நம்பர்)/.test(t)) return true; }
  if (NAME_OF.test(t)) return true;
  // who filed it, in other words (CSK-6): the person behind it, identify the complainant, who submitted or phoned it in, a Tamil "the one who filed", its raw text
  if (/\bwho\s+(?:is|was)\s+(?:the\s+)?(?:(?:citizen|person|resident|complainant|caller|reporter|one|guy|man|woman)\s+)?behind\b|\bidentify\b.{0,30}\b(?:complainants?|filers?|callers?|citizens?|reporters?|residents?|persons?|senders?|submitters?)\b/i.test(t)) return true;
  if (!counting && /புகாரளித்த|புகாரளி(?:த்)?தவ/.test(t)) return true;
  if (ONE_FILING.test(t) && (/\bperu\b|\bpugar\s+solr?\w+|மூல\s*உரை|\b(?:raw|source|original)\s+(?:text|words)\b/i.test(t))) return true;
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
const WIPES = /\b(?:remove|close all|clear|discard|drop|trash|dismiss|get\s+rid\s+of)\b/i;
const RECORDS = /\b(complaints?|cases?|incidents?|records?|data|reports?|drafts?|entries|entry|files?|tickets?|grievances?|everything|everyone)\b|all\s+of\s+them|\b(?:them|these|those)\s*$|புகார்|சம்பவ|அறிக்கை|வரைவ/i;
const CONSOLE_THING = /\b(filters?|panels?|chips?|layers?|highlights?|pins?|windows?|views?|charts?|maps?|tabs?|screens?|lists?)\b|வடிகட்டி|பேனல்|வரைபடம்/i;
/** a change to a record's state, a release of money, a close on records: Jarvis never writes, in any language ("maathidu", "மாத்திடு", "close pannu") */
const CHANGE_VERB = /\b(?:change|modify|alter|edit|rewrite|overwrite|downgrade|reclassify|maathidu|maathu|maathi|mathidu|maatru|maatri)\b|மாற்று|மாற்றி|மாத்து|மாத்தி|மாத்திடு/i;
const STATE_WORD = /\b(?:status|severity|priority|closed?|resolved|low|high|severe|critical|pending)\b|-?ன்னு|\bnu\b/i;
const RECORDISH = /\b(?:fir|cases?|complaints?|incidents?|records?|severity|status|all|every|ellam|pending|inc-[a-z0-9-]+)\b|எல்லா|புகார|சம்பவ|வழக்கு|கேஸ்/i;
const CLOSE_VERB = /\b(?:close|closing|reopen)\b|\bclose\s*pann|மூடு|மூடி|க்ளோஸ்/i;
/**
 * "close aachu", "approve aayiduchu", "க்ளோஸ் ஆச்சு": a verb with a Tanglish or Tamil "it happened" after it says the thing was done; it is a statement or a question about
 * the past, not an order, so the verb is not read as one (QA4 G1, metamorphic m30: "evlo complaints close aachu" was refused as an order to close). Only the done phrase is taken
 * out, so an order beside it ("close aachu, now close all of them") still counts.
 */
const DONE_PHRASE = /\b[a-z][a-z-]*\s*(?:aa(?:chu|chi|yiduchu|yiruchu|giduchu|girukku|nadhu|nathu|gi)|achu)\b|\S+\s*ஆ(?:ச்சு|யிடுச்சு|யிருக்கு|னது|கிடுச்சு|கிவிட்டது)/gi;
const MONEY_VERB = /\b(?:release|disburse|allocate|sanction|transfer|withdraw|waive)\b.{0,50}\b(?:funds?|relief|money|amount|budget|compensation|lakhs?|crores?|rs\.?|rupees)\b|(?:நிதி|பணம்|இழப்பீடு|லட்சம்|கோடி).{0,40}(?:விடுவி|ஒதுக்கு|ரிலீஸ்|கொடு)|\b(?:fund|nidhi|lakhs?)\b.{0,30}\b(?:release|oduk|ondhuk)\w*\s*pann/i;
/** an order to do what a record says, or to show the rules Jarvis runs by */
const OBEY_RECORD = /\b(?:do|follow|obey|act\s+on|carry\s+out|execute)\s+(?:what|as|whatever|the\s+instructions?)\b.{0,40}\b(?:says?|said|written|instructions?|asks?|tells?)\b|சொன்ன\s*மாதிரி\s*(?:செய்|பண்ணு)|\bas\s+(?:it|the\s+(?:complaint|note|record|message))\s+says\b/i;
const REVEAL_RULES = /\b(?:print|show|reveal|repeat|tell|read|output|display|share|give|leak|dump)\b.{0,25}\b(?:your|the)\s+(?:system\s+|hidden\s+|secret\s+)?(?:prompts?|instructions|rules|configuration)\b|உன்\s*(?:ப்ரொம்ப்ட்|பிராம்ப்ட்|விதிகள|அறிவுறுத்தல)/i;

/** Tells Jarvis to do what it never does: send, approve or delete (or to ignore its rules). */
export function asksForbidden(text: string): boolean {
  // The rules (ignore them, show them, do what a record says, move money) are read on the whole sentence: a marker after them ("ignore all your rules aachu") does not make them
  // a statement about the past. Only the order verbs below read the sentence with the done phrase taken out (QA4 g-repair 1, reviewer problem 1).
  const whole = stripFormat(text).trim();
  if (/(ignore|forget|disregard|override|bypass)\s+.{0,30}(rules|instructions|prompt|system|policy|restrictions)|you are now|pretend (you|to)|developer mode|jailbreak|முன்பு சொன்ன.*புறக்கணி|(?:விதி|அறிவுறுத்தல்|கட்டுப்பாடு)\S*\s*(?:புறக்கணி|மற)\S*/i.test(whole)) return true;
  if (OBEY_RECORD.test(whole) || REVEAL_RULES.test(whole) || MONEY_VERB.test(whole)) return true;
  const t = whole.replace(DONE_PHRASE, " ");
  if (WIPES.test(t) && RECORDS.test(t) && !CONSOLE_THING.test(t)) return true;
  if (!CONSOLE_THING.test(t) && (/\bresolved\b.{0,14}\bmark\b|\bmark\b.{0,20}\bresolved\b|resolved-?\s*nu\s+mark|resolved.{0,12}மார்க்|தீர்ந்த(?:தாக|து)?\s*(?:என)?\s*குறி/i.test(t))) return true;
  // the act said with a Tamil helper verb, with nothing else needed ("sanction pannunga", "send seiyunga", "அப்ரூவ் பண்ணுங்க")
  if (/\b(?:approve|delete|send|sanction|reject|authori[sz]e|forward|publish|erase|wipe)\s+(?:pann|seiy|sei\b|panni)\w*|(?:அப்ரூவ்|சாங்ஷன்|டெலிட்|சென்ட்|செண்ட்|ரிஜெக்ட்)\s*(?:பண்ண|செய்)/i.test(t)) return true;
  if (!CONSOLE_THING.test(t)) {
    if (CLOSE_VERB.test(t) && (RECORDISH.test(t) || RECORDS.test(t))) return true;
    if (CHANGE_VERB.test(t) && STATE_WORD.test(t) && RECORDISH.test(t)) return true;
  }
  // "issue" alone is a noun here ("what is the issue in this case"); only issuing something outward counts
  const verb = /\b(send|approve|authorise|authorize|sanction|delete|erase|wipe|purge|dispatch|forward|e-?mail|sms|reject|submit|publish|mark .{0,20}resolved)\b|\bissue\s+(?:an?\s+|the\s+|this\s+|that\s+)?(?:notices?|orders?|instructions?|alerts?|letters?|circulars?|memos?|directives?|statements?|press\s+release)\b|(அனுப்பு|அனுப்பி|அனுப்புங்க|ஒப்புதல் கொடு|ஒப்புதல் தா|ஒப்புதல்\s*(?:செய்|அளி|வழங்கு)|அங்கீகரி|நீக்கு|நீக்குங்க|அழி|அழிங்க)|\b(?:anup[pi]\w*|anupu\w*|azhi\w*|neek+i?\w*)|\bsign\s*off\b|அப்ரூவ்|சாங்ஷன்|டெலிட்/i;
  if (!verb.test(t)) return false;
  // "send" in the sense of a draft to the tray is still only a draft: the tray gate handles it; these name the outward act itself
  return /\b(all|every|old|complaints?|cases?|incidents?|records?|data|report|alert|message|notice|letter|mail|email|sms|it|this|that|them|these|the\s+drafts?|\btray\b|\binc-[a-z0-9-]+|officers?|departments?|engineers?|commissioner|citizens?|press|media)\b|(எல்லா|புகார்|சம்பவ|அறிக்கை|செய்தி|கடிதம்|அதிகாரி|துறை|வரைவ|இதை|அதை)|(ellam|pugar|complaint|case|report|message|draft|officer)/i.test(t);
}

// ---- redaction: every tool result, every string --

// counted by digits, in any grouping; never the rest of a number, an INC- id or a date and time
const PHONE = /(?<!\d)(?<!\d[.,:/-])(?<!\binc-)(?:(?:\+?91|0{1,2}(?:91)?)[ .-]?)?[6-9]\d(?:[ .-]?\d){8}(?![\d:])/gi;
const LANDLINE = /(?<!\d)(?<!\d[.,:/-])(?<!\binc-)(?:\+91[ .-]?[1-9]\d(?:[ .-]?\d){8}|0[1-9](?:[ .-]?\d){8,9})(?![\d:])/gi;
/** a list of small numbers or a date is not a phone: no group of one digit, no dd-mm-yyyy */
const dialled = (m: string) => {
  const groups = m.replace(/^(?:\+?91|0{1,2}(?:91)?)[ .-]/, "").split(/[ .-]/);
  return groups.length <= 5 && groups.every((g) => g.length >= 2) && !DATE.test(groups.join("-"));
};
/** dd-mm-yyyy (any of - . space), a real day and month: not a phone */
const DATE = /^(?:0?[1-9]|[12]\d|3[01])[-. ](?:0?[1-9]|1[0-2])[-. ](?:19|20)\d\d/;
const maskPhone = (m: string) => (dialled(m) ? "[hidden]" : m);
const AADHAAR = /(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}(?!\d)|(?<![\d-])\d{12}(?![\d-])/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w.-]+)?/g;
/** "ramesh [at] gmail [dot] com", "ramesh at gmail dot com", "ramesh(at)gmail.com", "ramesh at gmail.com", Tamil "அட்" / "டாட்" */
const AT_WORD = String.raw`(?:\s*(?:\[at\]|\(at\)|\{at\})\s*|\s+at\s+|\s+அட்\s+|\s*@\s*)`;
const DOT_WORD = String.raw`(?:\s*(?:\[dot\]|\(dot\)|\{dot\})\s*|\s+dot\s+|\s+டாட்\s+|\s*\.\s*)`;
const EMAIL_SPOKEN = new RegExp(String.raw`[\p{L}\p{M}\p{N}._+-]+${AT_WORD}[\p{L}\p{M}\p{N}-]+(?:${DOT_WORD}(?:[a-z]{2,}|காம்|கொம்))+`, "giu");
/** a number said as words, eight digits or more: English, Tamil and Tanglish ("nine eight four", "ஒன்பது எட்டு", "onbadhu ettu") */
const DIGIT_WORD = String.raw`(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple|poojyam|pujyam|poojiyam|onnu|ondru|ondrum|rendu|irandu|moonu|moondru|naalu|naangu|anju|ainthu|aaru|aaru|ezhu|elu|ettu|onbadhu|onbathu|ombodhu|பூஜ்யம்|பூஜ்ஜியம்|ஒன்று|ஒண்ணு|ஒன்னு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எழு|எட்டு|ஒன்பது|ஒம்பது)`;
const SPELLED = new RegExp(String.raw`(?<![\p{L}\p{M}])(?:${DIGIT_WORD}(?![\p{L}\p{M}])[\s,.-]*){8,}`, "giu");
/** digits in any grouping (spaces, dots, dashes, slashes, brackets): counted, then judged as a phone or an Aadhaar */
/** digits and digit words mixed ("98765 four three two one zero"): ten digits or more is a number said two ways */
const MIXED = new RegExp(String.raw`(?<![\p{L}\p{M}\d])(?:(?:${DIGIT_WORD}|\d+)(?![\p{L}\p{M}\d])[\s,.-]*){3,}`, "giu");
const MIXED_DIGIT_WORD = new RegExp(String.raw`^${DIGIT_WORD}$`, "iu");
const mixedRun = (m: string) => {
  const toks = m.trim().split(/[\s,.-]+/).filter(Boolean);
  const words = toks.filter((x) => MIXED_DIGIT_WORD.test(x)).length;
  const digits = toks.reduce((n, x) => n + (MIXED_DIGIT_WORD.test(x) ? 1 : x.length), 0);
  return words > 0 && digits >= 10 ? "[hidden] " : m;
};
/** 10 digits joined by an underscore */
const UNDERSCORED = /(?<![\w-])\d+(?:_\d+){1,4}(?![\w])/g;
const RUN = /(?<![\w-])\+?\(?\d[\d .\/()-]{7,24}\d(?![\w])/g;
/** fields that hold a citizen's own words or identity: they never leave a tool */
const PRIVATE_KEY = /^(complainant|complainant_.*|citizen|citizen_.*|reporter|reporter_.*|caller|caller_.*|phone|mobile|contact_no|contact_number|aadhaar|aadhar|email|name_of_.*|raw_text|complaint_text|complaint_body|description|description_raw|address_line.*|house_no)$/i;

/** "6 7 8 9 1 0 1 1 1 2" is 6, 7, 8, 9, 10, 11, 12: the digits read as one count going up by one are a list, not a number */
function countsUp(d: string): boolean {
  let n = Number(d[0]), i = 1;
  while (i < d.length) {
    n += 1;
    const w = String(n);
    if (!d.startsWith(w, i)) return false;
    i += w.length;
  }
  return d.length > 1;
}

/** A run of digits that is someone's number: 10 from 6-9 (a mobile, with or without +91 / 0), a landline from 0, or 12 (Aadhaar). */
function personalRun(m: string, before: string): boolean {
  if (/:/.test(m) || /inc-$/i.test(before) || /\d{4}-\d{2}-\d{2}/.test(m) || /(?:^|\D)(?:0?[1-9]|[12]\d|3[01])[-./](?:0?[1-9]|1[0-2])[-./](?:\d{4}|\d{2})(?:\D|$)/.test(m)) return false;
  // a list of small numbers said with spaces or commas ("zones 6 7 8 9 10") is not a phone; single digits joined by dots or dashes are
  // (but ten or twelve single digits spaced out are a number said digit by digit, with or without a +91 / 0 in front)
  const groups = m.trim().replace(/^\+?\(?(?:0091|091|91|0)\)?[\s.-]+(?=\d)/, "").split(/[\s,]+/);
  const singles = groups.length > 1 && groups.every((g) => /^\d$/.test(g));
  if (groups.length > 1 && groups.some((g) => /^\d$/.test(g)) && !singles) return false;
  if (singles && countsUp(groups.join(""))) return false;
  const d = m.replace(/\D/g, "");
  if (d.length === 12 && !/^91[6-9]/.test(d)) return true;
  const local = d.replace(/^(?:0091|091|91|0)(?=[6-9]\d{9}$)/, "");
  if (local.length === 10 && /^[6-9]/.test(local)) return true;
  return /^0[1-9]\d{8,9}$/.test(d);
}

export function redactText(s: string): string {
  const t = normaliseNumbers(s);
  return t.replace(EMAIL_SPOKEN, "[hidden]").replace(EMAIL, "[hidden]").replace(SPELLED, "[hidden] ").replace(MIXED, mixedRun).replace(AADHAAR, "[hidden]").replace(PHONE, maskPhone).replace(LANDLINE, maskPhone)
    .replace(RUN, (m, off: number, all: string) => (personalRun(m, all.slice(Math.max(0, off - 4), off)) ? "[hidden]" : m))
    .replace(UNDERSCORED, (m) => (personalRun(m.replace(/_/g, " "), "") ? "[hidden]" : m));
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
