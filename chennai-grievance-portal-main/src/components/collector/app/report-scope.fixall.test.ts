import { describe, expect, it } from "vitest";
import { coverLine, keyPoints, workload } from "./reportPdf";
import { reportOpt, scopeWords } from "./lib";

// console-sync-02: the PDF's cover said "District-wide" when every figure was filtered to a taluk or a category (the report request carries
// them; the cover was given the zone's name or "District-wide" only). console-sync-12: a zone's PDF named the district's busiest zone in its
// key points and charted other zones' open incidents, from the page's all-zone table.

const P = { label: "Last 7 days", word: "Weekly", unit: "Week", prev: "prev. week", resolved: "Resolved, last 7 days" };
const zoneTable = [{ zone: 5, name: "Royapuram", open: 40 }, { zone: 9, name: "Teynampet", open: 90 }, { zone: 13, name: "Adyar", open: 70 }];
const base = (over: Record<string, unknown> = {}) => ({
  periodInfo: P, zone: null, zoneTable, kpi: { cur: { ongoing: 200 }, prev: { ongoing: 180 } }, severity: { counts: { Severe: 3, High: 9 } },
  tasks: { count: 2, leftToDepts: 5, rows: [] }, snapshot: { newsOnly: 0 },
  report: { attention: [], attentionTotal: 0, routine: 0, newsOnly: [] },
  bottom: { byDept: [{ l: "Storm Water Drains", v: 12 }], byZone: [], rain: { stations: [] }, aqi: { stations: [] }, lakes: { stations: [] } },
  ...over
});

describe("console-sync-02: the PDF's cover names every filter its figures are filtered by", () => {
  it("a taluk and a category with no zone: not 'District-wide'", () => {
    const scope = scopeWords({ zoneName: null, deptName: null, catLabel: "Garbage & sanitation", talukName: "Mylapore" });
    expect(scope).toBe("Garbage & sanitation · Mylapore taluk");
    const opt = reportOpt({ scopeName: scope, deptName: null }, "f.pdf");
    expect(coverLine(base(), opt)).toBe("Last 7 days · Garbage & sanitation · Mylapore taluk");
  });
  it("no filter is District-wide; a zone and a department are each named once", () => {
    expect(scopeWords({ zoneName: null, deptName: null, catLabel: null, talukName: null })).toBe("District-wide");
    const scope = scopeWords({ zoneName: "Teynampet", deptName: "Storm Water Drains", catLabel: null, talukName: null });
    expect(coverLine(base(), reportOpt({ scopeName: scope, deptName: "Storm Water Drains" }, "f.pdf"))).toBe("Last 7 days · Teynampet · Storm Water Drains");
  });
});

describe("console-sync-12: a zone's PDF keeps to that zone", () => {
  const places = [{ zone: null, l: "Mount Road", n: 6, v: 14 }, { zone: null, l: "Anna Salai", n: 9, v: 11 }];
  const d = base({ zone: 5, bottom: { ...base().bottom, byZone: places } });
  it("its key points name no other zone as the busiest", () => {
    const pts = keyPoints(d, { scope: "Royapuram", dept: null }).join(" ");
    expect(pts).not.toMatch(/Teynampet|Adyar/);
    expect(pts).toContain("Mount Road has the most citizen complaints in the zone (14)");
  });
  it("its workload chart is the zone's places, not the other zones", () => {
    const right = workload(d, { scope: "Royapuram", dept: null }).right;
    expect(right.rows.map((r) => [r.l, r.v])).toEqual([["Mount Road", 14], ["Anna Salai", 11]]); // the zone's places by complaints, most first
    expect(right.head).not.toMatch(/by zone/i);
  });
  it("the district's PDF still names the busiest zone and charts the zones", () => {
    expect(keyPoints(base(), { scope: "District-wide", dept: null }).join(" ")).toContain("Teynampet zone has the most open incidents (90)");
    expect(workload(base(), { scope: "District-wide", dept: null }).right.rows.map((r) => r.l)).toEqual(["Teynampet", "Adyar", "Royapuram"]);
  });
});
