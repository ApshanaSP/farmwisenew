/**
 * v10 (docs/jarvis/JARVIS_V10.md Part 8, RESULTS v9 "Where v9 still misses" 1): "நியூஸ்" is the Tamil-script "news" Whisper writes, and it was
 * no news word: "புழல் ஜெயில் நியூஸ் படிங்க" made no news request at all (six of v9's blind Tamil requests). The other loanwords a Tamil speaker
 * says for the press too (ஆர்டிகிள், ஹெட்லைன், ஸ்டோரி, ரிப்போர்ட், பேப்பர்). Failing first on v9's news8.ts.
 */
import { describe, expect, it } from "vitest";
import { newsRequest, pickStory, rankStories, SOFT_FLOOR, topicWords } from "../v8/news8";
import { newsLane8 } from "../v8/browser";
import { newsAsk } from "../newsask";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";

const stories = [
  { id: "a", title: "Bid to smuggle drugs into Puzhal jail, two held" },
  { id: "b", title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai on November 23, 24" },
  { id: "c", title: "CHENNAI: RESIDENTS STAGE EMPTY-POT PROTEST OVER FOUR-MONTH WATER SHORTAGE IN KODUNGAIYUR" },
  { id: "d", title: "Health Department and Rotary Club of Madras partner to take forward HPV vaccination" }
];
const pick = (said: string) => {
  const r = newsRequest(said);
  return r ? pickStory(rankStories(r, stories)).pick?.id ?? null : null;
};

describe("v10: the Tamil-script loanwords for the news are news words", () => {
  it.each([
    ["புழல் ஜெயில் நியூஸ் படிங்க", "a"],
    ["புழல் ஜெயில் நியூஸை படிங்க", "a"],
    ["கொடுங்கையூர் போராட்டம் நியூஸ் காட்டுங்க", "c"],
    ["அக்வான் புயல் நியூஸ் சொல்லுங்க", "b"],
    ["HPV தடுப்பூசி நியூஸ்ஸ படிங்க", "d"]
  ])("%s -> a story request that finds %s", (said, id) => {
    expect(newsRequest(said)).not.toBeNull();
    expect(pick(said)).toBe(id);
  });

  it("the loanword is no topic word itself", () => {
    expect(topicWords("புழல் ஜெயில் நியூஸ் படிங்க", null)).not.toContain("niyus");
    expect(topicWords("புழல் ஜெயில் நியூஸ்ல என்ன இருக்கு", null)).not.toContain("niyusla");
  });

  it.each([
    ["மழை பத்தி என்ன நியூஸ் இருக்கு?"],
    ["புயல் பத்தி ஏதாவது நியூஸ் இருக்கா"],
    ["கொடுங்கையூர் பத்தி நியூஸ்ல என்ன வந்திருக்கு"]
  ])("a Tamil news question with நியூஸ்: %s", (said) => {
    const r = newsRequest(said);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("ask");
  });

  it.each([["ஹெட்லைன்ஸ் படிங்க"], ["நியூஸ் படிங்க"], ["நியூஸ் பேனல் திறங்க"]])("the news with no topic is no story request: %s", (said) => {
    expect(newsRequest(said)).toBeNull();
  });
});

describe("v10: a long English word is never matched by its consonants alone (the real store, 19 Nov)", () => {
  it("'volcano' is not வழக்கின் (of the case): both are v-l-k-n", () => {
    const items = [{ id: "per", title: "பெரியார் அறிவுலக ஊழல்! திமுக வழக்கின் விசாரணை ஒத்திவைப்பு!", titleEn: "Periyar World corruption! DMK case hearing adjourned!", place: "Chennai" }];
    const r = newsRequest("Is there any news about a volcano in Chennai?")!;
    const ranked = rankStories(r, items);
    expect(ranked[0].hits).toBeLessThan(2);
    expect(pickStory(ranked, "en").pick).toBeNull();
  });
  it("a by-ear form still is ('suprim' for Supreme), and a short word across scripts ('court' for கோர்ட்)", () => {
    expect(pickStory(rankStories(newsRequest("open the suprim court news")!, [{ id: "sc", title: "Supreme Court stays the construction ban" }])).pick?.id).toBe("sc");
    expect(rankStories(newsRequest("court news padinga")!, [{ id: "k", title: "கோர்ட் உத்தரவு: கட்டுமானத் தடை" }])[0].hits).toBeGreaterThan(0);
  });
});

describe("v10: two stories as close, the one in the request's language", () => {
  it("an English request about Cyclone Akvan reads an English report when a Tamil one scores as close (the dry replay, 19 Nov)", () => {
    const items = [
      { id: "ta1", title: "அக்வான் புயல் எதிரொலி திருவொற்றியூர், எண்ணூரில் கடல் சீற்றம்", titleEn: "Akvan cyclone effect: rough sea at Thiruvottiyur, Ennore", t: "2026-11-19 12:00" },
      { id: "en1", title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai on November 23, 24", t: "2026-11-19 11:36" }
    ];
    const r = newsRequest("tell me the news about cyclone akvan");
    expect(r).not.toBeNull();
    expect(pickStory(rankStories(r!, items), "en").pick?.id).toBe("en1");
    expect(pickStory(rankStories(newsRequest("அக்வான் புயல் செய்தி படிங்க")!, items), "ta").pick?.id).toBe("ta1");
  });
});

describe("v10: spoken Tamil about a story (news9, the dry run of 19 Nov: v10 said 'nothing' where the store has it)", () => {
  // the 19 Nov store's own headlines (public), among 40 about nothing asked here
  const FILL = ["Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
    "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
    "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
    "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
    "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
    "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
    "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
    "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
    "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised",
    "Metro rail work: traffic diversions on Poonamallee High Road", "Chennai Corporation to install 500 new streetlights"].map((title, i) => ({ id: `f${i}`, title }));
  const week = [
    { id: "pz1", title: "Bid to smuggle drugs into Puzhal jail, two held" },
    { id: "pz2", title: "Two women arrested for supplying drugs to Puzhal prison inmate" },
    { id: "pz3", title: "மூன்றாம் முறையாக புழல் சிறையில் மகேஷூடன் உதயநிதி சந்திப்பு", titleEn: "Udhayanidhi meets Mahesh in Puzhal prison for the third time" },
    { id: "sp1", title: "12 லட்சம் மரக்கன்றுகள்..! சென்னையின் பசுமைப் பரப்பை அதிகரிக்க மாநகராட்சி நடவடிக்கை..!", titleEn: "12 lakh saplings! Municipal action to increase green cover in Chennai!" },
    { id: "sp2", title: "மணலி மண்டலத்தில் 1.30 லட்சம் மரக்கன்றுகள் நடும் பணி: இணை ஆணையாளர் கற்பகம் ஆய்வு", titleEn: "Planting of 130,000 saplings in the Manali region: Joint Commissioner Karpagam inspects" },
    ...FILL];
  const found = (said: string) => { const r = newsRequest(said); return r ? pickStory(rankStories(r, week)).pick?.id ?? null : null; };
  it("'புழல் ஜெயிலுக்குள்ள போதை மருந்து கடத்தப் பாத்தாங்களே': the jail with its ending, the drug, the smuggling, a spoken verb", () => {
    expect(found("ஜார்விஸ், புழல் ஜெயிலுக்குள்ள போதை மருந்து கடத்தப் பாத்தாங்களே, அந்த நியூஸ படிங்க.")).toBe("pz1");
  });
  it("'மரக்கன்னு நடுறது': saplings planted", () => {
    expect(["sp1", "sp2"]).toContain(found("ஜார்விஸ், மரக்கன்னு நடுறது பத்தி ஏதாவது நியூஸ் இருக்கா?"));
  });
});

describe("v10: a story that has only the request's place is not its story (v8's dev d-out-2 after the review's fixes, the store of 20 Nov)", () => {
  const FILL2 = ["Gold rate today: 24K, 22K and 18K prices across Delhi, Kerala, Chennai and other cities", "Flood-prone areas to be monitored using drones in Chennai",
    "Metro rail work: traffic diversions on Poonamallee High Road", "Chennai Corporation to install 500 new streetlights", "School students visit the planetarium",
    "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds", "Free eye camp held for senior citizens", "Marathon to be held on Sunday",
    "Lake restoration work begins", "Vegetable prices fall at Koyambedu market", "Adyar residents complain of irregular water supply",
    // (as in the real week: "flood" in several stories, so the request's place word weighs more than its event word)
    "Flood relief kits handed out in Velachery", "Flood water drains out of Mudichur", "Officials review flood preparedness in Chennai", "Dietary advice from staff nurses help in blood sugar control",
    ...Array.from({ length: 60 }, (_, i) => `Civic notice number ${i} about ${["parks", "schools", "markets", "libraries", "buses", "ration"][i % 6]}`)].map((title, i) => ({ id: `k${i}`, title }));
  const found = (said: string) => { const r = newsRequest(said); return r ? pickStory(rankStories(r, FILL2)).pick?.id ?? null : null; };
  it("'Any news on the Kerala floods?': the gold-rate story says Kerala, never the floods: nothing is read", () => {
    expect(found("Any news on the Kerala floods?")).toBeNull();
  });
  it("a place alone is still found ('Any news on Kerala?')", () => {
    expect(found("Any news on Kerala?")).toBe("k0");
  });
  it("'any news on the Adyar fire?' is not the Adyar water story", () => {
    expect(found("Any news on the Adyar fire?")).toBeNull();
  });
});

describe("v10: 'திருட்டு போனது' (got stolen): போனது is no topic word (news9 n9-newsAsk-11, the store of 20 Nov: a Pondy Bazaar story read for a temple theft)", () => {
  it("the topic words are the temple and the theft", () => {
    expect(topicWords("கோயில்ல திருட்டு போனது பத்தி ஏதாவது நியூஸ்?", null)).not.toContain("ponatu");
    expect(topicWords("போன வாரம் கோயில்ல திருட்டு நியூஸ் சொல்லுங்க", null)).not.toContain("pona");
  });
  it("the temple story, never the Pondy Bazaar one", () => {
    const items = [{ id: "pb", title: "உலகையே திரும்பிப் பார்க்க வைத்த பாண்டி பஜார்!அண்ணா நகர்!" },
      { id: "tm", title: "சென்னை வடபழனி முருகன் கோவிலில் மாக கந்த சஷ்டி பெருவிழாவில் இறுதி நிகழ்வான திருக்கல்யாண வைபவம் நடந்தது.", titleEn: "Final event of the grand Kanda Shasti festival held at Murugan Temple in Vadapalani" },
      { id: "th", title: "சென்னையில் 24 இடங்களில் மின் திருட்டு: ரூ.52.77 லட்சம் அபராதம்" },
      ...Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, title: `Civic notice number ${i} about ${["parks", "schools", "markets", "libraries"][i % 4]}` }))];
    const r = newsRequest("கோயில்ல திருட்டு போனது பத்தி ஏதாவது நியூஸ்?")!;
    expect(pickStory(rankStories(r, items)).pick?.id).not.toBe("pb");
  });
});

// ---- v10 dev2 (the fresh development set written blind to the code, 20 Nov): each miss as a failing test first, with variants of its own
// the 19-20 Nov store's own headlines (public), as fillers among the stories asked for
const DEV2_FILL = ["Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Cricket academy opens new nets",
  "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours", "Traffic police launch helmet awareness drive",
  "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala", "Housing board allots flats",
  "கிழக்குக் காற்று வருகை: இந்த முறை சென்னைக்கு மழை நிச்சயம்!", "தமிழ் இலக்கிய அச்சு நூல்கள் வரலாற்றில் அநாமதேயங்களும் புனைபெயர்களும்!",
  "கிரைம் கார்னர்: சென்னை", "'கைதி' பட பாணியில் ரூ.350 கோடி மதிப்பிலான 70 கிலோ ஹெராயின் பறிமுதல்: சென்னையில் அதிர்ச்சி சம்பவம்",
  "Bid to smuggle drugs into Puzhal jail, two held", "71 kg heroin bound for Sri Lanka seized in Chennai, among 2026's biggest hauls"].map((title, i) => ({ id: `d2f${i}`, title }));
const dev2World = { ...WORLD, ...referenceWorld() } as never;

describe("v10 dev2: dA-news-1, a power cut said as Tamil speakers say it ('கரண்ட் கட்', 'current cut') is the மின்தடை story", () => {
  const items = [
    { id: "cut", title: "சென்னையில் வரும் சனிக்கிழமை மின்தடை அறிவிப்பு.. எந்தெந்த ஏரியாக்கள் தெரியுமா?", t: "2026-11-19 17:41" },
    { id: "theft", title: "சென்னையில் 24 இடங்களில் மின் திருட்டு: ரூ.52.77 லட்சம் இழப்பீடு வசூல்", t: "2026-11-19 00:49" },
    { id: "woes", title: "Chennai stares at another summer of power woes as grid projects drag on", t: "2026-11-19 00:16" },
    { id: "wkd", title: "From coding on weekdays to cooking on weekends: 5 Chennai IT employees have served special", t: "2026-11-18 10:00" },
    { id: "ban", title: "பள்ளிக்கரணை கட்டுமானத் தடை: உச்சநீதிமன்றத்தை அணுக மனுதாரர்களுக்கு அனுமதி", t: "2026-11-18 20:14" },
    ...DEV2_FILL];
  const found = (said: string, list: { id: string; title: string }[] = items) => { const r = newsRequest(said); return r ? pickStory(rankStories(r, list), /[஀-௿]/u.test(said) ? "ta" : "en").pick?.id ?? null : null; };
  it.each([
    ["இந்த வீக்கெண்ட் கரண்ட் கட் பத்தி ஏதாவது நியூஸ் இருக்கா?"],
    ["this weekend current cut pathi edhavadhu news irukka?"],
    ["பவர் கட் பத்தி என்ன நியூஸ் இருக்கு?"],
    ["any news on the power cut this weekend?"]
  ])("%s -> the power cut story, never the power theft or the ban", (said) => {
    expect(newsRequest(said)).not.toBeNull();
    expect(found(said)).toBe("cut");
  });
  it("a Tamil loanword request finds an English power cut headline too", () => {
    const en = [{ id: "pcut", title: "Power shutdown in parts of Chennai on Saturday for maintenance work" }, ...items.filter((x) => x.id !== "cut")];
    expect(found("கரண்ட் கட் நியூஸ் சொல்லுங்க", en)).toBe("pcut");
  });
  it("power theft is not a power cut: 'current' alone does not make every power story the cut", () => {
    expect(found("மின் திருட்டு பத்தி ஏதாவது நியூஸ் இருக்கா?")).toBe("theft");
  });
});

describe("v10 dev2: dA-names-4, an English request about a Tamil-only report (the by-election), and the outlet asked for leads its event", () => {
  const items = [
    { id: "dt-by", title: "கொளத்தூர் தொகுதி இடைத்தேர்தலில் மு.க.ஸ்டாலின் போட்டியிடுவாரா? - கேள்வி எழுப்பும் அவரது பேச்சு", outlets: ["Daily Thanthi"], t: "2026-11-19 18:20" },
    { id: "dm-by", title: "கொளத்தூர் தொகுதி இடைத்தேர்தல் எப்போது? மு.க. ஸ்டாலின் போட்டியா?", outlets: ["Dinamani"], t: "2026-11-19 18:28" },
    { id: "dt-1", title: "கொளத்தூர் எம்.எல்.ஏ. வி.எஸ்.பாபு மறைவு: வைகோ இரங்கல்", outlets: ["Daily Thanthi"], t: "2026-11-19 19:28" },
    { id: "dt-2", title: "கொளத்தூர் எம்.எல்.ஏ. விஎஸ். பாபு மறைவு: இந்திய யூனியன் முஸ்லிம் லீக் இரங்கல்", outlets: ["Daily Thanthi"], t: "2026-11-19 19:05" },
    { id: "dt-3", title: "கொளத்தூர் தொகுதி த.வெ.க. எம்.எல்.ஏ. வி.எஸ்.பாபுவின் உடல் நாளை மாலை நல்லடக்கம்", outlets: ["Daily Thanthi"], t: "2026-11-19 21:12" },
    { id: "etv", title: "Stalin's giant-slayer's death leaves Kolathur vacant; six Tamil Nadu bypolls due", outlets: ["ETV Bharat"], t: "2026-11-19 20:42" },
    ...DEV2_FILL];
  const found = (said: string) => { const r = newsRequest(said); return r ? pickStory(rankStories(r, items), "en", undefined, r.outlet).pick?.id ?? null : null; };
  it("'read me what daily tanty wrote on the kolathur by election': Daily Thanthi's own by-election report", () => {
    const r = newsRequest("read me what daily tanty wrote on the kolathur by election");
    expect(r?.outlet).toBe("Daily Thanthi");
    expect(found("read me what daily tanty wrote on the kolathur by election")).toBe("dt-by");
  });
  it("the same event asked of another outlet is that outlet's report", () => {
    expect(found("what did Dinamani write about the Kolathur by-election?")).toBe("dm-by");
  });
  it("with no outlet, a by-election report (an English word for a Tamil headline's own)", () => {
    expect(["dt-by", "dm-by"]).toContain(found("any news on the Kolathur election?"));
    // ("bypoll" is the English report's own word: it may lead, an English request read an English report of the event)
    expect(["dt-by", "dm-by", "etv"]).toContain(found("open the Kolathur bypoll story"));
  });
  it("the MLA's death in English is the Tamil மறைவு reports", () => {
    expect(["dt-1", "dt-2", "dt-3"]).toContain(found("read what Daily Thanthi wrote on the Kolathur MLA's death"));
  });
});

describe("v10 dev2: dA-screenRef-5, the English verb in Tamil letters ('ஓபன் பண்ணு', 'ரீட் பண்ணுங்க') is the request's own word, never a topic", () => {
  const panel = [
    { id: "p1", title: "'கைதி' பட பாணியில் ரூ.350 கோடி மதிப்பிலான 70 கிலோ ஹெராயின் பறிமுதல்: சென்னையில் அதிர்ச்சி சம்பவம்", onScreen: 1 },
    { id: "p2", title: "Stalin's giant-slayer's death leaves Kolathur vacant; six Tamil Nadu bypolls due", onScreen: 2 },
    { id: "p3", title: "காசிமேடு மீனவர்கள் போராட்டம் காலவரையற்ற வேலை நிறுத்தம் அறிவிப்பு", onScreen: 3 },
    { id: "p13", title: "Bid to smuggle drugs into Puzhal jail, two held", onScreen: 4 },
    { id: "k2", title: "சென்னை காசிமேடு மீன்பிடி துறைமுகத்தில் அக்வான் புயல் காரணமாக கடல் சீற்றத்துடன் காணப்பட்டன." },
    { id: "k3", title: "ஆபத்தான நிலையில் சென்னை காசிமேடு மீன்பிடித் துறைமுகத்தில் மீன் பிடிக்கும் மீனவர்கள்." },
    ...DEV2_FILL];
  const found = (said: string) => { const r = newsRequest(said, { onScreen: true }); return r ? pickStory(rankStories(r, panel), "ta").pick?.id ?? null : null; };
  it.each([
    ["அந்த காசிமேடு நியூஸ ஓபன் பண்ணு", "p3"],
    ["காசிமேடு ஸ்டோரிய ஓப்பன் பண்ணுங்க", "p3"],
    ["andha Kasimedu news-a open pannunga", "p3"],
    ["புழல் ஜெயில் நியூஸ ரீட் பண்ணுங்க", "p13"]
  ])("%s -> %s", (said, id) => {
    expect(topicWords(said, null).some((w) => /^(?:opan|oppan|rit|ritu)$/.test(w))).toBe(false);
    expect(found(said)).toBe(id);
  });
  it("the story on screen is meant even when the panel shows its English headline and an older Tamil report of the place is as close", () => {
    // (the dry run of dev2: the panel's row read "Kasimeedu fishermen's protest ..."; the language rule swapped in an 18 Nov Tamil Kasimedu story)
    const en = [{ id: "p3", title: "Kasimeedu fishermen’s protest announces indefinite strike", onScreen: 3 }, ...panel.filter((x) => x.id !== "p3")];
    for (const said of ["அந்த காசிமேடு நியூஸ ஓபன் பண்ணு", "காசிமேடு நியூஸ் படிங்க"]) {
      const r = newsRequest(said, { onScreen: true })!;
      expect(pickStory(rankStories(r, en), "ta").pick?.id).toBe("p3");
    }
  });
});

describe("v10 dev2: dA-reading-2, 'read the whole thing' after a story was found reads that story in full", () => {
  const last = { id: "gate1", title: "Civic projects worth Rs 97 crore opened; foundation stone laid for Gateway of Chennai project", q: "open the Gateway of Chennai one", other: null };
  const lane = (said: string, lastFound: typeof last | null = last) => newsLane8(said, { news: { items: [] }, world: dev2World, lang: /[஀-௿]/u.test(said) ? "ta" : "en", lastFound });
  it.each([["read the whole thing, not the summary"], ["read it fully"], ["read me the full story please"], ["full-a padinga"], ["முழுசா படிங்க"]])("%s -> the found story, read in full", (said) => {
    expect(lane(said)).toEqual({ kind: "read", body: { id: "gate1", full: true }, full: true });
  });
  it("nothing found before: no story to read in full here", () => {
    expect(lane("read the whole thing, not the summary", null)).toBeNull();
  });
  it("a negation is never a read", () => {
    expect(lane("don't read the whole thing")).toBeNull();
  });
  it("over the panel, after one story was read, 'read it fully' is that story, never the panel's first", () => {
    const on = { items: [{ id: "a1", source: null, title: "one" }, { id: "a7", source: null, title: "seven" }], reading: "a7", afterRead: true };
    expect(newsAsk("read the whole thing, not the summary", on)).toEqual({ kind: "read", body: { id: "a7", full: true }, full: true });
    // (the panel open and nothing read yet: no story is in focus; the panel's first is never read in full for it)
    expect(newsAsk("read it fully", { items: on.items })).toBeNull();
  });
});

// the week's stories (the store of 20 Nov, public headlines) for the soft asks below: a story asked about with no news word is found only when close
const DEV2_WEEK = [
  { id: "sdp", title: "Call to make toilet near court in Saidapet disabled-friendly", t: "2026-11-15 06:56" },
  { id: "tlt1", title: "Chennai Corporation opens free public toilets at 853 locations", t: "2026-11-17 14:04" },
  { id: "tlt2", title: "Comfort in sight: 433 more spots in Chennai to get free toilets", t: "2026-11-17 07:43" },
  { id: "tlt3", title: "Toilet at Tambaram Sanatorium railway station locked for 7 months", t: "2026-11-16 09:00" },
  { id: "sfly", title: "70 சதவீத பணிகள் நிறைவு; சைதாப்பேட்டை – தேனாம்பேட்டை மேம்பாலம் எப்போது பயன்பாட்டுக்கு வரும்? அமைச்சர் தகவல்", titleEn: "70 percent of work completed; when will Saidapet – Teynampet flyover come into public use? Minister info", t: "2026-11-14 21:25" },
  { id: "enc", title: "6,824 சதுரடி மாநகராட்சி நிலம் அண்ணா நகரில் ஆக்கிரமிப்பு: 3 மாதமாக கிடப்பில் புகார்", titleEn: "6,824 sq ft Corporation land encroached in Anna Nagar: Complaint pending for 3 months", t: "2026-11-18 21:27" },
  { id: "enc2", title: "Residents urge GCC to remove encroachments on roads in congested areas", t: "2026-11-15 01:01" },
  { id: "enc3", title: "வடபழனி முருகன் கோவில் முகப்பு சாலை ஆக்கிரமிப்பு மகா கந்தசஷ்டி விழாவிற்கு வரும் பக்தர்கள் பரிதவிப்பு", t: "2026-11-14 01:05" },
  { id: "an1", title: "Anna Nagar tower park reopens after renovation", t: "2026-11-16 10:00" },
  { id: "iuml", title: "கொளத்தூர் எம்.எல்.ஏ. விஎஸ். பாபு மறைவு: இந்திய யூனியன் முஸ்லிம் லீக் இரங்கல்", titleEn: "Kolathur MLA V.S. Babu's death: Indian Union Muslim League condolence", outlets: ["Daily Thanthi"], t: "2026-11-19 19:05" },
  { id: "vaiko", title: "கொளத்தூர் எம்.எல்.ஏ. வி.எஸ்.பாபு மறைவு: வைகோ இரங்கல்", outlets: ["Daily Thanthi"], t: "2026-11-19 19:28" },
  { id: "lead", title: "கொளத்தூர் எம்எல்ஏ வி.எஸ். பாபு மறைவு! தலைவர்கள் இரங்கல்!", titleEn: "Kolathur MLA V.S. Babu's death! Leaders' condolences!", outlets: ["Dinamani"], t: "2026-11-19 19:40" },
  { id: "body", title: "கொளத்தூர் தொகுதி த.வெ.க. எம்.எல்.ஏ. வி.எஸ்.பாபுவின் உடல் நாளை மாலை நல்லடக்கம்", outlets: ["Daily Thanthi"], t: "2026-11-19 21:12" },
  { id: "toi", title: "Kolathur MLA Babu, who defeated former CM Stalin, dies at 75", outlets: ["The Times of India"], t: "2026-11-19 21:48" },
  ...DEV2_FILL];
const softPick = (said: string) => {
  const r = newsRequest(said);
  if (!r) return null;
  const p = pickStory(rankStories(r, DEV2_WEEK), /[஀-௿]/u.test(said) || r.words.some((w) => /^(?:enna|sonn)/.test(w)) ? "ta" : "en", r.soft ? SOFT_FLOOR : undefined);
  return p.pick?.id ?? null;
};

describe("v10 dev2: dA-names-3, 'that X thing, what was it': a story recalled by its topic, with no news word (found only when close)", () => {
  it.each([
    ["that sydapet court toilet thing, what was it"],
    ["what was that Saidapet court toilet business?"],
    ["andha Saidapet court toilet vishayam enna?"]
  ])("%s -> the Saidapet court toilet story", (said) => {
    const r = newsRequest(said);
    expect(r?.soft).toBe(true);
    expect(softPick(said)).toBe("sdp");
  });
  it("'Sydapet' by ear is Saidapet (a y between consonants said as 'ai', as Indian spellings write it: Mylapore, Sydapet)", () => {
    expect(rankStories(newsRequest("that sydapet court toilet thing, what was it")!, DEV2_WEEK).find((x) => x.item.id === "sdp")!.hits).toBe(3);
  });
  it("a thing with no word that names it (a kind of thing alone) is never a story here; with a place it is found only when that close", () => {
    expect(newsRequest("what was that drain thing?")).toBeNull();
    expect(newsRequest("what was that thing")).toBeNull();
    expect(softPick("that Adyar drain thing, what was it")).toBeNull();
  });
});

describe("v10 dev2: dA-names-12, a question whether someone said or did something public ('condolence sonnaangala'): the news, found only when close", () => {
  it.each([
    ["kolathoor MLA vee yes baabu-ku muslim league condolence sonnaangala"],
    ["கொளத்தூர் எம்எல்ஏ பாபுவுக்கு முஸ்லிம் லீக் இரங்கல் சொன்னாங்களா?"],
    ["did the Muslim League condole Kolathur MLA Babu's death?"]
  ])("%s -> the Muslim League's condolence", (said) => {
    const r = newsRequest(said);
    expect(r?.soft).toBe(true);
    expect(softPick(said)).toBe("iuml");
  });
  it("an officer's word is no story ('Adyar AE enna sonnaaru?'): nothing that close, the console's lanes take it", () => {
    expect(softPick("Adyar AE enna sonnaaru?")).toBeNull();
  });
});

describe("v10 dev2: dA-news-10, a Tamil hearsay ('...போட்டுட்டாங்களாம்', 'they grabbed it, it seems') about an event is a news question; zone 8 is Anna Nagar", () => {
  it.each([
    ["எட்டாவது ஜோன்ல கார்ப்பரேஷன் இடத்தை யாரோ வளைச்சுப் போட்டுட்டாங்களாம், யாரும் கண்டுக்கலையாமே?"],
    ["anna nagar-la corporation idatha yaaro valachu pottutaangalaam, yaarum kandukkalaiyaame"],
    ["I heard someone grabbed corporation land in zone 8 and nobody acted on it?"]
  ])("%s -> the Anna Nagar encroachment story", (said) => {
    const r = newsRequest(said);
    expect(r?.soft).toBe(true);
    expect(softPick(said)).toBe("enc");
  });
  it("a hearsay with nothing that names an event is no news request ('Adyar-la current illaiyaam')", () => {
    expect(softPick("Adyar-la current illaiyaam")).toBeNull();
  });
  it("zone 8 said by its number is Anna Nagar for the news ('எட்டாவது ஜோன்', 'zone 8', 'ettavadhu zone')", () => {
    for (const s of ["எட்டாவது ஜோன்ல நியூஸ் என்ன?", "any news from zone 8?", "ettavadhu zone news enna"]) expect(newsRequest(s)?.words, s).toEqual(expect.arrayContaining(["anna", "nagar"]));
  });
});

describe("v10 dev2: dA-news-6, a question whether a public project is coming ('innoru project varudhaa?'), the project described in the Collector's own words (sea water made drinking water: desalination)", () => {
  const WATER = [
    { id: "desal", title: "Chennai Metropolitan Area faces 500 MLD water deficit; another desal plant planned at Minjur", t: "2026-11-18 07:14" },
    { id: "pot", title: "CHENNAI: RESIDENTS STAGE EMPTY-POT PROTEST OVER FOUR-MONTH WATER SHORTAGE IN KODUNGAIYUR", t: "2026-11-17 10:00" },
    { id: "cans", title: "BIS seizes 113 unauthorised water cans", t: "2026-11-18 11:00" },
    { id: "chola", title: "Chola-era lakes supplying drinking water to Chennai", t: "2026-11-16 09:00" },
    { id: "surge", title: "அக்வான் புயல் எதிரொலி திருவொற்றியூர், எண்ணூரில் கடல் சீற்றம்; சாலையில் கடல்நீர் புகுந்ததால் பொதுமக்கள் அதிர்ச்சி!", titleEn: "Akvan cyclone echo: rough sea at Thiruvottiyur, Ennore; sea water enters the road", t: "2026-11-19 12:00" },
    { id: "gate", title: "Civic projects worth Rs 97 crore opened; foundation stone laid for Gateway of Chennai project", t: "2026-11-19 08:22" },
    { id: "rwh", title: "307 out of 347 RWH structures in high-rise buildings full functional: Chennai Metro Water board", t: "2026-11-17 08:00" },
    { id: "itms", title: "Intelligent Transport System to start operations in Chennai next month", t: "2026-11-16 08:00" },
    ...DEV2_FILL];
  const pick = (said: string) => { const r = newsRequest(said); return r ? pickStory(rankStories(r, WATER), /[஀-௿]/u.test(said) || !/\b(?:is|are|the|any)\b/i.test(said) ? "ta" : "en", r.soft ? SOFT_FLOOR : undefined).pick?.id ?? null : null; };
  it.each([
    ["kadal thanniya kudi thanniya maathura innoru project varudhaa? thanni evlo kammi?"],
    ["கடல் தண்ணியை குடிதண்ணியா மாத்துற இன்னொரு திட்டம் வருதா? தண்ணி எவ்வளவு கம்மி?"],
    ["is another plant coming that turns sea water into drinking water? how big is the water shortfall?"],
    ["is another desalination plant coming up?"]
  ])("%s -> the Minjur desal plant story", (said) => {
    const r = newsRequest(said);
    expect(r?.soft).toBe(true);
    expect(pick(said)).toBe("desal");
  });
  it("sea water on the road is no desalination: the surge story stays the surge's ('kadal thanni road-la vandhuchaa' is not this kind of question)", () => {
    expect(newsRequest("Ennore-la kadal thanni road-la vandhuchaa?")?.gloss?.kadal ?? []).not.toContain("desal");
  });
  it("a project question that names nothing close finds nothing (the console's lanes take it); a forecast is never one", () => {
    expect(pick("Adyar-la pudhu drain project varudhaa?")).toBeNull();
    expect(newsRequest("mazhai varuma?")).toBeNull();
    expect(newsRequest("will it rain tomorrow?")).toBeNull();
  });
});
