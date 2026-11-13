/**
 * The officer console's data (lib/officer/data.ts) on an isolated in-memory store, through the same MySQL -> SQLite translation the AWS
 * store uses (the harness of deptlock.sqlite.test.ts). Fix-all round 2, the officer console batch.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  return /^\s*(SELECT|WITH)/i.test(s)
    ? [st.all(...(p as never[]))]
    : (() => { const r = st.run(...(p as never[])); return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }]; })();
};
const pool = {
  query: async (sql: string, params: unknown[] = []) => run(sql, params),
  getConnection: async () => ({
    query: async (sql: string, params: unknown[] = []) => run(sql, params),
    beginTransaction: async () => void h.db.exec("BEGIN"),
    commit: async () => void h.db.exec("COMMIT"),
    rollback: async () => void h.db.exec("ROLLBACK"),
    release: () => undefined
  })
};
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async () => 0, awaitingQueue: async () => 0 }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-10-14 12:00:00" }));

const { feedbackCounts, grievanceDetail, grievanceList, resolvedTile, search } = await import("./data");

const SWM = { code: "GCC-SWM", name: "Solid Waste Management", org: "GCC", head: "SE", route: "AE → EE", short: "SWM", remarkHint: "" };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, channels TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_no INTEGER,
      zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT,
      actor_user_id INTEGER, at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, remarks TEXT, photo_dir TEXT, photos TEXT,
      sent_by TEXT, sent_user_id INTEGER, sent_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY, at TEXT DEFAULT CURRENT_TIMESTAMP, actor TEXT, action TEXT, table_name TEXT, record_id TEXT,
      before_value TEXT, after_value TEXT);
    CREATE TABLE incident_timeline (incident_id TEXT, at TEXT, step TEXT, note TEXT, actor TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, channel TEXT, reported_at TEXT, title TEXT, role TEXT);
    CREATE TABLE events (event_id TEXT, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT);
    CREATE TABLE documents (doc_id TEXT, publisher TEXT, title TEXT, url TEXT, published_at TEXT, linked_incident_id TEXT, story_id TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, subject TEXT, body TEXT, owner TEXT, body_hash TEXT, approved_at TEXT,
      to_contact_ids TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE followups (followup_id INTEGER PRIMARY KEY, email_id INTEGER, contact_id INTEGER, incident_id TEXT, summary TEXT, due_date TEXT, status TEXT);`);
  return db;
}

/** One incident of the department (defaults: a Medium garbage case reported at 09:00 today, open, due tomorrow 09:00). */
function incident(id: string, o: Record<string, unknown> = {}) {
  const r = { incident_id: id, title: "Garbage not cleared", lead_dept: "GCC-SWM", category_label: "Garbage", category_code: "SOLID_WASTE", zone_no: 9,
    zone_name: "Teynampet", place_text: "Test Street", severity_level: "Medium", status_std: "Open", citizen_complaints: 1, outlet_count: 0,
    first_reported_at: "2026-10-14 09:00:00", sla_due_at: "2026-10-15 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-10-14 09:00:00", ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
}
const decide = (id: string, d: string, at: string, note: string | null = null, role = "collector") =>
  h.db.prepare(`INSERT INTO collector_decisions (incident_id, decision, note, decided_by, decided_role, decided_at) VALUES (?, ?, ?, 'c@x', ?, ?)`).run(id, d, note, role, at);
/** The department's own close, as recordStep writes it: the step, then a resolve decision by its officer, in one transaction. */
const closeByDept = (id: string, at: string) => { step(id, "close", at, "Cleared"); decide(id, "resolve", at, "Closed by the department: Cleared", "department_officer"); };
const step = (id: string, s: string, at: string, note: string | null = null) =>
  h.db.prepare(`INSERT INTO officer_steps (incident_id, dept_code, step, note, actor, at) VALUES (?, 'GCC-SWM', ?, ?, 'swm@x', ?)`).run(id, s, note, at);

describe("officer console data", () => {
  beforeEach(() => { h.db = fresh(); });

  describe("officer-day-26: the API's next step follows the case's severity", () => {
    it("a Medium case in action: the next step is the department's own close, not a send to the Collector", async () => {
      incident("INC-MED");
      step("INC-MED", "approve", "2026-10-14 10:00:00");
      const d = await grievanceDetail(SWM, "INC-MED");
      expect(d?.grievance.stage).toBe("approved");
      expect(d?.next).toBe("close");
    });
    it("a Severe case in action is sent; a new one is approved; a verified one has none", async () => {
      incident("INC-SEV", { severity_level: "Severe" });
      incident("INC-NEW");
      incident("INC-DONE", { status_std: "Resolved", is_open: 0 });
      step("INC-SEV", "approve", "2026-10-14 10:00:00");
      expect((await grievanceDetail(SWM, "INC-SEV"))?.next).toBe("send");
      expect((await grievanceDetail(SWM, "INC-NEW"))?.next).toBe("approve");
      expect((await grievanceDetail(SWM, "INC-DONE"))?.next).toBeNull();
    });
  });

  describe("officer-day-22: the search finds text with '_' and '%' in it on the AWS store", () => {
    it("'bin_50' and '50% full' find the case that says so, and '_' and '%' are not wildcards", async () => {
      incident("INC-A", { title: "Garbage bin_50% full near the school" });
      incident("INC-B", { title: "Garbage bin 50 is full" });
      const ids = async (q: string) => (await search(SWM, q)).map((r) => r.id).sort();
      expect(await ids("bin_50")).toEqual(["INC-A"]);
      expect(await ids("50% full")).toEqual(["INC-A"]);
      expect(await ids("bin_50% full")).toEqual(["INC-A"]);
      expect(await ids("full")).toEqual(["INC-A", "INC-B"]);
      const l = await grievanceList(SWM, { tab: "all", period: "daily", zone: null, taluk: null, page: 0, per: 50, cat: null, q: "bin_50" });
      expect(l.rows.map((r) => r.id)).toEqual(["INC-A"]);
    });
  });

  describe("pass4-open-07: the officer finds a case by a complaint number filed into it", () => {
    it("a complaint number (whole or in part) finds the case it joined, whose id does not contain it", async () => {
      incident("INC-20261014-AB12CD", { title: "Garbage heap on Test Street" });
      incident("INC-OTHER", { title: "Another heap" });
      h.db.prepare(`INSERT INTO events (event_id, source, source_record_id, incident_id, text) VALUES (?, 'grievance', ?, ?, ?)`)
        .run("GRV-2026-777AAA", "2026-777AAA", "INC-20261014-AB12CD", "Garbage not cleared for a week");
      const ids = async (q: string) => (await search(SWM, q)).map((r) => r.id);
      expect(await ids("2026-777AAA")).toEqual(["INC-20261014-AB12CD"]);
      expect(await ids("777aaa")).toEqual(["INC-20261014-AB12CD"]);
      expect(await ids("2026-888BBB")).toEqual([]);
    });
  });

  describe("officer-day-17: the officer reads the citizen's whole complaint", () => {
    it("a 400-character complaint (the form's limit) reaches the drawer's source whole, not its first 280 characters", async () => {
      incident("INC-LONG");
      const text = `Garbage has not been cleared on Test Street for nine days. ${"The bins overflow onto the road and dogs scatter it. ".repeat(7)}`.slice(0, 397) + " END";
      expect(text.length).toBe(401);
      h.db.prepare(`INSERT INTO events (event_id, source, source_record_id, incident_id, text) VALUES ('GRV-1', 'grievance', '2026-111AAA', 'INC-LONG', ?)`).run(text);
      h.db.prepare(`INSERT INTO incident_members (incident_id, event_id, source, channel, reported_at, title, role)
        VALUES ('INC-LONG', 'GRV-1', 'grievance', 'citizen_app', '2026-10-14 09:00:00', 'Garbage not cleared', 'first_report')`).run();
      const d = await grievanceDetail(SWM, "INC-LONG");
      expect(d?.sources[0].note).toBe(text);
    });
  });

  describe("officer-day-15, officer-day-24: a step and a decision in the same second are read in one order by every console", () => {
    /** The three readers of one case: the officer's stage, the citizen's tracker (complaint-progress.ts, the real reader), the Collector's status. */
    async function views(id: string) {
      h.db.prepare(`INSERT INTO events (event_id, source, source_record_id, incident_id, text) VALUES (?, 'grievance', ?, ?, 'x')`).run(`GRV-${id}`, `C-${id}`, id);
      const { progressFor } = await vi.importActual<typeof import("@/lib/complaint-progress")>("@/lib/complaint-progress");
      const { effectiveStatus } = await import("@/lib/collector/effective");
      const g = (await grievanceDetail(SWM, id))!.grievance;
      const citizen = (await progressFor([{ code: `C-${id}`, createdAt: "2026-10-14 08:00:00" }])).get(`C-${id}`)!.status;
      // the Collector reads the latest decision with an effect by decision_id (effective.ts effectiveSql)
      const last = h.db.prepare(`SELECT decision FROM collector_decisions WHERE incident_id = ? AND decision IN ('verify', 'resolve', 'reject', 'reopen')
        ORDER BY decision_id DESC LIMIT 1`).get(id) as { decision: string };
      return { stage: g.stage, returned: g.returned, citizen, collector: effectiveStatus(1, "Open", last.decision).status };
    }
    const T = "2026-10-14 11:00:00";

    it("officer-day-15: a send-back in the same second as the send is In action AND Returned, as the citizen and the Collector read it", async () => {
      incident("INC-S", { severity_level: "Severe" });
      step("INC-S", "approve", "2026-10-14 10:00:00");
      step("INC-S", "send", T, "Cleared");
      decide("INC-S", "reopen", T, "Photos do not show the street");
      expect(await views("INC-S")).toEqual({ stage: "action", returned: true, citizen: "In Progress", collector: "Open" });
    });

    it("officer-day-24: a send-back, then the department's close, in the same second: closed, for all three", async () => {
      incident("INC-C");
      step("INC-C", "approve", "2026-10-14 10:00:00");
      decide("INC-C", "reopen", T, "Not done");
      closeByDept("INC-C", T);
      expect(await views("INC-C")).toEqual({ stage: "verified", returned: false, citizen: "Resolved by Department", collector: "Resolved" });
    });

    it("officer-day-24: the department's close, then a send-back, in the same second: returned, for all three", async () => {
      incident("INC-R");
      step("INC-R", "approve", "2026-10-14 10:00:00");
      closeByDept("INC-R", T);
      decide("INC-R", "reopen", T, "Not done");
      expect(await views("INC-R")).toEqual({ stage: "action", returned: true, citizen: "In Progress", collector: "Open" });
    });
  });

  describe("hunt2-ops-08, officer-day-05: the Collector's decisions, by what they did", () => {
    // the feedback window runs back from the wall clock (decisions carry real times)
    const ago = (min: number) => new Date(Date.now() + 330 * 60_000 - min * 60_000).toISOString().slice(0, 19).replace("T", " ");
    it("every decision of the period is counted (not the newest 8), a reject is not rework, a resolve is not a verified report", async () => {
      for (let k = 1; k <= 12; k++) incident(`INC-${k}`);
      for (let k = 1; k <= 9; k++) decide(`INC-${k}`, "resolve", ago(60 - k));
      decide("INC-10", "verify", ago(40));
      decide("INC-11", "reopen", ago(30), "Not done");
      decide("INC-12", "reject", ago(20), "Duplicate");
      closeByDept("INC-1", ago(10)); // the department's own close is not the Collector's decision
      decide("INC-2", "resolve", ago(60 * 30)); // before the period
      expect(await feedbackCounts("GCC-SWM", { period: "daily", zone: null, taluk: null })).toEqual({ verified: 1, resolved: 9, returned: 1, rejected: 1 });
    });
    it("a rejected case's detail says it was rejected, when and why", async () => {
      incident("INC-REJ");
      decide("INC-REJ", "reject", "2026-10-14 11:00:00", "Duplicate of an earlier complaint");
      const d = await grievanceDetail(SWM, "INC-REJ");
      expect(d?.grievance.stage).toBe("closed");
      expect(d?.rejected).toEqual({ t: "2026-10-14 11:00:00", note: "Duplicate of an earlier complaint" });
      incident("INC-OK");
      expect((await grievanceDetail(SWM, "INC-OK"))?.rejected).toBeNull();
    });
  });

  describe("officer-day-13: the board's Resolved tile counts what the list it opens holds", () => {
    it("the tile, its previous period and its series are the Verified list's rows: Collector-verified and department-closed, by report date", async () => {
      const scope = { period: "weekly" as const, zone: null, taluk: null };
      incident("INC-V", { severity_level: "Severe" }); // verified by the Collector
      step("INC-V", "send", "2026-10-14 10:00:00", "Done");
      decide("INC-V", "verify", "2026-10-14 11:00:00");
      incident("INC-D"); // closed by the department itself
      closeByDept("INC-D", "2026-10-14 10:30:00");
      incident("INC-P", { status_std: "Resolved", is_open: 0, first_reported_at: "2026-10-10 09:00:00" }); // resolved in the pipeline, earlier this week
      incident("INC-OLD", { first_reported_at: "2026-09-01 09:00:00" }); // reported before the window, closed today: in neither
      closeByDept("INC-OLD", "2026-10-14 10:40:00");
      incident("INC-PREV", { status_std: "Resolved", is_open: 0, first_reported_at: "2026-10-05 09:00:00" }); // the week before
      incident("INC-OPEN"); // still open
      incident("INC-REJ"); // rejected: closed, not resolved
      decide("INC-REJ", "reject", "2026-10-14 11:00:00", "Duplicate");
      const tile = await resolvedTile(SWM, scope);
      const list = await grievanceList(SWM, { ...scope, tab: "verified", page: 0, per: 100, cat: null, q: null });
      expect(list.rows.map((r) => r.id).sort()).toEqual(["INC-D", "INC-P", "INC-V"]);
      expect(tile.cur).toBe(list.total);
      expect(tile.prev).toBe(1);
      expect(tile.series.reduce((a, x) => a + x, 0)).toBe(tile.cur);
    });
  });

  describe("officer-day-10: every list row and the detail carry the grievance's deadline and the pipeline's breach", () => {
    it("due_at and breached on the list row and the detail", async () => {
      incident("INC-DUE", { sla_due_at: "2026-10-15 09:00:00", sla_breached: 1 });
      const l = await grievanceList(SWM, { tab: "new", period: "daily", zone: null, taluk: null, page: 0, per: 10, cat: null, q: null });
      expect(l.rows[0]).toMatchObject({ id: "INC-DUE", due_at: "2026-10-15 09:00:00", breached: 1 });
      expect((await grievanceDetail(SWM, "INC-DUE"))?.grievance).toMatchObject({ due_at: "2026-10-15 09:00:00", breached: 1 });
    });
  });

  describe("officer-day-29: only a severe case waits in 'Sent to Collector'", () => {
    it("a non-severe case the pipeline marks Awaiting verification is the department's to close (In action), a severe one the Collector's", async () => {
      incident("INC-MED-AV", { status_std: "Awaiting verification" });
      incident("INC-SEV-AV", { status_std: "Awaiting verification", severity_level: "Severe" });
      const tab = async (t: "action" | "sent") =>
        (await grievanceList(SWM, { tab: t, period: "daily", zone: null, taluk: null, page: 0, per: 10, cat: null, q: null })).rows.map((r) => r.id);
      expect(await tab("sent")).toEqual(["INC-SEV-AV"]);
      expect(await tab("action")).toEqual(["INC-MED-AV"]);
      const d = await grievanceDetail(SWM, "INC-MED-AV");
      expect([d?.grievance.stage, d?.next]).toEqual(["action", "close"]);
    });
  });

  describe("reviewer4-03: an instruction to one department never shows in another department's drawer", () => {
    const ELE = { ...SWM, code: "GCC-ELE", name: "Electrical", short: "ELE" };
    const mail = (id: number, inc: string, subject: string) =>
      h.db.prepare(`INSERT INTO outbound_emails (email_id, incident_id, subject, body, owner, created_at) VALUES (?, ?, ?, 'Dear officer, ...', 'c@x', '2026-10-14 10:00:00')`).run(id, inc, subject);
    const follow = (email: number, inc: string, summary: string) =>
      h.db.prepare(`INSERT INTO followups (email_id, contact_id, incident_id, summary, due_date, status) VALUES (?, 0, ?, ?, '2026-10-15', 'pending')`).run(email, inc, summary);
    it("a GCC-SWM batch whose listed cases later moved to GCC-ELE (the first and the second) stays out of GCC-ELE's drawer", async () => {
      for (const id of ["INC-1", "INC-2", "INC-3"]) incident(id);
      mail(1, "INC-1", "Action needed: 3 cases from the Collector's map");
      for (const id of ["INC-1", "INC-2", "INC-3"]) follow(1, id, "Completion report with photos (map send to GCC-SWM)");
      h.db.prepare(`UPDATE incidents SET lead_dept = 'GCC-ELE' WHERE incident_id IN ('INC-1', 'INC-2')`).run(); // re-categorised (derive.ts)
      expect((await grievanceDetail(ELE, "INC-1"))?.instructions).toEqual([]);
      expect((await grievanceDetail(ELE, "INC-2"))?.instructions).toEqual([]);
      expect((await grievanceDetail(SWM, "INC-3"))?.instructions.map((e) => e.id)).toEqual([1]);
    });
    it("a rain-rehearsal job for another department is left out; an instruction about the case itself (Take action) still shows", async () => {
      incident("INC-9", { lead_dept: "GCC-ELE" });
      mail(2, "INC-9", "Before the rain: 2 jobs for Solid Waste Management");
      follow(2, "INC-9", '[RR] {"r":"R1","d":"GCC-SWM","k":"j1","la":13,"lo":80,"w":9} Clear the drain');
      mail(3, "INC-9", "Urgent: live wire on Test Street");
      follow(3, "INC-9", "Completion report with photos from Electrical");
      expect((await grievanceDetail(ELE, "INC-9"))?.instructions.map((e) => e.id)).toEqual([3]);
    });
  });
});
