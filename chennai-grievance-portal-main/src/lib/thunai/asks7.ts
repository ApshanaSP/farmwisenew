/**
 * v7: question shapes the owner asks for that no lane read in code (docs/jarvis/JARVIS_V7.md part 2, section 3), each sent to the screen whose
 * facts answer it; the aide then says the point. Run on the server after the frame, the resolve lane and the intent flows, before the fast lane:
 *   "compare everything", "compare all the zones", "how do the zones compare"     -> every zone side by side (performance by zone)
 *   "compare all departments"                                                    -> every department side by side (performance by department)
 *   "compare this week with last week", "today vs yesterday"                     -> what changed between the two windows, and where (changed)
 *   "why is Adyar worse than Anna Nagar"                                          -> the two places side by side (compare)
 *   "what's the Adyar issue", "Adyar issue enna", "அடையாறு பிரச்சினை என்ன"     -> the case that matters most there, explained (explain)
 * English, Tamil and Tanglish. Anything else is null: the lanes that read it already keep it. Pure and browser-safe.
 */
import { asciiDigits } from "./digits";
import { catIn, districtNounIn, zonesIn } from "./quick";
import type { Recipe } from "./stage";
import type { World } from "./types";

export interface Ask7 {
  recipe: Recipe; slots: Record<string, unknown>; why: string;
  /** the outside part's own words (a person, an event): what the aide looks for in the news when the dashboard does not hold it */
  gap?: string[];
}

const norm = (s: string) => ` ${asciiDigits(s.normalize("NFC").toLowerCase()).replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;
const LEAD = String.raw`^ (?:hey |hi |ok |okay )?(?:jarvis )?(?:please |can you |could you |now |and |so )*`;

const ALL_ZONES = [
  new RegExp(`${LEAD}(?:compare|contrast|comparison of) (?:everything|all of (?:it|them)|(?:all )?(?:the )?(?:15 |fifteen )?zones|every zone|zone ?wise)\\b`),
  / how do (?:the |all the )?zones compare /, / zone ?wise comparison /, / compare the zones /
];
const ALL_ZONES_TA = [/எல்லா\s*மண்டலங்கள(?:ையும்)?\s*(?:ஒப்பிடு|கம்பேர்)/u, /மண்டலங்களை\s*ஒப்பிடு/u, /எல்லாவற்றையும்\s*ஒப்பிடு|எல்லாத்தையும்\s*(?:ஒப்பிடு|கம்பேர்)/u];
const ALL_ZONES_TG = [/ (?:ella|ellaa|elle|ellam) ?(?:zone|zones) ?(?:um|yum)? (?:compare|oppidu|oppittu)/, / (?:everything|ellathayum|ellathaiyum|ellam) (?:compare|oppidu)/];
const ALL_DEPTS = [new RegExp(`${LEAD}(?:compare|contrast|comparison of) (?:(?:all )?(?:of )?(?:the )?departments|all (?:the )?depts|every (?:department|dept))\\b`), / how do (?:the |all the )?departments compare /, / department ?wise comparison /];
const ALL_DEPTS_TA = [/துறைகளை\s*ஒப்பிடு|எல்லா\s*துறைகள(?:ையும்)?\s*ஒப்பிடு/u];
// v7 review: every department said ("ella", "department wise"); a department compared with itself ("how does the electricity department compare
// with last month") or one that "compares worst" is not every department side by side
const ALL_DEPTS_TG = [/ (?:ella|ellaa|elle|ellam) ?(?:departments?|depts?|thurai) ?(?:um|yum|ayum|aiyum)? (?:compare|oppidu|oppittu) /, / department ?wise (?:compare|oppidu|oppittu) /];

/**
 * this window against the one before: "compare this week with last week", "today vs yesterday", "this month versus last month", "how does this
 * week compare with last week", "week on week". Only a comparison asked for: two windows joined by "and" are a list ("show me complaints from
 * today and yesterday", v7 review) unless "compare" leads them ("compare today and yesterday")
 */
const NOW_WIN = "(?:this week|today|this month|the last 24 hours|this quarter)";
const PREV_WIN = "(?:last week|the week before|yesterday|last month|the month before|the previous (?:week|month|day)|the 24 hours before|last quarter)";
const PERIOD_PAIR = new RegExp([
  ` (?:compare|comparing|comparison of|contrast)(?: [a-z0-9]+){0,4} ${NOW_WIN} (?:with|against|to|vs|versus|and) ${PREV_WIN} `,
  ` ${NOW_WIN} (?:vs|versus|against|compared (?:with|to|against)|in comparison (?:with|to)|relative to) ${PREV_WIN} `,
  ` ${NOW_WIN} compares? (?:with|to|against) ${PREV_WIN} `,
  " (?:week on week|month on month|day on day|week over week|month over month) "
].join("|"));
const PERIOD_PAIR_TA = /(?:இந்த வாரம்|இன்று|இந்த மாதம்)\s*(?:vs|மற்றும்)?\s*(?:போன|கடந்த|நேற்று)\s*(?:வாரம்|மாதம்)?\s*(?:ஒப்பிடு|கம்பேர்)/u;

/** why (or how) one place is worse or better than another */
const WORSE = / (?:why|how come|how is it|explain why) .*(?:worse|better|higher|lower|more|fewer) /;
const WORSE_TA = /ஏன்.*(?:விட|காட்டிலும்).*(?:மோச|அதிக|குறைவ)|(?:விட|காட்டிலும்).*(?:மோச|அதிக|குறைவ).*ஏன்/u;
const WORSE_TG = / (?:yen|en|ean) .*(?:vida|kaatilum) .*(?:mosam|adhigam|kammi)/;

/** "the X issue": one problem of a place, said as one ("what's the Adyar issue", "the issue in Adyar") */
const ISSUE = [/ (?:whats|what is|what was|tell me about|explain|brief me on) the (?:[a-z]+ )?(?:issue|problem|matter|trouble) /, / the (?:issue|problem|matter|trouble) (?:in|at|with) /, / (?:issue|problem) (?:enna|ennanu|enna aachu|pathi sollu) /];
const ISSUE_TA = /(?:பிரச்சினை|பிரச்சனை|ப்ராப்ளம்)\s*(?:என்ன|என்னன்னு|பற்றி சொல்|பத்தி சொல்)/u;
/** a list, not one issue */
const MANY = / (?:issues|problems|list|all|every|cases|complaints) /;

/**
 * People and events the console holds no record of: a public office (the CM, a minister, the Governor, an MLA, the Mayor) or a public event (an
 * inauguration, an election, a bandh). The console's own officers, departments and complaints are not this ("which officer has the case").
 */
const OUTSIDE_EN = / (?:cm|chief minister|deputy cm|deputy chief minister|minister|ministers|governor|mla|mlas|mp|mps|mayor|deputy mayor|prime minister|pm|president|union minister|actor|film star|celebrity|inaugurat\w*|election|elections|bypoll|by election|bandh|hartal) /;
/**
 * "cm" and "pm" that are a unit or a time, not the Chief Minister or the Prime Minister (v7 review: "more than 10 cm of rain", "after 6 pm today"
 * went to the news): after a number ("10 cm", "6 30 pm"), or a length said of rain or water ("how many cm of rain"). Taken out before the
 * offices are read; "CM Vijay is visiting Adyar", "is the CM coming", "PM visit" keep theirs.
 */
const unitsOut = (t: string): string => t
  .replace(/ \d+(?: \d+)? (?:cm|pm|am|mm|km)(?= )/g, " ")
  .replace(/ (?:cm|mm)(?= (?:of )?(?:rain|rainfall|rains|water|flood|flooding|deep|high) )/g, " ")
  .replace(/ (?:in|many|much) cm(?= )/g, " ");
const OUTSIDE_TA = /முதல்வர்|முதலமைச்சர்|அமைச்சர்|ஆளுநர்|மேயர்|எம்எல்ஏ|எம்\.எல்\.ஏ|பிரதமர்|ஜனாதிபதி|திறப்பு விழா|தேர்தல்|பந்த்/u;
/**
 * A current event with nothing of the district in it ("how many people died in the Kerala landslide", "what happened in Bengaluru today"): the
 * general lane would answer it from a model's memory. A strong event word is enough; "happened" needs a time word with it.
 */
const EVENT_STRONG = / (?:died|dead|deaths|killed|injured|missing|won|wins|elected|resigned|arrested|landslide|landslides|earthquake|tsunami|explosion|blast|crash|crashed|derailed|derailment|stampede|riot|riots) /;
const EVENT_WEAK = / (?:happened|happening|going on|news|update|updates|latest) /;
const NOW_WORDS = / (?:today|yesterday|tonight|this week|this morning|last night|just now|right now|recently|latest) /;
const EVENT_TA = /இறந்த|உயிரிழ|பலி|நிலச்சரிவு|நிலநடுக்க|வெடிவிபத்து|வெடிகுண்டு|ரயில் விபத்து|கலவர|வெற்றி பெற்ற|தேர்தல் முடிவு/u;
const OUTSIDE_STOP = new Set(("the a an is are was were be to of in on at for and or about what who when where why how will would should could can do does did any there this that these those i me my we our you know tell " +
  "say said says today tomorrow yesterday now please jarvis ok okay hey hi going coming come anything something news report reports latest").split(" "));
/** the outside part's words, as said: the question less its district names and its asking words (at most six) */
function outsideWords(t: string, w: World): string[] {
  const district = new Set(w.zones.flatMap((z) => z.name.toLowerCase().split(" ")));
  return [...new Set(t.trim().split(" ").filter((x) => x.length >= 2 && !OUTSIDE_STOP.has(x) && !district.has(x) && !/^\d+$/.test(x) && !/^(?:ல|இல்|க்கு)$/u.test(x)))].slice(0, 6);
}

/**
 * A command that acts (v7 review: "Draft a letter to the zonal officer about the issue in Adyar" became an explain screen and the draft never
 * reached the planner): the fast lane's back-off (quick.ts readScreen: "draft", "send", a note, an order to change a record) said for every verb
 * that acts, in English, Tanglish and Tamil. A verb that is also a noun or a question's word ("the call", "the way forward", "why did it
 * escalate", "open cases") counts only at the head of the sentence, after a word that makes a request ("please", "can you", "and"), or with
 * "pannu"; the rest count anywhere.
 */
const ACT_ANY = / (?:draft|send|email|e mail|notify|remind|delete) /;
const ACT_HEAD = new RegExp(`(?:^ (?:hey |hi |ok |okay )?(?:jarvis )?|(?:please|pls|kindly|just|now|then|also|and|you|lets|let us|go ahead and|want you to) )` +
  // ("open" and "close" said of cases are their state: "how do the zones compare on closed and open cases")
  "(?:(?:open|close)(?! (?:cases?|complaints?|ones|incidents?|issues?|grievances?|tickets?|and|or|rates?|times?|status) )|write|mail|message|text|forward|assign|reassign|escalate|mark|schedule|call|ring|phone|whatsapp|sms|share) ");
const ACT_TG = / (?:draft|send|mail|email|message|forward|open|close|assign|escalate|mark|remind|notify|schedule|call|delete|write|letter|share|whatsapp|sms) (?:pannu|pannunga|pannungal|panni|pannidu|panniru|seiyunga|sei) | (?:anupp\w*|anupu\w*|ezhudhu\w*|ezhuthu\w*|thira|thiranga|thirakkavum|moodu|moodunga|nyabagapaduthu\w*|ninaivoottu\w*) /;
const ACT_TA = /(?<![஀-௿])(?:அனுப்பு|அனுப்புங்க|அனுப்புங்கள்|அனுப்பவும்|அனுப்பிடு|அனுப்பிடுங்க|எழுது|எழுதுங்க|எழுதுங்கள்|எழுதிடு|எழுதவும்|திற|திறங்க|திறக்கவும்|மூடு|மூடுங்க|மூடிடு|ஒதுக்கு|ஒதுக்குங்க|நீக்கு|நீக்குங்க|நினைவூட்டு|நினைவூட்டுங்க|முடிச்சிடு)(?![஀-௿])/u;
const acts = (t: string): boolean => ACT_ANY.test(t) || ACT_HEAD.test(t) || ACT_TG.test(t) || ACT_TA.test(t);

const periodOf = (t: string, dflt: "daily" | "weekly" | "monthly"): "daily" | "weekly" | "monthly" =>
  / (?:today|yesterday|24 hours|day on day) |இன்று|நேற்று/u.test(t) ? "daily" : / (?:this month|last month|month on month|monthly) |மாதம்/u.test(t) ? "monthly" : / (?:this week|last week|week on week|weekly) |வாரம்/u.test(t) ? "weekly" : dflt;

export function asks7(text: string, w: World): Ask7 | null {
  const t = norm(text);
  if (t.trim().length < 3 || t.length > 260) return null;
  // a command that acts is the planner's (its drafts and its tools), never a screen read here
  if (acts(t)) return null;
  const zones = zonesIn(t, w);
  // the kind the sentence names ("the drainage problem in Adyar", "this week with last week for garbage"): kept, never widened to every kind (v7 review)
  const cat = catIn(t);
  if (zones.length < 2 && (ALL_ZONES.some((re) => re.test(t)) || ALL_ZONES_TA.some((re) => re.test(t)) || ALL_ZONES_TG.some((re) => re.test(t))))
    return { recipe: "performance", slots: { by: "zone", period: periodOf(t, "weekly"), zones: [], fresh: true }, why: "compare-all-zones" };
  if (ALL_DEPTS.some((re) => re.test(t)) || ALL_DEPTS_TA.some((re) => re.test(t)) || ALL_DEPTS_TG.some((re) => re.test(t)))
    return { recipe: "performance", slots: { by: "dept", period: periodOf(t, "weekly"), zones: zones.slice(0, 1), fresh: true }, why: "compare-all-depts" };
  if (PERIOD_PAIR.test(t) || PERIOD_PAIR_TA.test(t))
    return { recipe: "changed", slots: { period: periodOf(t, "weekly"), zones: zones.slice(0, 1), cat, fresh: true }, why: "compare-periods" };
  if (zones.length === 2 && (WORSE.test(t) || WORSE_TA.test(t) || WORSE_TG.test(t)))
    return { recipe: "compare", slots: { zones, cat: null, period: periodOf(t, "weekly") }, why: "why-worse" };
  const current = !districtNounIn(text, w) && (EVENT_STRONG.test(t) || EVENT_TA.test(t) || (EVENT_WEAK.test(t) && NOW_WORDS.test(t)));
  if (OUTSIDE_EN.test(unitsOut(t)) || OUTSIDE_TA.test(t) || current) {
    const gap = outsideWords(t, w);
    return zones.length
      ? { recipe: "situation", slots: { zones: zones.slice(0, 1), period: "daily", fresh: true }, why: "outside", gap }
      : { recipe: "news", slots: { zones: [], q: gap.join(" ").slice(0, 120), period: "weekly", fresh: true }, why: "outside", gap };
  }
  if (zones.length === 1 && !MANY.test(t) && (ISSUE.some((re) => re.test(t)) || ISSUE_TA.test(t)))
    return { recipe: "explain", slots: { zones, cat, sev: null, period: "monthly", fresh: true }, why: "the-issue" };
  return null;
}

/**
 * "Who has it?" with a case on the screen (the Haiku dev run, 17 Nov: after "tell me about the Adyar issue" the planner's reply to "who has
 * it?" failed the exit gate and the turn ended in "I can't do that"): the case's own screen, whose facts say who holds it and whether an
 * officer is named. Only a question about "it", "this" or "that" (never "who has the most open cases").
 */
const WHO_HAS = / (?:who(?:s| s| is)? (?:has|holds|handling|handles|on|owns|in charge of|responsible for|dealing with|looking (?:at|into)) (?:it|this|that)(?: one| case)? $|which (?:department|dept|officer|team) (?:has|holds|is handling|handles|is on|owns) (?:it|this|that) |whose (?:case|job) is (?:it|this|that) )/;
const WHO_HAS_TA = /யார்\s*(?:கையில்|கிட்ட|கிட்டே|பொறுப்பில்|பார்க்கிறார்|பார்க்கிறாங்க|கவனிக்கிறார்)|எந்த\s*துறை(?:யிடம்|கிட்ட|யின்\s*கையில்)|யாரிடம்\s*(?:இருக்கு|உள்ளது|இருக்கிறது)/u;
const WHO_HAS_TG = / (?:yaar|yaaru|yar) (?:kitta|kaila|kayila|kaiyila|handle|paakuranga|pakuranga|paakraanga)| (?:entha|endha) (?:department|dept|thurai) (?:kitta|la) /;
/**
 * The Tamil and Tanglish readings ask about the case, as the English one does (v7 review: "எந்த துறையிடம் அதிக புகார்கள் நிலுவையில் உள்ளன?",
 * "which department has the most complaints pending", re-showed the one case): about it, this or that ("இது", "இந்த சம்பவம்", "அது", "idhu",
 * "indha case"), or a bare holder question with no other subject ("யார் கையில் இருக்கு", "yaar kitta irukku").
 */
const ABOUT_IT_TA = /(?<![஀-௿])(?:இது|இதுக்கு|இதை|இதன்|இதோட|அது|அதுக்கு|அதை|அதன்|அதோட)(?![஀-௿])|(?:இந்த|அந்த)\s*(?:சம்பவ|கேஸ்|புகார்|பிரச்சினை|பிரச்சனை|மனு|வழக்கு)/u;
const ABOUT_IT_TG = / (?:idhu|idha|ithu|itha|idhai|adhu|adha|athu|atha|adhai|(?:indha|intha|andha|antha) (?:case|complaint|pugar|issue|problem|incident|one)) /;
const OTHER_NOUN = / (?:complaints?|cases|pending|most|more|adhigam|athigam|adhikam|niraya|ellam|ella|evlo|ethana|total|issues|problems) |புகார்|அதிக|நிலுவை|எல்லா|மொத்த|எத்தனை|எவ்வளவு|பிரச்சினைகள்/u;
const aboutIt = (t: string): boolean => ABOUT_IT_TA.test(t) || ABOUT_IT_TG.test(t) || (t.trim().split(" ").length <= 5 && !OTHER_NOUN.test(t));
export function whoHas(text: string, stage: { blocks: { kind: string; ids: string[] }[] } | null | undefined): Ask7 | null {
  const id = stage?.blocks.find((b) => b.kind === "CaseDetail")?.ids[0];
  if (!id) return null;
  const t = norm(text).replace(/\?/g, "");
  if (t.trim().split(" ").length > 9) return null;
  return WHO_HAS.test(t) || ((WHO_HAS_TA.test(text) || WHO_HAS_TG.test(t)) && aboutIt(t)) ?{ recipe: "case", slots: { id }, why: "who-has" } : null;
}
