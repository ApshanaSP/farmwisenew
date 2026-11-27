import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sources: 0, studio: 0, live: 0, imd: 0, followups: 0 }));
vi.mock("@/lib/collector/sources", () => ({ runDueSources: () => void h.sources++ }));
vi.mock("@/lib/studio/pipeline", () => ({ runDueRefreshes: () => void h.studio++, runDueConnectors: () => void h.live++ }));
vi.mock("@/lib/live/imd", () => ({ liveImdTick: async () => void h.imd++ }));
vi.mock("@/lib/officer/followups", () => ({ followupsTick: async () => void h.followups++ }));
import { startJobs } from "./scheduler";

describe("background jobs run on the server's schedule, not from page reads (P-6)", () => {
  it("starts once and sweeps sources and Data Studio links every minute", async () => {
    vi.useFakeTimers();
    startJobs();
    startJobs(); // a second start (dev hot reload) adds no second timer
    expect(h.sources).toBe(0); // nothing at start: the data is still loading
    await vi.advanceTimersByTimeAsync(60_000);
    expect([h.sources, h.studio, h.live]).toEqual([1, 1, 1]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect([h.sources, h.studio, h.live]).toEqual([2, 2, 2]);
    // the live lane's IMD tick runs every minute too (it reads IMD itself only every 10 minutes)
    expect(h.imd).toBe(2);
    // the follow-ups check is asked every minute too (it runs itself at most every 5 minutes: lib/officer/followups.ts)
    expect(h.followups).toBe(2);
    clearInterval(global.__districtIqJobs);
    global.__districtIqJobs = undefined;
    vi.useRealTimers();
  });
});
