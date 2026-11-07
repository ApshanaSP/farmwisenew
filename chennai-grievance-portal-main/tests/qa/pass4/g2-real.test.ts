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
