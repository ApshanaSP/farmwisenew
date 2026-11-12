// QA pass 4, g-repair: tests for what the reviewer (g-review.md) and the skeptics found after the G1, G2, U1 and U2 fixes, on the real path:
// the pinned snapshot, a frozen clock (2026-11-06 12:00 IST), no model key. Jarvis through grader/client-sim.ts (the browser's own order of lanes, the real planRound).
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/g-repair.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim } from "./grader/client-sim";

const NOW = new Date("2026-11-06T06:30:00.000Z");
let w: Awaited<ReturnType<typeof browserWorld>>;
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: NOW }); clearCaches(); await asOf(); w = await browserWorld(); }, 300_000);
afterAll(() => { vi.useRealTimers(); });

async function talk(...said: string[]) {
  vi.setSystemTime(NOW);
  clearCaches();
  const sim = new ClientSim(w.world, {}, w.list);
  const outs = [];
  for (const s of said) outs.push(await sim.handle(s));
  return { sim, outs };
}

describe("g-review 3: a status or a window that is read is applied, or the sentence is handed on, never dropped", () => {
  // The rules lane has a view step and a period step and no status step, so a sentence with a status and a window is not answered by either alone.
  it("a status beside a window ('last month resolved cases', 'pona vaaram overdue cases', Tamil too) is not turned into the window alone", async () => {
    for (const p of ["last month resolved cases", "pona maasam resolved cases", "pona vaaram overdue cases", "கடந்த வாரம் தாமதமான புகார்கள்", "கடந்த மாதம் தீர்க்கப்பட்ட புகார்கள்", "last week overdue cases"]) {
      const { outs } = await talk(p);
      const o = outs[0];
      expect(o.steps.filter((s) => s.a === "period" || s.a === "view"), `${p}: ${JSON.stringify(o.steps)} said ${o.said}`).toEqual([]);
    }
  });
  it("a count of days the console does not hold ('last 3 days', 'last 14 days') is not answered as today", async () => {
    for (const p of ["severe cases in the last 3 days", "severe cases in the last 14 days", "overdue cases in the last 2 days"]) {
      const { outs } = await talk(p);
      const o = outs[0];
      expect(o.kind, `${p}: ${o.said}`).not.toBe("do");
      expect(o.said, p).not.toMatch(/\btoday\b/i);
    }
  });
  it("a window the console holds still sets it, with the status kept in the slots", async () => {
    const { outs } = await talk("show overdue cases in the last 7 days");
    const o = outs[0];
    expect(String(o.stage?.slots?.period ?? ""), o.said).toBe("weekly");
    expect(String(o.stage?.slots?.status ?? ""), o.said).toBe("overdue");
  });
});
