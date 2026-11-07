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
