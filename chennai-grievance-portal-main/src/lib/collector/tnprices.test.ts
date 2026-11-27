/**
 * 27 Nov: the TN Agricultural Marketing department's Uzhavar Sandhai prices (tnprices.ts). Names map to the stored AGMARKNET spellings,
 * a "not entered" answer is never a failure and an error page is never "not entered", a day is read again until it is settled, failures
 * are said, the file is the source on a copy that does not save, the store is written only where it keeps its writes, and every read
 * merges the file with the store and leaves out the Madurai / Tiruchirappalli "Anna Nagar" and "K.K. Nagar". No network: the fetch is a
 * stand-in, the store a mock.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ store: [] as Record<string, unknown>[], saves: false, kept: [] as { day: string; rows: unknown[] }[], sql: [] as string[] }));
vi.mock("@/lib/collector/db", () => {
  const query = async (sql: string, params: unknown[] = []) => {
    h.sql.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
    if (/MIN\(date\)/.test(sql)) {
      const ds = h.store.filter((r) => (params as string[]).includes(String(r.market))).map((r) => String(r.d)).sort();
      return [[{ a: ds[0] ?? null, b: ds.at(-1) ?? null, f: ds.length ? "2026-10-07 11:20:30" : null }]];
    }
    if (/WHERE date <= \?/.test(sql)) {
      const [day, ...keys] = params as string[];
      const ds = h.store.filter((r) => keys.includes(String(r.market)) && String(r.d) <= day).map((r) => String(r.d)).sort();
      return [[{ d: ds.at(-1) ?? null }]];
    }
    const [from, to, ...keys] = params as string[];
    return [h.store.filter((r) => String(r.d) >= from && String(r.d) <= to && keys.includes(String(r.market)))];
  };
  return { default: { query }, ops: (t: string) => `ops.${t}` };
});
vi.mock("@/lib/aws/store", () => ({ savesToAws: () => h.saves }));
vi.mock("@/lib/collector/ogdprices", () => ({ keepDay: async (day: string, rows: unknown[]) => { h.kept.push({ day, rows }); return rows.length; } }));

import { collectTnPrices, fileDay, fileDays, forgetTn, loadTn, marketRows, marketSpan, newestOnOrBefore, parsePriceList, settled, storeKeeps, tnItem,
  TN_MARKETS, type TnCell } from "./tnprices";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tnprices-"));
const FILE = path.join(dir, "tn-prices.json");
const two = ["Pallavaram", "Ambattur"].map((k) => TN_MARKETS.find((m) => m.key === k)!);
const cell = (c: string, modal: number, v = ""): TnCell => [c, v, modal - 500, modal + 500, modal, 0.1, "Vegetables"];

beforeEach(() => {
  h.store = []; h.saves = false; h.kept = []; h.sql = [];
  vi.stubEnv("TN_PRICES_FILE", FILE);
  vi.stubEnv("TN_PRICES_SEED", path.join(dir, "no-seed.json"));
  vi.stubEnv("DATA_BACKEND", "aws");
  fs.rmSync(FILE, { force: true });
  forgetTn();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("an agrimark item as the store names it", () => {
  it("maps to AGMARKNET's spellings, with the variety in brackets", () => {
    expect(tnItem("Big Onion")).toEqual(["Onion", "", "Vegetables"]);
    expect(tnItem("Small Onion")[0]).toBe("Small Onion");
    expect(tnItem("Chilli")[0]).toBe("Green Chilli");
    expect(tnItem("Bhendi")[0]).toBe("Bhindi(Ladies Finger)");
    expect(tnItem("Ribbed gourd")[0]).toBe("Ridgeguard(Tori)");
    expect(tnItem("Kovvaikai")[0]).toBe("Thondekai");
    expect(tnItem("Greens")[0]).toBe("Amaranthus");
    expect(tnItem("Colacasia ")[0]).toBe("Colacasia");
    expect(tnItem("Tomato (Bangalore)")).toEqual(["Tomato", "Bangalore", "Vegetables"]);
    expect(tnItem("Potato (Agra)")).toEqual(["Potato", "Agra", "Vegetables"]);
    expect(tnItem("Bitter Gourd (Big)")).toEqual(["Bitter gourd", "Big", "Vegetables"]);
    expect(tnItem("Banana (veg)")[0]).toBe("Banana - Green");
    expect(tnItem("Mango (veg)")[0]).toBe("Mango(Raw-Ripe)");
    expect(tnItem("Coconut")).toEqual(["Coconut", "", "Spices"]);
    expect(tnItem("Pappaya")).toEqual(["Papaya", "", "Fruits"]);
  });
  it("keeps the fruit bananas apart: their prices differ twofold", () => {
    expect(tnItem("Banana  (Karpuravalli)")).toEqual(["Banana (Karpuravalli)", "", "Fruits"]);
    expect(tnItem("Banana (Red banana)")[0]).toBe("Banana (Red)");
    expect(tnItem("Banana (Yelakki)")[0]).toBe("Banana (Yelakki)");
  });
});

describe("one market's answer", () => {
  it("is rupees a quintal, the middle of the low and high, arrivals in tonnes", () => {
    expect(parsePriceList(JSON.stringify({ price_list: { Tomato: { qty: "1060", min: "40", max: "50" } } }))).toEqual([["Tomato", "", 4000, 5000, 4500, 1.06, "Vegetables"]]);
    // one price only: both ends
    expect(parsePriceList(JSON.stringify({ price_list: { Lemon: { qty: "", min: "", max: "120" } } }))).toEqual([["Lemon", "", 12000, 12000, 12000, null, "Vegetables"]]);
  });
  it("is 'not entered' for null or an empty list, never a failure", () => {
    for (const b of ["null", "", "[]", "{}", '{"price_list":[]}', "﻿null"]) expect(parsePriceList(b), b).toBeNull();
  });
  it("throws on an error page, so a failure is never taken for 'not entered'", () => {
    expect(() => parsePriceList("<html><body>Service unavailable</body></html>")).toThrow(/not a price list/);
    expect(() => parsePriceList('{"price_list":"x"}')).toThrow(/not a price list/);
  });
  it("leaves out an item whose low is above its high (an entry slip) and a zero price", () => {
    expect(parsePriceList(JSON.stringify({ price_list: { Amla: { qty: "10", min: "1110", max: "130" }, Beans: { qty: "5", min: "0", max: "0" }, Carrot: { qty: "1", min: "50", max: "60" } } })))
      .toEqual([["Carrot", "", 5000, 6000, 5500, 0.001, "Vegetables"]]);
  });
});

describe("the collector", () => {
  it("reads each market of each day once, keeps them in the file, and says what failed", async () => {
    const asked: string[] = [];
    const fetcher = async (d: string, m: { key: string }) => {
      asked.push(`${d} ${m.key}`);
      if (m.key === "Ambattur" && d === "2026-11-25") throw new Error("HTTP 503");
      return m.key === "Ambattur" && d === "2026-11-26" ? null : [cell("Tomato", 4500), cell("Onion", 6000)];
    };
    const run = await collectTnPrices({ from: "2026-11-25", to: "2026-11-26", gapMs: 0, fetcher, markets: two });
    expect(asked).toEqual(["2026-11-25 Pallavaram", "2026-11-25 Ambattur", "2026-11-26 Pallavaram", "2026-11-26 Ambattur"]);
    expect(run).toMatchObject({ calls: 4, answered: 3, seen: 4, added: 4, newest: "2026-11-26", errors: ["Ambattur, 25 Nov: HTTP 503"] });
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    expect(saved.days["2026-11-25"].Pallavaram.rows).toHaveLength(2);
    expect(saved.days["2026-11-25"].Ambattur).toBeUndefined(); // a failed call keeps nothing: tried again next run
    expect(saved.days["2026-11-26"].Ambattur.rows).toEqual([]); // "not entered", remembered
  });

  it("stops after three calls when the site answers none of them (down, or refusing this copy: the hosted copy abroad)", async () => {
    const fetcher = vi.fn(async () => { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; });
    const run = await collectTnPrices({ from: "2026-11-13", to: "2026-11-27", gapMs: 0, fetcher });
    // 15 days x 8 markets would be 120 calls of 20 s each
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(run).toMatchObject({ calls: 3, answered: 0, seen: 0 });
    expect(run.errors).toHaveLength(3);
    expect(run.errors.at(-1)).toMatch(/no answer in 20 s.*stopped/);
  });

  it("goes on past failed calls once the site has answered this run", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => { if (n++ === 0) return [cell("Tomato", 4500)]; throw new Error("HTTP 503"); });
    const run = await collectTnPrices({ from: "2026-11-25", to: "2026-11-26", gapMs: 0, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(16);
    expect(run).toMatchObject({ calls: 16, answered: 1 });
  });

  it("reads a day again until it is settled (read after noon of the next day), then never", async () => {
    expect(settled("2026-11-25", "2026-11-26 11:59:59")).toBe(false);
    expect(settled("2026-11-25", "2026-11-26 12:00:00")).toBe(true);
    const fetcher = vi.fn(async () => [cell("Tomato", 4500)]);
    // read on the 26th at 06:00 IST: not settled
    vi.useFakeTimers({ now: Date.parse("2026-11-26T00:30:00Z"), toFake: ["Date"] });
    await collectTnPrices({ from: "2026-11-25", to: "2026-11-25", gapMs: 0, fetcher, markets: two.slice(0, 1) });
    // read again on the 26th at 13:00 IST: now settled
    vi.setSystemTime(Date.parse("2026-11-26T07:30:00Z"));
    await collectTnPrices({ from: "2026-11-25", to: "2026-11-25", gapMs: 0, fetcher, markets: two.slice(0, 1) });
    await collectTnPrices({ from: "2026-11-25", to: "2026-11-25", gapMs: 0, fetcher, markets: two.slice(0, 1) });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps a day's prices when the site later answers 'not entered' for it", async () => {
    let answer: TnCell[] | null = [cell("Tomato", 4500)];
    const fetcher = async () => answer;
    await collectTnPrices({ from: "2026-11-27", to: "2026-11-27", gapMs: 0, fetcher, markets: two.slice(0, 1) });
    answer = null;
    await collectTnPrices({ from: "2026-11-27", to: "2026-11-27", gapMs: 0, fetcher, markets: two.slice(0, 1) });
    expect(loadTn().days["2026-11-27"].Pallavaram.rows).toEqual([cell("Tomato", 4500)]);
  });

  it("writes the store only where it keeps its writes, and only rows it lacks or holds otherwise", async () => {
    const fetcher = async () => [cell("Tomato", 4500), cell("Onion", 6000)];
    // a copy that does not save to AWS: the file only
    await collectTnPrices({ from: "2026-11-26", to: "2026-11-26", gapMs: 0, fetcher, markets: two.slice(0, 1) });
    expect(h.kept).toEqual([]);
    expect(await storeKeeps()).toBe(false);
    // the copy that saves: the rows the table lacks or holds with other figures
    h.saves = true;
    h.store = [{ d: "2026-11-27", market: "Pallavaram", commodity: "Tomato", variety: "", min_price: 4000, max_price: 5000, modal_price: 4500 },
      { d: "2026-11-27", market: "Pallavaram", commodity: "Onion", variety: "", min_price: 5000, max_price: 6000, modal_price: 5500 }];
    await collectTnPrices({ from: "2026-11-27", to: "2026-11-27", gapMs: 0, fetcher, markets: two.slice(0, 1) });
    expect(h.kept).toHaveLength(1);
    expect(h.kept[0].day).toBe("2026-11-27");
    expect(h.kept[0].rows).toEqual([{ market: "Pallavaram", commodity: "Onion", variety: "", min: 5500, max: 6500, modal: 6000, arrival: 0.1, group: "Vegetables" }]);
    // MySQL keeps every write
    vi.stubEnv("DATA_BACKEND", "");
    expect(await storeKeeps()).toBe(true);
  });
});

describe("reading the prices", () => {
  const put = async (d: string, market: string, rows: TnCell[]) =>
    collectTnPrices({ from: d, to: d, gapMs: 0, fetcher: async (_d, m) => (m.key === market ? rows : null), markets: TN_MARKETS.filter((m) => m.key === market) });

  it("merges the file with the store, the file first, and never returns Madurai's or Tiruchirappalli's markets", async () => {
    await put("2026-11-26", "Pallavaram", [cell("Tomato", 4500), cell("Small Onion", 17500)]);
    h.store = [
      // AGMARKNET's rows of 6 Oct (the file holds none of that day)
      { d: "2026-10-06", market: "Pallavaram", commodity: "Onion Green", variety: "Onion Green", grp: "Vegetables", lo: 10000, hi: 11000, modal: 10500, arrival: 0.18 },
      { d: "2026-10-06", market: "Anna Nagar", commodity: "Tomato", variety: "Deshi", grp: "Vegetables", lo: 2000, hi: 3000, modal: 2500, arrival: 1 },
      { d: "2026-10-06", market: "K.K. Nagar", commodity: "Tomato", variety: "Deshi", grp: "Vegetables", lo: 2000, hi: 3000, modal: 2500, arrival: 1 },
      // a saved row of a day and market the file holds: the file's reading is the one shown
      { d: "2026-11-26", market: "Pallavaram", commodity: "Tomato", variety: "", grp: "Vegetables", lo: 1, hi: 1, modal: 1, arrival: null }
    ];
    const rows = await marketRows("2026-10-01", "2026-11-30");
    expect(rows.map((r) => `${r.d} ${r.market} ${r.commodity} ${r.modal}`)).toEqual([
      "2026-10-06 Pallavaram Small Onion 10500", // AGMARKNET's "Onion Green" is small onion: shown by its clear name
      "2026-11-26 Pallavaram Small Onion 17500",
      "2026-11-26 Pallavaram Tomato 4500"
    ]);
    expect(await marketRows("2026-10-01", "2026-11-30", "Anna Nagar")).toEqual([]);
    expect((await marketRows("2026-10-01", "2026-11-30", "pallavaram")).length).toBe(3);
  });

  it("knows the first and last day held, and the newest report before a day", async () => {
    await put("2026-11-20", "Ambattur", [cell("Tomato", 3000)]);
    await put("2026-11-26", "Ambattur", [cell("Tomato", 3100)]);
    h.store = [{ d: "2026-09-15", market: "Ambattur", commodity: "Tomato", variety: "", modal: 2000 }, { d: "2026-09-15", market: "Anna Nagar", commodity: "Tomato", variety: "", modal: 2000 }];
    expect(await marketSpan()).toMatchObject({ from: "2026-09-15", to: "2026-11-26" });
    expect(await newestOnOrBefore("2026-11-25")).toBe("2026-11-20");
    expect(await newestOnOrBefore("2026-11-01")).toBe("2026-09-15");
    expect([...fileDays("2026-11-01", "2026-11-30")].sort()).toEqual(["2026-11-20", "2026-11-26"]);
    expect(fileDay()?.day).toBe("2026-11-26");
  });

  it("takes the hosted copy's seed file in at the first read, the newer reading of a day winning", async () => {
    const seed = path.join(dir, "seed.json");
    fs.writeFileSync(seed, JSON.stringify({ v: 1, source: "x", unit: "x", days: {
      "2026-11-01": { Medavakkam: { at: "2026-11-02 13:00:00", rows: [cell("Tomato", 4000)] } },
      "2026-11-26": { Medavakkam: { at: "2026-11-26 07:00:00", rows: [cell("Tomato", 1)] } } } }));
    await put("2026-11-26", "Medavakkam", [cell("Tomato", 5000)]);
    forgetTn();
    vi.stubEnv("TN_PRICES_SEED", seed);
    const s = loadTn();
    expect(s.days["2026-11-01"].Medavakkam.rows[0][4]).toBe(4000);
    expect(s.days["2026-11-26"].Medavakkam.rows[0][4]).toBe(5000);
    // and it is saved, so a restart without the seed keeps it
    forgetTn();
    vi.stubEnv("TN_PRICES_SEED", path.join(dir, "no-seed.json"));
    expect(loadTn().days["2026-11-01"]).toBeDefined();
  });
});
