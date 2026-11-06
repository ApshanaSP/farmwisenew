// QA pass 4: data invariants, the app's side. invariants.mjs says what is in the stored data; this file says what the app does with it, by running the real code
// (store.ts, its build steps, intel.ts, the tools, the officer insights, the profile route) on the same pinned snapshot. An open finding is it.fails with its id first.
//
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/invariants-app.test.ts
//
// No model is called: the process has no key. The only write is the profile route's, to this process's own throwaway durable file (see vitest.qa4.config.ts). The sign-in is
// faked at the boundary (getSessionFromCookies), because this test is about the zone rule and not sign-in. Text from a record is never printed: the tests compare counts.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: 0 }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSessionFromCookies: vi.fn(async () => ({ userId: session.userId, email: "qa@example.invalid", role: "citizen" }))
}));

import { NextRequest } from "next/server";
import "@/lib/collector/derive";
import { awsPool } from "@/lib/aws/store";
import { asOf, incident, list, search } from "@/lib/collector/intel";
import { resolutionTimes } from "@/lib/assistant/incidents";
import { runTool } from "@/lib/assistant/tools";
import { deptInsights } from "@/lib/officer/insights";
import { redactText } from "@/lib/thunai/privacy";
import { PUT as profilePut } from "@/app/api/profile/route";
import { buildChecks, EVIDENCE_AFTER_BUILD, EVIDENCE_JSON, openPinned, replaceTable, runCheck } from "./invariants.mjs";

const FROZEN = "2026-11-06T06:30:00.000Z"; // 12:00 IST; the store's as-of (18:08) is later, so the console's now is 18:08
const PHONE = /(?<![\w.\/-])(?:(?:\+?91|0)[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\w-])/, EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

let pool: any, now: string;
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await pool.query(sql, p))[0];
const LIST = { period: "quarterly", zone: null, dept: null, sev: null, q: null, sort: "t", dir: -1, page: 0, scope: "all" } as const;

describe("data invariants: what the app does with the data", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
    pool = awsPool();
    now = await asOf();
  });
  afterAll(() => { vi.useRealTimers(); });

  describe("INV-1: incidents the app's build drops", () => {
    const dangling = () => q(`SELECT d.doc_id AS id, d.linked_incident_id AS inc, d.title_en AS en FROM documents d
      WHERE d.linked_incident_id IS NOT NULL AND d.title_en IS NOT NULL AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.incident_id = d.linked_incident_id) ORDER BY d.published_at DESC`);

    it.fails("INV-1 no article is left linked to an incident the build took out", async () => {
      expect((await dangling()).length).toBe(0);
    });

    it.fails("INV-1 a news result in the search box opens an incident that exists", async () => {
      const [d] = await dangling();
      const words = String(d.en).split(/\s+/).filter((w) => w.length > 4).slice(0, 4).join(" ");
      const hit = (await search(words)).news.find((n: any) => n.id === d.id);
      expect(hit, "the article is found by its own words").toBeTruthy();
      expect(await incident(String(hit!.incident))).not.toBeNull(); // CollectorApp.tsx:786 opens n.incident when it has one
    });

    it("the other path out of the build (dropIncidents) leaves no link behind, so the rule is known", async () => {
      // reportKinds and newsSanity use dropIncidents and null the link. Every dangling link comes from newsMedia (derive.ts:311), whose incidents are from sites that are not news media.
      const [r] = await q(`SELECT COUNT(*) AS n FROM events e WHERE e.incident_id IS NOT NULL AND e.source <> 'news' AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.incident_id = e.incident_id)`);
      expect(Number(r.n)).toBe(0);
    });
  });

  describe("INV-2: personal data in a news headline", () => {
    const leakyTitles = async (text: string) => (await search(text)).news.filter((n: any) => PHONE.test(String(n.title)) || EMAIL.test(String(n.title)));

    it.fails("INV-2 the search box shows no phone number or email in a news headline", async () => {
      const found = [...(await leakyTitles("kamakoti Nagar")), ...(await leakyTitles("Nanganallur")), ...(await leakyTitles("gmail"))];
      expect(found.length).toBe(0);
    });

    it("the same headline is hidden on Jarvis's path: the rule exists, the search box does not use it", async () => {
      const rows = await q(`SELECT title FROM documents WHERE title LIKE '%@gmail.com%' OR title LIKE '%Contact No%'`);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(redactText(String(r.title)) === String(r.title)).toBe(false);
    });
  });

  describe("INV-3: closed within the deadline", () => {
    const closedByDue = async (extra = "", p: unknown[] = []) => q(`SELECT COUNT(*) AS n, SUM(i.closed_at <= i.sla_due_at) AS within FROM incidents i
      WHERE i.status_std = 'Resolved' AND i.is_open = 0 AND i.closed_at > ? - INTERVAL 90 DAY AND i.closed_at <= ?${extra}`, [now, now, ...p]);

    it.fails("INV-3 Ask District IQ's 'within the deadline' counts incidents closed by their due time", async () => {
      const rows = await resolutionTimes({ period: "quarterly" } as never, now);
      const [truth] = await closedByDue();
      expect(rows.reduce((a, r) => a + r.n, 0)).toBe(Number(truth.n)); // the same incidents
      expect(rows.reduce((a, r) => a + r.onTime, 0)).toBe(Number(truth.within)); // app 6,585; closed by the due time 2,923
    });

    it.fails("INV-3 the resolution_times answer states the true share", async () => {
      const r: any = await runTool("resolution_times" as never, { scope: { period: "quarterly" } });
      const [truth] = await closedByDue();
      expect(r.facts.find((f: any) => f.id === "resolution.on_time_pct").value).toBe(Math.round((Number(truth.within) / Number(truth.n)) * 100));
    });

    // Police has "response" deadlines: 77% on the tile, 8% closed by the due time. Departments with "resolution" deadlines are right, because their flag does follow closing.
    it.fails("INV-3 the officer's 'Closed on time' tile counts incidents closed by their due time", async () => {
      const mods = await deptInsights("POL-GCP", { period: "quarterly", zone: null, taluk: null });
      const tile = mods.flatMap((m) => m.kpis ?? []).find((k) => k.label === "Closed on time");
      expect(tile).toBeTruthy();
      const w = `i.lead_dept = 'POL-GCP' AND i.first_reported_at > ? - INTERVAL 90 DAY AND i.first_reported_at <= ?`;
      const [t] = await q(`SELECT SUM(i.is_open = 0) AS closed, SUM(i.is_open = 0 AND i.closed_at <= i.sla_due_at) AS within FROM incidents i WHERE ${w}`, [now, now]);
      expect(Math.abs(Number(String(tile!.value).replace("%", "")) - (Number(t.within) / Number(t.closed)) * 100)).toBeLessThanOrEqual(1);
    });
  });

  describe("INV-3, the control: where the deadline is about closing, the tile is right", () => {
    it("Solid Waste Management's tile agrees with closing by the due time", async () => {
      const mods = await deptInsights("GCC-SWM", { period: "quarterly", zone: null, taluk: null });
      const tile = mods.flatMap((m) => m.kpis ?? []).find((k) => k.label === "Closed on time");
      const [t] = await q(`SELECT SUM(i.is_open = 0) AS closed, SUM(i.is_open = 0 AND i.closed_at <= i.sla_due_at) AS within FROM incidents i
        WHERE i.lead_dept = 'GCC-SWM' AND i.first_reported_at > ? - INTERVAL 90 DAY AND i.first_reported_at <= ?`, [now, now]);
      expect(Math.abs(Number(String(tile!.value).replace("%", "")) - (Number(t.within) / Number(t.closed)) * 100)).toBeLessThanOrEqual(1);
    });
  });

  describe("INV-4 (OPEN-7): past deadline", () => {
    const missedButNotFlagged = () => q(`SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND sla_breached = 0 AND sla_due_at < ? ORDER BY priority_score DESC`, [now]);

    it("the case page's rule says missed for these incidents", async () => {
      const [m] = await missedButNotFlagged();
      const d: any = await incident(m.id);
      const i = d.incident;
      // Detail.tsx:130 `overdue = open && i.sla_due && ms(i.sla_due) < ms(c.now)`, shown as "· missed"
      expect(Number(i.open)).toBe(1);
      expect(String(i.sla_due) < now).toBe(true);
    });

    it.fails("INV-4 an incident the case page calls missed is on the Past deadline list", async () => {
      const [m] = await missedButNotFlagged();
      const r = await list({ ...LIST, status: "overdue", q: m.id } as never);
      expect(r.incidents).toBe(1);
    });

    it.fails("INV-4 the Past deadline list holds every open incident whose due time has gone", async () => {
      const r = await list({ ...LIST, status: "overdue" } as never);
      const [t] = await q(`SELECT COUNT(*) AS n FROM incidents i WHERE i.is_open = 1 AND i.sla_due_at < ? AND i.first_reported_at <= ?
        AND NOT EXISTS (SELECT 1 FROM dept_assignments da WHERE da.incident_id = i.incident_id)`, [now, now]);
      expect(r.incidents).toBe(Number(t.n));
    });
  });

  describe("INV-5 (OPEN-11): a forecast stored as an incident", () => {
    const future = () => q(`SELECT incident_id AS id FROM incidents WHERE hours_open < 0 ORDER BY incident_id`);

    it("no list shows it: the lists stop at the store's time", async () => {
      const r = await list({ ...LIST, status: "open", q: (await future())[0].id } as never);
      expect(r.incidents).toBe(0);
    });

    it.fails("INV-5 the incident's answer never says it has been open for less than no time", async () => {
      const r: any = await runTool("incident_detail" as never, { id: (await future())[0].id });
      expect(r.data.incident.hours_open).toBeGreaterThanOrEqual(0);
      expect(String(r.data.incident.open_for)).not.toMatch(/^-/);
    });
  });

  describe("INV-6: a ward in another zone", () => {
    const put = async (zoneId: number, wardNumber: number) =>
      (await profilePut(new NextRequest("http://127.0.0.1/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstName: "QA", zoneId, wardNumber }) }))).status;
    beforeAll(async () => {
      const [u] = await q(`SELECT MIN(id) AS id FROM users`);
      session.userId = Number(u.id);
    });

    it("the route takes a ward of the zone and refuses one outside its range", async () => {
      expect(await put(13, 175)).toBe(200);
      expect(await put(14, 168)).toBe(200);
      expect(await put(14, 5)).toBe(400);
    });

    it.fails("INV-6 the route refuses Adyar's ward 175 for zone 14, whose range wraps around Adyar", async () => {
      const [w] = await q(`SELECT zone_id FROM zone_wards WHERE ward_number = 175`);
      expect(Number(w.zone_id)).toBe(13);
      expect(await put(14, 175)).toBe(400);
    });
  });

  describe("the same checks after the app's build steps", () => {
    /** What each difference from the stored data means. Anything not listed here is a new difference, and the test fails. */
    const MEANING: Record<string, string> = {
      incident_lapsed_without_closed_at: "by design: dropped news-only incidents take some Lapsed ones with them. This is the number on screen.",
      incident_zone_without_ward: "by design: the build places some news at zone level.",
      incident_pin_outside_own_ward: "by design: the same placing step moves some pins.",
      duplicate_news_url_in_one_incident: "by design: fewer incidents, so fewer repeats.",
      outlet_count_is_not_publishers: "by design: merged incidents recount outlets as publishers.",
      incident_id_date_differs_from_first_report: "by design: fewer incidents.",
      incident_dead_vs_reports: "by design: the build lowers or holds some death counts on news-only incidents.",
      member_rows_vs_events: "INV-1: events still point at incidents the build took out.",
      orphan_event_without_incident: "INV-1: events still point at incidents the build took out (newsMedia, derive.ts:311).",
      orphan_action_without_incident: "INV-1: actions left behind. No screen lists them without their incident.",
      orphan_timeline_without_incident: "INV-1: timeline rows left behind. No screen lists them without their incident.",
      orphan_document_without_incident: "INV-1: an article linked to an incident that is gone. The search box opens it.",
      orphan_gap_without_incident: "INV-1: gap rows left behind. The app joins gaps from incidents, so none shows.",
      null_parent_rows: "by design: dropIncidents unlinks the reports of incidents it takes out.",
      review_gap_incident_missing: "INV-1: the review queue still counts gaps for dropped incidents (insights.ts:173 counts by type only).",
      gap_differs_from_incident: "by design: the merged incident's facts changed; the app joins from incidents.",
      kpis_incidents: "not shown: the app never reads the kpis table (catalog.ts:360 keeps it from Ask District IQ too).",
      kpis_severe: "not shown: see kpis_incidents.", kpis_high: "not shown: see kpis_incidents.", kpis_open: "not shown: see kpis_incidents.",
      kpis_past_deadline_open: "not shown: see kpis_incidents.", kpis_news_only: "not shown: see kpis_incidents.", kpis_resolved_vs_closed_in_window: "not shown: see kpis_incidents.",
      kpis_resolved_counts_rejected: "not shown: see kpis_incidents.", kpis_median_first_action: "not shown: see kpis_incidents.",
      metrics_vs_raw_counts: "not shown as a figure: the pipeline's own run record.",
      ward_incidents_30d: "not shown: the planner is told not to count from ref_wards (prompts/planner.ts:22).",
      ward_open_incidents: "not shown: see ward_incidents_30d.", ward_open_past_deadline: "not shown: see ward_incidents_30d.",
      briefing_incidents_vs_incidents: "not shown: the app reads only the briefing's summary sentences, which state no totals (insights.ts:212)."
    };

    it("every difference is known, and the evidence is written", async () => {
      const s: any = openPinned();
      const rows: Record<string, [number, number]> = {};
      for (const t of ["incidents", "events", "incident_members", "documents", "actions", "incident_timeline", "gaps", "alerts"]) {
        const before = s.db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
        const after = await q(`SELECT * FROM ${t}`);
        replaceTable(s.db, t, after);
        rows[t] = [before, after.length];
        await new Promise((r) => setImmediate(r));
      }
      const stored = new Map<string, number>(JSON.parse(fs.readFileSync(EVIDENCE_JSON, "utf8")).checks.map((c: any) => [c.name, c.count]));
      // one at a time with a pause between, or the worker cannot answer vitest during this long run
      const results: any[] = [];
      for (const c of buildChecks(s)) {
        results.push(runCheck(s.db, c));
        await new Promise((r) => setImmediate(r));
      }
      s.db.close();
      const changed = results.filter((r: any) => stored.get(r.name) !== r.count).map((r: any) => ({ name: r.name, stored: stored.get(r.name), after_build: r.count, meaning: MEANING[r.name] ?? "NEW: not explained" }));
      fs.mkdirSync(path.dirname(EVIDENCE_AFTER_BUILD), { recursive: true });
      fs.writeFileSync(EVIDENCE_AFTER_BUILD, JSON.stringify({ note: "The same SQL checks, with the main tables replaced by what the real store holds after the app's build steps. Ids and text are not copied here.", rows_before_and_after: rows, changed }, null, 1));
      expect(changed.filter((c: any) => !MEANING[c.name]).map((c: any) => c.name)).toEqual([]);
      expect(results.find((r: any) => r.name === "incident_lapsed_without_closed_at").count).toBe(611);
    }, 280_000);
  });
});
