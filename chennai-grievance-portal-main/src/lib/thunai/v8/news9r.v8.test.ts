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
