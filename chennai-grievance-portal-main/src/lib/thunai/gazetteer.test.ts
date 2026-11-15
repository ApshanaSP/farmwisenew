/**
 * Jarvis v5 B3 (JARVIS_V5_BUILD_2 section 8, Phase 6): the gazetteer corrector, JARVIS_GAZETTEER=1, default off.
 * Every sentence and misspelling here is invented for the test; no transcript of anyone.
 *   - the two invented misspellings are fixed: "Udyar" -> Adyar, "Vela Cherry" -> Velachery (and two Tamil-script ones);
 *   - a list of ordinary English, Tanglish and Tamil words comes back unchanged: each word alone, the list as one sentence,
 *     and every ordered pair of the Latin words (so no two ordinary words are ever merged into a name);
 *   - digits and number words are never touched, and never merged into a name;
 *   - stt.ts: flag off (unset or 0), the transcript is exactly Whisper's; flag on, the name is fixed and telemetry holds
 *     counts only, never a word.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { resetLedger } from "./ledger";
import { correctNames, gazetteerOn } from "./gazetteer";
import { hearUtterance } from "./stt";

/** ordinary English words: the console's own nouns and verbs, function words, and words that sit near a place name by sound */
const ENGLISH = ("the a an and or but if then so to of in on at by for from with about into over under after before between around near inside outside " +
  "above below through during without within along across behind beside show me tell give open close map zone ward area road street drain drains water flood " +
  "floods flooding rain rainfall garbage waste complaint complaints case cases report status update today yesterday tomorrow week month year morning " +
  "evening night please sir madam what where when which who how many much more less most least high low severe critical urgent pending closed " +
  "resolved new old latest recent police hospital school college office department board corporation district collector officer engineer contractor " +
  "mosquito dengue fever health power light lights tree trees park beach river lake canal bridge flyover signal traffic accident accidents parking bus " +
  "train metro station airport market shop price prices vegetable onion tomato rice milk people citizen family house building wall roof gate door " +
  "window ready already again also only just still even very really quickly slowly early late number total average percent compare versus against " +
  "filter sort list table chart graph page screen button draft letter email message note remind remember save pin export download print share " +
  "explain summary briefing overview trends environment studio weather cyclone storm warning alert alerts reservoir level levels pump motor " +
  "adder ardor dear year cherry valley manual money media mango ignore aider odour udder radar viper vapor poor pour windy honey medal metal " +
  "pallet palace annual manner marina pearl purple pepper paper better butter matter mother father brother sister daughter garden harbour " +
  "temple church mosque village city town country state nation world").split(" ");

/** ordinary Tanglish words (Tamil said in English letters), including near-sounds of place names: manal (sand), gundu, kottu */
const TANGLISH = ("enna epdi eppadi enga inga anga inniki innaiku naalaikku nethu ippo appo romba konjam illa illai irukku irukka iruku sollu sollunga " +
  "kaattu kaatu paaru paarunga pannu pannunga podu kudu kodu vaa po vendaam venum theriyum theriyuma aachu aagudhu nadandhuchu vandhuchu pochu " +
  "mazhai thanni vellam kuppai saakkadai theru vilakku kosu kaaichal maram veedu kadai pakkam kitta oda mela keezha ulla veliya munnadi pinnadi " +
  "pakkathula ellam ellaam ovvoru evlo evvalavu yaaru edhu idhu adhu indha andha nalla mosam periya chinna pudhu palaya vaaram maasam naal neram " +
  "velai vela ooru oor nagaram manal kulam eri paalam saalai thirumbi marubadiyum seekiram mella sari seri aama thaan dhaan kooda mattum " +
  "ellarum namma unga avanga ivanga neenga naan nee avan aval adhikaari pugaar pugar nilavaram nilamai thagaval seithi vilai kaaikari arisi " +
  "paal maruthuvamanai palli kalloori kaaval kaavalar thurai vaariyam gundu kottu pudhusa ponga vaanga sapadu saapadu thanni-a kelunga " +
  "paathukko paathu nilaimai aiyo ayyo dei machan").split(" ");

/** ordinary Tamil words in Tamil script, including மணல் (sand), a near-sound of மணலி */
const TAMIL = ("மழை தண்ணீர் வெள்ளம் குப்பை சாலை தெரு வீடு கடை பள்ளி புகார் நிலவரம் இன்று நாளை நேற்று என்ன எங்கே எப்படி எவ்வளவு காட்டு " +
  "சொல்லு பாரு இருக்கு இல்லை வேண்டாம் மணல் குளம் ஏரி பாலம் மரம் கொசு காய்ச்சல் வேலை ஊர் நகரம் விலை அரிசி பால் மருத்துவமனை " +
  "காவலர் துறை வாரியம் அதிகாரி மக்கள் தகவல் செய்தி கால்வாய் மின்சாரம் விளக்கு நாய் போக்குவரத்து").split(" ");

const unchanged = (s: string) => { const r = correctNames(s); expect(r.text, s).toBe(s); expect(r.fixed, s).toBe(0); };

describe("B3: the gazetteer fixes a misheard place name", () => {
  it("the invented misspellings are fixed: Udyar -> Adyar, Vela Cherry -> Velachery", () => {
    expect(correctNames("Udyar").text).toBe("Adyar");
    expect(correctNames("show me the severe cases in Udyar this week").text).toBe("show me the severe cases in Adyar this week");
    expect(correctNames("flooding in Vela Cherry today").text).toBe("flooding in Velachery today");
    expect(correctNames("Vela Cherry, Udyar.").text).toBe("Velachery, Adyar.");
    const r = correctNames("Udyar and Vela Cherry status");
    expect(r).toMatchObject({ text: "Adyar and Velachery status", fixed: 2 });
  });
  it("Tamil script: a confusable letter or a dropped vowel sign in a name is fixed to the lexicon's spelling", () => {
    // வேலச்சேரி (ல for ள) -> வேளச்சேரி; அடயாறு (no ை) -> அடையாறு
    expect(correctNames("வேலச்சேரி நிலவரம்").text).toBe("வேளச்சேரி நிலவரம்");
    expect(correctNames("அடயாறு புகார்கள்").text).toBe("அடையாறு புகார்கள்");
  });
  it("a name already spelt right, in either script, with or without a case ending, is left as it is", () => {
    for (const s of ["Adyar", "Adayar zone", "Velachery", "Anna Nagar", "Thiruvika Nagar", "Sholinganallur", "Adyarla", "அடையாறு", "அடையாற்றில்", "மணலியில்", "அண்ணா நகர்", "Red Hills", "Metro Water", "CMWSSB"]) unchanged(s);
  });
});

describe("B3: ordinary words are never 'fixed'", () => {
  it(`the list (${ENGLISH.length} English, ${TANGLISH.length} Tanglish, ${TAMIL.length} Tamil words) is long enough`, () => {
    expect(ENGLISH.length + TANGLISH.length).toBeGreaterThanOrEqual(200);
  });
  it("each word alone comes back unchanged, in lower case and capitalised", () => {
    for (const w of [...ENGLISH, ...TANGLISH, ...TAMIL]) { unchanged(w); unchanged(w.charAt(0).toUpperCase() + w.slice(1)); }
  });
  it("the whole list as one sentence comes back unchanged", () => {
    unchanged(ENGLISH.join(" "));
    unchanged(TANGLISH.join(" "));
    unchanged(TAMIL.join(" "));
    unchanged([...ENGLISH, ...TANGLISH].reverse().join(" "));
  });
  it("every ordered pair of the Latin words comes back unchanged (no two ordinary words merge into a name), but the brief's own 'vela cherry'", () => {
    // "vela" (Tanglish, work) and "cherry" are each in the lists, so their pair is the invented misspelling the brief requires fixed:
    // it must be the one and only pair of the 70,000+ that changes
    const latin = [...ENGLISH, ...TANGLISH];
    const changed: string[] = [];
    for (const a of latin) for (const b of latin) { const s = `${a} ${b}`, r = correctNames(s); if (r.text !== s) changed.push(`${s} -> ${r.text}`); }
    expect(changed).toEqual(["vela cherry -> Velachery"]);
  });
  it("every ordered pair of the Tamil words comes back unchanged", () => {
    const bad: string[] = [];
    for (const a of TAMIL) for (const b of TAMIL) { const s = `${a} ${b}`; if (correctNames(s).text !== s) bad.push(s); }
    expect(bad).toEqual([]);
  });
});

describe("B3: digits and number words are never touched", () => {
  const NUMBERS = ["13", "45", "2026", "4th", "15th", "௧௩", "one", "seven", "thirteen", "fifteenth", "twenty", "fifty", "hundred", "thousand", "lakh", "crore",
    "onnu", "rendu", "moonu", "naalu", "anju", "aaru", "ezhu", "ettu", "ombodhu", "pathu", "padhinanju", "nooru", "aayiram",
    "ஒன்று", "ரெண்டு", "ஏழு", "ஆறு", "பதினைந்து", "நூறு", "ஆயிரம்"];
  it("each number alone, and the lot as one sentence, comes back unchanged", () => {
    for (const n of NUMBERS) unchanged(n);
    unchanged(NUMBERS.join(" "));
  });
  it("beside a misheard name, the name is fixed and the number is left exactly as it was (never merged into the name)", () => {
    expect(correctNames("Udyar zone 13 has 45 complaints").text).toBe("Adyar zone 13 has 45 complaints");
    expect(correctNames("Udyar ezhu").text).toBe("Adyar ezhu");
    expect(correctNames("ezhu Udyar").text).toBe("ezhu Adyar");
    expect(correctNames("zone 13 Udyar").text).toBe("zone 13 Adyar");
    for (const n of NUMBERS) {
      expect(correctNames(`Vela ${n}`).text).toBe(`Vela ${n}`);
      expect(correctNames(`${n} Cherry`).text).toBe(`${n} Cherry`);
    }
  });
});

describe("B3: stt.ts calls the corrector after the decode, only with JARVIS_GAZETTEER=1", () => {
  let dir: string;
  const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
  /** a fake Groq: the English decode hears the invented misspelling, sure of it; the Tamil one is unsure */
  const fetcher = (async (_u: string, init: RequestInit) => {
    const en = (init.body as FormData).get("language") === "en";
    return new Response(JSON.stringify({ text: en ? "show me Udyar and Vela Cherry status" : "ஷோ மீ", duration: 1, segments: [{ avg_logprob: en ? -0.1 : -1.4, no_speech_prob: 0.01, compression_ratio: 1.2 }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const rows = () => { const f = path.join(dir, "telemetry.ndjson"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : []; };
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv-gaz-")); vi.stubEnv("THUNAI_DIR", dir); vi.stubEnv("GROQ_API_KEY", "x"); resetLedger(); });
  afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

  it("flag off (unset): the transcript is exactly Whisper's, and no gazetteer telemetry is written", async () => {
    vi.stubEnv("JARVIS_GAZETTEER", "");
    expect(gazetteerOn()).toBe(false);
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher });
    expect(h.text).toBe("show me Udyar and Vela Cherry status");
    expect(rows().some((r) => String(r.event).startsWith("gazetteer"))).toBe(false);
  });
  it("flag off (0): the transcript is exactly Whisper's", async () => {
    vi.stubEnv("JARVIS_GAZETTEER", "0");
    expect(gazetteerOn()).toBe(false);
    expect((await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher })).text).toBe("show me Udyar and Vela Cherry status");
  });
  it("flag on: the names are fixed, and telemetry holds the counts of fixed and unfixed only, never a word", async () => {
    vi.stubEnv("JARVIS_GAZETTEER", "1");
    expect(gazetteerOn()).toBe(true);
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher });
    expect(h).toMatchObject({ text: "show me Adyar and Velachery status", lang: "en", noise: false });
    const g = rows().filter((r) => r.event === "gazetteer");
    expect(g.find((r) => r.kind === "fixed")?.count).toBe(2);
    expect(typeof g.find((r) => r.kind === "unfixed")?.count).toBe("number");
    const values = rows().flatMap((r) => Object.values(r)).map(String).join(" ").toLowerCase();
    for (const w of ["udyar", "adyar", "vela", "cherry", "velachery", "show me"]) expect(values).not.toContain(w);
  });
});
