import React from "react";
import { describe, expect, it, vi } from "vitest";

// fixall-board-resolved-01 (noted on reviewerE-04): the officer Board's Resolved tile said "Resolved in 24 h" and "Resolved this week /
// month / quarter", but it counts the department's grievances first reported in the console's window (today since 12 AM, or the last 7, 30
// or 90 days back from now) that are now verified (officer/data.ts resolvedTile). The label now says that, in English and in Tamil.
vi.mock("@/components/manu/PetitionOriginal", () => ({ default: () => null }));
vi.mock("@/components/collector/app/SatMap", () => ({ default: () => null }));
vi.mock("@/components/collector/app/askmap/AskOverlay", () => ({ default: () => null }));
(globalThis as { React?: unknown }).React = React;

const { PERIODS } = await import("@/lib/collector/intel");
const { HeroKpis, ResolvedKpi } = await import("./Board");
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
  // 28 Nov: the count tiles are the band's (Board.tsx HeroKpis), on the one-page console
  return find(HeroKpis({ c: c as never }), ResolvedKpi);
};

describe("fixall-board-resolved-01: the officer's Resolved tile says what it counts", () => {
  for (const period of Object.keys(PERIODS) as (keyof typeof PERIODS)[]) {
    it(`${period}: reported in its window, never a calendar week, month or quarter`, () => {
      const label = tile(period)?.props?.label ?? "";
      expect(label).toBe(period === "daily" ? "Resolved, reported today (since 12 AM)" : `Resolved, reported in ${PERIODS[period].label.toLowerCase()}`);
      expect(label).not.toMatch(/this (day|week|month|quarter)|24 h/i);
    });
  }
  it("in Tamil, the same window with its number, reported and then resolved", () => {
    expect(translate("Resolved, reported today (since 12 AM)")).toBe("இன்று (நள்ளிரவு 12 மணி முதல்) பதிவாகி, தீர்க்கப்பட்டவை");
    expect(translate("Resolved, reported in last 7 days")).toBe("கடந்த 7 நாட்களில் பதிவாகி, தீர்க்கப்பட்டவை");
    expect(translate("Resolved, reported in last 90 days")).toBe("கடந்த 90 நாட்களில் பதிவாகி, தீர்க்கப்பட்டவை");
  });
});
