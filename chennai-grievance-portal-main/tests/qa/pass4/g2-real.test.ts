// QA pass 4, fixer G2: understanding and answers, through the real path (the browser's handle() written out in grader/client-sim.ts, the real planRound,
// serverWorld() and serverHands() on the pinned snapshot, no model key). English, Tamil letters and Tanglish. None of these sentences is in the open or the sealed set.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/g2-real.test.ts
//   RC-15  the Tamil brief reads Tamil lines, not the briefing tool's English templates
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearCaches } from "@/lib/thunai/round";
import { narrationOf } from "@/lib/thunai/stagelocal";
import { browserWorld, ClientSim, runConversation } from "./grader/client-sim";

const FROZEN = "2026-11-06T06:30:00.000Z";
let world: Awaited<ReturnType<typeof browserWorld>>["world"];
let list: Awaited<ReturnType<typeof browserWorld>>["list"];
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) }); ({ world, list } = await browserWorld()); }, 300_000);
afterAll(() => { vi.useRealTimers(); });

async function say(...turns: string[]) {
  clearCaches();
  const sim = new ClientSim(world, {}, list);
  let c = await runConversation(sim, [], turns[0]);
  for (const t of turns.slice(1)) c = await runConversation(sim, [], t);
  const slots = (c.last.stage?.slots ?? {}) as { zones?: number[]; cat?: string | null; period?: string | null };
  return { said: c.last.said ?? "", kind: c.last.kind, steps: c.last.steps ?? [], stage: c.last.stage, sim, zone: sim.zone ?? slots.zones?.[0] ?? null, cat: sim.cat ?? slots.cat ?? null, slots };
}
const LATIN = /[A-Za-z]{3,}/;

describe("RC-15 the Tamil brief carries Tamil lines (PB-207)", () => {
  it.each([
    ["Tamil letters, the district", "இன்றைய சுருக்கம் சொல்லு"],
    ["Tamil letters, a zone", "அடையாறு சுருக்கம்"],
    ["Tanglish, the district", "indha vaaram brief sollu"],
    ["Tanglish, a zone", "Perambur nelamai enna, konjam summary sollu"]
  ])("%s: %s", async (_n, text) => {
    const r = await say(text);
    expect(r.stage, r.said).toBeTruthy();
    const brief = r.stage!.blocks.find((b) => b.kind === "Brief");
    if (!brief || brief.kind !== "Brief") return; // a brief of a body or a screen that is not the brief recipe: covered by its own tests
    // every point the code builds has a Tamil line; the reasons are the Tamil of the templates; only the record's own title (before the colon) may stay as the record has it
    const lines = narrationOf(r.stage!, "ta");
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) {
      const afterTitle = l.text.includes(": ") ? l.text.slice(l.text.lastIndexOf(": ") + 2) : l.text;
      const own = brief.points.find((p, i) => `brief-${i}` === l.key)?.incidentId != null;
      expect(own ? afterTitle : l.text, l.text).not.toMatch(LATIN);
    }
    // no two lines say the same thing
    expect(new Set(lines.map((l) => l.text)).size).toBe(lines.length);
  });
});

describe("RC-15 the Tamil lines of a ranking, a trend and a dashboard say Tamil names (PB-161, PB-174 class)", () => {
  it("every department and category of the real world has its Tamil name (complete reference data)", async () => {
    const { DEPT_TA } = await import("@/lib/thunai/lexicon");
    const { CAT_LABEL_TA } = await import("@/lib/thunai/narrate");
    const noDept = world.depts.filter((d) => !DEPT_TA[d.code]).map((d) => d.code);
    const noCat = world.cats.filter((c) => !CAT_LABEL_TA[c.code]).map((c) => c.code);
    expect({ noDept, noCat }).toEqual({ noDept: [], noCat: [] });
  });
  it.each([
    ["a zone ranking, Tamil letters", "அதிக புகார்கள் உள்ள மண்டலங்கள் வரிசை"],
    ["a zone ranking, Tanglish", "enna zone la romba severe cases irukku rank pannu"],
    ["a trend, Tamil letters", "இந்த மாதம் புகார்கள் போக்கு என்ன"],
    ["a trend of one kind, Tamil letters", "இந்த மாதம் சாலை புகார்கள் போக்கு"],
    ["a dashboard of one kind, Tamil letters", "குப்பை புகார்கள் டாஷ்போர்டு"]
  ])("%s", async (_n, text) => {
    const r = await say(text);
    if (!r.stage) return;
    const lines = [r.said, ...narrationOf(r.stage, "ta").map((l) => l.text)];
    for (const l of lines) {
      // a record's own title may stay as the record has it; a zone, a department, a category, a unit and a date never do
      if (r.stage.blocks.some((b) => b.kind === "CaseList")) continue;
      expect(l, l).not.toMatch(/\b(incidents?|Incidents|Oct|Nov|Sep|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Dec|Roads|Garbage|Flooding)\b/);
    }
  });
});

// RC-05, RC-07 (lane a's leftovers; hunt-jarvis2-1, -2, -11): a zone said by NUMBER is a zone, in any wording
describe("a zone said by number, as a word or in Tamil letters, is kept (PB-288, PB-289, PB-298)", () => {
  const NAMES = ["", "Thiruvottiyur", "Manali", "Madhavaram", "Tondiarpet", "Royapuram", "Thiru-Vi-Ka", "Ambattur", "Anna Nagar", "Teynampet", "Kodambakkam", "Valasaravakkam", "Alandur", "Adyar", "Perungudi", "Sholinganallur"];
  const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
  it("the class: every zone, said as a number word, as digits and in Tamil letters, is the same zone", async () => {
    const { zonesIn } = await import("@/lib/thunai/quick");
    const TA_WORD = ["", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து", "பதினொன்று", "பன்னிரண்டு", "பதிமூன்று", "பதினான்கு", "பதினைந்து"];
    const bad: string[] = [];
    for (let n = 1; n <= 15; n++) {
      for (const text of [`severe complaints in zone ${WORDS[n]}`, `severe complaints in zone ${n}`, `zone number ${n} severe complaints`, `மண்டலம் ${n} கடுமையான புகார்கள்`, `மண்டலம் ${TA_WORD[n]} கடுமையான புகார்கள்`, `zone ${WORDS[n]} severe cases kaattu`]) {
        const t = ` ${text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;
        const got = zonesIn(t, world);
        if (got.length !== 1 || got[0] !== n) bad.push(`${text} -> ${JSON.stringify(got)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it.each([
    ["English number word", "show severe complaints in zone seven", 7],
    ["Tamil letters, digits", "மண்டலம் 8 கடுமையான புகார்கள் காட்டு", 8],
    ["Tamil letters, number word", "மண்டலம் ஒன்பது கடுமையான புகார்கள் காட்டு", 9],
    ["Tanglish", "zone aaru severe complaints kaattu", 6]
  ])("%s: the severe-cases screen is that zone's", async (_n, text, zone) => {
    const r = await say(text);
    const z = r.zone ?? (r.slots.zones ?? [])[0] ?? null;
    expect(z, r.said).toBe(zone);
    expect(r.said).not.toMatch(/^8 severe cases today/);
  });
  it("two zones said by number are both kept, and compared", async () => {
    const r = await say("zone three and zone nine compare");
    expect(r.slots.zones, r.said).toEqual([3, 9]);
  });
});

// RC-04 (hunt-jarvis1-8, -9, jarvis2-7): a note to keep, or an order Jarvis never carries out, is not a filter
describe("an order Jarvis does not carry out, and a note to keep, are not filters (PB-283, PB-284, PB-294)", () => {
  it.each([
    "close all severe complaints",
    "delete every overdue case in Adyar",
    "மண்டலம் 5 புகார்களை எல்லாம் மூடு",
    "send all the drafts now",
    "Adyar la ella complaints-um close pannu"
  ])("%s is refused or asked about, and the console is left alone", async (text) => {
    const r = await say(text);
    expect(r.steps.some((s) => s.a === "view" || s.a === "page"), r.said).toBe(false);
    expect(r.said.trim()).not.toBe("Severe");
  });
  it.each([
    ["Tamil letters", "மண்டலம் 5 முக்கியம்னு ஞாபகம் வச்சுக்கோ"],
    ["Tamil letters, polite ending", "அடையாறு கவனிக்கணும்னு நினைவில் வச்சுக்கோங்க"],
    ["Tanglish", "zone 5 mukkiyam nu nyabagam vechukonga"]
  ])("a note to keep, %s: asks to remember, opens nothing", async (_n, text) => {
    const r = await say(text);
    expect(r.steps.some((s) => s.a === "view"), r.said).toBe(false);
    expect(r.kind, r.said).toBe("clarify");
  });
});

// RC-06 (lane a's leftovers): "last week" and "last month" are the console's matching window (the last 7 and 30 days) in English, Tamil letters and Tanglish alike (BUG-003,
// an accepted decision, kept); a stretch the console does not hold ("two weeks ago", "a month ago", "last year", "next week") is asked about, in every language, never answered with
// the current window.
describe("last week and last month mean the same window in all three languages (PB-043..PB-050 class)", () => {
  it("the table: every word of the one period table reads as its own window in the fast lane", async () => {
    const { periodIn } = await import("@/lib/thunai/quick");
    const { PERIOD_TABLE } = await import("@/lib/thunai/lexicon");
    const bad: string[] = [];
    for (const [k, ws] of Object.entries(PERIOD_TABLE)) for (const w of ws) if (periodIn(` ${w} `) !== k) bad.push(`${w} -> ${periodIn(` ${w} `)} (want ${k})`);
    expect(bad).toEqual([]);
  });
  it.each([
    ["weekly", "show severe cases last week", "கடந்த வாரம் கடுமையான புகார்கள் காட்டு", "pona vaaram severe cases kaattu"],
    ["monthly", "show severe cases last month", "போன மாசம் கடுமையான புகார்கள் காட்டு", "kadantha maasam severe cases kaattu"],
    ["weekly", "show overdue cases last week", "கடந்த வாரம் காலக்கெடு தாண்டிய புகார்கள்", "pona vaaram deadline thaandiya cases kaattu"]
  ])("%s: the same window whatever the language", async (period, en, ta, tg) => {
    const got: string[] = [];
    for (const text of [en, ta, tg]) { const r = await say(text); got.push(String(r.slots.period ?? r.sim.period)); }
    expect(got, `${en} | ${ta} | ${tg}`).toEqual([period, period, period]);
  });
  it.each([
    "show severe cases two weeks ago", "cases a month ago", "severe cases last year", "cases next week",
    "இரண்டு வாரம் முன்பு கடுமையான புகார்கள்", "ஒரு மாசம் முன்னாடி புகார்கள்", "அடுத்த வாரம் புகார்கள்",
    "rendu vaaram munnaadi severe cases kaattu", "adutha vaaram cases kaattu"
  ])("%s is asked about, not answered with the current window", async (text) => {
    const r = await say(text);
    expect(r.kind, r.said).toBe("clarify");
    expect(r.said).not.toMatch(/last 7 days|கடந்த 7 நாட்கள்|last 30 days/i);
    expect(r.steps.some((s) => s.a === "period" || s.a === "view")).toBe(false);
  });
  it("the matching windows are still answered (the guard of the guard)", async () => {
    for (const text of ["severe cases this week", "இந்த வாரம் கடுமையான புகார்கள்", "3 months severe cases", "மூன்று மாதம் கடுமையான புகார்கள்"]) {
      const r = await say(text);
      expect(r.kind, `${text}: ${r.said}`).not.toBe("clarify");
    }
  });
});

// RC-02, RC-03, RC-05 (lane a's leftovers): a place or a topic the rules cannot apply is said, not dropped; a word of the data is read by its longest name; an everyday word is not a filter
describe("a place or topic that cannot be applied is named, and the longest name wins (PB-091, PB-114, PB-130, PB-131, PB-173, PB-024)", () => {
  it.each([
    ["Latin letters", "Chetpet police report", /Chetpet/],
    ["a street name", "Anna Salai police report", /Anna Salai/],
    ["Tamil letters", "தி நகர் போலீஸ் அறிக்கை", /தி நகர்/],
    ["a second place", "Kilpauk police report", /Kilpauk/]
  ])("a place of ours that no zone holds, %s: the brief says it cannot narrow to it", async (_n, text, name) => {
    const r = await say(text);
    expect(r.said, r.said).toMatch(name);
    expect(r.said, r.said).toMatch(/can't narrow|பிரிக்க முடியவில்லை/);
  });
  it.each(["today's police report", "senior citizen police report", "Adyar police report", "full police report"])("the guard: %s names no place it cannot narrow to", async (text) => {
    const r = await say(text);
    expect(r.said, r.said).not.toMatch(/can't narrow|பிரிக்க முடியவில்லை/);
  });
  it.each([
    ["English, a long question", "District Revenue section at the Collectorate, where are we on things?"],
    ["Tanglish", "District Revenue pakkam enna nelamai"],
    ["a short request", "District Revenue report"]
  ])("the longer name of a body with no records here is not the Corporation's Revenue: %s", async (_n, text) => {
    const r = await say(text);
    const dept = (r.steps.find((s) => s.a === "view") as { view?: { dept?: string } } | undefined)?.view?.dept ?? (r.stage?.slots as { dept?: string } | undefined)?.dept ?? null;
    expect(dept, r.said).not.toBe("GCC-REV");
    expect(r.said, r.said).not.toMatch(/Tax & Licence/);
  });
  it("the guard: the Corporation's own revenue words still reach the Corporation's Revenue", async () => {
    const r = await say("property tax department status");
    const dept = (r.steps.find((s) => s.a === "view") as { view?: { dept?: string } } | undefined)?.view?.dept ?? (r.stage?.slots as { dept?: string } | undefined)?.dept ?? null;
    expect(dept, r.said).toBe("GCC-REV");
  });
  it.each([
    ["drain works pit, Tamil letters", "ஆலந்தூர்ல வடிகால் வேலை நடக்குற இடத்துல பள்ளம் மூடாம விட்டுட்டாங்க", "DRAIN_WORKS_SAFETY"],
    ["drain works, English", "unsafe pit at the drain works site in Alandur", "DRAIN_WORKS_SAFETY"],
    ["a plain pothole is still the road's", "pothole on the road in Alandur", "ROAD_DAMAGE"]
  ])("%s", async (_n, text, cat) => {
    const r = await say(text);
    const got = (r.steps.find((s) => s.a === "view") as { view?: { cat?: string } } | undefined)?.view?.cat ?? r.cat;
    expect(got, r.said).toBe(cat);
  });
  it.each([
    ["Tamil lamp words", "அடையாறு மின் விளக்கு புகார்கள்"],
    ["Tamil lamp words, other order", "மின்விளக்கு புகார் அடையாறு"],
    ["Tanglish", "Adyar la theru vilakku complaints kaattu"]
  ])("street-light words in %s read as the street-light category", async (_n, text) => {
    const r = await say(text);
    expect(r.cat ?? (r.slots as { cat?: string }).cat, r.said).toBe("STREETLIGHT_ELECTRICAL");
  });
  it.each(["கடுமையான வெயில்", "கடுமையான குளிர் இருக்கு", "கடுமையான வெப்பம் பற்றி சொல்லு"])("%s is the weather, not severe cases", async (text) => {
    const r = await say(text);
    expect((r.slots as { sev?: string | null }).sev ?? null, r.said).toBeNull();
    expect(r.steps.some((s) => s.a === "view" && (s as { view?: { sev?: string } }).view?.sev), r.said).toBe(false);
  });
  it("the guard: a real severity in Tamil is still one", async () => {
    const r = await say("கடுமையான புகார்கள் காட்டு");
    const sev = (r.steps.find((s) => s.a === "view") as { view?: { sev?: string } } | undefined)?.view?.sev ?? (r.slots as { sev?: string }).sev;
    expect(sev, r.said).toBe("Severe");
  });
  it.each(["the power cut complaint in Ambattur", "noise complaints in Adyar this week"])("%s: a topic no category names is not answered with every case of the place", async (text) => {
    const r = await say(text);
    expect(r.stage?.recipe === "cases" && !(r.stage?.slots as { cat?: string | null } | undefined)?.cat && !(r.stage?.slots as { q?: string | null } | undefined)?.q, r.said).toBe(false);
  });
});
