// reviewerG-06 (on reviewerE-01): with no trusted proxy (TRUST_PROXY_HOPS unset) every client is the one address "direct", so reviewerE-01
// stopped applying the address limit there (it was a district-wide off switch). That left no district-wide ceiling at all: register allows
// about 400 new accounts an hour from "direct", each may file 10 an hour, so one script could file about 4,000 complaints an hour, each a
// classifier call, a dataset append and a case on a department's list. Now, in that mode only, the district has an hourly ceiling far above
// real volume (COMPLAINTS_DISTRICT_PER_HOUR, 1,000: the dataset's busiest hour is 19 filings), and its refusal says the site is busy.
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const load = async () => {
  vi.resetModules(); // rate-limit.ts keeps its buckets in module memory: a fresh limiter per test
  return import("@/lib/complaint-limit");
};
const hdrs = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("reviewerG-06: with no trusted proxy, a district-wide hourly ceiling well above real volume", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T06:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("many accounts file up to the ceiling; the next is refused as 'busy', not blamed on the account", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    const { complaintTry, complaintLimitMessage, COMPLAINTS_DISTRICT_PER_HOUR } = await load();
    expect(COMPLAINTS_DISTRICT_PER_HOUR).toBe(1000);
    for (let u = 0; u < COMPLAINTS_DISTRICT_PER_HOUR; u++) expect(complaintTry(10_000 + u, hdrs()).allowed).toBe(true);
    const next = complaintTry(99_999, hdrs()); // a citizen's first complaint, once the district's hour is full
    expect(next).toMatchObject({ allowed: false, by: "district" });
    expect(next.retryAfterSeconds).toBeGreaterThan(0);
    const msg = complaintLimitMessage(next.by);
    expect(msg).toMatch(/busy/i);
    expect(msg).not.toMatch(/account|your network/i);
  });

  it("a try the ceiling refused does not count in the citizen's own limits; the hour over, they file", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    const { complaintTry, COMPLAINTS_DISTRICT_PER_HOUR, COMPLAINTS_PER_HOUR } = await load();
    for (let u = 0; u < COMPLAINTS_DISTRICT_PER_HOUR; u++) complaintTry(20_000 + u, hdrs());
    for (let i = 0; i < COMPLAINTS_PER_HOUR * 3; i++) expect(complaintTry(7, hdrs()).allowed).toBe(false);
    vi.advanceTimersByTime(3_601_000); // the district's hour is over
    for (let i = 0; i < COMPLAINTS_PER_HOUR; i++) expect(complaintTry(7, hdrs()).allowed).toBe(true);
  });

  it("one account still stops at its own 10 an hour, refused as the account's", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    const { complaintTry, COMPLAINTS_PER_HOUR } = await load();
    for (let i = 0; i < COMPLAINTS_PER_HOUR; i++) complaintTry(1, hdrs());
    expect(complaintTry(1, hdrs())).toMatchObject({ allowed: false, by: "account" });
  });

  it("the double-click give-back returns the district's try too", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    const { complaintTry, giveBackComplaintTry, COMPLAINTS_DISTRICT_PER_HOUR } = await load();
    for (let u = 0; u < COMPLAINTS_DISTRICT_PER_HOUR + 50; u++) {
      expect(complaintTry(30_000 + u, hdrs()).allowed).toBe(true);
      giveBackComplaintTry(30_000 + u, hdrs()); // the same complaint again: nothing new filed
    }
  });

  it("behind a trusted proxy there is no district ceiling: each address has its own limit", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    const { complaintTry, COMPLAINTS_DISTRICT_PER_HOUR, COMPLAINTS_PER_IP_HOUR } = await load();
    const addresses = Math.ceil((COMPLAINTS_DISTRICT_PER_HOUR + 100) / COMPLAINTS_PER_IP_HOUR);
    let u = 40_000;
    for (let a = 0; a < addresses; a++)
      for (let i = 0; i < COMPLAINTS_PER_IP_HOUR; i++) expect(complaintTry(u++, hdrs(`49.206.${a >> 8}.${a & 255}`)).allowed).toBe(true);
  });

  it("the ceiling is at least 5 times the busiest hour of filings on record, and not under 1,000", async () => {
    const { COMPLAINTS_DISTRICT_PER_HOUR } = await load();
    expect(COMPLAINTS_DISTRICT_PER_HOUR).toBeGreaterThanOrEqual(1000);
    const file = path.join(process.cwd(), "data", "datasets", "grievances.csv");
    if (!fs.existsSync(file)) return; // a clone without the dataset: the floor above still holds
    // "Filed On" is the second column ("YYYY-MM-DD HH:MM"), and the first field (the complaint number) has no comma or quote in it
    const perHour = new Map<string, number>();
    for (const m of fs.readFileSync(file, "utf8").matchAll(/^[^,"\r\n]+,(\d{4}-\d\d-\d\d \d\d):\d\d/gm)) perHour.set(m[1], (perHour.get(m[1]) ?? 0) + 1);
    const busiest = Math.max(0, ...perHour.values());
    expect(perHour.size).toBeGreaterThan(100); // the dataset was read
    expect(COMPLAINTS_DISTRICT_PER_HOUR).toBeGreaterThanOrEqual(5 * busiest);
  });
});
