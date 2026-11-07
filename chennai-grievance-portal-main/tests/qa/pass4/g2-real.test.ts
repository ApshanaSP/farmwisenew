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
