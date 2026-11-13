import React from "react";
import { describe, expect, it, vi } from "vitest";

// console-sync-09: the Ongoing incidents tile counts incidents; the "Open, by severity" card counts one row per group of reports of the same
// problem in one area. Which unit the console counts in is the owner's (pass 4 lanes/merge.md); what was wrong is that the tile said "the
// same incidents are split by severity in the card below", and the PDF's first key point put the card's group counts beside the tile's
// incident count in one sentence ("N incidents are open; S severe and H high").
vi.mock("./SatMap", () => ({ default: () => null }));
vi.mock("./askmap/AskOverlay", () => ({ default: () => null }));
vi.mock("./YourData", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
(globalThis as { React?: unknown }).React = React;

const { PERIODS } = await import("@/lib/collector/intel");
const { HeroBody } = await import("./Overview");
const { keyPoints } = await import("./reportPdf");

// 5 open incidents: 3 severe (two of them reports of one drain, one group) and 1 high; the card holds 2 severe groups and 1 high
const kpi = { cur: { severe: 3, severe_open: 3, complaints: 2, complaint_inc: 1, ongoing: 5, urgent: 4, resolved: 0, reported: 5 },
  prev: { severe: 0, complaints: 0, ongoing: 5, resolved: 0, severe_open: 0, urgent: 0 } };
const d = { periodInfo: PERIODS.weekly, zone: null, zoneTable: [], kpi, severity: { counts: { Severe: 2, High: 1, Medium: 1, Low: 0 } },
  tasks: { count: 0, leftToDepts: 0, rows: [] }, snapshot: { kind: "district", newsOnly: 0 }, report: { attention: [], attentionTotal: 0, routine: 0, newsOnly: [] },
  bottom: { byDept: [], byZone: [], rain: { stations: [] }, aqi: { stations: [] }, lakes: { stations: [] } } };

type El = { key?: string; props: { tip?: string; children?: unknown } };
const tile = (k: string) => {
  const c = { period: "weekly", dept: null, layout: { kpis: ["severe", "complaints", "ongoing", "resolved"], panels: { snapshot: false } }, openList: () => undefined };
  const out = HeroBody({ d, c } as never) as unknown as El;
  return ((out.props.children as El[]).flat().filter(Boolean).flatMap((x) => (x as El).props.children as El[])).find((x) => x?.key === k);
};

describe("console-sync-09: incidents and groups are never said to be the same count", () => {
  it("the Ongoing tile does not say the card below splits the same incidents; it says the card counts a repeated problem once", () => {
    const tip = tile("ongoing")?.props.tip ?? "";
    expect(tip).not.toMatch(/same incidents are split/i);
    expect(tip).toMatch(/one row/i);
  });
  it("the PDF's first key point says severe and high in incidents, the unit of the open count beside them", () => {
    const first = keyPoints(d, { dept: null })[0];
    expect(first).toMatch(/^5 incidents are open/);
    expect(first).toContain("3 severe and 1 high");
  });
});
