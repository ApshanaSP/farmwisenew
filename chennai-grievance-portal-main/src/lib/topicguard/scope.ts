/**
 * The topic guard: is a question about this product at all? District IQ answers about Chennai district's records and feeds,
 * this console and how to use it, District IQ itself, and the civic terms a Collector needs to read them. Anything else (a
 * cricketer's retirement, a film's release, a joke, homework) is declined in a fixed sentence, by every assistant: Jarvis,
 * Ask District IQ, the officer consoles, Ask the Map and the Studio analyst.
 *
 * This is the cheap code check that runs before any model. It says "out" only when a plainly off-topic subject is named
 * AND nothing in the sentence ties it to the district (traffic around Chepauk for an IPL match is in scope), and never for a
 * short follow-up inside a district thread ("and that one?"). Everything else is "in" or "unsure", and the model decides,
 * under the same rule (see rule.ts), with its verdict enforced in code.
 *
 * Pure and browser safe.
 */
import { districtNounIn, placesIn } from "@/lib/thunai/quick";
import type { World } from "@/lib/thunai/types";
import { OWN_DATA } from "@/lib/thunai/studiowords";

export type ScopeTopic = "sports" | "entertainment" | "tech" | "writing" | "trivia" | "finance" | "astrology" | "cooking" | "homework" | "politics";
export type ScopeVerdict = { verdict: "out" | "in" | "unsure"; topic: ScopeTopic | null };

/** Subjects outside the product, in English, Tamil script and Tanglish. Names here are public figures, never common first names. */
const TOPICS: [RegExp, ScopeTopic][] = [
  [/\b(ipl|cricket(ers?)?|football(ers?)?|soccer|world cup|olympics?|kabaddi|tennis|badminton|hockey|chess olympiad|grand ?prix|formula ?(1|one)|f1 race|csk|rcb|mumbai indians|dhoni|kohli|virat|sachin|tendulkar|rohit sharma|bumrah|jadeja|ravichandran ashwin|messi|ronaldo|neymar|federer|nadal|djokovic|gukesh|innings|wickets?|batting|bowling|t20s?|odis?|test match(es)?|match score|cricket score|who won the (match|game|cup|series|toss|title|final)|who will win the (match|game|cup|series|toss|title|final|tournament|ipl|world cup)|retire(d|ment)? from (cricket|football|tennis|international))\b|கிரிக்கெட்|தோனி|கோலி|ஐபிஎல்|கால்பந்து|டென்னிஸ்/i, "sports"],
  // (a film's trailer, never a trailer truck: "Broken-down trailer truck blocks Santhome" is a police record)
  [/\b(movies?|films?|cinema|songs?|lyrics|actor|actress|celebrit(y|ies)|netflix|amazon prime video|hotstar|web ?series|box office|tv shows?|bigg boss|release date|(film|movie|teaser|official) trailers?|trailer (launch|release)|rajinikanth|rajini|kamal haasan|ilaiyaraaja|a\.? ?r\.? ?rahman|anirudh|shah ?rukh|salman khan|amitabh|kollywood|bollywood|hollywood)\b|திரைப்பட|சினிமா|நடிகர்|நடிகை|பாடல் வரி|ரஜினி/i, "entertainment"],
  [/\b(python|javascript|typescript|java|c\+\+|html|css|regex|coding|programming|debug(ging)?|deep learning|machine learning|neural networks?|chatgpt|large language models?|blockchain|quantum computing|write (a |some |the )?(code|program|script|function|sql))\b/i, "tech"],
  [/\b(write|compose|tell|make|give|sing)\b.{0,20}\b(poem|poetry|story|joke|riddle|essay|song|haiku|rap|shayari|limerick)\b|\b(jokes?|poems?|riddles?|haikus?)\b|கவிதை|ஜோக்|நகைச்சுவை சொல்/i, "writing"],
  // (no "how far is": "How far is the nearest shelter from Velachery?" is a map question)
  [/\b(capital of|president of|prime minister of|who invented|who discovered|meaning of life|tallest|largest (country|planet|ocean|animal)|speed of light|boiling point|solar system|world record|richest (man|person)|seven wonders)\b/i, "trivia"],
  // (the share market, never a stock of sandbags or relief material, nor the police records' "Stock-trading app fraud")
  [/\b(stock ?(markets?|exchanges?|prices?|tips?)|stocks? to buy|(buy|sell)(ing)? (stocks?|shares)|share price|share market|sensex|nifty|bitcoin|crypto(currency)?|ethereum|mutual funds?|forex|gold rate|intraday)\b/i, "finance"],
  [/\b(horoscope|astrology|zodiac|rasi palan|palmistry|numerology|jathagam|tarot)\b|ஜாதகம்|ராசி பலன்|ராசிபலன்/i, "astrology"],
  [/\b(recipe|how to cook|cooking(?!\s*gas)|how to make (biryani|dosa|idli|cake|tea|coffee))\b|சமையல் குறிப்பு/i, "cooking"],
  // (a school's assignment and a sum, never "the assignment of my tasks" or "how can we solve this problem")
  [/\b(homework|(school|college|class) assignments?|assignment (help|answers?|questions?)|exam paper|syllabus|solve (this|the|my) (equation|maths? problem|sum)|differentiate|integrate x)\b/i, "homework"],
  [/\b(which party|vote for|election result|exit poll|opinion on (the )?(government|minister|cm|pm)|who will win (the )?(next )?(elections?|polls?))\b/i, "politics"]
];

/** Words that tie a question to the product: the district's records and feeds, the console, District IQ, a place or an event in it. */
const ANCHOR = /\b(incidents?|complaints?|grievances?|petitions?|manu|zones?|wards?|taluks?|departments?|dept|lakes?|reservoirs?|hospitals?|beds?|aqi|air quality|rain(fall)?|flood(s|ing|ed)?|waterlogg\w*|warnings?|imd|cpcb|cfm|pwd|gcc|cmwssb|tangedco|police|mandi|uzhavar|koyambedu|prices?|markets?|chennai|madras|district|collector|severe|briefing|officers?|officials?|news|stor(y|ies)|records?|dashboard|console|page|tab|panel|map|jarvis|district iq|farmwise\w*|studio|dataset|export|download|filter|traffic|congest\w*|jams?|crowds?|stampede|diversion|bandobast|security|parking|metro|bus(es)?|trains?|roads?|streets?|stadium|venue|screening|procession|rally|festival|accidents?|crimes?|fires?|drains?|garbage|water|power|dengue|cases|thefts?|robber(y|ies)|murders?|frauds?|scams?|cheat(ing|ed)?|blasts?|explosions?|cylinders?|shelters?|relief|tasks?|colou?r[- ]?cod(e|es|ed|ing)|legend|permissions?|permits?|data|files?|uploads?|uploaded|csv|excel|spread ?sheets?)\b|சம்பவ|புகார்|மண்டல|வார்டு|ஏரி|மழை|மருத்துவமனை|விலை|சென்னை|போக்குவரத்து|நெரிசல்|கூட்டம்|செய்தி|காவல்|மெட்ரோ|மனு/i;

/** A short follow-up that leans on the turn before ("and that one?", "what about there"): never declined by the code check. */
const LEANS = /^\s*(and|what about|how about|only|also|then|so|same)\b|\b(there|that|those|them|it|this one|the same)\b|அங்கே|அது|அந்த/i;
/**
 * A short sentence that asks a whole question of its own ("Who won the toss?", "When was Dhoni's retirement?", "Tell me a joke", "தோனி எப்போது
 * ஓய்வு பெற்றார்?"): not a follow-up for being short. (Review 27 Nov: with any earlier turn in the hour, the usual state of Jarvis, every such
 * question of four words or fewer skipped the code check and was sent to the model.)
 */
const STANDS = /^\s*(who|whom|whose|when|what|which|where|why|how|is|are|was|were|did|does|do|will|would|can|could|tell|write|explain|give|sing|compose|predict|recommend)\b|எப்போது|யார்|\b(eppo|yaaru|yaar)\b/i;

export function topicOf(text: string): ScopeTopic | null {
  const hit = TOPICS.find(([re]) => re.test(text));
  return hit ? hit[1] : null;
}

export function anchored(text: string, world?: World | null): boolean {
  // the Collector's own Data Studio files ("how many cricket grounds in my playgrounds data") are always theirs to ask about
  if (ANCHOR.test(text) || OWN_DATA.test(text)) return true;
  if (!world) return false;
  // a zone, a category, a district word, or one of the district's localities by name (Chepauk, Marina Beach, Triplicane: most have no zone
  // in the reference, so districtNounIn alone missed "Is there an IPL match at Chepauk today?")
  try { return districtNounIn(text, world) || placesIn(` ${text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `, world).length > 0; } catch { return false; }
}

/**
 * The code verdict on a question. "out": an off-topic subject is named, nothing ties it to the district, and it is not a
 * follow-up that leans on the turn before; decline without asking a model. "in": it is anchored and names no off-topic
 * subject. "unsure": the model decides, under the scope rule.
 */
export function scopeOf(text: string, o: { world?: World | null; follows?: boolean } = {}): ScopeVerdict {
  const t = String(text ?? "");
  const topic = topicOf(t);
  // "bitcoin price" or "share market" is not the district's prices or markets
  const anchor = anchored(topic === "finance" ? t.replace(/\b(prices?|rates?|markets?|news)\b/gi, " ") : t, o.world);
  const elliptical = !!o.follows && (LEANS.test(t) || (t.trim().split(/\s+/).length <= 4 && !STANDS.test(t)));
  if (topic && !anchor && !elliptical) return { verdict: "out", topic };
  return { verdict: topic ? "unsure" : anchor ? "in" : "unsure", topic };
}
