// Copy to: chennai-grievance-portal-main/src/app/api/track/route.race.probe.fixall.test.ts (next to route.ts and route.fixall.test.ts)
//
// reviewerB-01 (P5-033 part manu-sec-09, commit ff8dc483). The per-number limit on wrong last-4 tries is now a check
// (failuresOver, route.ts:27) before `await complaintForTrack` (route.ts:29) and a count (addFailure, route.ts:31) after it.
// Tries that arrive together all pass the check before any of them is counted. The old checkRateLimit counted at the check,
// synchronously, so at most 12 tries per number got through in 10 minutes however they were sent.
// Expected on 172fabd: fails (all 40 tries reach the store, none is a 429). Passes once the per-number count is taken before the await
// for every request without the key (for example checkRateLimit(bucket, 12, 600) when !holdsKey).
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ reads: 0 }));
vi.mock("@/lib/manu/track", async (orig) => {
  const real = await orig<typeof import("@/lib/manu/track")>();
  return {
    ...real,
    // a store read takes a little while, as it does against MySQL or the AWS store
    complaintForTrack: async (code: string) => {
      h.reads++;
      await new Promise((r) => setTimeout(r, 25));
      return { complaint_code: code, mobile_number: "9000041873" };
    },
    trackView: async (c: { complaint_code: string }) => ({ code: c.complaint_code, status: "Complaint Filed", filedAt: "2026-11-01 10:00:00", department: "SWM", dueBy: null, steps: [] })
  };
});

process.env.TRUST_PROXY_HOPS = "1"; // each request its own address: the per-address limit is not what is tested here
const { POST } = await import("./route");
let ip = 0;
const track = (body: unknown) =>
  POST(new NextRequest("http://x/api/track", { method: "POST", headers: { "x-forwarded-for": `10.88.${Math.floor(++ip / 250)}.${ip % 250}` }, body: JSON.stringify(body) }));

describe("reviewerB-01: wrong last-4 tries sent together are limited per number, like tries sent one at a time", () => {
  it("40 wrong tries at once on one number: at most 12 reach the store, the rest are 429", async () => {
    const code = "2026-333CCC";
    // 4000..4039: none is 1873, the end of the stored mobile
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => track({ code, last4: String(4000 + i) })));
    const statuses = res.map((r) => r.status);
    expect(h.reads, `store reads for one number in one burst (statuses: ${statuses.join(",")})`).toBeLessThanOrEqual(12);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(28);
  });
});
