/**
 * A saved workspace's Briefing (28 Nov 2026). The owner: "when I open the saved workspace, the second (Briefing) page key points change into a
 * different format. Make sure the live format we are using now stays even if I save the workspace."
 *  - the copy a version keeps (BriefingBook freezeBook) goes through the store as JSON and comes back (workspacesnap readSavedBrief) to draw
 *    the same key points, figures, departments, stories and news-only lines as the live page did: the same markup, card for card;
 *  - a saved copy is drawn from itself only: different live stories, news or AI words on the console change nothing in it;
 *  - a version saved before 28 Nov (only its markdown) still opens, on the Briefing page's own card, said to be in the written format.
 */
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Console, SavedOpen } from "./CollectorApp";

vi.mock("@/lib/i18n/lang", async (orig) => ({ ...(await orig<typeof import("@/lib/i18n/lang")>()), useLang: () => ["en", () => undefined] }));
(globalThis as { React?: unknown }).React = React;

const { BriefingBook, freezeBook } = await import("./BriefingBook");
const { readSavedBrief } = await import("@/lib/collector/workspacesnap");

const NOW = "2026-11-28 10:30:00";
const days = Array.from({ length: 7 }, (_, k) => ({ day: `2026-11-${String(22 + k).padStart(2, "0")}`, reported: 150 + k * 4, resolved: 140 + k * 3 }));
// the Briefing part as the insights route sends it, with fields the page does not draw (they must not be needed by the saved copy)
const ins = {
  now: NOW, scope: "District-wide",
  book: {
    status: { level: "watchful", reasons: ["1 death"], warning: null },
    alerts: null,
    today: {
      whole: true,
      kpi: { cur: { reported: 172, ongoing: 168, urgent: 38, severe: 8, severe_open: 7, resolved: 175 }, prev: { reported: 176, ongoing: 167, severe: 12, resolved: 190 } },
      overdue: 13, deaths: 1, injured: 6, awaiting: 2, unchecked: 15,
      kinds: [{ cat: "CRIME_PROPERTY", label: "Theft", n: 24, prev: 16 }, { cat: "FLOOD_WATERLOGGING", label: "Flooding", n: 15, prev: 15 }],
      zones: [{ zone: 8, name: "Anna Nagar", n: 21, prev: 15 }, { zone: 13, name: "Adyar", n: 18, prev: 22 }],
      cases: [{ id: "INC-1", title: "Wall collapse at Kellys", type: "Unsafe buildings & walls", sev: "Severe", zone: "Anna Nagar", loc: "Kellys", dept: "PWD-BLD", deptName: "PWD Buildings", deptHead: null, dead: 1, next: null, t: "2026-11-28 08:00:00" }],
      fatal: { id: "INC-1", title: "Wall collapse at Kellys", dead: 1 },
      days
    },
    glance: { ai: null, opening: null, tiles: {} },
    critical: [{ id: "INC-1", title: "Wall collapse at Kellys", why: { attention: [] } }],
    departments: [
      { code: "POL-GCP", name: "Greater Chennai Police", head: "Commissioner", n: 77, severe: 3, dead: 1, open: 60, overdue: 6, items: [{ id: "INC-5", title: "x", type: "y" }] },
      { code: "PWD-WRD", name: "PWD Water Resources", head: null, n: 16, severe: 0, dead: 0, open: 9, overdue: 0, items: [] }
    ],
    where: [], news: [], newsAi: false, health: { ai: null, beds: [], disease: { now: 0, prev: 0, zones: [] } }, law: { ai: null, rising: [], falling: [] },
    citizens: { kinds: [], oldest: { id: "INC-7", title: "Garbage not cleared for a week", zone: "Adyar", days: 6, t: "2026-11-22 09:00:00" } },
    good: { resolved: 175, serious: [], falling: [] }
  },
  briefing: { emerging: [], md: "# Collector's Briefing\n\n- 172 reported", headline: "172 reported", attention: [] },
  gaps: [{ id: "INC-9", title: "Fire at a godown in Ambattur", type: "Fire", sev: "High", zone_name: "Ambattur", dept_name: "Fire and Rescue", t: "2026-11-28 07:10:00", why: { attention: ["only in the news"] }, lat: 13.1 }]
};
const threads = [{
  id: "T1", title: "Library books case", outlets: ["DT Next", "The Hindu", "Dinamani"], last: "2026-11-28 09:00:00", ai: { now: "Police have filed a case.", status: "ongoing" },
  events: [{ t: "2026-11-26 10:00:00", label: "Reported", what: "Books found missing", title: "", publisher: null, url: null, incident: null, sources: [], reports: 2 },
    { t: "2026-11-27 10:00:00", label: "Action", what: "Police registered a case", title: "", publisher: null, url: null, incident: null, sources: [], reports: 1 },
    { t: "2026-11-28 09:00:00", label: "Update", what: "Two arrested", title: "", publisher: null, url: null, incident: null, sources: [], reports: 3 }],
  // what a story carries and its card never draws
  days: [{ day: "2026-11-26", steps: [] }], records: [], merged: 1, folded: 0, rank: 1
}];
const base = {
  period: "daily", periodLabel: "Today", scopeName: "District-wide", zone: null, zoneName: null, dept: null, deptName: null, cat: null, catLabel: null, taluk: null,
  talukName: () => null, stories: { days: 1, total: 1, threads, ai: true, pending: false }, conflicts: null, dayBrief: null, saved: null
};
const console0 = base as unknown as Console;

/** the server's round trip: the copy goes into the archive's fact pack as JSON and comes back parsed, beside the markdown */
function throughStore(view: unknown) {
  const facts = JSON.parse(JSON.stringify({ headline: "172 reported", attention: [], scope: "District-wide", view }));
  return { markdown: ins.briefing.md, facts, period: "daily", as_of: NOW, issued_at: "2026-11-28 10:31:00" };
}
const savedOpen = (brief: ReturnType<typeof readSavedBrief>): SavedOpen => ({ id: 4, name: "Collector's Daily Briefing", version: 3, savedAt: "2026-11-28 10:31:00", brief,
  filters: { period: "daily", zone: null, dept: null, cat: null, taluk: null } });
/** the part of the page between two markers: the key points, or the three cards under them */
const part = (html: string, from: string, to?: string) => html.slice(html.indexOf(from), to ? html.indexOf(to) : undefined);

describe("a saved Briefing reopens in the live page's own format", () => {
  const live = renderToStaticMarkup(createElement(BriefingBook, { ins: ins as never, c: console0 }));
  const view = freezeBook(ins as never, undefined, console0);
  const brief = readSavedBrief(throughStore(view));
  const savedC = { ...base, saved: savedOpen(brief) } as unknown as Console;
  const saved = renderToStaticMarkup(createElement(BriefingBook, { c: savedC, saved: brief }));

  it("the copy is the page's own: key points, figures and lists, and it survives the store's JSON", () => {
    expect(view).toBeTruthy();
    expect(brief?.kind).toBe("view");
    const v = (brief as Extract<typeof brief, { kind: "view" }>).view;
    expect(v.glance.figures.map((f) => [f.key, f.v])).toEqual([["reported", 172], ["open", 168], ["overdue", 13], ["severe", 8], ["resolved", 175]]);
    expect(v.glance.happening.length + v.glance.needs.length + v.glance.next.length).toBeGreaterThan(3);
    expect(v.departments).toEqual([
      { code: "POL-GCP", name: "Greater Chennai Police", n: 77, open: 60, dead: 1, severe: 3, overdue: 6 },
      { code: "PWD-WRD", name: "PWD Water Resources", n: 16, open: 9, dead: 0, severe: 0, overdue: 0 }]);
    // a story keeps what its card shows, not its every report
    expect(Object.keys(v.stories!.threads[0]).sort()).toEqual(["ai", "events", "id", "last", "outlets", "title"]);
    expect(v.gaps).toEqual([{ id: "INC-9", title: "Fire at a godown in Ambattur", type: "Fire", sev: "High", zone_name: "Ambattur", dept_name: "Fire and Rescue", t: "2026-11-28 07:10:00" }]);
  });

  it("draws the same key points, figures and week as the live page", () => {
    expect(part(saved, '<div class="gl-grid">', '<div class="bb2-row">')).toBe(part(live, '<div class="gl-grid">', '<div class="bb2-row">'));
    expect(part(live, '<div class="gl-grid">')).toContain("What needs you");
    expect(part(saved, '<p class="gl-say"', '<div class="gl-grid">')).toBe(part(live, '<p class="gl-say"', '<div class="gl-grid">'));
  });

  it("draws the same departments, developing stories and news-only lines", () => {
    expect(part(saved, '<div class="bb2-row">')).toBe(part(live, '<div class="bb2-row">'));
    expect(part(saved, '<div class="bb2-row">')).toContain("Greater Chennai Police");
    expect(part(saved, '<div class="bb2-row">')).toContain("Two arrested");
    expect(part(saved, '<div class="bb2-row">')).toContain("Fire at a godown in Ambattur");
  });

  it("says it is a saved copy, and when its data was read; the live page does not", () => {
    expect(saved).toContain('class="bb bb2 bb-saved"');
    expect(saved).toMatch(/class="gl-saved"[^>]*><svg[^]*?<b>Saved copy<\/b><span>data as of<\/span><time data-no-i18n="">28 Nov, 10:30 AM<\/time>/);
    expect(live).not.toContain("gl-saved");
  });

  it("is drawn from the copy only: other live stories, news or AI words on the console change nothing", () => {
    const later = { ...savedC, stories: { days: 1, total: 0, threads: [], ai: true, pending: true },
      dayBrief: { brief: { headline: "Everything changed", headlineTa: null } }, periodLabel: "Last 7 days", scopeName: "Adyar" } as unknown as Console;
    expect(renderToStaticMarkup(createElement(BriefingBook, { c: later, saved: brief }))).toBe(saved);
  });
});

describe("versions saved before 28 Nov (the migration)", () => {
  it("a markdown-only version opens on the Briefing page's own card, in the written format", () => {
    const old = { markdown: "# Collector's Briefing\n\n## Decisions for you\n- Wall collapse at Kellys", facts: { headline: "3 need you", attention: ["INC-1"], scope: "District-wide" },
      period: "daily", as_of: "2026-11-20 09:00:00", issued_at: "2026-11-20 09:05:00" };
    const b = readSavedBrief(old);
    expect(b).toEqual({ kind: "text", md: old.markdown, headline: "3 need you", asOf: "2026-11-20 09:00:00", issuedAt: "2026-11-20 09:05:00" });
    const html = renderToStaticMarkup(createElement(BriefingBook, { c: { ...base, saved: savedOpen(b) } as unknown as Console, saved: b }));
    expect(html).toContain('class="bb bb2 bb-saved"');
    expect(html).toContain("This version kept only the written briefing.");
    expect(html).toContain("Wall collapse at Kellys");
  });
});
