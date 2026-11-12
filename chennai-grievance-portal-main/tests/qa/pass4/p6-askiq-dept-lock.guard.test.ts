// QA pass 6, P6-006 (found by the redsec2 red team): Ask District IQ for a department officer answers only about the officer's own department.
// The fast path (fastpath.ts) opened any incident named by id ("tell me about INC-…", its timeline, incidents like it, what to do about it)
// with no department check, while the planner's path refuses ("that incident is handled by another department") and the officer console
// answers 404 for the same id. Real ask(), real pinned snapshot, no model key in the process, a frozen clock.
//   QA_PIN_PORT=3197 npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/p6-askiq-dept-lock.guard.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pool, { ops } from "@/lib/collector/db";
import { asOf } from "@/lib/collector/intel";
import { ask } from "@/lib/assistant/pipeline";
import { clearCaches } from "@/lib/thunai/round";

const USER = "qa.p6.lock@example.test";
type Out = Awaited<ReturnType<typeof ask>>;
const askAs = async (lockDept: string | null, message: string): Promise<Out["card"]> => (await ask({ user: `${USER}.${lockDept ?? "collector"}`, sessionId: null, message, inputMode: "text",
  language: "auto", scope: { period: "monthly", zone: null, dept: null, cat: null, taluk: null } as never, replyTo: null, pinId: null, insightKey: null, lockDept,
  stage: () => undefined } as never)).card;

let swm = "";   // an incident of GCC-SWM (officerA's department)
let swmTitle = "";
let ele = "";   // an incident of GCC-ELE (officerB's department)
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") });
  clearCaches();
  await asOf();
  void ops;
  const [a] = await pool.query(`SELECT incident_id, title FROM incidents WHERE lead_dept = 'GCC-SWM' AND title IS NOT NULL AND title <> '' ORDER BY first_reported_at DESC LIMIT 1`) as unknown as [{ incident_id: string; title: string }[]];
  const [b] = await pool.query(`SELECT incident_id FROM incidents WHERE lead_dept = 'GCC-ELE' ORDER BY first_reported_at DESC LIMIT 1`) as unknown as [{ incident_id: string }[]];
  swm = a[0].incident_id; swmTitle = a[0].title; ele = b[0].incident_id;
}, 300_000);
afterAll(() => { vi.useRealTimers(); });

const leaks = (c: Out["card"], id: string) => {
  const text = JSON.stringify(c);
  return { incident: (c as { incident?: { id?: string } | null }).incident?.id === id || text.includes(`"incidentId":"${id}"`), title: swmTitle.length > 12 && text.includes(swmTitle) };
};

describe("QA pass 6, P6-006: an officer's Ask District IQ never opens another department's incident", () => {
  for (const ask of ["tell me about %s", "%s", "what happened in %s", "timeline of %s", "incidents like %s", "what should be done about %s"]) {
    it(`officerB (GCC-ELE): "${ask}" with a GCC-SWM incident`, async () => {
      const c = await askAs("GCC-ELE", ask.replace("%s", swm));
      expect(leaks(c, swm), `${c.responseType}: ${c.headline}`).toEqual({ incident: false, title: false });
      expect(c.kind, c.headline).toBe("refusal");
    });
  }
  for (const ask of ["%s pathi sollu", "%s பற்றி சொல்லு"]) {
    it(`officerB (GCC-ELE), Tanglish and Tamil: "${ask}" with a GCC-SWM incident`, async () => {
      const c = await askAs("GCC-ELE", ask.replace("%s", swm));
      expect(leaks(c, swm), `${c.responseType}: ${c.headline}`).toEqual({ incident: false, title: false });
    });
  }

  it("officerB still gets its own department's incident", async () => {
    const c = await askAs("GCC-ELE", `tell me about ${ele}`);
    expect((c as { incident?: { id?: string } | null }).incident?.id ?? JSON.stringify(c).includes(ele)).toBeTruthy();
  });

  it("the Collector (no lock) still gets any incident", async () => {
    const c = await askAs(null, `tell me about ${swm}`);
    expect(JSON.stringify(c).includes(swm), `${c.responseType}: ${c.headline}`).toBe(true);
  });
});
