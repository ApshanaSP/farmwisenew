import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { composeGlance, plain } from "@/lib/collector/glance";
import type { DeptBriefing } from "@/lib/officer/insights";

// 28 Nov 2026 (the owner: "make sure everything is the same as the Collector console ... a single-page dashboard"): the officer console is
// one scrolling page built from the Collector's shell and parts. These check what it says and opens, and that it never reaches a
// Collector-only API: the department is the session's, on the server.
vi.mock("@/components/manu/PetitionOriginal", () => ({ default: () => null }));
vi.mock("@/components/collector/app/SatMap", () => ({ default: () => null, exitMapFullscreen: () => undefined, esc: (s: string) => s }));
vi.mock("@/components/collector/app/askmap/AskOverlay", () => ({ default: () => null }));
// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;

const NOW = "2026-11-28 10:00:00";
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const counts = { new: 6, action: 9, sent: 2, verified: 4, returned: 1, serious: 3, overdue: 2, newSerious: 2, due: 3 };
const dept = { code: "GCC-SWD", name: "Storm Water Drain Department", org: "Greater Chennai Corporation", head: "Chief Engineer (SWD)", route: "Chief Engineer, SWD", short: "SWD", remarkHint: "" };
const row = (id: string, more: Record<string, unknown> = {}) => ({ id, type: "Waterlogging", title: `Water stagnation ${id}`, sev: "High", zone_name: "Adyar", loc: "LB Road", t: "2026-11-28 08:00:00", stage: "action", complaints: 2, ...more });
const ov = {
  now: NOW, period: "daily", periodInfo: { label: "Today (since 12 AM)", prev: "yesterday by this time", word: "Daily", buckets: 12, hours: 24 },
  dept, counts, resolved: { cur: 4, prev: 3, series: [] },
  board: { kpi: { cur: { severe: 1, ongoing: 12, complaints: 30, resolved: 9 }, prev: { severe: 2, ongoing: 10, complaints: 20, resolved: 5 } },
    severity: { counts: { Severe: 1, High: 3, Medium: 4, Low: 4 }, rows: [row("INC-1", { sev: "Severe", dept: "GCC-SWD" })] },
    snapshot: { contacts: [{ contact_id: 1, dept_code: "GCC-SWD", name: "A. Officer", designation: "Chief Engineer (Storm Water Drain)", phone: "25619200", email: "cesw@chennaicorporation.gov.in",
      source_url: "https://chennaicorporation.gov.in/gcc/who-is-who/", retrieved_on: "2026-09-28" }], overdue: 2 }, bell: [] },
  news: [{ ...row("INC-9"), outletNames: ["The Hindu", "DT Next"] }],
  head: null, feedback: [], feeds: [],
  work: { new: [row("INC-2", { stage: "new" })], action: [row("INC-3")], returned: [row("INC-4", { returned: true, returnNote: "Photos unclear" })], awaiting: 0, awaitingNote: null }
};
const ctx = (extra: Record<string, unknown> = {}) => ({
  ov, dept, now: NOW, zoneName: null, talukName: null, areaName: null, busy: new Set<string>(), fresh: null,
  openGrievance: () => undefined, openList: () => undefined, openSend: () => undefined, approve: async () => undefined, openWork: () => undefined,
  openContacts: () => undefined, openNews: () => undefined, openNewsAll: () => undefined, setZone: () => undefined, ...extra
});
const briefing: DeptBriefing = {
  now: NOW, status: { level: "watchful", reasons: ["1 death"] },
  today: { kpi: { cur: { reported: 14, ongoing: 12, urgent: 4, severe: 1, severe_open: 1, resolved: 9 }, prev: { reported: 11, ongoing: 10, severe: 2, resolved: 5 } },
    overdue: 2, deaths: 1, injured: 0, kinds: [{ cat: "FLOOD_WATERLOGGING", label: "Waterlogging", n: 9, prev: 6 }], zones: [{ zone: 13, name: "Adyar", n: 5, prev: 2 }],
    fatal: { id: "INC-1", title: "Wall collapse in Adyar", dead: 1 }, days: [],
    cases: [{ id: "INC-1", title: "Wall collapse in Adyar", type: "Building safety", sev: "Severe", zone: "Adyar", loc: "LB Road", dead: 1 }] },
  oldest: null, gaps: [{ id: "INC-7", title: "Drain overflow at Velachery", type: "Drainage", sev: "Medium", zone_name: "Velachery", loc: null, t: NOW, outlets: 2 }], gapsTotal: 1, rise: null
} as unknown as DeptBriefing;

describe("today's briefing for the department: the Collector's glance, in the officer's voice", () => {
  it("says the department's figures, the officer's own Resolved count, and none of the Collector's own steps", async () => {
    const { officerGlanceInput, officerSteps } = await import("./Briefing");
    const f = officerGlanceInput(briefing, ctx() as never);
    expect(f.scope.words).toBe("Storm Water Drain Department");
    expect(f.cur.resolved).toBe(4); // the officer's tile (officer-day-13), not the Collector's 9
    const g = composeGlance(f);
    const said = [g.situation.en, ...[...g.happening, ...g.needs, ...g.next].map((p) => p.en)].map(plain).join(" | ");
    expect(said).toMatch(/^Storm Water Drain Department: 14 incidents were reported today/);
    expect(said).toMatch(/4 resolved/);
    // the Collector's steps: instructing a department, verifying finished work, asking a department to close or record its cases
    expect(said).not.toMatch(/Instruct|My tasks|Verify or send back|Ask .* to (close|record)|not yet checked on the ground/);
    const steps = officerSteps(counts as never).map((p) => plain(p.en));
    expect(steps).toEqual([
      "Approve the 6 new grievances; the 2 severe or high first.",
      "Redo the 1 case the Collector reopened, and send a fresh report.",
      "Finish the 3 cases due within 24 hours."
    ]);
    // each also in Tamil
    expect(officerSteps(counts as never).every((p) => /[஀-௿]/.test(plain(p.ta)))).toBe(true);
  });
  it("draws its key points with the Collector's own parts, and the loading and empty states say so", async () => {
    const { OfficerBriefing } = await import("./Briefing");
    const html = renderToStaticMarkup(createElement(OfficerBriefing, { c: ctx() as never, b: briefing, failed: false, retry: () => undefined }));
    expect(html).toContain('class="bb-card bb-brief gl ofc-gl"');
    for (const h of ["What is happening", "What needs you", "What to do next"]) expect(text(html)).toContain(h);
    expect(text(html)).toMatch(/Good morning, SWD officer/);
    expect(text(renderToStaticMarkup(createElement(OfficerBriefing, { c: ctx() as never, b: null, failed: false, retry: () => undefined })))).toMatch(/No briefing for SWD/);
    expect(text(renderToStaticMarkup(createElement(OfficerBriefing, { c: ctx() as never, b: null, failed: true, retry: () => undefined })))).toMatch(/could not be loaded/);
  });
});

describe("What needs you: by severity, and My work with To approve, In action and Reopened", () => {
  it("opens on My work while something waits, with the three lists and each row's one action", async () => {
    const { OfficerAttention } = await import("./OfficerAttention");
    const html = renderToStaticMarkup(createElement(OfficerAttention, { c: ctx() as never }));
    const t = text(html);
    expect(t).toMatch(/By severity 12/);
    expect(t).toMatch(/My work 15/);
    expect(t).toMatch(/6 To approve 9 In action 1 Reopened/);
    expect(t).toContain("Approve");
    expect(html).toContain('class="att-pills three"');
  });
  it("the reopened list names the Collector's note on the row", async () => {
    const { OfficerAttention } = await import("./OfficerAttention");
    const html = renderToStaticMarkup(createElement(OfficerAttention, { c: ctx({ ov: { ...ov, counts: { ...counts, new: 0 } } }) as never }));
    expect(text(html)).toMatch(/Reopened: Photos unclear/);
    expect(text(html)).toMatch(/Complete & close/);
    expect(text(html)).toMatch(/2 waiting for the Collector's check/);
  });
});

describe("the band and the office card: the Collector's tiles, real contacts only", () => {
  it("four count tiles, the approval tile among them", async () => {
    const { HeroKpis } = await import("./Board");
    const t = text(renderToStaticMarkup(createElement(HeroKpis, { c: ctx() as never })));
    for (const l of ["Severe events", "Open incidents", "Waiting for your approval", "Resolved, reported today (since 12 AM)"]) expect(t).toContain(l);
  });
  it("Your office: the login, the head of department as the GCC Who's who lists them, and the source with the day it was read", async () => {
    const { ContactsCard } = await import("./Cards");
    const t = text(renderToStaticMarkup(createElement(ContactsCard, { c: ctx() as never, user: "officer.gcc-swd@chennai.gov.in" })));
    expect(t).toMatch(/Signed in as officer\.gcc-swd/);
    expect(t).toMatch(/A\. Officer/);
    expect(t).toContain("25619200");
    expect(t).toMatch(/Greater Chennai Corporation, Who's who\s*, read 28 Sep/);
    const none = text(renderToStaticMarkup(createElement(ContactsCard, { c: ctx({ ov: { ...ov, board: { ...ov.board, snapshot: { contacts: [] } } } }) as never, user: "x@y" })));
    expect(none).toMatch(/Not listed on the GCC Who's who page/);
  });
});

describe("one page, the Collector's shell, the officer's own routes", () => {
  const dir = path.resolve(__dirname);
  const src = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")] as const);
  const app = fs.readFileSync(path.join(dir, "OfficerApp.tsx"), "utf8");
  it("no officer screen calls a Collector-only API", () => {
    expect(src.filter(([, s]) => /["'`]\/api\/collector\//.test(s)).map(([f]) => f)).toEqual([]);
    // the alert chip reads the officer's own route
    expect(app).toMatch(/<AlertBar now=\{ov\.now\} compact src="\/api\/officer\/insights\?part=alerts" \/>/);
  });
  it("the shell is the Collector's: page tabs, Menu without the Data Studio, the band, the dock with the new Jarvis and chatbot buttons", () => {
    expect(app).toMatch(/<PageTabs /);
    expect(app).toMatch(/<TopMenu[\s\S]{0,200}dashboards=\{false\}/);
    expect(app).toMatch(/className="band hero"/);
    expect(app).toMatch(/className="cdock"/);
    expect(app).toMatch(/ask-fab ask-fab-v2/);
    expect(fs.readFileSync(path.join(dir, "Jarvis.tsx"), "utf8")).toMatch(/className="jvf-core"/);
    // the old pager and its second page are gone
    expect(app).not.toMatch(/PageSwap|WorkPage|InsightsPage/);
    expect(fs.existsSync(path.join(dir, "InsightsPage.tsx"))).toBe(false);
  });
  it("the server decides the department: the routes read it from the session, never the query", () => {
    const route = (p: string) => fs.readFileSync(path.resolve(dir, "../../app/api/officer", p, "route.ts"), "utf8");
    expect(route("insights")).toMatch(/deptBriefing\(ctx\.dept\.code, parseScope\(p\)\)/);
    expect(route("overview")).toMatch(/officerWork\(ctx\.dept, scope\)/);
    for (const r of ["insights", "overview"]) expect(route(r)).not.toMatch(/get\("dept"\)/);
  });
});
