import { describe, expect, it, vi } from "vitest";

// a deliberately stale air-quality feed and a fresh news feed (FRESH-001)
vi.mock("@/lib/collector/sources", async (orig) => ({
  ...(await orig<typeof import("@/lib/collector/sources")>()),
  collectionStatus: async () => ({
    lastRun: "2026-10-12 15:00:00", done: [], missing: [], total: 2,
    stale: [{ source: "cpcb", name: "Air quality (CPCB)", minutes: 1080, targetMin: 60 }]
  })
}));

import { staleCaveats } from "@/lib/assistant/pipeline";

describe("assistant freshness caveat (FRESH-001)", () => {
  it("names the stale feed when the answer used it", async () => {
    expect(await staleCaveats([{ tool: "environment", args: { metric: "aqi" } }], []))
      .toEqual(["Air quality (CPCB) last collected 18 hours ago; this answer may be incomplete."]);
  });
  it("says nothing when the answer did not use the stale feed", async () => {
    expect(await staleCaveats([{ tool: "environment", args: { metric: "rainfall_24h_mm" } }], [])).toEqual([]);
    expect(await staleCaveats([{ tool: "news_gaps" }], [])).toEqual([]);
    expect(await staleCaveats([{ tool: "mandi_prices" }], [])).toEqual([]);
    expect(await staleCaveats([], ["intel.incidents"])).toEqual([]);
  });
});
