import { describe, expect, it } from "vitest";
import { parseLakePage } from "./lakes";

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
});
