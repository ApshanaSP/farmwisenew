import { describe, expect, it } from "vitest";
import { cmwssbLakes, oncePerLake, parseLakePage, type LakeDay, type LakeRow } from "./lakes";

const ROW = (cells: string[]) => `<tr style="text-align: right;">${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

describe("parseLakePage", () => {
  it("reads CMWSSB's lake storage table", () => {
    const html = `<b> Lake Storage As On - 06/10/2026</b><table>
      <tr><th>RESERVOIR</th><th>Full Tank Level (ft.)</th></tr>
      ${ROW(["POONDI", "140.00", "3231.00", "129.80", "817.00", "25.29", "-", "530.00", "0.00", "2518.00"])}
      ${ROW(["PUZHAL", "50.20", "3300.00", "42.95", "1868.00", "56.61", "225.00", "205.00", "0.00", "2978.00"])}
      ${ROW(["TOTAL", "-", "13,222.00", "-", "4,857.16", "36.74", "900.00", "1,222.00", "19.20", "9,355.02"])}</table>`;
    const d = parseLakePage(html)!;
    expect(d.date).toBe("2026-10-06");
    expect(d.rows.map((r) => [r.key, r.pct, r.inflow, r.lastYearMcft])).toEqual([["POONDI", 25.29, null, 2518], ["PUZHAL", 56.61, 225, 2978]]);
    expect(d.total).toEqual({ capacityMcft: 13222, storageMcft: 4857.16, pct: 36.74, lastYearMcft: 9355.02 });
  });
  it("returns null for a page without the table", () => {
    expect(parseLakePage("<html>no data</html>")).toBeNull();
  });
  it("27 Nov: a page that carries its table twice gives each reservoir once (and the first total)", () => {
    const table = (pct: string) => `<table>${ROW(["POONDI", "140.00", "3231.00", "129.80", "817.00", pct, "-", "530.00", "0.00", "2518.00"])}
      ${ROW(["PUZHAL", "50.20", "3300.00", "42.95", "1868.00", "56.61", "225.00", "205.00", "0.00", "2978.00"])}
      ${ROW(["TOTAL", "-", "13,222.00", "-", "4,857.16", "36.74", "900.00", "1,222.00", "19.20", "9,355.02"])}</table>`;
    const d = parseLakePage(`<b> Lake Storage As On - 26/11/2026</b>${table("25.29")}${table("99.99")}`)!;
    expect(d.rows.map((r) => [r.key, r.pct])).toEqual([["POONDI", 25.29], ["PUZHAL", 56.61]]);
    expect(d.total.storageMcft).toBe(4857.16);
  });
  it("27 Nov review: the real page of 26 Nov lists each reservoir twice and its one TOTAL row sums both copies: the total is the six's", () => {
    const six = [["POONDI", "140.00", "3231.00", "127.81", "554.00", "17.15", "-", "30.00", "0.00", "2711.00"],
      ["CHOLAVARAM", "65.50", "1081.00", "51.72", "198.00", "18.32", "55.00", "8.00", "1.00", "565.00"],
      ["PUZHAL", "50.20", "3300.00", "45.29", "2274.00", "68.91", "150.00", "178.00", "6.60", "2808.00"],
      ["KANNANKOTTAI THERVOY KANDIGAI", "115.35", "500.00", "106.75", "238.00", "47.60", "-", "14.00", "0.00", "439.00"],
      ["CHEMBARAMBAKKAM", "85.40", "3645.00", "74.62", "1222.00", "33.53", "135.00", "185.00", "7.00", "3051.00"],
      ["VEERANAM", "47.50", "1465.00", "44.25", "712.00", "48.60", "-", "128.00", "6.00", "978.20"]];
    const html = `<b> Lake Storage As On - 26/11/2026</b><table>${six.map((r) => ROW(r) + ROW(r)).join("")}
      ${ROW(["TOTAL", "-", "26,444.00", "-", "10,396.00", "39.31", "680.00", "1,086.00", "41.20", "21,104.40"])}</table>`;
    const d = parseLakePage(html)!;
    expect(d.rows).toHaveLength(6);
    expect(d.total).toEqual({ capacityMcft: 13222, storageMcft: 5198, pct: 39.31, lastYearMcft: 10552.2 });
    // a page without the duplicates keeps its own TOTAL row as it is
    const once = parseLakePage(`<b> Lake Storage As On - 25/11/2026</b><table>${six.map((r) => ROW(r)).join("")}
      ${ROW(["TOTAL", "-", "13,222.00", "-", "5,198.00", "39.31", "340.00", "543.00", "20.60", "10,552.20"])}</table>`)!;
    expect(once.total).toEqual({ capacityMcft: 13222, storageMcft: 5198, pct: 39.31, lastYearMcft: 10552.2 });
  });
});

describe("27 Nov: each lake once a day, even from a saved file that holds it twice", () => {
  const row = (key: string, pct: number): LakeRow => ({ key, name: key, lat: 13, lon: 80, ftlFt: 140, capacityMcft: 3231, levelFt: 127.8, storageMcft: 554, pct, inflow: null, outflow: 20, rainMm: 0, lastYearMcft: null });
  const day = (date: string, rows: LakeRow[]): LakeDay => ({ date, rows, total: { capacityMcft: 6462, storageMcft: 1108, pct: 17.1, lastYearMcft: null } });

  it("oncePerLake keeps the first of each reservoir and leaves a clean day as it is", () => {
    const clean = day("2026-11-25", [row("POONDI", 17), row("PUZHAL", 40)]);
    expect(oncePerLake(clean)).toBe(clean);
    const twice = day("2026-11-26", [row("POONDI", 17.15), row("PUZHAL", 41), row("POONDI", 99), row("PUZHAL", 99)]);
    expect(oncePerLake(twice).rows.map((r) => [r.key, r.pct])).toEqual([["POONDI", 17.15], ["PUZHAL", 41]]);
  });

  it("27 Nov review: a saved day whose total summed both copies (rows already once) gets the reservoirs' own total back", () => {
    // as the saved file of 27 Nov holds 26 Nov: six rows, the TOTAL of the page that listed them twice
    const saved: LakeDay = { date: "2026-11-26", rows: [row("POONDI", 17.15), row("PUZHAL", 17.15)], total: { capacityMcft: 12924, storageMcft: 2216, pct: 17.15, lastYearMcft: 900 } };
    expect(oncePerLake(saved).total).toEqual({ capacityMcft: 6462, storageMcft: 1108, pct: 17.15, lastYearMcft: 450 });
  });

  it("cmwssbLakes: one station per reservoir (the reservoirs build hook keeps one signal row per lake: UNIQUE metric, place_id)", async () => {
    // the module's saved copy, as the file of 26 Nov had it (read at once: today's page was just read)
    const g = (globalThis as unknown as { __lakes: { saved: unknown; loading: unknown } }).__lakes;
    g.saved = { todayFetchedAt: Date.now(), error: null, days: {
      "2026-11-25": day("2026-11-25", [row("POONDI", 17), row("PUZHAL", 40)]),
      "2026-11-26": day("2026-11-26", [row("POONDI", 17.15), row("PUZHAL", 41), row("POONDI", 17.15), row("PUZHAL", 41)])
    } };
    const l = (await cmwssbLakes("2026-11-26 21:17:34"))!;
    const ids = l.stations.map((s) => s.id);
    expect(ids).toEqual(["CMWSSB-POONDI", "CMWSSB-PUZHAL"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(l.stations[0].series).toEqual([17, 17.15]);
  });
});
