/**
 * A report of the console's own, not the press: an officer's, an action-taken, a weekly, monthly or daily one, the rain's, a status or progress
 * one, mine or ours, a zone's or a ward's, a department's (v7's newsask OWN_REPORT and v8's news8, the review of 18 Nov).
 *
 * v10 review 2, round 2 (news-12): v10 made ரிப்போர்ட் (the English "report" in Tamil letters) a news word, and the console's own reports said that
 * way became news finds ("மழை ரிப்போர்ட் காட்டுங்க" read a cyclone story; "இந்த வார ரிப்போர்ட் காட்டுங்க" searched the news for "vara"). The same
 * qualifiers in all three ways the Collector says them: English, Tanglish ("mazhai report", "indha vaara report", "ennoda report") and Tamil
 * letters before ரிப்போர்ட் or அறிக்கை with any ending (மழை ரிப்போர்ட்டை, வாராந்திர அறிக்கை, அதிகாரியின் அறிக்கை). Pure, no imports: v7's
 * reader (newsask.ts) and v8's news lane (news8.ts) both ask it.
 */
const EN = "officer'?s?|officers'?|action[- ]taken|atr|status|progress|weekly|monthly|daily|quarterly|annual|inspection|field|audit|my|our|department'?s?|dept|zone|ward|sla|" +
  "incident|police|fir|rainfall|rain|situation|briefing|brief|summary|performance|collector'?s?";
/** Tanglish: the week's, the month's, daily, the rain's, mine, ours, an officer's, the situation's, a zone's, today's, yesterday's */
const TG = "mazhai|mazha|vaara|vaaram|vaarathu|vaarathoda|varam|maadha|maadhaandhira|maasa|maasam|maasathu|matha|thinasari|dhinasari|ennoda|en|enga|engaloda|engal|namma|" +
  "nammoda|adhikari|athikari|adhigari|nilavaram|nilamai|mandala|innaiku|inniku|indraiya|nethu|netru|nethaiya";
/** v10 review 2, round 3: "report" as the verb, "nethu report aana news" (the news reported yesterday), "report pannina": the press's, not the console's */
// (only "that was reported": "weekly report aachu?" and "mazhai report panna sollunga" are still the console's own)
const TG_VERB = "aana|aanadhu|aanathu|pannina|pannuna|pannappatta";
const OWN_EN = new RegExp(String.raw`\b(?:${EN}|${TG}) reports?\b(?!\s+(?:${TG_VERB})\b)`, "i");
/** Tamil letters: the qualifier as a word of its own (with a case ending or the sandhi consonant), then the report */
const TA = "வார|வாராந்திர|வாரந்திர|வாரத்து|வாரத்தோட|மாத|மாதாந்திர|மாசத்து|தினசரி|டெய்லி|வீக்லி|மந்த்லி|இன்றைய|இன்னைக்கு|நேற்றைய|நேத்து|மழை|மழைக்கால|மழையளவு|" +
  "ஆபீசர்|ஆஃபீசர்|அதிகாரி|அதிகாரிகள்|ஸ்டேட்டஸ்|நிலவர|நிலை|ப்ராக்ரஸ்|முன்னேற்ற|என்|என்னோட|என்னுடைய|எங்க|எங்களோட|எங்கள்|நம்ம|நம்முடைய|மண்டல|ஜோன்|சோன்|" +
  "வார்டு|ஏடிஆர்|இன்ஸ்பெக்ஷன்|ஃபீல்டு|ஆடிட்|தணிக்கை|சம்மரி|பிரீஃபிங்|ப்ரீஃபிங்|டிபார்ட்மென்ட்|துறை|கலெக்டர்|ஆட்சியர்|போலீஸ்|காவல்துறை|எஃப்ஐஆர்";
// (round 3: not the verb, ரிப்போர்ட் ஆன, ரிப்போர்ட்டான, ரிப்போர்ட் பண்ணின: "இன்னைக்கு ரிப்போர்ட் ஆன பள்ளிக்கரணை செய்தி" is today's press)
const OWN_TA = new RegExp(String.raw`(?:^|\s)(?:${TA})(?:ின்|யின்|த்து|த்தின்|ோட|ுடைய|ப்|க்|ச்|த்)?\s*(?:ரிப்போர்ட|அறிக்கை)(?!்\s*(?:ஆன|பண்ணின|பண்ணுன|செய்யப்பட்ட|செய்த(?=\s|$))|்டான)`, "u");

/** Does the sentence ask for a report of the console's own (in English, Tanglish or Tamil letters)? */
export const ownReport = (text: string): boolean => {
  const t = text.normalize("NFC");
  return OWN_EN.test(t) || OWN_TA.test(t);
};
