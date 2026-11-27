/**
 * 27 Nov: the dashboard's market views rebuilt from the Uzhavar Sandhai rows (sources.ts mandiMarkets, mandiWeekly("chennai_region"),
 * mandi("chennai_markets")), read through tnprices.marketRows: the kept file first, the store's rows for other days, never the
 * Madurai / Tiruchirappalli "Anna Nagar" and "K.K. Nagar". No network, the store a mock.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ store: [] as Record<string, unknown>[] }));
vi.mock("@/lib/collector/db", () => {
  const query = async (sql: string, params: unknown[] = []) => {
    if (/MIN\(date\)/.test(sql)) {
      const ds = h.store.filter((r) => (params as string[]).includes(String(r.market))).map((r) => String(r.d)).sort();
      return [[{ a: ds[0] ?? null, b: ds.at(-1) ?? null, f: null }]];
    }
    if (/mandi_market_prices/.test(sql) && /date >= \?/.test(sql)) {
      const [from, to, ...keys] = params as string[];
      return [h.store.filter((r) => String(r.d) >= from && String(r.d) <= to && keys.includes(String(r.market)))];
    }
    return [[]];
  };
  return { default: { query }, ops: (t: string) => `ops.${t}`, TITLE: "i.title", CLUSTER: "i.incident_id", INTEL_DB: "district_intel", OPS_DB: "district_intel_ops" };
});

import { forgetTn, type TnCell } from "./tnprices";
import { CHENNAI_MARKETS, mandi, mandiMarkets, mandiWeekly } from "./sources";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mandi-rebuild-"));
const FILE = path.join(dir, "tn-prices.json");
const c = (name: string, modal: number): TnCell => [name, "", modal - 500, modal + 500, modal, 0.2, "Vegetables"];

function write(days: Record<string, Record<string, TnCell[]>>) {
  const out: Record<string, Record<string, { at: string; rows: TnCell[] }>> = {};
  for (const [d, byM] of Object.entries(days)) for (const [m, rows] of Object.entries(byM)) (out[d] ??= {})[m] = { at: "2026-11-27 13:00:00", rows };
  fs.writeFileSync(FILE, JSON.stringify({ v: 1, source: "test", unit: "Rs/quintal", days: out }));
}

beforeEach(() => {
  h.store = [];
  vi.stubEnv("TN_PRICES_FILE", FILE);
  vi.stubEnv("TN_PRICES_SEED", path.join(dir, "none.json"));
  fs.rmSync(FILE, { force: true });
  forgetTn();
});
afterEach(() => vi.unstubAllEnvs());

describe("the Chennai markets' prices", () => {
  it("lists only the Uzhavar Sandhai markets around Chennai: no Anna Nagar or K.K. Nagar", () => {
    expect(CHENNAI_MARKETS.map((m) => m.key)).toEqual(["Nanganallur", "Ambattur", "Pallavaram", "Medavakkam", "Keelkattalai", "Guduvancheri", "Kundrathur", "Padappai"]);
    expect(CHENNAI_MARKETS.find((m) => m.zone === 8)).toBeUndefined();
  });

  it("compares the markets on the newest day, with each one's previous report", async () => {
    write({
      "2026-11-25": { Pallavaram: [c("Tomato", 4000)], Nanganallur: [c("Tomato", 5000)] },
      "2026-11-26": { Pallavaram: [c("Tomato", 4500), c("Onion", 6500)], Nanganallur: [c("Tomato", 5500)] }
    });
    // AGMARKNET's old rows of Madurai's "Anna Nagar" are in the store: never shown
    h.store = [{ d: "2026-11-26", market: "Anna Nagar", commodity: "Tomato", variety: "Deshi", grp: "Vegetables", lo: 100, hi: 100, modal: 100 }];
    const m = await mandiMarkets();
    expect(m.latest).toBe("2026-11-26");
    expect(m.markets.map((x) => x.key)).toEqual(["Nanganallur", "Pallavaram"]);
    const tomato = m.commodities.find((x) => x.commodity === "Tomato")!;
    expect(tomato).toMatchObject({ markets: 2, avg: 5000, avgPrev: 4500 });
    expect(tomato.prices.Pallavaram).toMatchObject({ price: 4500, prev: 4000, prevDate: "2026-11-25", lo: 4000, hi: 5000 });
    expect(m.commodities[0].commodity).toBe("Tomato"); // staples first
  });

  it("averages the markets week by week (Monday to Sunday), the last week up to the newest report", async () => {
    write({
      "2026-11-16": { Pallavaram: [c("Tomato", 3000)] }, // Mon 16 Nov
      "2026-11-18": { Pallavaram: [c("Tomato", 5000)], Kundrathur: [c("Tomato", 3000)] },
      "2026-11-23": { Pallavaram: [c("Tomato", 4400)] }, // Mon 23 Nov
      "2026-11-26": { Pallavaram: [c("Tomato", 4800)], Medavakkam: [c("Tomato", 4800)] }
    });
    const [w] = await mandiWeekly("chennai_region");
    // week of 16 Nov: day averages 3000 and 4000 -> 3500; week of 23 Nov: 4400 and 4800 -> 4600
    expect(w).toMatchObject({ commodity: "Tomato", week: "23–26 Nov", weekStart: "2026-11-23", price: 4600, districts: 2, series: [3500, 4600], labels: ["16–22 Nov", "23–26 Nov"] });
    expect(w.chgWeek).toBeCloseTo(31.4, 1);
    expect(w.chgMonth).toBeNull();
  });

  it("gives the day-by-day average across the markets, with the day before and the week before", async () => {
    write({
      "2026-11-19": { Pallavaram: [c("Onion", 6000)] },
      "2026-11-25": { Pallavaram: [c("Onion", 6000)], Ambattur: [c("Onion", 7000)] },
      "2026-11-26": { Pallavaram: [c("Onion", 6400)], Ambattur: [c("Onion", 6600)] }
    });
    const d = await mandi("chennai_markets");
    expect(d.latest).toBe("2026-11-26");
    expect(d.commodities[0]).toMatchObject({ commodity: "Onion", date: "2026-11-26", price: 6500, prev: 6500, week: 6000, dates: ["2026-11-19", "2026-11-25", "2026-11-26"] });
  });

  it("shows nothing, not an error, when no price is held", async () => {
    expect(await mandiMarkets()).toMatchObject({ latest: null, markets: [], commodities: [] });
    expect(await mandiWeekly("chennai_region")).toEqual([]);
    expect(await mandi("chennai_markets")).toMatchObject({ commodities: [], latest: null });
  });
});
