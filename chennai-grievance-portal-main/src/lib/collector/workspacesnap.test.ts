/**
 * A saved workspace's Briefing copy (28 Nov 2026, workspacesnap.ts): read back whatever it was saved as, never a broken page, and kept small
 * enough for one stored row.
 */
import { describe, expect, it } from "vitest";
import { BRIEF_VIEW_V, VIEW_MAX_BYTES, capView, normalizeView, readSavedBrief, trimThread, type FrozenBook } from "./workspacesnap";

const glance = { empty: false, situation: { en: ["172 incidents were reported today."], ta: ["இன்று 172 சம்பவங்கள் பதிவாகின."] }, figures: [], happening: [], needs: [], next: [] };
const view = (o: Partial<FrozenBook> = {}): FrozenBook => ({
  v: BRIEF_VIEW_V, now: "2026-11-28 10:30:00", period: "daily", periodLabel: "Today", scopeName: "District-wide", whole: true,
  status: { level: "normal", reasons: [] }, warned: null, glance, ai: null, days: [], oldest: null, departments: [], stories: { threads: [] }, gaps: [], news: null, differ: null, ...o
} as FrozenBook);
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

describe("reading a saved version's Briefing", () => {
  it("a copy saved since 28 Nov is the page's view, with its own time", () => {
    const b = readSavedBrief({ markdown: "# x", facts: { view: view() }, as_of: "2026-11-28 10:30:00", issued_at: "2026-11-28 10:31:00" });
    expect(b?.kind).toBe("view");
    expect(b).toMatchObject({ asOf: "2026-11-28 10:30:00", issuedAt: "2026-11-28 10:31:00" });
  });
  it("reads the fact pack whether it comes parsed or as its stored JSON text", () => {
    const b = readSavedBrief({ markdown: "# x", fact_pack: JSON.stringify({ view: view() }), as_of: "2026-11-28 10:30:00" });
    expect(b?.kind).toBe("view");
  });
  it("an older version (markdown only), a copy of an unknown shape or a broken pack falls back to the written briefing", () => {
    expect(readSavedBrief({ markdown: "# Briefing", facts: { headline: "h" } })).toMatchObject({ kind: "text", md: "# Briefing", headline: "h" });
    expect(readSavedBrief({ markdown: "# Briefing", facts: { view: { v: 9, glance } } })).toMatchObject({ kind: "text" });
    expect(readSavedBrief({ markdown: "# Briefing", facts: { view: { v: 2, now: "2026-11-28 10:30:00", glance: { figures: [] } } } })).toMatchObject({ kind: "text" });
    expect(readSavedBrief({ markdown: "# Briefing", fact_pack: "{not json" })).toMatchObject({ kind: "text" });
  });
  it("no briefing, or an empty one, is none", () => {
    expect(readSavedBrief(null)).toBeNull();
    expect(readSavedBrief({ markdown: "  ", facts: null })).toBeNull();
    expect(readSavedBrief("text")).toBeNull();
  });
  it("whatever a partial copy is missing is an empty list or a plain default", () => {
    const v = normalizeView({ v: 2, now: "2026-11-28 10:30:00", glance, status: { level: "loud" }, departments: [{ code: "POL", name: "Police", n: "5" }] })!;
    expect(v.status).toEqual({ level: "normal", reasons: [] });
    expect(v.departments).toEqual([{ code: "POL", name: "Police", n: 5, open: 0, dead: 0, severe: 0, overdue: 0 }]);
    expect(v.gaps).toEqual([]);
    expect(v.days).toEqual([]);
    expect(v.stories).toBeNull();
    expect(v.whole).toBe(true);
    expect(v.scopeName).toBe("District-wide");
  });
});

describe("the copy stays small enough for one stored row", () => {
  const long = "A very long headline about an incident somewhere in Chennai, repeated ".repeat(6);
  const big = view({
    gaps: Array.from({ length: 900 }, (_, k) => ({ id: `INC-${k}`, title: long, type: "Fire", sev: "High", zone_name: "Adyar", dept_name: "Fire and Rescue", t: "2026-11-28 07:00:00" })),
    stories: { threads: Array.from({ length: 80 }, (_, k) => trimThread({ id: `T${k}`, title: long, outlets: ["DT Next", "The Hindu"], last: "2026-11-28 09:00:00", ai: null,
      events: Array.from({ length: 12 }, () => ({ t: "2026-11-28 09:00:00", label: "Update", what: long })) } as never)) },
    departments: [{ code: "POL", name: "Police", n: 5, open: 1, dead: 0, severe: 0, overdue: 0 }]
  });
  it("an ordinary copy is kept as it is", () => {
    const v = view({ gaps: big.gaps.slice(0, 5) });
    expect(capView(v)).toBe(v);
  });
  it("a very long one loses its last lines first, never its key points or departments", () => {
    expect(bytes(big)).toBeGreaterThan(VIEW_MAX_BYTES);
    const c = capView(big);
    expect(bytes(c)).toBeLessThanOrEqual(VIEW_MAX_BYTES);
    expect(c.glance).toEqual(big.glance);
    expect(c.departments).toEqual(big.departments);
    expect(c.gaps.length).toBeLessThanOrEqual(30);
  });
});
