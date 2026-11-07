/**
 * QA pass 4, lane a: class guards for the understanding code (outside place or body, everyday words, word edges, periods, ...).
 * Each describe is one root cause from docs/qa/pass4/ROOT_CAUSES.md; the guard crosses a list with every language and every lane,
 * so the next sentence of the same kind fails here, not in front of the Collector. Fast, no snapshot, no model.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { briefTurn, foreignIn } from "./entities";
import { quickScreen } from "./quick";
import { resolveFrame } from "./frame";
import { understand } from "./understand";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const START = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, list: [], lastFilter: null, now: Date.parse("2026-11-06T06:30:00Z") };
const rules = (t: string) => understand(t, START as never, world as never) as { kind: string; steps?: { a: string; view?: { dept?: string; zone?: number | null; cat?: string | null } }[] };

// towns and countries that are in no word list of the code: the guard must hold for names it has never been told
const NEVER_LISTED = ["Zorbatown", "Vellapatti", "Kumarapuram", "Thenmalai", "Karungulam", "Pazhaveri", "Sundarapandi", "Nallur", "Kottaiyur", "Mannargudi", "Loyola", "Quorvex", "Brightwell"];
const TA_TOWNS = ["கும்பகோணம்", "நாகர்கோவில்", "பொள்ளாச்சி", "காரைக்குடி", "துபாய்", "கொழும்பு"];
const EN_HEADS = ["police", "corporation", "municipality", "water board", "health department", "council", "college", "association"];

describe("RC-01: an outside place or body is never answered with ours, in any lane", () => {
  const sentences: string[] = [];
  for (const t of NEVER_LISTED) for (const h of EN_HEADS) sentences.push(`${t} ${h} report`, `${t} ${h} status kudu`, `filter ${t} ${h}`, `${t}-la ${h} filter pannu`);
  for (const t of TA_TOWNS) for (const h of ["போலீஸ் அறிக்கை", "காவல்துறை நிலவரம்", "மாநகராட்சி அறிக்கை", "போலீஸ் பில்டர் போடு"]) sentences.push(`${t} ${h}`);
  for (const s of ["Anna Nagar, Madurai side. Flood complaints there?", "Colombo-la vellam ennanga", "ஆவடில குப்பை கதை என்ன?", "not this Manali, the Himachal one", "Old Madras Road in Bengaluru has potholes", "Bar Council meeting-la enna mudivu"]) sentences.push(s);
  it("one question for every lane: said as unknown by the brief turn, left alone by the fast lane and the frame, no filter from the rules", () => {
    const bad: string[] = [];
    for (const s of sentences) {
      const turn = briefTurn(s, world as never);
      if (!(turn?.kind === "reply" && turn.via === "unknown")) bad.push(`briefTurn: ${s}`);
      if (quickScreen(s, world as never)) bad.push(`quickScreen: ${s}`);
      if (quickScreen(s, world as never, { noBail: true })) bad.push(`quickScreen noBail: ${s}`);
      if (resolveFrame({ text: s, stage: null, turns: [{ heard: "police report", did: "brief" }], lastPlace: null, lastText: "Adyar flooding cases", world: world as never }).kind !== "none") bad.push(`frame: ${s}`);
      const u = rules(s);
      if (u.kind === "do" && (u.steps ?? []).some((x) => x.a === "view")) bad.push(`rules: ${s}`);
    }
    expect(bad).toEqual([]);
  });
  it("our own bodies and places are not taken for foreign ones", () => {
    const ours = ["Adyar police report", "chennai city police report", "police brief for Velachery", "corporation health department status", "Metrowater report", "greater chennai corporation report", "storm water drain department update",
      "PWD water resources report", "Chennai's police report", "our police status", "indha police report", "namma corporation report", "அடையாறு போலீஸ் அறிக்கை", "சென்னை மாநகராட்சி அறிக்கை", "weekly police report", "traffic police report", "show me the severe cases in Adyar"];
    for (const s of ours) expect(foreignIn(s, world as never), s).toBeNull();
  });
  it("general knowledge about a far place stays the general lane's", () => {
    expect(foreignIn("what is the capital of Delhi", world as never)).toBeNull();
    expect(foreignIn("Delhi police report", world as never)).not.toBeNull();
  });
});

describe("RC-01 class guard: no lane answers before it asks the one outside question", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const read = (f: string) => fs.readFileSync(`src/lib/thunai/${f}`, "utf8");
  it.each(["quick.ts", "frame.ts", "understand.ts", "entities.ts"])("%s calls foreignIn", (f) => expect(read(f)).toMatch(/foreignIn\(/));
  it("the fast lane asks it before any screen is built, and the rules before any view step", () => {
    const q = read("quick.ts"), u = read("understand.ts");
    expect(q.indexOf("foreignIn(text, w)")).toBeGreaterThan(0);
    expect(q.indexOf("foreignIn(text, w)")).toBeLessThan(q.indexOf("// follow-ups and edits of an open screen"));
    expect(u.indexOf("foreignIn(input, world)")).toBeLessThan(u.indexOf("// ---------------------------------------------------- questions and readings"));
  });
  it("an ordinary word in front of an agency word is not a place (adverbs, commands, Tanglish verbs)", () => {
    for (const s of ["kindly tell me which department has the most open complaints", "export police report", "City Health Officer kitta irukura department nelavaram kudu", "please show the police report"]) expect(foreignIn(s, world as never), s).toBeNull();
  });
  it("another jurisdiction's word in front of an agency word is another body", () => {
    for (const s of ["state police report", "central police report", "district police status", "airport police report"]) expect(foreignIn(s, world as never), s).not.toBeNull();
  });
});

describe("RC-01: the reply language follows the Collector's words, not one marker word", async () => {
  const { detectLang } = await import("./normalise");
  it("Tanglish is Tamil, a long English sentence with one stray word is English, a zone named Thiru is English", () => {
    for (const s of ["Colombo-la vellam ennanga, romba mosama?", "Pondy Anna Salai la accident nadandhucha, theriyuma", "Mangalore pakkam Adyar nu oru ooru iruke, anga vellam eppadi"]) expect(detectLang(s), s).toBe("ta");
    for (const s of ["Anything from Coimbatore actually dengue er indha maasam?", "Thiru Vi Ka Nagar police report", "show flooding cases in Adyar"]) expect(detectLang(s), s).toBe("en");
    expect(detectLang("மழை எப்படி")).toBe("ta");
  });
});

// RC-04: one intent gate in front of every lane. The same sentence goes to every lane and must get the same class.
import { isNavCommand } from "./plan";
import { CHANGE_RECORD, KEEPING } from "./lexicon";
describe("RC-04: a keeping note, an order to change a record and a data question are never a brief, a screen or a console move", () => {
  const BODIES = ["police", "corporation", "Metrowater", "PWD"];
  const keep = (b: string) => [`remind me to check the ${b} report`, `don't let me forget the ${b} report`, `keep the ${b} report for later`, `make a note of the ${b} status`, `${b} report ah nyabagam vechukko`,
    `${b} அறிக்கை பார்க்க நினைவூட்டு`, `${b} அறிக்கையை ஞாபகம் வச்சுக்கோ`, `${b} ரிப்போர்ட் சேவ் பண்ணு`, `${b} ரிப்போர்ட் டைப் பண்ணு`];
  const change = (b: string) => [`change the ${b} case status to closed`, `${b} records-la andha FIR status-a closed nu maathidu`, `${b} பதிவு நிலையை மாற்று`, `mark the ${b} complaint as resolved`];
  it("keeping and changing: no brief, no fast-lane screen, no filter from the rules", () => {
    const bad: string[] = [];
    for (const b of BODIES) for (const s of [...keep(b), ...change(b)]) {
      if (!(KEEPING.test(s) || CHANGE_RECORD.test(s))) bad.push(`class: ${s}`);
      if (briefTurn(s, world as never)?.kind === "screen") bad.push(`brief: ${s}`);
      if (quickScreen(s, world as never)) bad.push(`quick: ${s}`);
      const u = rules(s);
      if (u.kind === "do" && (u.steps ?? []).some((x) => x.a === "view" || x.a === "page")) bad.push(`rules: ${s}`);
    }
    expect(bad).toEqual([]);
  });
  it("a data question never moves the console, in English, Tamil and Tanglish", () => {
    const steps = [{ a: "view", view: { zone: 13 } }] as never;
    for (const s of ["Severe flood cases still open Adyar, just list them", "Adyar flooding open, give me just the number", "Zone 5, total open", "இந்த வாரம் severe மட்டும் எடுத்து போடு", "அடையாறு வெள்ள பட்டியல் குடு", "indha vaaram severe-a ellam list podu", "எந்த டிபார்ட்மெண்ட் ரொம்ப மெதுவா வேலை பாக்குது?"]) expect(isNavCommand(s, steps), s).toBe(false);
    for (const s of ["only Adyar", "show only Adyar", "அடையாறுக்கு மாற்று", "Adyar-ku maathu", "filter pannu Adyar"]) expect(isNavCommand(s, steps), s).toBe(true);
  });
  it("a Tamil verb inside a longer word is not the verb (போ in போராட்டம், போனவங்க)", () => {
    const steps = [{ a: "view", view: { zone: 2 } }] as never;
    for (const s of ["மணலில போராட்டம் கேஸ்", "காணாம போனவங்க கேஸ்"]) expect(isNavCommand(s, steps), s).toBe(false);
  });
  it("how fast Jarvis talks is a short order or about the voice, never a question about the data", () => {
    expect(rules("எந்த டிபார்ட்மெண்ட் ரொம்ப மெதுவா வேலை பாக்குது?").steps?.[0]?.a ?? "").not.toBe("speed");
    expect(rules("which department is slowest to close cases").steps?.[0]?.a ?? "").not.toBe("speed");
    for (const s of ["slower", "slow down", "speak slowly", "மெதுவா பேசு", "faster please"]) expect(rules(s).steps?.[0]?.a, s).toBe("speed");
  });
  it("a workspace is opened by name in Tamil and Tanglish as in English", () => {
    for (const s of ["open workspace morning round", "morning round ஒர்க்ஸ்பேஸ் திற", "morning round workspace open pannu", "morning round workspace-a thira"]) {
      const st = rules(s).steps?.[0] as { a: string; op?: string; name?: string } | undefined;
      expect([st?.a, st?.op, (st?.name ?? "").toLowerCase()], s).toEqual(["workspace", "open", "morning round"]);
    }
  });
  it("click and press name a control, not a request for a screen", () => {
    expect(quickScreen("click trends", world as never)).toBeNull();
    expect(quickScreen("Jarvis, press trends", world as never)).toBeNull();
    expect((rules("Jarvis, click Trends").steps?.[0] as { name?: string } | undefined)?.name).toBe("Trends");
  });
});

// RC-05: the same question has the same topic, filter and deadline in every language, and a lane never drops a filter it read.
import { CAT_ALIASES } from "./lexicon";
import { catIn, deptWordIn, statusIn } from "./quick";
describe("RC-05: topic, status and filters are read the same in every language and lane", () => {
  it("no spoken name belongs to two categories (a name that does would make one question two topics)", () => {
    const seen = new Map<string, string>(), clash: string[] = [];
    for (const [code, words] of Object.entries(CAT_ALIASES)) for (const w of words) { const k = w.trim().toLowerCase(); const o = seen.get(k); if (o && o !== code) clash.push(`${k}: ${o} and ${code}`); seen.set(k, code); }
    expect(clash).toEqual([]);
  });
  const triples: [string, string, string][] = [
    ["drain complaints in Ambattur", "Ambattur la drain complaints", "அம்பத்தூரில் வடிகால் புகார்கள்"],
    ["stray animal complaints in Valasaravakkam", "Valasaravakkam la stray dog complaints", "வளசரவாக்கத்தில் தெருநாய் புகார்கள்"],
    ["garbage complaints in Anna Nagar", "Anna Nagar la kuppai complaints", "அண்ணா நகரில் குப்பை புகார்கள்"],
    ["fire complaints in Madhavaram", "Madhavaram la fire complaints", "மாதவரத்தில் தீ புகார்கள்"],
  ];
  it("the topic and the place of one question are the same in English, Tanglish and Tamil", () => {
    for (const [en, tg, ta] of triples) {
      const a = quickScreen(en, world as never), b = quickScreen(tg, world as never), c = quickScreen(ta, world as never);
      const topic = (q: ReturnType<typeof quickScreen>) => (q?.slots as { cat?: string } | undefined)?.cat ?? null;
      const where = (q: ReturnType<typeof quickScreen>) => JSON.stringify((q?.slots as { zones?: number[] } | undefined)?.zones ?? null);
      expect([topic(b), topic(c)], en).toEqual([topic(a), topic(a)]);
      expect(topic(a), en).not.toBeNull();
      expect(where(b), en).toBe(where(a)); // the zone of the Tamil spelling is the data's (ta names come from the live world), checked on the real path
    }
  });
  it("past the deadline, said any way in three languages, is overdue; still open is open", () => {
    for (const s of ["past the deadline", "beyond the deadline", "after the deadline", "breached their deadline", "deadline missed", "delayed severe cases", "not resolved in time", "deadline thaandi pochu", "deadline mudinjiduchu", "deadline miss aachu", "தாமதமான புகார்கள்", "கெடு தாண்டிய புகார்கள்"]) expect(statusIn(` ${s} `), s).toBe("overdue");
    for (const s of ["still open", "unresolved ones", "pending cases", "not yet resolved", "innum mudiyaadha cases", "தீர்க்கப்படாத புகார்கள்"]) expect(statusIn(` ${s} `), s).toBe("open");
    expect(statusIn(" garbage complaints ")).toBeNull();
  });
  it("a broad word (water) never beats the specific one (lakes), in any language", () => {
    for (const s of ["lakes la water level enna", "what is the water level of the lakes", "ஏரிகளின் நீர் மட்டம் என்ன"]) expect(quickScreen(s, world as never)?.recipe, s).toBe("readings");
    expect(catIn(" water supply complaints ")).toBe("WATER_SUPPLY");
  });
  it("a filter the lane has no slot for is never dropped: a ward, or a department with no topic, goes to the agent", () => {
    for (const s of ["severe complaints in ward 172", "top five wards by severe complaints", "வார்டு 172 புகார்கள்"]) expect(quickScreen(s, world as never), s).toBeNull();
    expect(deptWordIn(" tax department unresolved ones ")).not.toBeNull();
    expect(quickScreen("Tax department, unresolved ones", world as never)).toBeNull();
  });
  it("a second topic word is not answered as the first (flood relief is not standing water)", () => {
    for (const s of ["explain the flood relief need in Adyar", "அடையாறு வெள்ள நிவாரணம் விளக்குங்க"]) expect(quickScreen(s, world as never), s).toBeNull();
    expect(quickScreen("explain the flooding complaint in Adyar", world as never)?.recipe).toBe("case");
  });
});

// RC-02: everyday words and foreign names never become a zone, a body, a reservoir or a case by sound or by a near spelling.
import { resolveEntity } from "./entities";
import { taMatch } from "./normalise";
describe("RC-02: no entity from an everyday sentence", () => {
  // sentences with no place or body in them, in the three languages; the data's names must not be heard in them
  const EVERYDAY = ["this week's status", "give me the quarterly summary", "what is there to see", "do it now", "close it", "tell me about the state", "was there any news today", "how are we doing this month",
    "indha vaaram nilavaram enna", "quarterly summary sollu", "adha close pannidu", "angu enna nadakkudhu", "inge vandhu paaru", "oru nimidam wait pannu", "maanila arasu pathi sollu", "ennaku konjam help pannu",
    "இந்த வாரம் நிலவரம்", "காலாண்டு சுருக்கம்", "ஆட்சியர் அறிக்கை", "மாநில நிலவரம்", "அங்க என்ன நடக்குது", "கொடு", "கொடுத்து விடு", "என்னிடம் சொல்லு", "இதை நிறுத்து"];
  it("resolves to no body and no zone", () => {
    const bad: string[] = [];
    for (const s of EVERYDAY) { const r = resolveEntity(s, world as never); if (r.kind === "entity" || r.kind === "ambiguous") bad.push(`${s} -> ${r.kind === "entity" ? r.entity.id : "ambiguous"}`); }
    expect(bad).toEqual([]);
  });
  it("a place named only by its first word is ambiguous, so it is no place (Anna Salai, Anna University)", () => {
    for (const s of ["Anna Salai status", "Anna flyover report", "அண்ணா சாலை அறிக்கை"]) { const r = resolveEntity(s, world as never); expect(r.kind === "entity" && r.entity.id === "ZONE-8", s).toBe(false); }
    const full = resolveEntity("Anna Nagar zone report", world as never);
    expect(full.kind === "entity" && full.entity.id).toBe("ZONE-8");
  });
  it("a Tamil name that ends in -u needs the whole name before it takes a case ending (கொசு is not கொடு)", () => {
    expect(taMatch("கொடு", "கொசு")).toBe(false);
    expect(taMatch("கொடைக்கானல்", "கொசு")).toBe(false);
    expect(taMatch("கொசுவை", "கொசு")).toBe(false);
    expect(taMatch("அடையாற்றில்", "அடையாறு")).toBe(true);
  });
  it("a misheard name keeps its first letter; a number before the word zones is a count", () => {
    expect(resolveEntity("Adayar report", world as never).kind === "entity").toBe(true);
    expect(rules("top five zones by open cases").steps?.some((x) => x.a === "view" && (x.view as { zone?: number | null } | undefined)?.zone === 5)).toBeFalsy();
  });
});
