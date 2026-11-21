/**
 * v11: small talk answered at once, with no model. The owner's log (20 Nov) had "How are you?" at 3.8 s and "எப்படி இருக்க நீ?" at
 * 4.8 s through the planner. The reference assistants answer these on the spot; Jarvis now does too, in the language it was asked in,
 * and points back at what it can do. Nothing here holds a figure. Pure (browser and server).
 */
export type SmallTalk = "howAreYou" | "thanks" | "whoAreYou" | "whatCanYouDo" | "praise" | "howYouSpeak";
export type SmallLang = "en" | "ta";

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[’']/g, "").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
/** the name, said around it ("Jarvis, how are you?"), is no part of the question */
const NAME = /\b(?:jarvis|jarviz|jervis|javis|jarves|thunai)\b|ஜார்விஸ்|ஜார்விஸ|துணை/gu;
const LEAD = /^(?:hi|hey|hello|ok|okay|so|and|vanakkam|ஹாய்|ஹலோ|வணக்கம்)\s+/u;

const SHAPES: [SmallTalk, RegExp][] = [
  ["howAreYou", /^(?:how are you(?: doing| today)?|how r u|how do you do|how are things with you|are you (?:ok|okay|fine|well)|epdi irukeenga|eppadi irukeenga|epdi irukinga|epdi iruka|eppadi irukka|எப்படி இருக்கீங்க|எப்படி இருக்கீர்கள்|எப்படி இருக்க நீ|நீ எப்படி இருக்க|எப்படி இருக்கே|எப்படி இருக்க|எப்படி இருக்கீங்களா|எப்படி போகுது|நலமா|நல்லா இருக்கியா|நல்லா இருக்கீங்களா|சௌக்கியமா)$/u],
  ["thanks", /^(?:thanks?(?: you)?(?: so much| a lot| very much)?|thank u|thx|ok thanks|okay thanks|great thanks|nandri|romba nandri|நன்றி|ரொம்ப நன்றி|மிக்க நன்றி)$/u],
  ["praise", /^(?:good job|well done|nice|super|excellent|awesome|great|great job|perfect|brilliant|semma|சூப்பர்|அருமை|நல்லது|பிரமாதம்|செம்ம)$/u],
  ["whoAreYou", /^(?:who are you|what are you|what is your name|whats your name|introduce yourself|நீ யார்|நீங்க யாரு|நீங்கள் யார்|உன் பெயர் என்ன|உங்க பேர் என்ன|nee yaaru|neenga yaaru)$/u],
  // v15 (22 Nov): "எப்படி பேசுற?" (how do you speak?) at 23:17:55 went to the planner and timed out
  ["howYouSpeak", /^(?:how do you (?:speak|talk)|how are you (?:speaking|talking)|which languages? (?:do )?you (?:speak|know|understand)|what languages? (?:do )?you (?:speak|know|understand)|do you (?:speak|understand|know) tamil|can you (?:speak|understand|talk in) tamil|எப்படி பேசுற|எப்படி பேசுறே|எப்படி பேசுறீங்க|எப்படிப் பேசுகிறாய்|எப்படி பேசுகிறீர்கள்|தமிழ் தெரியுமா|தமிழ் பேசுவியா|தமிழ்ல பேசுவியா|epdi pesura|eppadi pesura|epdi pesureenga|tamil theriyuma|tamil pesuviya)$/u],
  ["whatCanYouDo", /^(?:what can you do|what (?:all )?can you do for me|what do you do|how can you help(?: me)?|what are your (?:features|capabilities)|என்ன செய்ய முடியும்|உன்னால் என்ன செய்ய முடியும்|உங்களால என்ன பண்ண முடியும்|enna panna mudiyum|enna ellam panna mudiyum)$/u]
];

/** Which small talk the whole sentence is, or null (anything with a question about the district in it is not small talk). */
export function smallTalk(text: string): SmallTalk | null {
  let t = norm(text).replace(NAME, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) t = t.replace(LEAD, "").trim();
  if (!t || t.length > 60) return null;
  for (const [k, re] of SHAPES) if (re.test(t)) return k;
  return null;
}

const LINES: Record<SmallTalk, Record<SmallLang, string[]>> = {
  howAreYou: {
    en: ["All systems running, Collector, and the district's data is fresh. What shall we look at?", "Doing well, Collector. I'm watching the district for you. What do you need?"],
    ta: ["நன்றாக இருக்கிறேன் கலெக்டர். மாவட்டத் தரவு புதியதாக உள்ளது. என்ன பார்க்கலாம்?", "நலமாக இருக்கிறேன் கலெக்டர். மாவட்டத்தைக் கவனித்துக்கொண்டிருக்கிறேன். என்ன வேண்டும்?"]
  },
  thanks: {
    en: ["You're welcome, Collector.", "Anytime, Collector. I'm here."],
    ta: ["மகிழ்ச்சி கலெக்டர்.", "எப்போதும் தயார் கலெக்டர்."]
  },
  praise: {
    en: ["Thank you, Collector. What next?", "Glad it helps. What next, Collector?"],
    ta: ["நன்றி கலெக்டர். அடுத்து என்ன?", "உதவியதில் மகிழ்ச்சி. அடுத்து என்ன கலெக்டர்?"]
  },
  whoAreYou: {
    en: ["I'm Jarvis, your AI co-pilot for Chennai district. I read every complaint, the rain, live traffic, power, the news and the markets, and I can run this whole dashboard by voice."],
    ta: ["நான் ஜார்விஸ், சென்னை மாவட்டத்துக்கான உங்கள் AI உதவியாளர். புகார்கள், மழை, நேரடிப் போக்குவரத்து, மின்சாரம், செய்திகள், சந்தை விலைகள் எல்லாம் படிக்கிறேன்; இந்த டாஷ்போர்டை குரலிலேயே இயக்குவேன்."]
  },
  howYouSpeak: {
    en: ["I speak English and Tamil, Collector, and I follow Tanglish too. Ask me in whichever you like and I will answer in the same."],
    ta: ["நான் தமிழிலும் ஆங்கிலத்திலும் பேசுவேன் கலெக்டர்; தமிழ் கலந்த ஆங்கிலமும் புரியும். நீங்கள் எந்த மொழியில் கேட்டாலும் அதிலேயே பதில் சொல்வேன்."]
  },
  whatCanYouDo: {
    en: ["Ask me anything about the district: which zone needs you today, how the traffic or the rain is now, why complaints rose somewhere, or say show, compare or map and I'll put it on screen."],
    ta: ["மாவட்டம் பற்றி எதையும் கேளுங்கள்: இன்று எந்த மண்டலத்துக்கு கவனம் தேவை, இப்போது போக்குவரத்து, மழை எப்படி, எங்கே ஏன் புகார்கள் உயர்ந்தன. காட்டு, ஒப்பிடு, வரைபடத்தில் போடு என்று சொன்னால் திரையில் காட்டுவேன்."]
  }
};

/** The reply, in the language asked (`n` picks among the lines so a second "thanks" is not word for word the first). */
export function smallTalkLine(k: SmallTalk, lang: SmallLang, n = 0): string {
  const l = LINES[k][lang];
  return l[Math.abs(n) % l.length];
}
