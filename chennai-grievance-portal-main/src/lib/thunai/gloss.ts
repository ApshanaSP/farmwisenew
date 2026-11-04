/**
 * Thunai v3: a word-by-word English gloss of Tanglish (Tamil in Latin letters) and spoken Tamil, made by code and given
 * to the model next to the Collector's own words. The model still reads the original; the gloss only spells out the
 * words smaller models misread ("evlo" how many, "moozhgum" will go under, "ஏறியிருக்கா" has it gone up?). Tamil-script
 * words match by stem, so case endings (மழையில், புகாருக்கு) still find their word.
 */

/** [forms, English]: Latin forms match whole words; Tamil forms match a word's start (stem). */
const LEX: [string[], string][] = [
  [["evlo", "evalo", "evvalavu", "yevlo", "எவ்வளவு", "எத்தனை", "ethana", "ethanai"], "how many/how much"],
  [["irukku", "iruku", "irukka", "irukkaa", "irukkudhu", "இருக்கு", "இருக்கா", "இருக்கிறது"], "is there"],
  [["kaattu", "kaatu", "kattu", "kaminga", "காட்டு", "காமி"], "show"],
  [["sollu", "solunga", "chollu", "சொல்லு", "சொல்லுங்க"], "tell"],
  [["padi", "padinga", "படி"], "read"],
  [["mazhai", "mazha", "malai", "மழை"], "rain"],
  [["semma", "செம்ம"], "very heavy"],
  [["thanni", "thanneer", "tanni", "தண்ணி", "தண்ணீர்", "நீர்"], "water"],
  [["kuppai", "குப்பை"], "garbage"],
  [["vellam", "வெள்ளம்"], "flood"],
  [["thengudhu", "thenguthu", "nikkudhu", "nikkuthu", "தேங்கு", "நிக்குது"], "waterlogging"],
  [["moozhgum", "moozhgudhu", "muzhugum", "மூழ்கு"], "will go under (flood)"],
  [["pugar", "pugaar", "புகார்"], "complaint"],
  [["seithi", "seydhi", "seidhi", "செய்தி"], "news"],
  [["பேப்பர்", "நாளிதழ்"], "newspaper"],
  [["inniki", "innaikku", "innaiku", "inikki", "இன்னைக்கு", "இன்று", "இன்னிக்கு"], "today"],
  [["naalaiku", "naalaikku", "nalaiku", "naalai", "நாளைக்கு", "நாளை"], "tomorrow"],
  [["nethu", "nethiku", "நேத்து", "நேற்று"], "yesterday"],
  [["vaaram", "varam", "வாரம்"], "week"],
  [["maasam", "masam", "மாசம்", "மாதம்", "மாச"], "month"],
  [["yen", "ஏன்"], "why"],
  [["enna", "என்ன", "என்னென்ன"], "what"],
  [["enga", "engey", "எங்க", "எங்கே"], "where"],
  [["epdi", "eppadi", "எப்படி"], "how"],
  [["endha", "entha", "எந்த"], "which"],
  [["mudhal", "mudhalla", "mothalla", "முதல்", "முதல்ல"], "first"],
  [["adutha", "aduththa", "அடுத்த", "அடுத்தது"], "next"],
  [["romba", "ரொம்ப"], "very"],
  [["jaasthi", "jasthi", "adhigam", "athigam", "ஜாஸ்தி", "அதிகம்", "அதிக"], "more/most"],
  [["kammi", "korachal", "கம்மி", "குறைவு"], "less"],
  [["nilluvai", "நிலுவை", "பெண்டிங்"], "pending"],
  [["kadumaiyana", "kadumayana", "கடுமையான", "கடுமை"], "severe"],
  [["aspathiri", "aaspathri", "ஆஸ்பத்திரி", "மருத்துவமனை"], "hospital"],
  [["போலீஸ்", "காவல்"], "police"],
  [["eri", "yeri", "ஏரி"], "lake/reservoir"],
  [["kaathu", "kaatru", "காற்று"], "air"],
  [["vilai", "விலை"], "price"],
  [["thakkali", "தக்காளி"], "tomato"],
  [["vengayam", "வெங்காயம்"], "onion"],
  [["pannu", "pannunga", "பண்ணு"], "do"],
  [["pannanum", "pannanam", "பண்ணணும்", "செய்யணும்", "செய்ய வேண்டும்"], "should do"],
  [["தயார்"], "ready/prepare"],
  [["ippo", "ipo", "இப்போ", "இப்போது"], "now"],
  [["ellam", "ellaam", "எல்லாம்"], "all"],
  [["ottupaaru", "oppidu", "ஒப்பிட்டு", "ஒப்பிடு"], "compare"],
  [["eriyirukka", "yeriyirukka", "ஏறியிருக்கா", "ஏறியிருக்கு", "ஏறி"], "has it gone up"],
  [["erangiyirukka", "irangiyirukka", "இறங்கியிருக்கா", "இறங்கி"], "has it gone down"],
  [["kosu", "கொசு"], "mosquito"],
  [["டெங்கு"], "dengue"],
  [["மெட்ரோ வாட்டர்"], "Metro Water (CMWSSB)"],
  [["பொதுப்பணித்துறை"], "Public Works Dept (PWD)"],
  [["thee", "தீ"], "fire"],
  [["vibathu", "விபத்து"], "accident"],
  [["pakkathula", "pakkam", "பக்கத்துல", "பக்கம்", "அருகில்"], "near"],
  [["aachu", "achu", "ஆச்சு"], "happened"],
  [["vandha", "vantha", "வந்தா", "வந்தால்"], "if it comes"],
  [["mattum", "மட்டும்"], "only"],
  [["konjam", "கொஞ்சம்"], "a little/please"],
  [["neenga", "நீங்க"], "you"],
  [["naan", "நான்"], "I"],
  // English as it is said in Tamil letters: nothing in the sentence says what these are unless the model can sound them out
  [["கம்ப்ளைன்ட்", "கம்ப்ளெயின்ட்", "கம்ப்ளைண்ட்", "கம்ப்ளெயிண்ட்"], "complaint"],
  [["கேஸ்"], "case"], [["மேப்"], "map"], [["டேம்"], "dam/reservoir"], [["லேக்"], "lake"], [["ஒர்க்"], "work"], [["டீம்"], "team"],
  [["பேஜ்"], "page"], [["ஸ்கிரீன்"], "screen"], [["ரிப்போர்ட்"], "report"], [["ஸ்டேட்டஸ்"], "status"], [["லிஸ்ட்"], "list"], [["ஏரியா"], "area"],
  [["டிபார்ட்மென்ட்", "டிபார்ட்மெண்ட்"], "department"], [["ட்ரெண்ட்"], "trend"], [["டேஷ்போர்டு", "டாஷ்போர்டு"], "dashboard"], [["லெவல்"], "level"],
  [["பில்டர்"], "filter"], [["சேவ்"], "save"], [["கிலோமீட்டர்"], "kilometre"], [["ஸ்பாட்"], "spot"], [["சைடு"], "side"], [["மந்த்"], "month"],
  [["வீக்"], "week"], [["ரேட்"], "rate"], [["ஓபன்"], "open"], [["போன", "கடந்த"], "last/past"], [["நிலவரம்", "nilavaram"], "situation"],
  [["மாறு", "மாத்து", "maathu", "mathu"], "change to"], [["சுத்தி", "சுற்றி", "suthi"], "around"], [["குடிநீர்"], "drinking water"], [["பட்டியல்"], "list"],
  [["கூடி", "koodi"], "has risen"], [["குறைஞ்", "குறைந்"], "has fallen"], [["mosam", "mosama", "மோசம்", "மோசமா"], "bad"], [["aagala", "ஆகல"], "not done"], [["kooda", "கூட"], "with/compared to"]
];

const LATIN = new Map<string, string>();
const TAMIL: [string, string][] = [];
for (const [forms, en] of LEX) for (const f of forms) (/[஀-௿]/.test(f) ? TAMIL.push([f, en]) : LATIN.set(f.toLowerCase(), en));
TAMIL.sort((a, b) => b[0].length - a[0].length);

/**
 * The gloss, or null when the sentence is plain English (fewer than two words glossed). Multi-word Tamil forms
 * ("மெட்ரோ வாட்டர்") are matched first; "-la"/"-le" endings on Latin words ("Adyar-la", "mazhai-la") are read as "in".
 */
export function gloss(text: string): string | null {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  let hits = 0;
  for (const [f, en] of TAMIL.filter(([f]) => f.includes(" "))) if (t.includes(f)) { t = t.split(f).join(`⟨${en}⟩`); hits++; }
  const out = t.split(" ").map((raw) => {
    if (raw.startsWith("⟨")) return raw;
    const w = raw.replace(/^[^\p{L}]+|[^\p{L}\p{M}]+$/gu, "");
    if (!w) return raw;
    if (/[஀-௿]/.test(w)) {
      const m = TAMIL.find(([f]) => !f.includes(" ") && w.startsWith(f) && (f.length >= 2));
      if (m) { hits++; return `⟨${m[1]}⟩`; }
      return raw;
    }
    const lw = w.toLowerCase();
    const loc = lw.match(/^(.{3,}?)-?(la|le|lla|leh)$/);
    if (LATIN.has(lw)) { hits++; return `⟨${LATIN.get(lw)}⟩`; }
    if (loc && LATIN.has(loc[1])) { hits++; return `⟨${LATIN.get(loc[1])}⟩ ⟨in⟩`; }
    if (loc && /-(la|le)$/i.test(w)) return `${w.replace(/-(la|le)$/i, "")} ⟨in⟩`;
    return raw;
  });
  return hits >= 2 ? out.join(" ").replace(/[⟨⟩]/g, (c) => (c === "⟨" ? "[" : "]")) : null;
}
