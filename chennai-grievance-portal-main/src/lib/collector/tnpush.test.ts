import { beforeEach, describe, expect, it } from "vitest";
import { acceptPush, cleanPush, pushBody, pushTnPrices } from "./tnpush";
import { forgetTn, loadTn } from "./tnprices";

const row = ["Tomato", "Bangalore", 3000, 3200, 3100, 0.5, "Vegetables"];

describe("tn prices pushed from the PC to the hosted copy", () => {
  beforeEach(() => forgetTn());

  it("keeps only well-formed entries for known markets and real days", () => {
    const got = cleanPush({ days: {
      "2026-11-26": { Pallavaram: { at: "2026-11-27 06:00:00", rows: [row] }, "madurai-anna-nagar": { at: "2026-11-27 06:00:00", rows: [row] } },
      "26-11-2026": { Pallavaram: { at: "2026-11-27 06:00:00", rows: [row] } },
      "2026-11-25": { Pallavaram: { at: "yesterday", rows: [row] }, Nanganallur: { at: "2026-11-26 06:00:00", rows: [["", "x", 1, 2, 3, null, null]] } }
    } });
    expect(Object.keys(got)).toEqual(["2026-11-26"]);
    expect(Object.keys(got["2026-11-26"])).toEqual(["Pallavaram"]);
    expect(cleanPush(null)).toEqual({});
    expect(cleanPush({ days: "x" })).toEqual({});
  });

  it("merges the newer reading of a day and ignores an older one", () => {
    expect(acceptPush({ days: { "2026-11-26": { Pallavaram: { at: "2026-11-27 06:00:00", rows: [row] } } } })).toBe(1);
    expect(acceptPush({ days: { "2026-11-26": { Pallavaram: { at: "2026-11-26 18:00:00", rows: [] } } } })).toBe(0);
    expect(loadTn().days["2026-11-26"].Pallavaram.rows).toHaveLength(1);
    expect(acceptPush({ days: { "2026-11-26": { Pallavaram: { at: "2026-11-27 13:00:00", rows: [row, ["Onion", "", 4000, 4500, 4250, null, null]] } } } })).toBe(1);
    expect(loadTn().days["2026-11-26"].Pallavaram.rows).toHaveLength(2);
  });

  it("sends only the recent days, and nothing without a URL and key", async () => {
    acceptPush({ days: { "2026-10-01": { Pallavaram: { at: "2026-10-02 06:00:00", rows: [row] } }, "2026-11-26": { Pallavaram: { at: "2026-11-27 06:00:00", rows: [row] } } } });
    expect(Object.keys(pushBody("2026-11-27").days)).toEqual(["2026-11-26"]);
    expect(await pushTnPrices({ url: "", key: "" })).toEqual({ sent: 0, merged: null, error: null });
    let seen: { url: string; key: string | null; body: string } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      seen = { url, key: new Headers(init.headers).get("x-job-key"), body: String(init.body) };
      return new Response(JSON.stringify({ ok: true, merged: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await pushTnPrices({ url: "https://hosted.example/", key: "k", today: "2026-11-27", fetcher });
    expect(r).toEqual({ sent: 1, merged: 1, error: null });
    expect(seen!.url).toBe("https://hosted.example/api/collector/jobs/tn-prices");
    expect(seen!.key).toBe("k");
    const refused = await pushTnPrices({ url: "https://hosted.example", key: "k", today: "2026-11-27",
      fetcher: (async () => new Response(JSON.stringify({ error: "Not authorised" }), { status: 401 })) as unknown as typeof fetch });
    expect(refused.error).toMatch(/401/);
  });
});
