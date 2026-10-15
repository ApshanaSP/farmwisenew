import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sources: 0, studio: 0 }));
vi.mock("@/lib/collector/sources", () => ({ runDueSources: () => void h.sources++ }));
vi.mock("@/lib/studio/pipeline", () => ({ runDueRefreshes: () => void h.studio++ }));

import { startJobs } from "./scheduler";

describe("background jobs run on the server's schedule, not from page reads (P-6)", () => {
  it("starts once and sweeps sources and Data Studio links every minute", async () => {
    vi.useFakeTimers();
    startJobs();
    startJobs(); // a second start (dev hot reload) adds no second timer
    expect(h.sources).toBe(0); // nothing at start: the data is still loading
    await vi.advanceTimersByTimeAsync(60_000);
    expect([h.sources, h.studio]).toEqual([1, 1]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect([h.sources, h.studio]).toEqual([2, 2]);
    clearInterval(global.__districtIqJobs);
    global.__districtIqJobs = undefined;
    vi.useRealTimers();
  });
});
