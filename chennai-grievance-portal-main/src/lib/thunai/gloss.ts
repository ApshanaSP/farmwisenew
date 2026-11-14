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
  [["கூடி", "koodi"], "has risen"], [["குறைஞ்", "குறைந்"], "has fallen"], [["mosam", "mosama", "மோசம்", "மோசமா"], "bad"], [["aagala", "ஆகல"], "not done"], [["kooda", "கூட"], "with/compared to"],
  // Jarvis v4 (lane D2): the console's verbs and topics as Tanglish is spelt (Tanglish was the weakest language: 9/15 on Groq)
  [["kaatunga", "kaattunga", "kattunga", "katunga", "kaami", "kaamiga", "kami", "katu"], "show"],
  [["thira", "thora", "thiranga", "thirandhu", "thirakka", "thorandhu", "திறங்க"], "open"], [["moodu", "moodunga", "மூடு"], "close"],
  [["podu", "podunga", "போடு", "போடுங்க"], "put up/show"], [["edu", "eduthu", "edunga", "எடுத்து"], "take/get"], [["kudu", "kodu", "kudunga", "kodunga", "குடு", "கொடு", "கொடுங்க"], "give"],
  [["paaru", "paarunga", "paru", "பாரு", "பாருங்க"], "look/check"], [["sollunga", "solluga", "solra", "solreenga", "solringa", "சொல்லுங்க"], "tell"],
  [["vilakkunga", "vilakkam", "vilakkama", "vilakki", "விளக்கம்", "விளக்குங்க", "விளக்கமா"], "explain"], [["puriyala", "puriyalai", "புரியல"], "don't understand"],
  [["theriyum", "therinjudhu", "தெரியும்"], "know"], [["theriyala", "therila", "தெரியல"], "don't know"], [["irundhu", "irunthu", "lerndhu", "lerundhu", "லேர்ந்து"], "from"],
  [["vandhuchu", "vanthuchu", "vandhadhu", "வந்துச்சு", "வந்தது"], "came"], [["venum", "vendum", "வேணும்", "வேண்டும்"], "want/need"], [["venam", "vendaam", "vendam", "வேணாம்", "வேண்டாம்"], "don't/no"],
  [["illa", "illai", "இல்ல", "இல்லை"], "no/not"], [["innum", "இன்னும்"], "still/more"], [["apram", "appuram", "aprom", "அப்புறம்"], "then/after"], [["neraya", "niraya", "நிறைய"], "many"],
  [["yaaru", "யாரு"], "who"], [["edhu", "ethu"], "which one"], [["eppo", "eppodhu", "எப்போ"], "when"], [["pona", "poana"], "last/past"], [["indha", "intha", "idha", "idhu", "ithu"], "this"], [["andha", "antha", "adha", "adhu", "athu"], "that/it"],
  [["samibathula", "samibathil", "சமீபத்தில்", "சமீபத்துல"], "recently"], [["innaiki", "inaikku", "inaiku"], "today"], [["vaarathu", "vaarathula"], "week's"], [["maasathu", "maasathula"], "month's"],
  [["saakkadai", "sakkadai", "saakadai", "சாக்கடை"], "sewage/drain"], [["vadikaal", "vadikal", "வடிகால்"], "drain"], [["kalvai", "கால்வாய்"], "canal"], [["pallam", "kuzhi", "பள்ளம்", "குழி"], "pothole/pit"],
  [["maram", "மரம்"], "tree"], [["naai", "naaigal", "நாய்"], "dog"], [["kaaichal", "kaichal", "காய்ச்சல்"], "fever"], [["minsaram", "karent", "மின்சாரம்", "கரண்ட்"], "electricity"],
  [["rodu", "ரோடு", "சாலை"], "road"], [["sandai", "சண்டை"], "fight"], [["thiruttu", "திருட்டு"], "theft"], [["kudineer"], "drinking water"], [["thirai", "திரை"], "screen"], [["varaipadam", "வரைபடம்"], "map"],
  [["rendavadhu", "rendaavadhu", "irandavadhu", "rendavathu", "இரண்டாவது", "ரெண்டாவது"], "second"], [["moonavadhu", "moonaavadhu", "moonavathu", "மூணாவது", "மூன்றாவது"], "third"], [["kadaisi", "kadasi", "கடைசி"], "last"],
  [["nyabagam", "gnabagam", "ஞாபகம்"], "remember"], [["marandhudu", "maranthudu", "மறந்துடு", "மறந்துவிடு"], "forget"], [["niruthu", "nirutthu", "நிறுத்து"], "stop"], [["podhum", "போதும்"], "enough"],
  [["vechu", "vachu", "வச்சு"], "based on/using"], [["ennachu", "ennaachu", "என்னாச்சு"], "what happened"], [["la", "le", "lae"], "in"], [["ku", "kku"], "to/for"]
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
    // the object ending glued on with a hyphen ("case-a thira", "rendavadhu-a"): the word, then the ending (v4)
    const obj = lw.match(/^(.{3,}?)-(a|ai|aa|ah)$/);
    if (obj && LATIN.has(obj[1])) { hits++; return `⟨${LATIN.get(obj[1])}⟩`; }
    if (loc && LATIN.has(loc[1])) { hits++; return `⟨${LATIN.get(loc[1])}⟩ ⟨in⟩`; }
    if (loc && /-(la|le)$/i.test(w)) return `${w.replace(/-(la|le)$/i, "")} ⟨in⟩`;
    return raw;
  });
  return hits >= 2 ? out.join(" ").replace(/[⟨⟩]/g, (c) => (c === "⟨" ? "[" : "]")) : null;
}

/** words that only Tanglish uses: its grammar and its commonest verbs (an English sentence holds none of these) */
const TG_STRONG = new Set(("la le lae ku kku pannu pannunga panni pannidu kaattu kaatu kattu kaatunga kaattunga kattunga sollu sollunga solunga solra enna ennanga evlo evalo evvalavu ethana " +
  "irukku iruku irukka irukkaa irukkudhu mattum podu podunga aachu ennachu venum venam vendaam illa illai theriyum theriyala therila epdi eppadi enga engey yen endha entha " +
  "thira thora moodu maathu mathu paaru paarunga kudu kodu edu eduthu nyabagam marandhudu niruthu nirutthu podhum vechu vachu pona indha intha andha antha innum apram appuram " +
  "inniki innaiku innaikku innaiki nethu naalaiku vaaram maasam mazhai thanni kuppai pugar seithi vilakkunga vilakkam vilakkama puriyala rendavadhu moonavadhu kadaisi oppidu").split(" "));
/** a word with a Tanglish case ending glued on ("Adyarla", "Velacheryku", "policeoda") */
const TG_GLUED = /^[a-z]{4,}(?:la|lae|ku|kku|ukku|oda|ode|ulla|ilirundhu|lerndhu)$/;

/**
 * Is this Tanglish (Tamil spoken in Latin letters)? No Tamil script, and at least one word only Tanglish uses, or two words glossed: "Adyar la kuppai
 * complaints kaattu" is; "show the severe cases in Adyar" is not.
 */
export function tanglishIn(text: string): boolean {
  const s = String(text ?? "");
  if (!/[a-z]/i.test(s) || /[஀-௿]/.test(s)) return false;
  const ws = s.toLowerCase().replace(/-(la|le|ku|kku|a|ah|oda|ode|nu)\b/g, " $1").split(/[^a-z]+/).filter(Boolean);
  const strong = ws.filter((w) => TG_STRONG.has(w)).length;
  const glued = ws.filter((w) => TG_GLUED.test(w) && !/(?:ula|ala|ola|ila|ela)$/.test(w.slice(-3)) && !LATIN.has(w)).length;
  const glossed = ws.filter((w) => LATIN.has(w)).length;
  return strong >= 1 || glossed >= 2 || (glued >= 1 && glossed >= 1);
}

/** Written for this prompt (none is a test or held-out sentence): Tanglish requests and the screen each means, in the planner's own terms. */
const TANGLISH_EXAMPLES = [
  `"Perungudi la kuppai complaints kaattunga" -> cases zones [14], cat SOLID_WASTE`,
  `"indha vaaram Anna Nagar la thanni thengudhu, yen?" -> why zones [8], cat FLOOD_WATERLOGGING, period weekly`,
  `"Teynampet um Kodambakkam um compare pannunga" -> compare zones [9,10]`,
  `"pona maasam dengue epdi erangiyirukku" -> trend cat VECTOR_DISEASE, period monthly`,
  `"Alandur la current illa nu evlo complaints" -> cases zones [12], q "power cut"`,
  `"rendavadhu-a open pannu" (a Stage is open) -> stage op open n 2`
];

/**
 * What the planner should read with a Tanglish sentence: the word-by-word gloss (when there is one) and a few Tanglish examples of the screens.
 * null for a sentence that is not Tanglish, so English prompts stay as they are. The coordinator appends it to the planner's prompt (round.ts).
 */
export function tanglishHints(text: string): string | null {
  if (!tanglishIn(text)) return null;
  const g = gloss(text);
  return [
    "Tanglish (Tamil in Latin letters): the endings la/le (in), ku/kku (to), nu (that), um (and), -a (the) are grammar; the verbs kaattu/kaattunga (show), sollu (tell), pannu (do), thira (open), paaru (look) ask for a screen. Reply in Tamil script.",
    g ? `Gloss: ${g}` : "",
    `Tanglish examples: ${TANGLISH_EXAMPLES.join("; ")}`
  ].filter(Boolean).join("\n");
}
