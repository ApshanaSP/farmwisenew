// QA fix-all, reviewerE-01 (on hunt2-sec-12's limit). complaintTry() ran its three checkRateLimit() calls as an array literal, so every
// try counted in each limit still under its own, even when another limit refused it: an account's refused tries filled the address
// everyone behind it shares (with no trusted proxy, every client in the district), and tries a busy address refused used up each
// citizen's own hour. The refusal always said "from this account", and the double-click give-back returned only the account's tries.
// Now a try counts in all limits or none, the refusal says which limit, the give-back returns all, and with no trusted proxy the shared
// "direct" address is not limited (it is the whole district). The first three cases are reviewer E's probe.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const load = async () => {
  vi.resetModules(); // rate-limit.ts keeps its buckets in module memory: a fresh limiter per test
  return import("@/lib/complaint-limit");
};
const hdrs = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("reviewerE-01: a try counts in every filing limit or in none", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T06:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("no trusted proxy: one account's 300 refused tries do not lock every other citizen out", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    const { complaintTry, COMPLAINTS_PER_HOUR, COMPLAINTS_PER_IP_HOUR } = await load();
    let allowed = 0;
    for (let i = 0; i < COMPLAINTS_PER_IP_HOUR * 10; i++) if (complaintTry(1, hdrs()).allowed) allowed++;
    expect(allowed).toBe(COMPLAINTS_PER_HOUR); // the script filed only its own 10
    expect(complaintTry(2, hdrs()).allowed).toBe(true); // a different citizen's first complaint of the day
  });

  it("behind a proxy: one account's refused tries do not lock out the other accounts on its address", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    const { complaintTry, COMPLAINTS_PER_IP_HOUR } = await load();
    for (let i = 0; i < COMPLAINTS_PER_IP_HOUR + 5; i++) complaintTry(11, hdrs("49.205.1.1"));
    expect(complaintTry(12, hdrs("49.205.1.1")).allowed).toBe(true);
  });

  it("behind a proxy: tries the address refused do not use up the citizen's own hour", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    const { complaintTry, COMPLAINTS_PER_HOUR, COMPLAINTS_PER_IP_HOUR } = await load();
    for (let u = 100; u < 100 + COMPLAINTS_PER_IP_HOUR; u++) expect(complaintTry(u, hdrs("49.205.2.2")).allowed).toBe(true);
    vi.advanceTimersByTime(60_000);
    for (let i = 0; i < COMPLAINTS_PER_HOUR; i++) expect(complaintTry(7, hdrs("49.205.2.2")).allowed).toBe(false);
    vi.advanceTimersByTime(3_545_000); // the address's hour is over
    expect(complaintTry(7, hdrs("49.205.2.2")).allowed).toBe(true);
  });

  it("the refusal says which limit: a citizen refused by a shared address is not told their account filed too many", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    const { complaintTry, complaintLimitMessage, COMPLAINTS_PER_HOUR, COMPLAINTS_PER_IP_HOUR } = await load();
    for (let u = 200; u < 200 + COMPLAINTS_PER_IP_HOUR; u++) complaintTry(u, hdrs("49.205.3.3"));
    const shared = complaintTry(9, hdrs("49.205.3.3"));
    expect(shared).toMatchObject({ allowed: false, by: "address" });
    expect(complaintLimitMessage(shared.by)).not.toMatch(/account/i);
    for (let i = 0; i < COMPLAINTS_PER_HOUR; i++) complaintTry(8, hdrs("49.205.4.4"));
    const own = complaintTry(8, hdrs("49.205.4.4"));
    expect(own).toMatchObject({ allowed: false, by: "account" });
    expect(complaintLimitMessage(own.by)).toMatch(/this account/i);
  });

  it("the double-click give-back returns the try to the address as well as the account", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    const { complaintTry, giveBackComplaintTry, COMPLAINTS_PER_IP_HOUR } = await load();
    // one citizen on a shared address double-clicks 30 times: each second click files nothing and is given back
    for (let i = 0; i < COMPLAINTS_PER_IP_HOUR; i++) {
      const u = 300 + i;
      expect(complaintTry(u, hdrs("49.205.5.5")).allowed).toBe(true);
      giveBackComplaintTry(u, hdrs("49.205.5.5"));
    }
    expect(complaintTry(999, hdrs("49.205.5.5")).allowed).toBe(true);
  });

  it("no trusted proxy: a busy day's filings from many accounts are not capped by the one shared address", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    const { complaintTry, COMPLAINTS_PER_IP_HOUR } = await load();
    for (let u = 0; u < COMPLAINTS_PER_IP_HOUR * 20; u++) expect(complaintTry(5000 + u, hdrs()).allowed).toBe(true);
  });
});
