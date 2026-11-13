import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// P5-033 part manu-sec-09: twelve junk tries on someone's slip number locked its real holder out for 10 minutes, even with the QR
// key. The per-number bucket counted every try (the valid key too) and was checked before the key. The key is the slip's secret
// (an HMAC of the number), so it is never limited per number; only wrong tries count, which keeps last-4 guessing as slow as before.
const h = vi.hoisted(() => ({ reads: 0 }));
vi.mock("@/lib/manu/track", async (orig) => {
  const real = await orig<typeof import("@/lib/manu/track")>();
  return {
    ...real,
    complaintForTrack: async (code: string) => (h.reads++, code === "2026-111AAA" ? { complaint_code: code, mobile_number: "9000041873" } : null),
    trackView: async (c: { complaint_code: string }) => ({ code: c.complaint_code, status: "Complaint Filed", filedAt: "2026-11-01 10:00:00", department: "SWM", dueBy: null, steps: [] })
  };
});

process.env.TRUST_PROXY_HOPS = "1"; // each request its own address: the per-address limit is not what is tested here
const { POST } = await import("./route");
const { trackKey } = await import("@/lib/manu/track");
let ipSeq = 0;
const track = (body: unknown) => POST(new NextRequest("http://x/api/track", { method: "POST", headers: { "x-forwarded-for": `10.77.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}` }, body: JSON.stringify(body) }));
const CODE = "2026-111AAA";

describe("manu-sec-09: junk tries on a slip number never lock out the holder of the slip", () => {
  beforeEach(() => { h.reads = 0; });

  it("after 12 wrong last-4 tries the QR key still opens the slip", async () => {
    for (let i = 0; i < 12; i++) expect((await track({ code: CODE, last4: String(1000 + i) })).status).toBe(404);
    const r = await track({ code: CODE, key: trackKey(CODE) });
    expect(r.status).toBe(200);
    expect((await r.json()).code).toBe(CODE);
  });

  it("wrong tries are still limited per number: the 13th wrong last-4 is refused without reading the store", async () => {
    const code = "2026-222BBB";
    for (let i = 0; i < 12; i++) expect((await track({ code, last4: String(2000 + i) })).status).toBe(404);
    const before = h.reads;
    expect((await track({ code, last4: "3000" })).status).toBe(429);
    expect(h.reads).toBe(before);
  });

  it("a wrong key counts as a wrong try; the holder's own successful look-ups do not use up the number's tries", async () => {
    const code = "2026-111AAA";
    for (let i = 0; i < 20; i++) expect((await track({ code, key: trackKey(code) })).status).toBe(200);
    expect((await track({ code, key: "not-the-key-000000000" })).status).not.toBe(200);
  });
});
