// QA pass 4, fixer G1: the second job's mechanisms, through the real path (the browser's handle() written out in grader/client-sim.ts, the real planRound,
// serverWorld() and serverHands() on the pinned snapshot, no model key). English, Tamil letters and Tanglish. None of these sentences is in the open or the sealed set.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/g1-real.test.ts
// The seven open-set rows that went from safe to wrong when lane a landed (ta-brief-20, ta-explain-14, ta-explain-16, ta-noisy-07, tanglish-explain-08, tanglish-explain-20,
// tanglish-numbers-11) fell for five reasons. Each is a mechanism here:
//   1 a place said with a Tamil case ending ("...kkattula") was read as the name of another body when an agency word followed (RC-01 over-reach)
//   2 a Tanglish verb ("solraanga") or question word ("edhu") in front of an agency word was read as the name of another body
//   3 "yesterday" was a refusal of a plain request, where the rest of the sentence could be read
//   4 "explain" in Tamil or Tanglish took the whole sentence as the order to explain the screen, with a place and a topic named in it
//   5 the one-word name of a category ("drain") won over the category whose label the sentence says more of ("drain work ... safety")
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim, runConversation } from "./grader/client-sim";

const FROZEN = "2026-11-06T06:30:00.000Z";
let world: Awaited<ReturnType<typeof browserWorld>>["world"];
let list: Awaited<ReturnType<typeof browserWorld>>["list"];
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) }); ({ world, list } = await browserWorld()); });
afterAll(() => { vi.useRealTimers(); });

async function say(text: string) {
  clearCaches();
  const sim = new ClientSim(world, {}, list);
  const c = await runConversation(sim, [], text);
  // the console's filters, or the screen's own scope when the answer was a screen
  const slots = (c.last.stage?.slots ?? {}) as { zones?: number[]; cat?: string | null };
  return { said: c.last.said ?? "", kind: c.last.kind, steps: c.last.steps ?? [], zone: sim.zone ?? slots.zones?.[0] ?? null, cat: sim.cat ?? slots.cat ?? null, dept: sim.dept };
}
const NO_DATA = /no data on|தரவு இல்லை|data illa|தரவு இல்லை/i;

describe("1 a place with a Tamil case ending is ours, not another body's", () => {
  it.each([
    ["Tamil letters", "அடையாறுல கார்ப்பரேஷன் ஹெல்த் டிபார்ட்மெண்ட் என்ன பண்றாங்க?"],
    ["Tamil letters, a second place", "மாதவரத்துல கார்ப்பரேஷன் வேலை எப்படி போகுது"],
    ["Tanglish, the ending joined on", "Adyarla corporation health department enna panraanga"],
    ["Tanglish, a second place", "Velacherila corporation work eppadi irukku"]
  ])("%s: %s", async (_n, text) => {
    const r = await say(text);
    expect(r.said, r.said).not.toMatch(NO_DATA);
    // the place is taken up: a zone filter, or (for Velachery, a taluk and a map place) a step on the taluk or the map; never a refusal and never "no data"
    expect(r.kind === "do" && (r.zone != null || r.steps.length > 0), r.said).toBe(true);
  });
});

describe("2 a Tanglish verb or question word is not the name of another body", () => {
  it.each([
    "Adyar work site-la quality mosam nu solraanga, andha Corporation work vishayam enna",
    "edhu department adhigama pending irukku? rank pannu",
    "yaaru department romba slow, pending vechu sollu",
    "ellarum solraanga corporation work mosam nu"
  ])("%s", async (text) => { const r = await say(text); expect(r.said, r.said).not.toMatch(NO_DATA); });
  // the guard: a body or place that is not ours is still said so, in the same sentences' shape
  it.each(["Kumbakonam police report", "Loyola college health department", "Mumbai corporation report", "Kumbakonam corporation work eppadi irukku"])("%s is still no data of ours", async (text) => {
    const r = await say(text);
    expect(r.said, r.said).toMatch(NO_DATA);
    expect(r.zone).toBeNull();
  });
});

describe("3 yesterday is asked about, not refused, and nothing is shown for today as if it were yesterday", () => {
  it.each([
    ["English", "show the fire complaints in Adyar yesterday"],
    ["Tamil letters", "நேத்து அடையாறுல தீ விபத்து ஆச்சு, என்ன ஏதுன்னு சொல்லு"],
    ["Tanglish", "nethu Adyar la fire accident enna aachu"]
  ])("%s: %s", async (_n, text) => {
    const r = await say(text);
    expect(r.kind).toBe("clarify");
    expect(r.steps, "no step is taken before the Collector answers").toEqual([]);
    expect(r.said).toMatch(/yesterday|நேற்று/i);
  });
});

describe("4 'explain' with a place or a topic in the sentence is not the order to explain the screen", () => {
  it.each([
    ["Tamil letters", "மணலி பக்கம் குப்பை ஜாஸ்தியாம், விளக்கி சொல்லு"],
    ["Tanglish", "Manali pakkam kuppai jaasthiyaam, vilakkunga"],
    ["English", "explain the garbage complaints in Manali"]
  ])("%s: %s", async (_n, text) => {
    const r = await say(text);
    expect(r.steps.map((s: { a: string }) => s.a)).not.toEqual(["explain"]);
    expect(r.zone, "the place named is applied").toBe(2);
  });
  // the guard: the bare order still explains the screen
  it.each(["இதை விளக்கு", "vilakkunga", "explain this chart"])("%s", async (text) => { expect((await say(text)).steps.map((s: { a: string }) => s.a)).toEqual(["explain"]); });
});

describe("5 the category whose label the sentence says more of wins over a one-word name", () => {
  it.each([
    ["Tanglish", "Adyar-la drain work pallam thorandhu kedakku, safety issue explain pannu", "DRAIN_WORKS_SAFETY"],
    ["English", "drain works site safety problem in Adyar", "DRAIN_WORKS_SAFETY"],
    ["English, the plain word", "drain blocked in Adyar", "DRAINAGE_SEWAGE"],
    ["Tamil letters, the plain word", "அடையாறு வடிகால் அடைப்பு", "DRAINAGE_SEWAGE"],
    ["Tanglish, the plain word", "Adyar la sewage overflow", "DRAINAGE_SEWAGE"]
  ])("%s: %s", async (_n, text, cat) => { const r = await say(text); expect(r.cat, r.said).toBe(cat); });
});

describe("a body said back in the words it was said in (audit-understanding-17)", () => {
  it.each(["தீயணைப்பு துறை அறிக்கை", "சுகாதார துறையின் புதிய நிலவரம்"])("%s", async (text) => {
    const r = await say(text);
    if (NO_DATA.test(r.said)) expect(r.said).not.toMatch(/Tiyanaippu|\b[A-Z][a-z]+ Department\b/);
  });
});
