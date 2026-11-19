/**
 * Jarvis answers its name at once: "Hi Jarvis", "Jarvis", "vanakkam Jarvis", "ஹாய் ஜார்விஸ்" get a short spoken greeting
 * straight away, with no model (a model round took seconds), so the Collector can ask the next thing. Pure.
 */
export type GreetLang = "en" | "ta";

const NAME = "(?:jarvis|jarviz|jarvish|jarwis|jervis|jarves|javis|jaarvis|thunai|ஜார்விஸ்|ஜார்விஸ|ஜார்வீஸ்|ஜாவிஸ்|துணை)";
const HELLO = "(?:hi|hii|hey|hello|helo|hai|ok|okay|yo|vanakkam|vannakam|namaste|good (?:morning|afternoon|evening|day)|ஹாய்|ஹலோ|ஹே|வணக்கம்|காலை வணக்கம்|மாலை வணக்கம்)";
const SMALL = "(?:how are you|how r u|are you there|you there|are you listening|can you hear me|epdi irukeenga|eppadi irukeenga|epdi irukinga|நலமா|எப்படி இருக்கீங்க|இருக்கீங்களா)";
const ONLY = new RegExp(`^(?:${HELLO}[\\s,.!]*)*(?:${NAME})?[\\s,.!?]*(?:${HELLO}[\\s,.!]*)?(?:${SMALL})?[\\s,.!?]*(?:${NAME})?[\\s,.!?]*$`, "i");

/** the whole sentence is a greeting or the name alone (nothing asked) */
export function isGreeting(text: string): boolean {
  const t = text.toLowerCase().normalize("NFC").replace(/[’']/g, "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 60) return false;
  if (!new RegExp(NAME, "i").test(t) && !new RegExp(`^${HELLO}`, "i").test(t)) return false;
  return ONLY.test(t);
}

const EN = ["Hello Collector, how can I help you?", "Yes, Collector. What would you like to see?", "Hello Collector. I'm listening: what do you need?"];
const TA = ["வணக்கம் கலெக்டர், என்ன உதவி வேண்டும்?", "சொல்லுங்கள் கலெக்டர், என்ன பார்க்கலாம்?", "வணக்கம் கலெக்டர். கேட்கிறேன், சொல்லுங்கள்."];

/** the greeting: by the time of day the first time in a while, then a short "yes?" so a second call is not a speech */
export function greetLine(lang: GreetLang, now = new Date(), n = 0): string {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now)) % 24;
  if (n === 0) {
    if (lang === "ta") return h < 12 ? "காலை வணக்கம் கலெக்டர், என்ன உதவி வேண்டும்?" : h < 17 ? TA[0] : "மாலை வணக்கம் கலெக்டர், என்ன உதவி வேண்டும்?";
    return h < 12 ? "Good morning, Collector. How can I help you?" : h < 17 ? "Good afternoon, Collector. How can I help you?" : "Good evening, Collector. How can I help you?";
  }
  const list = lang === "ta" ? TA : EN;
  return list[n % list.length];
}
