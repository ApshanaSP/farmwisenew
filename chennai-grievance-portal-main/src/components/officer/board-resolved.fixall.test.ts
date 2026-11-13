import React from "react";
import { describe, expect, it, vi } from "vitest";

// fixall-board-resolved-01 (noted on reviewerE-04): the officer Board's Resolved tile said "Resolved in 24 h" and "Resolved this week /
// month / quarter", but it counts the department's grievances first reported in the console's window (the last 24 hours, or the last 7, 30
// or 90 days back from now) that are now verified (officer/data.ts resolvedTile). The label now says that, in English and in Tamil.
vi.mock("@/components/manu/PetitionOriginal", () => ({ default: () => null }));
vi.mock("@/components/collector/app/SatMap", () => ({ default: () => null }));
vi.mock("@/components/collector/app/askmap/AskOverlay", () => ({ default: () => null }));
(globalThis as { React?: unknown }).React = React;

const { PERIODS } = await import("@/lib/collector/intel");
const { OverviewPage, ResolvedKpi } = await import("./Board");
const { translate } = await import("@/components/i18n/Translator");

type El = { type?: unknown; props?: { label?: string; children?: unknown } };
const find = (n: unknown, type: unknown): El | null => {
  if (!n || typeof n !== "object") return null;
  if (Array.isArray(n)) { for (const x of n) { const f = find(x, type); if (f) return f; } return null; }
  const e = n as El;
  return e.type === type ? e : find(e.props?.children, type);
};
const tile = (period: keyof typeof PERIODS) => {
  const kpi = { severe: 1, ongoing: 2, complaints: 3, resolved: 4 };
  const c = { ov: { period, periodInfo: PERIODS[period], board: { kpi: { cur: kpi, prev: kpi, series: { severe: [], ongoing: [] } } }, counts: { new: 0, newSerious: 0 },
    resolved: { cur: 4, prev: 3, series: [] } }, openList: () => undefined };
  return find(OverviewPage({ c: c as never, goGrievances: () => undefined, openContacts: () => undefined, openNews: () => undefined }), ResolvedKpi);
};

describe("fixall-board-resolved-01: the officer's Resolved tile says what it counts", () => {
  for (const period of Object.keys(PERIODS) as (keyof typeof PERIODS)[]) {
    it(`${period}: reported in ${PERIODS[period].label.toLowerCase()}, never a calendar day, week, month or quarter`, () => {
      const label = tile(period)?.props?.label ?? "";
      expect(label).toBe(`Resolved, reported in ${PERIODS[period].label.toLowerCase()}`);
      expect(label).not.toMatch(/today|this (day|week|month|quarter)|in 24 h$/i);
    });
  }
  it("in Tamil, the same window with its number, reported and then resolved", () => {
    expect(translate("Resolved, reported in last 24 hours")).toBe("கடந்த 24 மணி நேரத்தில் பதிவாகி, தீர்க்கப்பட்டவை");
    expect(translate("Resolved, reported in last 7 days")).toBe("கடந்த 7 நாட்களில் பதிவாகி, தீர்க்கப்பட்டவை");
    expect(translate("Resolved, reported in last 90 days")).toBe("கடந்த 90 நாட்களில் பதிவாகி, தீர்க்கப்பட்டவை");
  });
});
