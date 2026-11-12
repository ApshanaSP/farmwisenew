// QA pass 6, hunter pass4-open: two tests of pass 4's own g2-real.test.ts fail on this tree. This file repeats each sentence alone (a fresh tab, caches cleared)
// and keeps what Jarvis said, to tell a real regression from order dependence.
//   QA_PIN_PORT=3197 timeout 600 npx vitest run --config vitest.qa4.config.ts --dir tests/qa/pass6/probes/pass4-open p6-regress
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// only under vitest.qa4.config.ts (dry-run store reading the pinned snapshot on 127.0.0.1); under another config this file stops before any import runs
vi.hoisted(() => { if (!(process.env.QA_GROQ_ONLY === "1" && process.env.AWS_STORE_DRY_RUN === "1" && /^http:\/\/127\.0\.0\.1:/.test(process.env.AWS_API_URL ?? ""))) throw new Error("pass4-open probe: run with vitest.qa4.config.ts only"); });
import { clearCaches } from "@/lib/thunai/round";
import { narrationOf } from "@/lib/thunai/stagelocal";
import { browserWorld, ClientSim, runConversation } from "../../../../../../../../tests/qa/pass4/grader/client-sim";

const FROZEN = "2026-11-06T06:30:00.000Z";
const EVID = path.resolve(process.cwd(), "..", "docs", "qa", "pass6", "evidence", "pass4-open");
const seen: Record<string, unknown> = {};
let world: any, list: any;
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) }); ({ world, list } = await browserWorld()); }, 300_000);
afterAll(() => { vi.useRealTimers(); fs.mkdirSync(EVID, { recursive: true }); fs.writeFileSync(path.join(EVID, "p6-regress.json"), JSON.stringify(seen, null, 1)); });
async function say(text: string) {
  clearCaches();
  vi.setSystemTime(new Date(FROZEN));
  const sim = new ClientSim(world, {}, list);
  const c = await runConversation(sim, [], text);
  const slots = (c.last.stage?.slots ?? {}) as { period?: string | null };
  return { said: c.last.said, kind: c.last.kind, lane: c.last.lane, stage: c.last.stage, period: String(slots.period ?? sim.period), title: c.last.stage?.title ?? null, steps: c.last.steps };
}

describe("RC-06 class (PB-043): 'last week' is the week in every language", () => {
  it.each([
    ["en overdue", "show overdue cases last week"],
    ["ta overdue", "கடந்த வாரம் காலக்கெடு தாண்டிய புகார்கள்"],
    ["ta overdue, with a verb", "கடந்த வாரம் காலக்கெடு தாண்டிய புகார்கள் காட்டு"],
    ["tanglish overdue", "pona vaaram deadline thaandiya cases kaattu"],
    ["ta severe", "கடந்த வாரம் கடுமையான புகார்கள் காட்டு"]
  ])("%s: %s", async (name, text) => {
    const r = await say(text as string);
    seen[`period ${name}`] = { text, said: r.said, kind: r.kind, lane: r.lane, period: r.period, title: r.title, steps: r.steps };
    // the week asked, or a question back; never today's window shown as if it were last week
    if (r.kind !== "clarify") expect(r.period, `${r.lane}: ${r.said} | ${r.title}`).toBe("weekly");
  });
});

describe("PB-207: a Tamil (Tanglish) district brief does not say the same line twice", () => {
  it.each([["tanglish", "indha vaaram brief sollu"], ["ta", "இந்த வாரம் சுருக்கம் சொல்லு"], ["en", "this week's brief"]])("%s: %s", async (name, text) => {
    const r = await say(text as string);
    const lines = r.stage ? narrationOf(r.stage, name === "en" ? "en" : "ta").map((l) => l.text) : [];
    const dup = lines.filter((l, i) => lines.indexOf(l) !== i);
    seen[`brief ${name}`] = { text, lane: r.lane, title: r.title, lines, dup };
    expect(lines.length, r.said).toBeGreaterThan(2);
    expect(dup).toEqual([]);
  });
});
