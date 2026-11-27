/**
 * The officer side of the three-portal loop (the integration review, 27 Nov), on an isolated in-memory store through the AWS dialect (the
 * harness of data.fixall.test.ts):
 * - the progress update is back: "work started" on an approved case (the citizen's tracker shows In Progress);
 * - the owner's decision: any open case may be sent to the Collector for approval; a severe one still must be; a sent case waits;
 * - the Collector's escalations reach the department's feedback, a note reaches the case's timeline, and the lists flag the cases the
 *   Collector sent an instruction about, with when its report is due.
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

const { feedbackCounts, grievanceDetail, grievanceList, recordStep, WorkflowError } = await import("./data");
const { nextStep, stepRefusal } = await import("./stages");
const { progressOf } = await vi.importActual<typeof import("@/lib/complaint-progress")>("@/lib/complaint-progress");

const SWM = { code: "GCC-SWM", name: "Solid Waste Management", org: "GCC", head: "SE", route: "AE → EE", short: "SWM", remarkHint: "" };
const ME = { email: "swm@x", userId: 5 };
const REPORT = { remarks: "Bins cleared and the spot washed", photoDir: "d1", photos: ["1.jpg"] };

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
function incident(id: string, o: Record<string, unknown> = {}) {
  const r = { incident_id: id, title: "Garbage not cleared", lead_dept: "GCC-SWM", category_label: "Garbage", category_code: "SOLID_WASTE", zone_no: 9,
    zone_name: "Teynampet", place_text: "Test Street", severity_level: "Medium", status_std: "Open", citizen_complaints: 1, outlet_count: 0,
    first_reported_at: "2026-10-14 09:00:00", sla_due_at: "2026-10-15 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-10-14 09:00:00", ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
}
const decide = (id: string, d: string, at: string, note: string | null = null) =>
  h.db.prepare(`INSERT INTO collector_decisions (incident_id, decision, note, decided_by, decided_role, decided_at) VALUES (?, ?, ?, 'c@x', 'collector', ?)`).run(id, d, note, at);
const stageOf = async (id: string) => (await grievanceDetail(SWM, id))?.grievance.stage;

describe("the progress update: work started on an approved case", () => {
  beforeEach(() => { h.db = fresh(); });

  it("approve, then work started: In action with 'Work started' in the timeline; only from an approved case", async () => {
    incident("INC-A");
    await expect(recordStep(SWM, "INC-A", "action", ME)).rejects.toMatchObject({ status: 409 });
    await recordStep(SWM, "INC-A", "approve", ME);
    expect(await recordStep(SWM, "INC-A", "action", ME)).toMatchObject({ stage: "action", reportId: null });
    const d = await grievanceDetail(SWM, "INC-A");
    expect(d?.grievance.stage).toBe("action");
    expect(d?.timeline.map((t) => t.label)).toEqual(expect.arrayContaining(["Approved by department", "Work started"]));
    expect(h.db.prepare("SELECT action FROM audit_log ORDER BY log_id").all()).toEqual([{ action: "officer:approve" }, { action: "officer:action" }]);
    // once started, a second "started" is a stage conflict, and the case is closed (or sent) from here as before
    await expect(recordStep(SWM, "INC-A", "action", ME)).rejects.toBeInstanceOf(WorkflowError);
    expect(d?.next).toBe("close");
  });

  it("the citizen's tracker reads the step as In Progress", () => {
    const p = progressOf("INC-A", "2026-10-14 09:00:00", [{ step: "approve", at: "2026-10-14 10:00:00", note: null, reportId: null, id: 1 },
      { step: "action", at: "2026-10-14 11:00:00", note: null, reportId: null, id: 2 }], [], []);
    expect(p?.status).toBe("In Progress");
    expect(p?.journey.at(-1)).toMatchObject({ status: "In Progress", stage: "Department Officer", remarks: "Work has started." });
  });
});

describe("the owner's decision: any open case may go to the Collector for approval", () => {
  beforeEach(() => { h.db = fresh(); });

  it("a Medium case is sent with its report; it then waits for the Collector, and the department cannot close it meanwhile", async () => {
    incident("INC-M");
    await recordStep(SWM, "INC-M", "approve", ME);
    expect(await recordStep(SWM, "INC-M", "send", ME, REPORT)).toMatchObject({ stage: "sent" });
    expect(await stageOf("INC-M")).toBe("sent");
    await expect(recordStep(SWM, "INC-M", "close", ME, REPORT)).rejects.toMatchObject({ status: 409 });
    expect(nextStep("sent", "Medium")).toBeNull();
    // the Collector's verify closes it; a send-back returns it to In action, where the department may close it or send it again
    decide("INC-M", "reopen", "2099-01-01 00:00:00", "Photos unclear");
    expect(await stageOf("INC-M")).toBe("action");
    expect(stepRefusal("close", "action", "Medium")).toBeNull();
    expect(stepRefusal("send", "action", "Medium")).toBeNull();
  });

  it("a severe case still must go to the Collector: its close is refused", async () => {
    incident("INC-S", { severity_level: "Severe" });
    await recordStep(SWM, "INC-S", "approve", ME);
    await expect(recordStep(SWM, "INC-S", "close", ME, REPORT)).rejects.toThrow(/verified by the Collector/);
    expect(await recordStep(SWM, "INC-S", "send", ME, REPORT)).toMatchObject({ stage: "sent" });
  });
});

describe("what the Collector did reaches the department", () => {
  beforeEach(() => { h.db = fresh(); });

  it("an escalation is counted in the department's feedback (a note is not a decision on the work)", async () => {
    // the feedback window runs back from the wall clock (decisions carry real times)
    const ago = (min: number) => new Date(Date.now() + 330 * 60_000 - min * 60_000).toISOString().slice(0, 19).replace("T", " ");
    incident("INC-E");
    decide("INC-E", "escalate", ago(30), "Escalated to EE");
    decide("INC-E", "note", ago(20), "Call the ward engineer");
    expect(await feedbackCounts("GCC-SWM", { period: "weekly", zone: null, taluk: null })).toEqual({ verified: 0, resolved: 0, returned: 0, rejected: 0, escalated: 1 });
  });

  it("an escalation and a note are in the case's timeline, the note as the Collector's note", async () => {
    incident("INC-N");
    decide("INC-N", "escalate", "2026-10-14 10:30:00", "Escalated to EE");
    decide("INC-N", "note", "2026-10-14 10:40:00", "Call the ward engineer");
    const t = (await grievanceDetail(SWM, "INC-N"))!.timeline;
    expect(t.find((x) => x.label === "Escalated by Collector")).toMatchObject({ note: "Escalated to EE", kind: "esc" });
    expect(t.find((x) => x.label === "Note from the Collector")).toMatchObject({ note: "Call the ward engineer", kind: "" });
    // neither changes the stage
    expect((await grievanceDetail(SWM, "INC-N"))!.grievance.stage).toBe("new");
  });

  it("the lists flag a case the Collector sent an instruction about; one addressed to another department does not count", async () => {
    incident("INC-I");
    incident("INC-J");
    incident("INC-K");
    h.db.exec(`INSERT INTO outbound_emails (email_id, incident_id, subject, body) VALUES (1, 'INC-I', 'Clear the bins', 'Please clear them today')`);
    h.db.exec(`INSERT INTO followups (email_id, contact_id, incident_id, summary, due_date, status) VALUES (1, 0, 'INC-I', 'Completion report with photos from SWM', '2026-10-13 09:00:00', 'pending'),
      (2, 0, 'INC-K', 'Completion report with photos (map send to GCC-SWD)', '2026-10-15', 'pending')`);
    const l = await grievanceList(SWM, { tab: "new", period: "daily", zone: null, taluk: null, page: 0, per: 20, cat: null, q: null });
    expect(Object.fromEntries(l.rows.map((r) => [r.id, r.instructed]))).toEqual({ "INC-I": true, "INC-J": false, "INC-K": false });
    // the drawer shows when the report is due, and that it is late
    const d = await grievanceDetail(SWM, "INC-I");
    expect(d?.instructions[0]).toMatchObject({ subject: "Clear the bins", reportDue: "2026-10-13 09:00:00", owed: true });
    h.db.exec(`UPDATE followups SET status = 'done' WHERE incident_id = 'INC-I'`);
    expect((await grievanceDetail(SWM, "INC-I"))?.instructions[0]).toMatchObject({ owed: false, closedByCollector: false });
    // the follow-ups job's 'closed': the Collector closed the case and no report came, so the drawer must not say "Report sent"
    h.db.exec(`UPDATE followups SET status = 'closed' WHERE incident_id = 'INC-I'`);
    expect((await grievanceDetail(SWM, "INC-I"))?.instructions[0]).toMatchObject({ owed: false, closedByCollector: true });
  });
});
