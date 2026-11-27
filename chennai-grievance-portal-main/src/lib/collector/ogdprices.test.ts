/**
 * v18 round 3 (24 Nov review): data.gov.in market prices. A record is kept only when it is a Chennai market's own report for the day asked
 * (district, arrival date, the anchored market names); a day is read page by page; its rows go in one transaction; a day answered with none
 * is remembered for 3 hours; an answer waits for data.gov.in a short while only and reports what really came back. No network: fetch is
 * a stand-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ log: [] as string[], have: [] as string[], conn: true, failInsert: false }));
vi.mock("@/lib/collector/db", () => {
  const run = async (sql: string) => {
    const head = sql.trim().split(/\s+/)[0];
    h.log.push(head);
    if (head === "INSERT" && h.failInsert) throw new Error("disk full");
    if (/SELECT DISTINCT/.test(sql)) return [h.have.map((d) => ({ d }))];
    return [{ affectedRows: 1 }];
  };
  const conn = {
    query: run,
    beginTransaction: async () => void h.log.push("BEGIN"),
    commit: async () => void h.log.push("COMMIT"),
    rollback: async () => void h.log.push("ROLLBACK"),
    release: () => void h.log.push("RELEASE")
  };
  const pool: Record<string, unknown> = { query: run };
  Object.defineProperty(pool, "getConnection", { get: () => (h.conn ? async () => conn : undefined) });
  return { default: pool, ops: (t: string) => `ops.${t}` };
});

import { arrivalDay, chennaiDistrict, chennaiRows, forgetOgdDays, isOgdKeyError, marketOf, missingDays, ogdEmptyDays, ogdMarketDay, ogdReadDays } from "./ogdprices";

// 27 Nov: a Chennai market as data.gov.in writes it (Nanganallur is filed under Chengalpattu, now spelt "Chengalpet")
const rec = (o: Record<string, unknown> = {}) => ({ State: "Tamil Nadu", District: "Chengalpet", Market: "Nanganallur(Uzhavar Sandhai )", Commodity: "Tomato", Variety: "Local",
  Arrival_Date: "20/11/2026", Min_Price: "2000", Max_Price: "3000", Modal_Price: "2500", ...o });

describe("which data.gov.in records are a Chennai market's report for the day", () => {
  it("reads the market by the collector's anchored names, never a bare prefix", () => {
    expect(marketOf("Nanganallur(Uzhavar Sandhai )")).toBe("Nanganallur");
    expect(marketOf("Ambattur(Uzhavar Sandhai )")).toBe("Ambattur");
    expect(marketOf("Keelkattalai(Uzhavar Sandhai )")).toBe("Keelkattalai");
    expect(marketOf("Padappai(Uzhavar Sandhai )")).toBe("Padappai");
    expect(marketOf("Ambattur")).toBeNull();
    expect(marketOf("Koyambedu")).toBeNull();
  });
  it("27 Nov: no longer takes Madurai's Anna Nagar or Tiruchirappalli's K.K. Nagar for Chennai markets", () => {
    expect(marketOf("Anna Nagar(Uzhavar Sandhai )")).toBeNull();
    expect(marketOf("Anna nagar(Uzhavar Sandhai )")).toBeNull();
    expect(marketOf("K.K.Nagar(Uzhavar Sandhai )")).toBeNull();
  });
  it("knows the four districts as the data set spells them, and the record's own date", () => {
    for (const d of ["Chennai", "Chengalpattu", "Chengalpet", "Kancheepuram", "Kanchipuram", "Thiruvallur", "Tiruvallur", "Thiruvellore"]) expect(chennaiDistrict(d), d).toBe(true);
    for (const d of ["Coimbatore", "Madurai", "", null, "Chennai Port"]) expect(chennaiDistrict(d), String(d)).toBe(false);
    expect(arrivalDay("20/11/2026")).toBe("2026-11-20");
    expect(arrivalDay("2/1/2026")).toBe("2026-01-02");
    expect(arrivalDay("2026-11-20")).toBe("2026-11-20");
    expect(arrivalDay("")).toBeNull();
  });
  it("keeps only Tamil Nadu, the four districts, the day asked, a Chennai market and a modal price", () => {
    const rows = chennaiRows([
      rec(),
      rec({ District: "Coimbatore", Market: "Nanganallur(Uzhavar Sandhai )" }), // another district's market of the same name
      rec({ District: "Madurai", Market: "Anna nagar(Uzhavar Sandhai )" }), // the Anna Nagar AGMARKNET filed under Chennai
      rec({ Arrival_Date: "19/11/2026" }), // another day the filter let through
      rec({ Market: "Ambattur" }), // not the Uzhavar Sandhai
      rec({ State: "Kerala" }),
      rec({ Modal_Price: "" }),
      // field names in another case, a suburban market in Chengalpattu
      { state: "Tamil Nadu", district: "Chengalpattu", market: "Guduvancheri(Uzhavar Sandhai )", commodity: "Onion", variety: "Big", arrival_date: "20/11/2026", min_price: null, max_price: "4200", modal_price: "4000" }
    ], "2026-11-20");
    expect(rows).toEqual([
      { market: "Nanganallur", commodity: "Tomato", variety: "Local", min: 2000, max: 3000, modal: 2500 },
      { market: "Guduvancheri", commodity: "Onion", variety: "Big", min: null, max: 4200, modal: 4000 }
    ]);
  });
});

describe("reading a day from data.gov.in", () => {
  const urls: string[] = [];
  const answer = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  beforeEach(() => {
    h.log = []; h.have = []; h.conn = true; h.failInsert = false; urls.length = 0;
    forgetOgdDays();
    vi.stubEnv("DATA_GOV_API_KEY", "test-key");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("pages with offset until the platform's total, and keeps the day in one transaction", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      const offset = Number(/offset=(\d+)/.exec(url)?.[1]);
      // the platform hands back fewer than asked: the total says there is more
      return answer(offset === 0 ? { total: 3, records: [rec(), rec({ Commodity: "Onion" })] } : { total: 3, records: [rec({ Commodity: "Potato" })] });
    }));
    expect(await ogdMarketDay("2026-11-20")).toEqual({ seen: 3, added: 3 });
    expect(urls.map((u) => /offset=(\d+)/.exec(u)?.[1])).toEqual(["0", "2"]);
    expect(urls[0]).toMatch(/limit=2000/);
    expect(h.log).toEqual(["BEGIN", "INSERT", "INSERT", "INSERT", "COMMIT", "RELEASE"]);
  });

  it("stops on a short page when the platform gives no total", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (urls.push(url), answer({ records: [rec()] }))));
    expect(await ogdMarketDay("2026-11-20")).toEqual({ seen: 1, added: 1 });
    expect(urls).toHaveLength(1);
  });

  it("rolls the whole day back when a row cannot be written", async () => {
    h.failInsert = true;
    vi.stubGlobal("fetch", vi.fn(async () => answer({ total: 1, records: [rec()] })));
    await expect(ogdMarketDay("2026-11-20")).rejects.toThrow("disk full");
    expect(h.log).toEqual(["BEGIN", "INSERT", "ROLLBACK", "RELEASE"]);
  });

  it("writes row by row on the pool where the store gives no connection", async () => {
    h.conn = false;
    vi.stubGlobal("fetch", vi.fn(async () => answer({ total: 2, records: [rec(), rec({ Commodity: "Onion" })] })));
    expect(await ogdMarketDay("2026-11-20")).toEqual({ seen: 2, added: 2 });
    expect(h.log).toEqual(["INSERT", "INSERT"]);
  });

  it("remembers a day answered with no Chennai rows for 3 hours, so it is not asked again", async () => {
    const f = vi.fn(async () => answer({ total: 1, records: [rec({ District: "Madurai", Market: "Anna Nagar(Uzhavar Sandhai )" })] }));
    vi.stubGlobal("fetch", f);
    expect(await ogdMarketDay("2026-11-20")).toEqual({ seen: 0, added: 0 });
    expect(ogdEmptyDays("2026-11-18", "2026-11-21")).toEqual(["2026-11-20"]);
    expect(await missingDays("2026-11-19", "2026-11-21", 7)).toEqual(["2026-11-21", "2026-11-19"]);
    vi.useFakeTimers({ now: Date.now() + 3 * 3600_000 + 1000, toFake: ["Date"] });
    try {
      expect(await missingDays("2026-11-19", "2026-11-21", 7)).toEqual(["2026-11-21", "2026-11-20", "2026-11-19"]);
    } finally { vi.useRealTimers(); }
  });

  it("never takes a failure for 'no prices': an HTTP error throws and is not remembered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer({}, 500)));
    await expect(ogdMarketDay("2026-11-20")).rejects.toThrow("data.gov.in HTTP 500");
    expect(ogdEmptyDays("2026-11-01", "2026-11-30")).toEqual([]);
    // a page lost midway loses the day, never half of it
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (/offset=0/.test(url) ? answer({ total: 3, records: [rec()] }) : answer({}, 502))));
    await expect(ogdMarketDay("2026-11-20")).rejects.toThrow(/HTTP 502 \(page 2/);
    expect(h.log).toEqual([]);
  });

  it("marks a refused key, the one error a scheduled run stops on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer({}, 403)));
    const e = await ogdMarketDay("2026-11-20").catch((x) => x);
    expect(isOgdKeyError(e)).toBe(true);
    expect(String(e.message)).toMatch(/DATA_GOV_API_KEY/);
    vi.stubGlobal("fetch", vi.fn(async () => answer({}, 503)));
    expect(isOgdKeyError(await ogdMarketDay("2026-11-21").catch((x) => x))).toBe(false);
  });

  it("takes a filter spelling the platform ignores for its wrong spelling, not for a day's prices", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (/filters\[State\]/.test(url) ? answer({ total: 900_000, records: [rec({ District: "Madurai" })] }) : answer({ total: 0, records: [] }))));
    expect(await ogdMarketDay("2026-11-20")).toEqual({ seen: 0, added: 0 });
  });
});

describe("an answer waits for data.gov.in a short while only", () => {
  it("reports each day's real outcome: rows, none, failed, still being read", async () => {
    const read = (d: string) => (d === "2026-11-22" ? Promise.resolve({ seen: 4 }) : d === "2026-11-21" ? Promise.resolve({ seen: 0 })
      : d === "2026-11-20" ? Promise.reject(new Error("data.gov.in HTTP 500")) : new Promise<{ seen: number }>(() => undefined));
    const t0 = Date.now();
    const o = await ogdReadDays(["2026-11-22", "2026-11-21", "2026-11-20", "2026-11-19"], 60, read);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(o).toEqual({ tried: ["2026-11-22", "2026-11-21", "2026-11-20", "2026-11-19"], none: ["2026-11-21"], failed: ["2026-11-20"], late: ["2026-11-19"],
      error: "data.gov.in HTTP 500", fetched: true });
  });
  it("is not 'read' when every call failed or timed out", async () => {
    const o = await ogdReadDays(["2026-11-22"], 30, () => new Promise(() => undefined));
    expect(o).toMatchObject({ fetched: false, none: [], late: ["2026-11-22"], error: "data.gov.in did not answer within 0.03 s" });
  });
});
