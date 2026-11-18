import { describe, expect, it } from "vitest";
import { newsRequest, pickStory, rankStories, topicWords, type StoryItem } from "./news8";

// real headlines from the dry-run store, 18 Nov 2026 (eval/v8/ref): the panel's and the store's
const PANEL: StoryItem[] = [
  { id: "p1", title: "Aquaan storm caused sea turbulence at Chennai Kasimedu fishing harbor", outlets: ["Dinamalar"], onScreen: 1, t: "2026-11-18 19:00" },
  { id: "p2", title: "GCC issues 124 de-occupation notices for coastal buildings", outlets: ["The Hindu"], onScreen: 2, t: "2026-11-18 18:00" },
  { id: "p3", title: "Chief Minister Vijay inaugurated 12 completed municipal projects in Chennai Municipal Corporation", outlets: ["Daily Thanthi"], onScreen: 3, t: "2026-11-18 17:00" },
  { id: "p4", title: "“பள்ளிக்கரணையில் தடுப்புச் சுவர் பணிகளையும் நிறுத்த வேண்டும்” - அன்புமணி", outlets: ["Hindu Tamil Thisai"], onScreen: 4, t: "2026-11-18 14:53" },
  { id: "p6", title: "Two arrested for assaulting traffic police constable near R.K. Salai in Chennai", outlets: ["The Hindu"], onScreen: 6, t: "2026-11-18 12:00" },
  { id: "p7", title: "Cyclone Akvan: RMC forecasts moderate rainfall for Chennai on Wednesday", outlets: ["Makkal Kural", "BBC", "DD News"], onScreen: 7, t: "2026-11-18 11:00" },
  { id: "p9", title: "அயனாவரம் பேருந்து நிலையம் எதிரே ஆறாக ஓடும் கழிவுநீர்! நடவடிக்கை எடுக்குமா குடிநீர் வாரியம்?", outlets: ["Dinamani"], onScreen: 9, t: "2026-11-18 10:00" },
  { id: "p17", title: "Chennai Metropolitan Area faces 500 MLD water deficit; another desal plant planned at Minjur", outlets: ["DT Next"], onScreen: 17, t: "2026-11-18 09:00" },
  { id: "p18", title: "Police nod holds up renovation of Nungambakkam and Duraisamy subways", outlets: ["DT Next"], onScreen: 18, t: "2026-11-18 08:30" },
  { id: "p19", title: "Tamil Nadu: Fire at IOCL plant in Chennai; worker killed in explosion", outlets: ["The Economic Times"], onScreen: 19, t: "2026-11-18 08:00" },
  { id: "p20", title: "Madras HC orders mandatory licensing and tagging of cattle in urban areas across Tamil Nadu to prevent motor accidents", outlets: ["The Hindu"], onScreen: 20, t: "2026-11-18 07:00" },
  { id: "p23", title: "Intelligent Transport System to start operations in Chennai next month", outlets: ["The Hindu"], onScreen: 23, t: "2026-11-18 06:00" }
];
const STORE: StoryItem[] = [
  { id: "s1", title: "Construction ban on Pallikkaranai wetland ordered by the Supreme Court for ‘Credai’", outlets: ["Dinamalar"], place: "Pallikaranai", t: "2026-11-18 19:24" },
  { id: "s2", title: "Pallikaranai Marshland Construction Freeze Stays: Madras High Court Defers To Supreme Court", outlets: ["LawChakra"], place: "Pallikaranai", t: "2026-11-18 18:22" },
  { id: "s3", title: "Pallikaranai marsh construction ban: Madras HC asks litigants to approach Supreme Court for interim relief", outlets: ["The Hindu"], place: "Pallikaranai", t: "2026-11-18 12:02" },
  { id: "s4", title: "Supreme Court bench to be established in Chennai - Published in Central Government Gazette", outlets: ["Top Tamil News"], place: "Chennai", t: "2026-11-17 17:49" },
  { id: "s5", title: "Health Department and Rotary Club of Madras partner to take forward HPV vaccination", outlets: ["The Hindu"], place: "Chennai", t: "2026-11-18 19:43" },
  { id: "s6", title: "CaratLane's Retail Network Reaches 400 Stores in India with Chennai’s 16th Store in Pallikaranai", outlets: ["5 Dariya News"], place: "Pallikaranai", t: "2026-11-18 17:59" },
  { id: "s7", title: "Vandalur Zoo closed due to bird flu to reopen tomorrow!", outlets: ["Dinamani"], place: "Chennai", t: "2026-11-16 10:00" },
  { id: "s8", title: "Chennai Corporation opens free public toilets at 853 locations", outlets: ["Daily Thanthi", "The Hindu"], place: "Chennai", t: "2026-11-15 10:00" }
];
const ALL = [...PANEL, ...STORE];
const PLACES = ["Pallikaranai", "Adyar", "Kasimedu", "Nungambakkam", "Ayanavaram", "Minjur", "Royapuram", "Teynampet", "Anna Nagar", "Kerala", "Mumbai"];
const find = (text: string, items = ALL, onScreen = true) => {
  const req = newsRequest(text, { onScreen });
  if (!req) return null;
  return { req, ...pickStory(rankStories(req, items, { places: PLACES })) };
};

describe("v8 news: the owner's example 1 (a story by its topic)", () => {
  it("'Open the Supreme Court news on Palikan' opens the Pallikaranai Supreme Court story (Palikan is Pallikaranai)", () => {
    const r = find("Open the Supreme Court news on Palikan.");
    expect(r?.req.kind).toBe("story");
    expect(["s1", "s2", "s3"]).toContain(r?.pick?.id);
  });
  it("'Open that one, that's Supreme Court order' (the owner's own words) opens a Supreme Court story", () => {
    const r = find("Open that one, that's Supreme Court order.");
    expect(r?.pick?.title).toMatch(/supreme court/i);
  });
  it("a headline read aloud with 'and that news' opens that story, a Tamil-letter word and all", () => {
    const r = find("Open the health department and rotary club of Madras partner to take forward HPVC. வாக்சினேசன். And that news.");
    expect(r?.pick?.id).toBe("s5");
  });
  it("the Pallikaranai marsh story, by place and topic", () => expect(["s1", "s2", "s3"]).toContain(find("Open the Pallikaranai marsh story.")?.pick?.id));
  it("an outlet and a topic: DT Next's piece on the water deficit", () => expect(find("Read DT Next's piece on the water deficit.")?.pick?.id).toBe("p17"));
  it("'the X one' with news on screen", () => {
    expect(find("The Nungambakkam subway one, open it.")?.pick?.id).toBe("p18");
    expect(find("Open the one about the traffic constable.")?.pick?.id).toBe("p6");
    expect(find("What about the Economic Times story?")?.pick?.id).toBe("p19");
  });
  it("Tamil and Tanglish", () => {
    expect(find("அயனாவரம் கழிவுநீர் செய்தியைப் படியுங்கள்.")?.pick?.id).toBe("p9");
    expect(find("andha IOCL fire news ah padinga")?.pick?.id).toBe("p19");
    expect(find("Kasimedu harbour news pathi sollunga")?.pick?.id).toBe("p1");
    expect(["s1", "s2", "s3", "s4"]).toContain(find("Supreme Court news open pannunga.")?.pick?.id);
    expect(["s1", "s2", "s3", "s4"]).toContain(find("சுப்ரீம் கோர்ட் செய்தியைத் திறங்க.")?.pick?.id);
  });
  it("a story only in the store (this week's)", () => {
    expect(find("Open the Vandalur zoo story.", ALL, false)?.pick?.id).toBe("s7");
    expect(find("Open the free public toilets news.", ALL, false)?.pick?.id).toBe("s8");
  });
  it("several outlets' reports of one event are one story: no 'other one' among them", () => {
    const r = find("Open the Pallikaranai marsh story.");
    expect(r?.other == null || !["s1", "s2", "s3"].includes(r.other.id)).toBe(true);
  });
});

describe("v8 news: the owner's example 2 (a short news question)", () => {
  it("'What's the news on the Supreme Court?' is a news question with its topic", () => {
    const r = find("What's the news on the Supreme Court?");
    expect(r?.req.kind).toBe("ask");
    expect(r?.stories.some((s) => /supreme court/i.test(s.title))).toBe(true);
  });
  it("short news questions in three languages", () => {
    expect(find("Any news on the cyclone?")?.stories.some((s) => /cyclone|akvan|storm/i.test(s.title))).toBe(true);
    expect(find("Is there anything in the news about the Pallikaranai marsh?")?.req.kind).toBe("ask");
    expect(find("IOCL fire pathi news la enna solraanga?")?.stories[0]?.id).toBe("p19");
    expect(find("பள்ளிக்கரணை பற்றி செய்தியில என்ன வந்திருக்கு?")?.stories.length).toBeGreaterThan(0);
  });
  it("what is not in the news is not matched to something else (Kerala's floods, a volcano)", () => {
    expect(find("Any news on the Kerala floods?")?.pick ?? null).toBeNull();
    expect(find("Is there any news about a volcano in Chennai?")?.pick ?? null).toBeNull();
  });
});

describe("v8 news: the dev set's misses (18 Nov)", () => {
  it("'CM' is the Chief Minister, and 'inauguration' is 'inaugurated'", () => expect(find("Open the CM inauguration news.")?.pick?.id).toBe("p3"));
  it("a place's situation is the console's, not a news question", () => {
    expect(newsRequest("What's happening in Royapuram?", { onScreen: false })).toBeNull();
    expect(newsRequest("what's happening in Teynampet", { onScreen: true })).toBeNull();
  });
  it("'what else is in the news about it' has no topic of its own", () => expect(topicWords("What else is in the news about it?", null)).toEqual([]));
});

describe("v8 news: not this lane's", () => {
  for (const t of ["Open the news.", "Tell me today's important news.", "Show me the latest news.", "Read the second story.", "Open the third news.", "Show me the cases in Adyar.",
    "Open the Adyar case.", "Go to trends.", "Don't open the news.", "Will it rain tonight?", "rendavadhu news ah padinga"]) {
    it(JSON.stringify(t), () => expect(newsRequest(t, { onScreen: true })).toBeNull());
  }
  it("the topic words leave the request's own words out", () => {
    expect(topicWords("Open the Supreme Court news on Palikan.", null)).toEqual(["supreme", "court", "palikan"]);
    expect(topicWords("Supreme Court news open pannunga.", null)).toEqual(["supreme", "court"]);
  });
});
