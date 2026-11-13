// Fix-all run after QA pass 6, hunt2-desk-09: the consoles' "now" (asOf) was kept 30 s whatever happened, and it is the upper bound of the
// officer's grievance windows (first_reported_at <= now). A case the desk filed after "now" was read was "Grievance not found in your
// department." and missing from the officer's list for up to 30 s after the desk said it was forwarded; the list's "now" stayed fixed.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({
  default: { query: async (sql: string) => [/metric = 'as_of'/.test(sql) ? [{ v: "2026-01-01T00:00:00" }] : []] },
  ops: (t: string) => t, CLUSTER: "", OPS_DB: "ops", TITLE: "i.title"
}));
const { asOf } = await import("@/lib/collector/intel");
const { bumpDataEpoch } = await import("@/lib/collector/epoch");

const ist = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
afterEach(() => vi.restoreAllMocks());

describe("hunt2-desk-09: a filing moves the consoles' 'now' at once", () => {
  it("a case filed 10 s after 'now' was read is inside the next window", async () => {
    let t = Date.UTC(2026, 10, 13, 9, 0, 0) + Math.floor(Math.random() * 1e6) * 1000; // unique per run: the cache is module state
    vi.spyOn(Date, "now").mockImplementation(() => t);
    bumpDataEpoch(); // whatever an earlier test left in the cache
    const first = await asOf();
    expect(first).toBe(ist(t));
    t += 10_000;
    const filedAt = ist(t); // the desk files now: filePetition's istNow(), the case's first_reported_at
    bumpDataEpoch(); // addCaseLive, after the case is in the build
    const next = await asOf();
    expect(next >= filedAt).toBe(true);
  });
  it("with nothing changed, 'now' is still kept 30 s (the caches keyed by it stay useful)", async () => {
    let t = Date.UTC(2026, 10, 13, 10, 0, 0) + Math.floor(Math.random() * 1e6) * 1000;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    bumpDataEpoch();
    const first = await asOf();
    t += 10_000;
    expect(await asOf()).toBe(first);
    t += 25_000;
    expect(await asOf()).toBe(ist(t));
  });
});
