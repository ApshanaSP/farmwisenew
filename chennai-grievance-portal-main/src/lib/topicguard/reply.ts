/**
 * The one sentence every assistant says when a question is outside District IQ: in English, Tamil or Tanglish, short for
 * the voice, and for an officer naming their department. Pure and browser safe.
 */
import type { ScopeTopic } from "./scope";

export type GuardLang = "en" | "ta" | "tanglish";

const TOPIC_HEAD: Record<ScopeTopic, Record<GuardLang, string>> = {
  sports: { en: "Sports are outside what I cover.", ta: "விளையாட்டு என் பணிக்கு வெளியே உள்ளது.", tanglish: "Sports en velaikku veliya." },
  entertainment: { en: "Films and celebrities are outside what I cover.", ta: "திரைப்படம், பிரபலங்கள் என் பணிக்கு வெளியே உள்ளன.", tanglish: "Movies, celebrities en velaikku veliya." },
  tech: { en: "Technology lessons and coding are outside what I cover.", ta: "தொழில்நுட்பப் பாடங்களும் நிரலாக்கமும் என் பணிக்கு வெளியே உள்ளன.", tanglish: "Tech lessons, coding en velaikku veliya." },
  writing: { en: "I don't write jokes, poems or stories.", ta: "நகைச்சுவை, கவிதை, கதை எழுத மாட்டேன்.", tanglish: "Joke, poem, story ezhudha maatten." },
  trivia: { en: "General-knowledge trivia is outside what I cover.", ta: "பொது அறிவுக் கேள்விகள் என் பணிக்கு வெளியே உள்ளன.", tanglish: "General knowledge kelvigal en velaikku veliya." },
  finance: { en: "Shares, the stock market and crypto are outside what I cover.", ta: "பங்குச் சந்தை, கிரிப்டோ என் பணிக்கு வெளியே உள்ளன.", tanglish: "Share market, crypto en velaikku veliya." },
  astrology: { en: "Horoscopes are outside what I cover.", ta: "ஜாதகம், ராசிபலன் என் பணிக்கு வெளியே உள்ளன.", tanglish: "Horoscope, rasi palan en velaikku veliya." },
  cooking: { en: "Recipes are outside what I cover.", ta: "சமையல் குறிப்புகள் என் பணிக்கு வெளியே உள்ளன.", tanglish: "Recipes en velaikku veliya." },
  homework: { en: "Homework and exam questions are outside what I cover.", ta: "வீட்டுப்பாடம், தேர்வுக் கேள்விகள் என் பணிக்கு வெளியே உள்ளன.", tanglish: "Homework, exam kelvigal en velaikku veliya." },
  politics: { en: "I don't give political opinions.", ta: "அரசியல் கருத்துகள் சொல்ல மாட்டேன்.", tanglish: "Political opinion solla maatten." }
};

const SORRY: Record<GuardLang, string> = {
  en: "Sorry, that is outside what I cover.",
  ta: "மன்னிக்கவும், அது என் பணிக்கு வெளியே உள்ளது.",
  tanglish: "Sorry, adhu en velaikku veliya."
};

const COVERS: Record<GuardLang, string> = {
  en: "I answer about Chennai district from this console: complaints and incidents, news, rain, lakes and IMD warnings, air quality, traffic, prices, hospitals, departments, your Data Studio files, and how to use these pages.",
  ta: "சென்னை மாவட்டத்தைப் பற்றிக் கேளுங்கள்: புகார்கள், சம்பவங்கள், செய்திகள், மழை, ஏரிகள், காற்றின் தரம், போக்குவரத்து, விலைகள், துறைகள், அல்லது இந்தத் தளத்தை எப்படிப் பயன்படுத்துவது.",
  tanglish: "Chennai district pathi kelunga: complaints, incidents, news, mazhai, lakes, air quality, traffic, prices, departments, illa indha site-a eppadi use panradhu."
};

const COVERS_VOICE: Record<GuardLang, string> = {
  en: "Ask me about Chennai district: complaints and incidents, news, rain and lakes, air quality, traffic, prices or departments.",
  ta: "சென்னை மாவட்டத்தைப் பற்றிக் கேளுங்கள்: புகார்கள், சம்பவங்கள், செய்திகள், மழை, ஏரிகள், காற்றின் தரம், போக்குவரத்து, விலைகள், துறைகள்.",
  tanglish: "Chennai district pathi kelunga: complaints, incidents, news, mazhai, lakes, air quality, traffic, prices, departments."
};

const COVERS_DEPT: Record<GuardLang, (d: string) => string> = {
  en: (d) => `I answer about ${d}'s records on this console: its complaints and incidents, places, deadlines and officers, and how to use these pages.`,
  ta: (d) => `இந்தக் கன்சோலில் ${d} துறையின் பதிவுகளைப் பற்றி மட்டுமே சொல்ல முடியும்: புகார்கள், சம்பவங்கள், இடங்கள், காலக்கெடு, அதிகாரிகள்.`,
  tanglish: (d) => `Indha console-la ${d} records pathi mattum solluven: complaints, incidents, places, deadlines, officers.`
};

export function guardLang(l: string | null | undefined): GuardLang {
  return l === "ta" ? "ta" : l === "tanglish" ? "tanglish" : "en";
}

/** The headline of a decline: the topic understood, or the general sentence. */
export function offTopicHead(lang: string | null | undefined, topic?: ScopeTopic | null): string {
  const g = guardLang(lang);
  return topic && TOPIC_HEAD[topic] ? TOPIC_HEAD[topic][g] : SORRY[g];
}

/** What the assistant covers, once, under the decline (the officer's department when locked). */
export function offTopicCovers(lang: string | null | undefined, o: { dept?: string | null; voice?: boolean } = {}): string {
  const g = guardLang(lang);
  if (o.dept) return COVERS_DEPT[g](o.dept);
  return o.voice ? COVERS_VOICE[g] : COVERS[g];
}

/**
 * The whole decline, as said or shown: "Sorry, that is outside what I cover. Ask me about Chennai district: ...". Shown (not voice) with a
 * topic, the topic's line leads instead ("Sports are outside what I cover. I answer about ..."); by voice it is always the short general line.
 */
export function offTopicReply(lang: string | null | undefined, o: { topic?: ScopeTopic | null; dept?: string | null; voice?: boolean } = {}): string {
  const g = guardLang(lang);
  const head = !o.voice && o.topic && TOPIC_HEAD[o.topic] ? TOPIC_HEAD[o.topic][g] : SORRY[g];
  return `${head} ${offTopicCovers(g, o)}`;
}
