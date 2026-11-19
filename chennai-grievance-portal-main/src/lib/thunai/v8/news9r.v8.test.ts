import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { newsRequest, pickStory, rankStories, SOFT_FLOOR, type StoryItem } from "./news8";
import { findNews, placesOf } from "./newsfind";

// The independent review of v9's first fixes (19 Nov, five lenses, each finding reproduced by a second agent): every confirmed finding as a
// failing test before its fix. The inputs are the reviewers' own; the stories are written here.
const world = { ...WORLD, ...referenceWorld() };
const PLACES = placesOf(world);
const pick = (text: string, items: StoryItem[], onScreen = false) => {
  const req = newsRequest(text, { onScreen });
  if (!req) return null;
  return { req, ...pickStory(rankStories(req, items, { places: PLACES }), null, req.soft ? SOFT_FLOOR : undefined) };
};
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
/** 40 stories about nothing asked here, so the word weights are a store's, not a fixture's */
const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
  "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
  "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
  "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
  "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
  "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
  "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => story(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));

describe("v9 review, group 1: the gloss is the Tamil word's, not its loose key's; the English is the word, not its loose key", () => {
  it("#2/#27: பாலம், paalam (bridge) is not பள்ளம், pallam (pothole)", () => {
    const bridge = story("அடையாறு பாலத்தில் விரிசல்: போக்குவரத்து மாற்றம்", { id: "br", titleEn: "Crack on Adyar bridge: traffic diverted", t: "2026-11-17 10:00" });
    const pothole = story("Pothole on Adyar main road leaves motorists fuming", { id: "ph", t: "2026-11-18 10:00" });
    const items = [bridge, pothole, story("Adyar residents complain of irregular garbage collection", { id: "ag" }), ...FILLER];
    expect(pick("Adyar paalam news padinga", items)?.pick?.id).toBe("br");
    expect(pick("அடையாறு பாலம் செய்தியைப் படிங்க", items)?.pick?.id).toBe("br");
    expect(pick("பாலம் விரிசல் செய்தி", items)?.pick?.id).toBe("br");
  });
  it("#2: பள்ளி (school) is not பலி (killed); மாலை (evening) is not மழை (rain); காதல் (love) is not கடல் (sea)", () => {
    const killed = story("Two killed in road accident at Ambattur", { id: "kd" });
    expect(pick("Ambattur palli news padinga", [killed, story("Ambattur: Students fall ill after eating midday meal at school", { id: "sc" }), ...FILLER])?.pick?.id).not.toBe("kd");
    const acc = story("Two-wheeler rider killed in accident at Anna Nagar", { id: "an" });
    const rain = story("Rain lashes Anna Nagar, roads waterlogged", { id: "rn", t: "2026-11-18 10:00" });
    expect(pick("நேற்று மாலை அண்ணா நகர் விபத்து செய்தி", [acc, rain, ...FILLER])?.pick?.id).toBe("an");
    const love = story("காதலனுடன் சென்ற இளம்பெண் கொலை: தந்தை கைது", { id: "lv", titleEn: "Young woman who eloped with lover killed: father arrested" });
    expect(pick("காதல் கொலை செய்தி", [love, story("Youth drowns in sea at Marina; another rescued", { id: "se" }), ...FILLER])?.pick?.id).toBe("lv");
  });
  it("#1: தி/டி in a dotted abbreviation (தி.மு.க., எம்.டி.சி) is not தீ (fire)", () => {
    const fire = story("Residents protest over fire at Perungudi dump yard", { id: "fi" });
    const items = [story("DMK cadres stage protest against Governor in Chennai", { id: "dm" }), fire, story("Fire breaks out at godown in Vyasarpadi; no casualties", { id: "vy" }),
      story("MTC to operate 500 special buses for Deepavali", { id: "mt" }), ...FILLER];
    expect(pick("தி.மு.க. போராட்டம் செய்தி", items)?.pick?.id).not.toBe("fi");
    expect(pick("எம்.டி.சி பேருந்து செய்தி", items)?.pick?.id).not.toBe("fi");
    expect(pick("அ.தி.மு.க. போராட்டம் பத்தி ஏதாவது செய்தி இருக்கா?", items)?.stories.map((s) => s.id) ?? []).not.toContain("fi");
  });
  it("#26: the gloss's English is the word itself: drugs is not truck, tree is not three, plane is not plan, cheat is not seat; புயல் is not a storm water drain", () => {
    const drugs = story("Seizure of drugs worth Rs. 140 crore near Madhavaram – 2 people arrested", { id: "dr", t: "2026-11-17 10:00" });
    const truck = story("Truck rams parked cars in Madhavaram, driver held", { id: "tr", t: "2026-11-18 10:00" });
    expect(pick("மாதவரம் போதைப்பொருள் செய்தியைப் படிங்க", [drugs, truck, ...FILLER])?.pick?.id).toBe("dr");
    expect(pick("மரம் விழுந்த செய்தியைப் படிங்க", [story("Three held for chain snatching in Anna Nagar", { id: "th" }), story("Three injured in a bike crash", { id: "t2" }), ...FILLER])?.pick ?? null).toBeNull();
    expect(pick("விமானம் செய்தியைப் படிங்க", [story("CMDA releases draft Third Master Plan for Chennai", { id: "mp" }), ...FILLER])?.pick ?? null).toBeNull();
    expect(pick("மோசடி செய்தியைப் படிங்க", [story("DMK, allies finalise seat-sharing for local body polls", { id: "ss" }), ...FILLER])?.pick ?? null).toBeNull();
    const drain = story("Storm water drain work delayed in Velachery", { id: "sd", t: "2026-11-18 10:00" });
    const cyc = story("Cyclone Fengal likely to cross coast near Mamallapuram", { id: "cy", t: "2026-11-17 10:00" });
    expect(pick("புயல் செய்தியைப் படிங்க", [drain, cyc, ...FILLER])?.pick?.id).toBe("cy");
  });
  it("#30: கொலை (murder) is not கொள்ளை (robbery)", () => {
    const rob = story("Robbery at Royapuram jewellery shop; gold worth Rs 50 lakh stolen", { id: "rb", t: "2026-11-17 10:00" });
    const mur = story("Youth murdered in Royapuram over old enmity", { id: "md", t: "2026-11-18 10:00" });
    expect(pick("ராயபுரம் கொள்ளை செய்தி", [rob, mur, ...FILLER])?.pick?.id).toBe("rb");
    expect(pick("ராயபுரம் கொலை செய்தி", [{ ...rob, t: "2026-11-19 10:00" }, mur, ...FILLER])?.pick?.id).toBe("md");
  });
  it("#4/#25: an inflected Tamil headline keeps v8's match whatever its English title says (கொலையான, மழையால், மரங்கள்)", () => {
    const body = story("ராயபுரத்தில் வெட்டிக் கொலையான இளைஞரின் உடல் ஒப்படைப்பு", { id: "rk", titleEn: "Body of youth hacked to death in Royapuram handed over to family" });
    const items = [body, story("Royapuram fish market to get new building", { id: "r2" }), story("Royapuram: Metro work causes traffic snarl", { id: "r3" }), ...FILLER];
    expect(pick("Royapuram kolai news padinga", items)?.pick?.id).toBe("rk");
    expect(pick("ராயபுரம் கொலை செய்தி", items)?.pick?.id).toBe("rk");
    const acc = story("தாம்பரம் அருகே லாரி மோதி விபத்தில் இருவர் பலி", { id: "ta", titleEn: "Two dead after lorry rams bike near Tambaram" });
    const tam = [acc, story("Tambaram bus terminus to get new platforms", { id: "t2" }), story("Tambaram corporation budget passed", { id: "t3" }), ...FILLER];
    expect(pick("Tambaram vibathu news sollunga", tam)?.pick?.id).toBe("ta");
    expect(pick("தாம்பரம் விபத்து செய்தி", tam)?.pick?.id).toBe("ta");
    const rain = story("வேளச்சேரியில் மழையால் சாலைகளில் வெள்ளம்", { id: "vr", titleEn: "Heavy rains leave Velachery roads flooded", t: "2026-11-17 10:00" });
    expect(pick("Velachery mazhai news padinga", [rain, story("Velachery residents protest against garbage dumping", { id: "vg", t: "2026-11-18 10:00" }), ...FILLER])?.pick?.id).toBe("vr");
    const trees = story("அண்ணா நகரில் மரங்கள் வேரோடு சாய்ந்தன", { id: "tz", titleEn: "Trees uprooted in Anna Nagar", t: "2026-11-16 10:00" });
    expect(pick("அண்ணா நகர் மரம் விழுந்த செய்தி", [trees, story("Anna Nagar tower park reopens after repairs", { id: "pk", t: "2026-11-18 10:00" }), ...FILLER])?.pick?.id).toBe("tz");
  });
  it("#5/#31: a noun is not a spoken verb (விபத்து, மின்வெட்டு, பேருந்து, vibatthu, vettu keep their weight)", () => {
    for (const t of ["வேளச்சேரி விபத்து செய்தி", "மயிலாப்பூர் மின்வெட்டு அறிவிப்பு செய்தி", "பேருந்து செய்தி", "Velachery road vibatthu news sollunga", "Pattinapakam la vettu news sollunga"])
      expect(newsRequest(t, {})?.weak ?? [], t).toEqual([]);
    expect(newsRequest("மெரினாவுல குதிரை மிரண்டு ஓடின செய்தி", {})?.weak).toEqual(expect.arrayContaining([expect.any(String)]));
    const m2 = story("மயிலாப்பூரில் நாளை மின்வெட்டு", { id: "m2", titleEn: "Power shutdown in Mylapore tomorrow", t: "2026-11-17 10:00" });
    const m1 = story("மயிலாப்பூர் கோயில் திருவிழா அறிவிப்பு", { id: "m1", titleEn: "Mylapore temple festival announced", t: "2026-11-18 10:00" });
    const m3 = story("குரூப் 4 தேர்வு முடிவுகள் அறிவிப்பு", { id: "m3", titleEn: "Group 4 exam results announced" });
    expect(pick("மயிலாப்பூர் மின்வெட்டு அறிவிப்பு செய்தி", [m1, m2, m3, ...FILLER])?.pick?.id).toBe("m2");
    const acc = story("வேளச்சேரியில் விபத்து: இளைஞர் பலி", { id: "va", titleEn: "Accident at Velachery: youth killed" });
    const relay = [story("Velachery main road relaying work begins", { id: "vw" }), ...Array.from({ length: 8 }, (_, i) => story(`Road relaying work ${i} begins in Chennai`, { id: `rr${i}` }))];
    expect(pick("Velachery road vibatthu news sollunga", [acc, ...relay, ...FILLER])?.pick?.id).toBe("va");
  });
  it("a Tamil word is not an English word that begins like it (மரம், maram, is not 'marathon'; the cut-short rule is for names and Tamil endings)", () => {
    expect(pick("மரம் விழுந்த செய்தியைப் படிங்க", [story("Marathon to be held on Sunday", { id: "mr" }), ...FILLER])?.pick ?? null).toBeNull();
    expect(pick("Adyar maram news padinga", [story("Adyar marathon draws 5,000 runners", { id: "am", t: "2026-11-18 10:00" }),
      story("Uprooted trees block Adyar roads after the storm", { id: "at", t: "2026-11-17 10:00" }), ...FILLER])?.pick?.id).toBe("at");
    // still: a name cut short ("Palikan"), and a Tamil word in its inflected Tamil form (மரம் in மரங்கள்)
    expect(pick("Open the Supreme Court news on Palikan.", [story("Pallikaranai marsh construction ban: Madras HC asks litigants to approach Supreme Court", { id: "pl" }), ...FILLER])?.pick?.id).toBe("pl");
    expect(pick("மரம் செய்தி", [story("அண்ணா நகரில் மரங்கள் வேரோடு சாய்ந்தன", { id: "mt", titleEn: "Uprooted in Anna Nagar" }), ...FILLER])?.pick?.id).toBe("mt");
  });
  it("#5: a spoken verb a story has still counts in that story (the horse story with மிரண்டு in its headline)", () => {
    const horse = story("மெரினாவில் சவாரி குதிரை மிரண்டு ஓடியதில் தாய், மகள் உட்பட 3 பேர் படுகாயம்", { id: "hz", titleEn: "3 people injured after a riding horse goes berserk in Marina" });
    const items = [horse, story("The cascade water tank in Marina, Chennai has broken; repair work has started", { id: "wt" }), ...FILLER];
    expect(pick("சென்னை மெரினா கடற்கரையில குதிரை மிரண்டு ஓடின செய்தி", items)?.pick?.id).toBe("hz");
  });
  it("#21: a Tamil news question in a rain week answers in well under 1.5 s (3,000 reports, 200 events of three reports each)", async () => {
    const items: StoryItem[] = [];
    // each event in words of its own (no story id: the reviewer's worst case, every event its own group)
    const C = "kmnprstl", V = "aiu";
    const word = (k: number) => C[k % 8] + V[Math.floor(k / 8) % 3] + C[Math.floor(k / 24) % 8] + V[Math.floor(k / 192) % 3] + C[Math.floor(k / 576) % 8];
    for (let e = 0; e < 200; e++) {
      // the three reports of one event share only its own two words and "rain": one group each (200 groups)
      const w1 = word(e * 7 + 1), w2 = word(e * 7 + 3);
      items.push(story(`மழை ${w1} ${w2}`, { id: `ta${e}`, titleEn: `Rain ${w1} ${w2}` }));
      items.push(story(`Rain ${w1} ${w2}`, { id: `en${e}` }));
      items.push(story(`${w2} ${w1} rain`, { id: `hv${e}` }));
    }
    for (let i = 0; i < 2400; i++) items.push(story(`Unrelated civic item number ${i} about ${["parks", "schools", "markets", "libraries"][i % 4]}`, { id: `u${i}` }));
    for (const q of ["mazhai news irukka?", "மழை பத்தி ஏதாவது செய்தி இருக்கா?"]) {
      const t0 = performance.now();
      const r = await findNews({ q, lang: "ta" }, { world, stories: async () => items });
      const ms = performance.now() - t0;
      expect(r?.picked.stories.length, q).toBeGreaterThan(0);
      // (review 1's bound is 1,500 ms for the whole route; the grouping alone took ~1 s here before its keys were kept per call)
      expect(ms, q).toBeLessThan(600);
    }
  }, 30_000);
});

describe("v9 review, group 2: a joined place stands for its parts only when it is a word the parts are not", () => {
  const horse = story("மெரினாவில் சவாரி குதிரை மிரண்டு ஓடியதில் தாய், மகள் உள்பட 3 பேர் படுகாயம்", { id: "s3", titleEn: "3 people including mother and daughter severely injured after a riding horse goes berserk in Marina", t: "2026-11-17 20:00" });
  const tank = story("The cascade water tank in Marina, Chennai has broken; repair work has started", { id: "s4", t: "2026-11-17 18:00" });
  const dhoni = story("Thala Forever: CSK Pay Special Tribute To MS Dhoni With Drone At Chennai's Marina Beach", { id: "s8", t: "2026-11-18 10:00" });
  it("#0: 'Marina beach' said in full does not veto the stories that say 'Marina'", () => {
    // ("beach" is only in the Dhoni story and "horse" only in the horse story: a tie, as in v8, which offers the other; v9's first try vetoed it)
    const r = pick("Jarvis, open the Marina beach horse news", [horse, tank, dhoni, ...FILLER]);
    expect([r?.pick?.id, r?.other?.id]).toContain("s3");
    expect(pick("Marina beach water tank news", [horse, tank, dhoni, ...FILLER])?.pick?.id).toBe("s4");
  });
  it("#0/#28: தி.நகர் (T. Nagar in Tamil) finds the English T. Nagar stories", () => {
    const sky = story("T. Nagar skywalk to be extended to Mambalam station", { id: "t1" });
    const crowd = story("Diwali shopping: crowds throng Ranganathan Street in T. Nagar", { id: "t2" });
    const fire = story("Fire at textile showroom godown in T. Nagar; no casualties", { id: "t3" });
    expect(pick("தி.நகர் skywalk செய்தி", [sky, crowd, fire, ...FILLER])?.pick?.id).toBe("t1");
    expect(pick("தி.நகர் ரங்கநாதன் தெரு செய்தியைப் படிங்க", [crowd, story("Fire breaks out at godown in Vyasarpadi; no casualties", { id: "b2" }), ...FILLER])?.pick?.id).toBe("t2");
    expect(pick("தி.நகர் பத்தி ஏதாவது செய்தி இருக்கா?", [sky, crowd, fire, ...FILLER])?.stories.map((s) => s.id).sort()).toEqual(["t1", "t2", "t3"]);
  });
  it("#3: '<place> HC' or '<place> MLA' does not credit HC or MLA to every story of the place", () => {
    const panel = { ...story("Adyar residents complain of irregular garbage collection", { id: "ap" }), onScreen: 1 };
    const hc = story("HC orders removal of encroachments along Adyar river", { id: "ah" });
    expect(pick("open the Adyar HC news", [panel, hc, ...FILLER], true)?.pick?.id).toBe("ah");
    const kp = { ...story("Kodambakkam flyover repair work to start next week", { id: "kp" }), onScreen: 1 };
    const mla = story("MLA inaugurates new ration shop in Kodambakkam", { id: "km" });
    expect(pick("Kodambakkam MLA news padinga", [kp, mla, ...FILLER], true)?.pick?.id).toBe("km");
  });
  it("#29: '<place> மழை' is not credited to a story that has the place with -யில் (வேளச்சேரியில்)", () => {
    const rain = story("மழையால் வேளச்சேரி சாலைகளில் வெள்ளம்", { id: "r1", titleEn: "Heavy rains leave Velachery roads flooded", t: "2026-11-16 10:00" });
    const prot = story("வேளச்சேரியில் குப்பை கொட்டுவதைக் கண்டித்து போராட்டம்", { id: "w1", titleEn: "Protest in Velachery against garbage dumping", t: "2026-11-18 10:00" });
    expect(pick("வேளச்சேரி மழை செய்தி", [rain, prot, ...FILLER])?.pick?.id).toBe("r1");
    const grain = story("கிண்டியில் கனமழை: சாலைகளில் தண்ணீர் தேக்கம்", { id: "g1", titleEn: "Heavy rain in Guindy: water stagnates on roads", t: "2026-11-16 10:00" });
    const gprot = story("கிண்டியில் தொழிற்பேட்டை தொழிலாளர்கள் போராட்டம்", { id: "g2", titleEn: "Guindy industrial estate workers protest", t: "2026-11-18 10:00" });
    expect(pick("கிண்டி மழை செய்தி", [grain, gprot, ...FILLER])?.pick?.id).toBe("g1");
  });
  it("a joined pair is matched by its spelling, not by its consonants: 'beach horse' is not 'fisheries' (the real store, 19 Nov)", () => {
    const fish = story("Climate change threatens marine livelihoods: Tamil Nadu Fisheries Minister", { id: "fm", t: "2026-11-18 10:00" });
    const r = pick("Marina beach horse news", [horse, fish, dhoni, ...FILLER]);
    expect(r?.pick?.id).not.toBe("fm");
    expect([r?.pick?.id, r?.other?.id]).toContain("s3");
  });
  it("still: a name the ears split is found joined ('Kasi medu', 'Palli Karanai')", () => {
    const kasi = story("Aquaan storm caused sea turbulence at Chennai Kasimedu fishing harbor", { id: "km1" });
    const party = story("Manithaneya Makkal Katchi Protests In Chennai, Seeks Release Of 22 Muslim Convicts", { id: "mm" });
    expect(pick("Jarvis, open the Kasi medu news", [kasi, party, ...FILLER])?.pick?.id).toBe("km1");
    expect(pick("Palli Karanai construction ban news", [story("Construction Ban In Chennai's Pallikaranai: HC Gives Liberty To Petitioners To Approach SC", { id: "pc" }), ...FILLER])?.pick?.id).toBe("pc");
  });
});

describe("v9 review, group 3: an outlet heard by ear is a long name's word, never a common English word; 'news on air' is no outlet; the scan is cheap", () => {
  it("#14: 'next' and 'text' are not DT Next (the Stage's own 'next' stays the Stage's)", async () => {
    const { outletIn } = await import("./news8");
    for (const t of ["next", "Jarvis, next", "next one", "read the text", "go to the next page", "what's planned for next week in Adyar", "what's next?"]) expect(outletIn(t), t).toBeNull();
    expect(outletIn("read the DT Next story")).toBe("DT Next");
    expect(outletIn("D T Next story padinga")).toBe("DT Next");
    const { browserLaneV8 } = await import("./browser");
    const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as never;
    const stage = { recipe: "news", blocks: [{ kind: "NewsReader", rows: [] }], scope: { zone: null } };
    const bl = browserLaneV8("next", { stage, news: { items: [{ id: "n1", source: "The Hindu", title: "One" }, { id: "n2", source: "DT Next", title: "Two" }] }, state, world, listenLang: "en", heardLang: "en", v7: true });
    expect(bl.lane).not.toBe("news");
  });
  it("#10: 'any news on air quality' keeps 'air' in the topic; All India Radio is News On AIR", async () => {
    const { outletIn, topicWords } = await import("./news8");
    expect(outletIn("Is there any news on air quality today?")).toBeNull();
    expect(topicWords("Is there any news on air quality today?", null)).toEqual(["air", "quality"]);
    expect(outletIn("Any news on Air India?")).toBeNull();
    expect(outletIn("Any news from All India Radio?")).toBe("News On AIR");
    const aq = story("Chennai air quality dips to poor as Bhogi smoke lingers", { id: "aq", outlets: ["The Hindu"] });
    const wq = story("Metrowater steps up drinking water quality checks across Chennai", { id: "wq" });
    expect(pick("Is there any news on air quality today?", [aq, wq, ...FILLER])?.stories[0]?.id).toBe("aq");
  });
  it("#22: reading the outlets costs well under a millisecond a sentence once warm, at any length", async () => {
    const { outletIn, newsRequest: nr } = await import("./news8");
    outletIn("warm up the Deccan Chronical one");
    const long = `${"please open the latest report on the Kodungaiyur protest and the water supply in the northern zones ".repeat(3)} open the Deccan Chronical story`.slice(0, 400);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) { outletIn("Show me the severe cases in Adyar."); outletIn(long); nr(long, {}); }
    const per = (performance.now() - t0) / 20;
    expect(outletIn(long)).toBe("Deccan Chronicle");
    expect(per).toBeLessThan(15);
  });
});

describe("v9 review, group 4: a position is a position only where it is said as one", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `n${i + 1}`, title: `Story ${i + 1}`, source: "The Hindu" }));
  const lane = async (t: string, o: { panel?: boolean } = {}) => {
    const { newsLane8 } = await import("./browser");
    return newsLane8(t, { news: { items }, world, lang: /[஀-௿]/u.test(t) ? "ta" : "en", panel: o.panel ?? true });
  };
  it("#8: on the news panel, 'a second', 'First, ...', 'zone number 3' are not stories", async () => {
    for (const t of ["Wait a second, open the Adyar complaints", "One second, open the Teynampet cases", "First open the Adyar complaints, then the map",
      "Just a second, please open the map", "Show me zone number 3", "Open ward number 5", "Show me complaint number 7", "Show me zone no. 4"]) {
      const r = await lane(t);
      expect(r?.kind === "read" ? r.body : null, t).toBeNull();
    }
    // still positions: "the seventh one", "number 7", "open number 12", Tamil and Tanglish ordinals
    const read = async (t: string) => { const r = await lane(t); return r?.kind === "read" && "id" in r.body ? r.body.id : null; };
    expect(await read("Jarvis, read me the seventh one")).toBe("n7");
    expect(await read("open number 12")).toBe("n12");
    expect(await read("read news number 3")).toBe("n3");
    expect(await read("ஏழாவது செய்தியைத் திறங்க")).toBe("n7");
    expect(await read("ezhavadhu onna open pannunga")).toBe("n7");
  });
  it("#9: over a case list, 'no one' and a date are not positions", async () => {
    const { stageRef8 } = await import("./refs8");
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `c${i + 1}`, title: "Garbage", place: "Adyar", zoneName: "Adyar" }));
    for (const t of ["Show me the cases no one has acted on", "Open the complaints no one has picked up", "Show me the ones no one is handling", "Read out the ones that came in on the 15th"])
      expect(stageRef8(t, rows), t).toBeNull();
    expect(stageRef8("Open the third one", rows)).toEqual({ op: "open", n: 3 });
    expect(stageRef8("open number 12", rows)).toEqual({ op: "open", n: 12 });
    expect(stageRef8("ஏழாவது சம்பவத்தைத் திறங்க", rows)).toEqual({ op: "open", n: 7 });
  });
  it("#13: 'the second item' on a Stage with news and cases is the case list's, not a story", async () => {
    const { newsOrdinal8 } = await import("./refs8");
    expect(newsOrdinal8("Open the second item", items)).toBeNull();
    expect(newsOrdinal8("Read the first item", items)).toBeNull();
    expect(newsOrdinal8("read the seventh news item", items)).toBe("n7");
  });
  it("#32: spoken forms past the fifth: ஒம்பதாவது, பன்னிரெண்டாவது, பதினோராவது, ஏழாம், ombadhavadhu, padhinonnavadhu, pannendavadhu; ஒன்னு and நியூஸ்", async () => {
    const { newsOrdinal8 } = await import("./refs8");
    const at = (t: string) => newsOrdinal8(t, items, { panel: true });
    expect(at("ஒம்பதாவது செய்தியைத் திறங்க")).toBe("n9");
    expect(at("பன்னிரெண்டாவது செய்தியைப் படிங்க")).toBe("n12");
    expect(at("பதினோராவது செய்தியைப் படிங்க")).toBe("n11");
    expect(at("ஏழாம் செய்தியைப் படிங்க")).toBe("n7");
    expect(at("ombadhavadhu news padinga")).toBe("n9");
    expect(at("padhinonnavadhu news padinga")).toBe("n11");
    expect(at("pannendavadhu news padinga")).toBe("n12");
    expect(at("கடைசி ஒன்னைப் படிங்க")).toBe("n12");
    expect(at("எட்டாவது நியூஸ் படிங்க")).toBe("n8");
    expect(at("கடைசி நியூஸ் படிங்க")).toBe("n12");
  });
  it("#20: after reading one story, the panel's positions still mean the panel (Jarvis's read screen over the open panel)", async () => {
    const { browserLaneV8 } = await import("./browser");
    const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: "news", incident: null, listLength: 0, lastPlace: null, numbers: false } as never;
    const readScreen = { recipe: "news", blocks: [{ kind: "NewsReader", rows: [] }], scope: { zone: null }, slots: { web: true } };
    const bl = browserLaneV8("read the seventh one", { stage: readScreen, news: { items }, state, world, listenLang: "en", heardLang: "en", v7: true });
    expect(bl.lane === "news" && bl.na.kind === "read" && "id" in bl.na.body && bl.na.body.id).toBe("n7");
  });
});

describe("v9 review, group 5: the soft search takes a named event, never the console's own views, reminders or a case in focus", () => {
  const state = (o: Record<string, unknown> = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
  const laneOf = async (t: string, o: { stage?: unknown; st?: Record<string, unknown>; incident?: string | null } = {}) => {
    const { browserLaneV8 } = await import("./browser");
    return browserLaneV8(t, { stage: (o.stage ?? null) as never, news: { items: [] }, state: state(o.st), world, listenLang: "en", heardLang: /[஀-௿]/u.test(t) ? "ta" : "en", incident: o.incident ?? null, v7: true });
  };
  it("#6/#15: a plural event, 'all', 'today's', a place alone or a generic word is the console's (no soft find)", async () => {
    for (const t of ["Open the accidents in Anna Nagar", "Open the protests in Royapuram", "Bring up the Royapuram protests", "Open all the fires in Adyar",
      "Open today's accidents in Anna Nagar", "Open the dog attacks in Anna Nagar", "Open the demolitions in Adyar", "Royapuram protest ellam open pannunga",
      "Tell me about the accidents in Anna Nagar today", "Pull up the protests in Royapuram", "open the road accident deaths", "open the Adyar fire", "pull up the Adyar fire",
      "open the Velachery protest"])
      expect(newsRequest(t, {})?.soft ?? false, t).toBe(false);
  });
  it("#7/#11: reminders, notes and the console's Tamil and Tanglish nouns are not soft finds", async () => {
    for (const t of ["Remind me to open the Royapuram protest at 5 pm", "What did I say about the Adyar fire? Read it", "Read my note on the Adyar fire",
      "Adyar fire pugar open pannunga", "Kodungaiyur fire nilavaram sollunga", "கொடுங்கையூர் தீ நிலவரம் சொல்லுங்க", "Adyar fire sambavam open pannunga", "Kodungaiyur fire situation sollunga"])
      expect(newsRequest(t, {})?.soft ?? false, t).toBe(false);
  });
  it("#15/#6: never with a case in focus: a case on the Stage, the console's incident, or 'the X one' over the console's list", async () => {
    const detail = { recipe: "case", blocks: [{ kind: "CaseDetail" }], scope: { zone: null } };
    const l1 = await laneOf("tell me about the IOCL plant fire", { stage: detail });
    expect(l1.lane === "news" && l1.na.kind === "find").toBe(false);
    const l2 = await laneOf("open the IOCL plant fire", { incident: "INC-7" });
    expect(l2.lane === "news" && l2.na.kind === "find").toBe(false);
    const l3 = await laneOf("Open the IOCL fire one", { st: { listLength: 3 } });
    expect(l3.lane === "news" && l3.na.kind === "find").toBe(false);
    // and with nothing in focus, a named event is still a soft find
    const l4 = await laneOf("Jarvis, open the Kodungayur empty pot protest");
    expect(l4.lane === "news" && l4.na.kind === "find" && l4.na.soft).toBe(true);
  });
  it("#16: a soft pick has the word that names it ('open the NEET protest' is no other party's protest)", async () => {
    const items = [story("AIADMK cadres stage protest against property tax hike in Tambaram", { id: "s17" }), story("Kodungaiyur residents stage empty pot protest over drinking water", { id: "s6" }),
      ...FILLER];
    for (const q of ["Jarvis, open the NEET protest", "open the PMK protest", "read the NTK protest"]) {
      const r = await findNews({ q, lang: "en" }, { world, stories: async () => items });
      expect(r?.req.soft, q).toBe(true);
      expect(r?.picked.pick ?? null, q).toBeNull();
    }
    const ok = await findNews({ q: "open the Kodungaiyur empty pot protest", lang: "en" }, { world, stories: async () => items });
    expect(ok?.picked.pick?.id).toBe("s6");
  });
  it("the event may be in the headline's own words ('the Pattinapakkam honking attack' is 'Man hacked after dispute over honking'; the real store)", async () => {
    const items = [story("Man hacked after dispute over honking in Pattinapakkam, four arrested", { id: "pk1" }), story("Pattinapakkam Secretariat stuck in stir, fishers' lives in limbo", { id: "pk2" }), ...FILLER];
    const r = await findNews({ q: "read the Pattinapakkam honking attack", lang: "en" }, { world, stories: async () => items });
    expect(r?.picked.pick?.id).toBe("pk1");
  });
  it("still soft: the holdout's named events (the IOCL fire, the Kodungaiyur empty pot protest, the Pattinapakkam honking attack, the Puzhal jail smuggling)", () => {
    for (const t of ["the IOCL fire, open that", "Jarvis, open the Kodungayur empty pot protest", "read the Pattinapakkam honking attack", "open the Puzhal jail drug smuggling",
      "tell me about the Madhavaram drug seizure", "கொடுங்கையூர் காலிக்குடம் போராட்டத்தைத் திறங்க"])
      expect(newsRequest(t, { onScreen: /IOCL/.test(t) })?.soft, t).toBe(true);
  });
});
