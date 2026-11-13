import React from "react";
import { describe, expect, it, vi } from "vitest";

// console-sync-01, hunt2-ops-10: the Resolved tile said "Resolved today" (Tamil "இன்று தீர்க்கப்பட்டவை") and "Resolved this week / month /
// quarter" over the console's reporting windows, which are the last 24 hours and the last 7, 30 and 90 days back from now (intel.ts
// periodSinceWindow; the owner's design). The tile, the PDF's tile and the period's own label now read one wording from PERIODS.
vi.mock("./SatMap", () => ({ default: () => null }));
vi.mock("./askmap/AskOverlay", () => ({ default: () => null }));
vi.mock("./YourData", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
(globalThis as { React?: unknown }).React = React;

const { PERIODS } = await import("@/lib/collector/intel");
const { HeroBody } = await import("./Overview");
const { pdfTiles } = await import("./reportPdf");
const { translate } = await import("@/components/i18n/Translator");

type El = { key?: string; props: { label?: string; children?: unknown } };
const tiles = (period: keyof typeof PERIODS) => {
  const d = { periodInfo: PERIODS[period], kpi: { cur: { severe: 1, severe_open: 1, complaints: 2, complaint_inc: 1, ongoing: 3, urgent: 1, resolved: 4, reported: 5 },
    prev: { severe: 0, complaints: 0, ongoing: 0, resolved: 0 } }, snapshot: { kind: "district" } };
  const c = { period, dept: null, layout: { kpis: ["severe", "complaints", "ongoing", "resolved"], panels: { snapshot: false } }, openList: () => undefined };
  const out = HeroBody({ d, c } as never) as unknown as El;
  const section = out.props.children as El[];
  return (Array.isArray(section) ? section : [section]).flat().filter(Boolean).flatMap((x) => (x as El).props.children as El[]);
};

describe("the Resolved tile says the window it counts", () => {
  for (const period of Object.keys(PERIODS) as (keyof typeof PERIODS)[]) {
    it(`${period}: the tile and the PDF's tile say "${PERIODS[period].label.toLowerCase()}", never a calendar day, week, month or quarter`, () => {
      const tile = tiles(period).find((k) => k?.key === "resolved");
      expect(tile?.props.label).toBe(PERIODS[period].resolved);
      expect(tile?.props.label).not.toMatch(/today|this (day|week|month|quarter)/i);
      expect(tile?.props.label?.toLowerCase()).toContain(PERIODS[period].label.toLowerCase());
      expect(pdfTiles(PERIODS[period]).find((t) => t[1] === "resolved")?.[0]).toBe(PERIODS[period].resolved);
    });
  }
  it("in Tamil, the hand-checked words say the same window, with its number", () => {
    expect(translate(PERIODS.daily.resolved)).toBe("தீர்க்கப்பட்டவை, கடந்த 24 மணி நேரம்");
    expect(translate(PERIODS.weekly.resolved)).toBe("தீர்க்கப்பட்டவை, கடந்த 7 நாட்கள்");
    expect(translate(PERIODS.quarterly.resolved)).toBe("தீர்க்கப்பட்டவை, கடந்த 90 நாட்கள்");
    for (const p of Object.values(PERIODS)) expect(translate(p.resolved)).not.toMatch(/இன்று|இந்த/);
  });
});
