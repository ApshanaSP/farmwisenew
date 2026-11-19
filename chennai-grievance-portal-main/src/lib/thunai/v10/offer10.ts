/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.5 and 4.9 feature 1): after a news brief, the next steps it offered and the story it was about, kept for the
 * NEXT turn only (one pending offer, forgotten on any other turn: Thunai.tsx clears it as each sentence comes). What a reply does:
 *
 *   "yes" / "sure" / "ஆமா" / "சரி"                         the first step offered (the brief's pick)
 *   "show them on the map", "map-la kaattunga", "வரைபடத்தில் காட்டுங்க"   Ask the Map with the cases' question (the console's own askOnMap)
 *   "draft a note to the officer", "officer-ku note draft pannunga", "அதிகாரிக்கு ஒரு குறிப்பு எழுதுங்க"
 *                                                          a note on the oldest case, into the tray (level C: never sent; the Collector taps Send)
 *   "follow it", "follow pannunga", "கவனிச்சுக்கோங்க"            the story's zone followed, through the follow flow and its yes (level B)
 *   "read it fully", "full-a padinga", "முழுசா படிங்க"            the whole story (the news route, `full: true`)
 *   "what do we have on this?", "idha pathi namma kitta enna irukku?", "இதைப் பற்றி நம்மகிட்ட என்ன இருக்கு?"
 *                                                          news to ground truth: what the console holds on the story (the news route, `ground`)
 *   "no", "not now", "வேண்டாம்"                                 the offer put away
 *
 * Pure and browser-safe: no network, no React. The Tamil and Tanglish phrasings are MODEL-DRAFTED and need a Tamil speaker's review.
 */
import { fullRead } from "../newsask";
import { checkStage, type StageDocT } from "../stage";
import type { Lang } from "../types";

export type OfferKind = "map" | "draft" | "follow" | "full";
export interface Offer10 {
  /** the story's stored id */
  story: string;
  lang: Lang;
  /** the steps offered, the pick first */
  offers: OfferKind[];
  /** the question Ask the Map is asked */
  map: string | null;
  /** the case a note is drafted on */
  draft: string[];
  /** the zone followed */
  follow: { zone: number; en: string; ta: string } | null;
  /** the story names a place in the district */
  civic: boolean;
  /** when it was offered (ms) */
  at: number;
}
/** an offer older than this is no longer "the one just made" */
export const OFFER_MS = 120_000;

const ID = /^[A-Za-z0-9_:.-]{1,80}$/;
const KINDS = new Set<OfferKind>(["map", "draft", "follow", "full"]);
/** The offer an "offer" event carries (web/serve.ts), checked: anything malformed is no offer. */
export function offerOf(e: Record<string, unknown>, lang: Lang, now: number): Offer10 | null {
  if (typeof e.story !== "string" || !ID.test(e.story)) return null;
  const offers = (Array.isArray(e.offers) ? e.offers : []).filter((x): x is OfferKind => KINDS.has(x as OfferKind)).slice(0, 2);
  const map = typeof e.map === "string" && e.map.trim() && e.map.length <= 200 ? e.map.trim() : null;
  const draft = (Array.isArray(e.draft) ? e.draft : []).filter((x): x is string => typeof x === "string" && ID.test(x)).slice(0, 3);
  const f = e.follow as { zone?: unknown; en?: unknown; ta?: unknown } | null | undefined;
  const follow = f && Number.isInteger(f.zone) && Number(f.zone) >= 1 && Number(f.zone) <= 15 && typeof f.en === "string" && typeof f.ta === "string"
    ? { zone: Number(f.zone), en: f.en.slice(0, 60), ta: f.ta.slice(0, 60) } : null;
  return { story: e.story, lang, offers, map, draft, follow, civic: e.civic === true, at: now };
}

export type OfferAct =
  | { act: "map"; q: string }
  | { act: "draft"; ids: string[] }
  | { act: "follow"; zone: number; name: { en: string; ta: string } }
  | { act: "full"; id: string }
  | { act: "ground"; id: string }
  | { act: "no" }
  /** a step this story has none of ("draft a note" with no open case on it): said so */
  | { act: "none"; what: "map" | "draft" | "follow" };

const flat = (s: string) => s.normalize("NFC").toLowerCase().replace(/[’']/g, "'").replace(/[.?!,;:]+/g, " ").replace(/\s+/g, " ").trim();
const NO = /^(?:no|nope|not now|no thanks|no thank you|leave it|that's all|that's it|nothing|later|வேண்டாம்|இல்லை|இல்ல|இப்போ வேண்டாம்|இப்போது வேண்டாம்|vendaam|venaam|vendam|venam|illa|illai|parava illa|paravaillai)(?: (?:thanks|thank you|jarvis|now))*$/u;
const NEGATED = /\b(?:don't|dont|do not|no need|never)\b|வேண்டாம்|வேணாம்|\bvendaam\b|\bvenaam\b|\bvendam\b/u;
/** the offer's own question ("Shall I show them on the map, ...", "வரைபடத்தில் காட்டட்டுமா"): Jarvis's words, not the Collector's */
const OWN = /\bshall i\b|காட்டட்டுமா|செய்யட்டுமா|படிக்கட்டுமா|சொல்லட்டுமா/u;
const YES = /^(?:(?:jarvis|ok|okay)\s+)?(?:yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|please|yes please|ஆமா|ஆமாம்|ஆம்|சரி|சரிங்க|பண்ணுங்க|aama|aamam|aamaa|sari|seri|seringa|pannunga)(?:\s+(?:please|jarvis|sir|do it|go ahead|பண்ணுங்க|பண்ணு|pannu|pannunga|thanks))*$/u;
/** the map named, in any of the three languages; or a plain "show them" */
const MAP = /\bmaps?\b|\bmap-?(?:la|le|il|ula|ah|a)\b|வரைபட|மேப்/u;
const SHOW = /^(?:(?:yes|ok|okay|sure|please|jarvis)\s+)*(?:show|plot|pull up)(?: (?:it|them|those|that|these|me|me them|the area|the cases|the complaints|the place))?(?: (?:please|jarvis))*$|^(?:சரி |ஆமா )?(?:காட்டு|காட்டுங்க|காட்டுங்கள்)$|^(?:sari |aama )?(?:kaattu|kaatu|kaattunga|kaatunga)$/u;
const DRAFT = /\bdraft\b|\b(?:write|send|prepare)(?: (?:a|an|the))? (?:note|letter|mail|e-?mail|message|memo)\b|\b(?:note|letter|mail|message|memo) to (?:the )?(?:officer|ae|ee|aee|engineer|department|dept|official)\b|\b(?:officer|ae|department|dept)-?(?:ku|kku|ukku|kitta)\b.*\b(?:note|letter|mail|ezhudhu\w*|ezhuthu\w*|eluthu\w*)\b|டிராஃப்ட்|டிராப்ட்|வரைவு|குறிப்பு\s*எழுது|கடிதம்\s*எழுது|மெயில்\s*எழுது|அதிகாரிக்கு.*(?:எழுது|குறிப்பு|அனுப்பு)/u;
const FOLLOW = /^(?:(?:yes|ok|okay|sure|please|jarvis)\s+)*(?:follow|track|keep (?:an )?eye on|keep watching|watch)(?: (?:it|this|that|them|the story|this story|that story|this one|that one|the area|the zone|the place))?(?: (?:for me|please|jarvis))*$|\bfollow (?:pannu|pannunga|panni)\b|\bkavanich\w*|ஃபாலோ|பாலோ\s*பண்ண|கவனிச்சுக்|கவனியுங்க|கவனித்துக்/u;

/** "what do we have on this?": the console's records on the story just read (it must point at the story, or be short enough to) */
const GROUND_EN = /\bwhat (?:do|have|did) we (?:got|have|know|hold)\b|\bwhat have we got\b|\bdo we have (?:any(?:thing)?|complaints?|cases?|records?|incidents?|grievances?)\b|\b(?:any|are there(?: any)?) (?:open )?(?:complaints?|cases?|incidents?|grievances?)\b|\bwhat (?:does|do|did) (?:the console|our (?:data|records?|console)|the records?|the data|the dashboard) (?:say|show|have|hold)\b|\b(?:anything|what'?s|what is) (?:on|in) (?:the console|our (?:records?|data|console|side)|the dashboard)\b|\bground truth\b|\bcheck (?:it |this |that )?(?:against|with) (?:the console|our (?:records?|data))\b|\bhave (?:people|citizens|residents) complained\b/;
const DEIXIS = /\b(?:this|that|it|these|those|there|here|the story|this story|that story|the place|that place|this one|the area)\b|\bground truth\b|\b(?:the console|our (?:records?|data|console|side)|the dashboard)\b/;
const GROUND_TA = /(?:நம்ம?\s*(?:கிட்ட|கிட்டே|இடம்)|நம்மகிட்ட|நம்மிடம்|நம்மளோட|கன்சோல்(?:ல|லே|ில்)).*(?:என்ன|இருக்கா|இருக்கிறதா|உள்ளதா)|புகார்(?:கள்)?\s*(?:ஏதாவது|ஏதும்|எதுவும்)?\s*(?:இருக்கா|இருக்கிறதா|உள்ளதா|வந்திருக்கா|வந்திருக்கிறதா)/u;
const GROUND_TG = /\bnamma (?:kitta|kita|kitte|data ?la|records? ?la|console ?la)\b|\b(?:complaints?|cases?) (?:edhavadhu |ethavathu |edhachum |ethachum |ethuvum )?(?:irukka|irukaa|irukkaa|iruka|vandhirukka|vanthirukka)\b/;
export function groundAsk(raw: string): boolean {
  const t = flat(raw);
  if (!t || t.length > 200) return false;
  if (GROUND_TA.test(raw.normalize("NFC")) || GROUND_TG.test(t)) return true;
  return GROUND_EN.test(t) && (DEIXIS.test(t) || t.split(" ").length <= 6);
}

/** What a reply to the brief's offer does; null: not a reply to it (the turn goes on to the lanes, and the offer is forgotten). */
export function offerAct(raw: string, o: Offer10 | null, now: number): OfferAct | null {
  if (!o || now - o.at > OFFER_MS || now < o.at - 5000) return null;
  const t = flat(raw);
  if (!t || t.length > 200) return null;
  const nfc = raw.normalize("NFC");
  // Jarvis's own offer, heard back (the captions can catch its voice): no reply to it
  if (OWN.test(t) || OWN.test(nfc)) return null;
  if (NO.test(t)) return { act: "no" };
  const wants = fullRead(raw) ? "full" : groundAsk(raw) ? "ground" : DRAFT.test(t) || DRAFT.test(nfc) ? "draft" : MAP.test(t) || SHOW.test(t) ? "map" : FOLLOW.test(t) || FOLLOW.test(nfc) ? "follow" : YES.test(t) ? o.offers[0] ?? null : null;
  if (!wants) return null;
  // "don't draft anything", "map vendaam": put away
  if (NEGATED.test(t) || NEGATED.test(nfc)) return { act: "no" };
  if (wants === "full") return { act: "full", id: o.story };
  if (wants === "ground") return { act: "ground", id: o.story };
  if (wants === "map") return o.map ? { act: "map", q: o.map } : { act: "none", what: "map" };
  if (wants === "draft") return o.draft.length ? { act: "draft", ids: o.draft } : { act: "none", what: "draft" };
  return o.follow ? { act: "follow", zone: o.follow.zone, name: { en: o.follow.en, ta: o.follow.ta } } : { act: "none", what: "follow" };
}

/** What is said for a reply code answers itself (the map is shown, the offer put away, a step there is none of). */
export function offerSaid(a: OfferAct, lang: Lang): string | null {
  const ta = lang === "ta";
  if (a.act === "no") return ta ? "சரி." : "Okay.";
  if (a.act !== "none") return null;
  if (a.what === "draft") return ta ? "இந்தச் செய்திக்கு கன்சோலில் திறந்த புகார் எதுவும் இல்லை; அதனால் குறிப்பு வரைவு செய்ய எதுவும் இல்லை." : "There's no open case on the console for this story, so there's nothing to draft a note on.";
  if (a.what === "follow") return ta ? "இந்தச் செய்தி எந்த மண்டலம் என்று தெரியவில்லை; அதனால் கவனிக்க முடியாது." : "I can't tell which zone this story is in, so there's nothing to follow.";
  return ta ? "இந்தச் செய்தியை வரைபடத்தில் காட்ட இடம் தெரியவில்லை." : "I can't place this story on the map.";
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/**
 * News to ground truth's screen: what was said (a Note) and the open cases on the story (a CaseList, the panel the Stage already draws: "open
 * the first one" opens a case). Checked; the cases left out if they fail; null if even the note does.
 */
export function groundScreen(o: { lang: Lang; en: string[]; ta: string[]; rows: unknown; title: { en: string; ta: string }; now?: number }): StageDocT | null {
  const L = (en: string, ta: string) => (o.lang === "ta" ? ta : en);
  const said = (o.lang === "ta" ? o.ta : o.en).join(" ").trim();
  const rows = Array.isArray(o.rows) ? o.rows.slice(0, 12) : [];
  const note = { kind: "Note", id: "ground", text: clip(said || L("Nothing on the console for this story.", "இந்தச் செய்திக்கு கன்சோலில் எதுவும் இல்லை."), 400) };
  const doc = (withRows: boolean) => ({
    v: 1, id: `ground-${(o.now ?? Date.now()).toString(36)}`, recipe: "cases", title: clip(L(o.title.en, o.title.ta), 200), takeaway: null,
    say: { en: clip(o.en.join(" "), 600), ta: clip(o.ta.join(" "), 900) },
    blocks: withRows && rows.length ? [note, { kind: "CaseList", id: "ground-cases", title: L("Open cases on the console for this story", "இந்தச் செய்திக்கான கன்சோலின் திறந்த புகார்கள்"), source: "list", sev: null, total: rows.length, rows }] : [note],
    scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: { ground: true }, sources: [], asOf: null,
    notes: [L("Matched by the story's place and kind, from the console's own records; few cases may only mean few were reported.", "செய்தியின் இடம், வகை கொண்டு கன்சோலின் பதிவுகளில் பொருத்தியது; புகார் குறைவு என்றால் பிரச்சினை குறைவு என்று அர்த்தமில்லை.")],
    lang: o.lang, titles: { en: clip(o.title.en, 200), ta: clip(o.title.ta, 200) }
  });
  const a = checkStage(doc(true));
  if (a.ok) return a.doc;
  const b = checkStage(doc(false));
  return b.ok ? b.doc : null;
}
