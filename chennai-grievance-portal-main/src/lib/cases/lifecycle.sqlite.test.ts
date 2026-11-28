/**
 * The case lifecycle of 28 Nov on an isolated in-memory store through the AWS dialect (the harness of lib/officer/integration27.sqlite.test.ts):
 *   1. the severe rule on the server: a severe case is never closed by the department; its send needs remarks and a photo; any other case
 *      is closed with remarks (photo optional) or sent with a photo;
 *   2. the Collector's Reopen of a closed case: back to the same department as Reopened, at the top of In action, with the remark, in its
 *      history, and open again on every count; a send-back of work waiting for the Collector stays a "return";
 *   3. Ask the department: the case stays closed, the officer sees the question and answers once, the answer reaches the Collector.
 */
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, synced: [] as string[][] }));
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
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title", CLUSTER: "i.incident_id", OPS_DB: "district_intel_ops" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async (ids: string[]) => { h.synced.push(ids); return 0; }, awaitingQueue: async () => 0 }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-11-28 18:00:00" }));
vi.mock("@/lib/collector/guard", () => ({
  collectorSession: async () => ({ email: "collector@x", role: "collector", userId: 1 }),
  failed: (_e: unknown, w: string) => new Response(JSON.stringify({ error: `Could not load ${w}.` }), { status: 500 })
}));

const { grievanceDetail, grievanceList, recordStep, WorkflowError } = await import("@/lib/officer/data");
const { CaseError, answerInquiry, askDepartment, caseLifecycle, caseNow, reopenCase } = await import("./lifecycle");
const { SEVERE_CLOSE } = await import("./rules");
const route = await import("@/app/api/collector/decisions/[id]/route");
process.env.STEP_UP = "off";

const SWM = { code: "GCC-SWM", name: "Solid Waste Management", org: "GCC", head: "SE", route: "AE → EE", short: "SWM", remarkHint: "" };
const ME = { email: "swm@x", userId: 5 };
const COLLECTOR = { email: "collector@x", role: "collector", userId: 1 };
const OFFICER = { email: "swm@x", role: "department_officer", userId: 5 };
const WITH_PHOTO = { remarks: "Bins cleared and the spot washed", photoDir: "20261128-0123456789abcdef", photos: ["1.jpg"] };
const NO_PHOTO = { remarks: "Bins cleared and the spot washed", photoDir: "20261128-fedcba9876543210", photos: [] as string[] };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, channels TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_no INTEGER,
      zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT, verified INTEGER,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT);
    CREATE TABLE ref_departments (code TEXT, name TEXT, route TEXT, action_owner INTEGER);
    INSERT INTO ref_departments VALUES ('GCC-SWM', 'Solid Waste Management', 'AE → EE', 1), ('GCC-SWD', 'Storm Water Drain', 'AE → EE', 1);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT,
      actor_user_id INTEGER, at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, remarks TEXT, photo_dir TEXT, photos TEXT,
      sent_by TEXT, sent_user_id INTEGER, sent_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT (datetime('now', '+330 minutes')));
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
    zone_name: "Teynampet", place_text: "Test Street", severity_level: "Medium", status_std: "Open", verified: 0, citizen_complaints: 1, outlet_count: 0,
    first_reported_at: "2026-11-28 09:00:00", sla_due_at: "2026-11-29 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-11-28 09:00:00", ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
}
const decide = (id: string, d: string, at: string, note: string | null = null) =>
  h.db.prepare(`INSERT INTO collector_decisions (incident_id, decision, note, decided_by, decided_role, decided_at) VALUES (?, ?, ?, 'collector@x', 'collector', ?)`).run(id, d, note, at);
const detail = async (id: string) => (await grievanceDetail(SWM, id))!;
const closeIt = async (id: string, report = WITH_PHOTO) => { await recordStep(SWM, id, "approve", ME); await recordStep(SWM, id, "close", ME, report); };

beforeEach(() => { h.db = fresh(); h.synced = []; });

describe("1. the severe rule, on the server", () => {
  it("a severe case: the department's close is refused, the send needs a photo, and with one it goes to the Collector", async () => {
    incident("INC-S", { severity_level: "Severe" });
    await recordStep(SWM, "INC-S", "approve", ME);
    await expect(recordStep(SWM, "INC-S", "close", ME, WITH_PHOTO)).rejects.toThrow(SEVERE_CLOSE);
    await expect(recordStep(SWM, "INC-S", "send", ME, NO_PHOTO)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/at least one photo/) });
    await expect(recordStep(SWM, "INC-S", "send", ME, { ...WITH_PHOTO, remarks: " " })).rejects.toBeInstanceOf(WorkflowError);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM officer_reports").get()).toEqual({ n: 0 });
    expect(await recordStep(SWM, "INC-S", "send", ME, WITH_PHOTO)).toMatchObject({ stage: "sent" });
  });

  it("any other case: closed with remarks and no photo, or sent only with a photo", async () => {
    incident("INC-M");
    incident("INC-L", { severity_level: "Low" });
    await recordStep(SWM, "INC-M", "approve", ME);
    expect(await recordStep(SWM, "INC-M", "close", ME, NO_PHOTO)).toMatchObject({ stage: "verified" });
    await recordStep(SWM, "INC-L", "approve", ME);
    await expect(recordStep(SWM, "INC-L", "send", ME, NO_PHOTO)).rejects.toMatchObject({ status: 400 });
    expect(await recordStep(SWM, "INC-L", "send", ME, WITH_PHOTO)).toMatchObject({ stage: "sent" });
  });
});

describe("2. the Collector reopens a closed case", () => {
  it("back to the same department as Reopened, first in In action, with the remark; open again everywhere", async () => {
    incident("INC-C");
    incident("INC-X", { severity_level: "Severe", first_reported_at: "2026-11-28 10:00:00" });
    await recordStep(SWM, "INC-X", "approve", ME);
    await closeIt("INC-C");
    expect((await caseNow("INC-C"))).toMatchObject({ open: 0, status: "Resolved" });
    const r = await reopenCase("INC-C", "Garbage is back at the same spot; clear it and add it to the route", COLLECTOR);
    expect(r).toMatchObject({ dept: "GCC-SWM" });
    // the Collector's figures: open again
    expect(await caseNow("INC-C")).toMatchObject({ open: 1, status: "Open" });
    // the officer: In action, returned and reopened, with the remark, ahead of a severe case in action
    const d = await detail("INC-C");
    expect(d.grievance).toMatchObject({ stage: "action", returned: true, reopened: true, returnNote: expect.stringMatching(/Garbage is back/) });
    expect(d.reopened).toMatchObject({ note: expect.stringMatching(/Garbage is back/) });
    expect(d.timeline.map((t) => t.label)).toContain("Reopened by Collector");
    const l = await grievanceList(SWM, { tab: "action", period: "daily", zone: null, taluk: null, page: 0, per: 10, cat: null, q: null });
    expect(l.rows.map((x) => x.id)).toEqual(["INC-C", "INC-X"]);
    // recorded and audited, and the residents' trackers told
    expect(h.db.prepare("SELECT action, record_id FROM audit_log WHERE action = 'decision:reopen'").all()).toEqual([{ action: "decision:reopen", record_id: "INC-C" }]);
    expect(h.synced.at(-1)).toEqual(["INC-C"]);
    // the department completes it again: closed, no longer reopened
    expect(await recordStep(SWM, "INC-C", "close", ME, NO_PHOTO)).toMatchObject({ stage: "verified" });
    expect((await detail("INC-C")).grievance).toMatchObject({ stage: "verified", reopened: false });
    const life = (await caseLifecycle("INC-C"))!;
    expect(life.events.map((e) => e.kind)).toEqual(["closed", "reopened", "closed"]);
  });

  it("a case the pipeline closed (no decision) reopens as Reopened too", async () => {
    incident("INC-P", { status_std: "Resolved", is_open: 0, closed_at: "2026-11-28 12:00:00" });
    await reopenCase("INC-P", "The residents say the bins overflow again", COLLECTOR);
    expect((await detail("INC-P")).grievance).toMatchObject({ stage: "action", reopened: true });
  });

  it("refused: an open case, and a reopen with no remark", async () => {
    incident("INC-O");
    await expect(reopenCase("INC-O", "Something is still wrong here", COLLECTOR)).rejects.toMatchObject({ status: 409 });
    incident("INC-D");
    await closeIt("INC-D");
    await expect(reopenCase("INC-D", "redo", COLLECTOR)).rejects.toBeInstanceOf(CaseError);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM collector_decisions WHERE decision = 'reopen'").get()).toEqual({ n: 0 });
  });

  it("a send-back of work waiting for the Collector stays a return, not a reopen", async () => {
    incident("INC-W");
    await recordStep(SWM, "INC-W", "approve", ME);
    await recordStep(SWM, "INC-W", "send", ME, WITH_PHOTO);
    decide("INC-W", "reopen", "2099-01-01 00:00:00", "Photos unclear");
    expect((await detail("INC-W")).grievance).toMatchObject({ stage: "action", returned: true, reopened: false });
  });

  it("the route: checked before the password, then recorded", async () => {
    incident("INC-R");
    await closeIt("INC-R");
    const post = (id: string, body: unknown) => route.POST(new NextRequest(`http://localhost/api/collector/decisions/${id}`, { method: "POST", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id }) });
    incident("INC-OPEN");
    expect((await post("INC-OPEN", { action: "reopen", note: "Please check the drain again" })).status).toBe(409);
    expect((await post("INC-R", { action: "reopen", note: "short" })).status).toBe(400);
    expect((await post("INC-R", { action: "reopen", note: "Garbage is back at the same spot" })).status).toBe(201);
    const g = await (await route.GET(new NextRequest("http://localhost/api/collector/decisions/INC-R"), { params: Promise.resolve({ id: "INC-R" }) })).json();
    expect(g).toMatchObject({ open: true, canReopen: false, canAsk: false, reopened: { kind: "reopened", note: "Garbage is back at the same spot" } });
  });
});

describe("3. Ask the department about a closed case", () => {
  it("the case stays closed; the officer sees the question, answers once; the answer reaches the Collector", async () => {
    incident("INC-Q");
    await closeIt("INC-Q");
    const q = await askDepartment("INC-Q", "Was the whole street cleared, or only the corner?", COLLECTOR);
    // a double click is the same question
    expect((await askDepartment("INC-Q", "Was the whole street cleared, or only the corner?", COLLECTOR)).again).toBe(true);
    expect(await caseNow("INC-Q")).toMatchObject({ open: 0, status: "Resolved" });
    const d = await detail("INC-Q");
    expect(d.grievance).toMatchObject({ stage: "verified", asked: true });
    expect(d.inquiries).toEqual([{ id: q.decisionId, t: expect.any(String), question: "Was the whole street cleared, or only the corner?", answer: null }]);
    expect(d.timeline.map((t) => t.label)).toContain("Question from the Collector");
    // the officer's list of questions to answer, whatever the date
    const asked = await grievanceList(SWM, { tab: "verified", asked: true, period: "daily", zone: null, taluk: null, page: 0, per: 10, cat: null, q: null });
    expect(asked.rows.map((x) => x.id)).toEqual(["INC-Q"]);
    // another department cannot answer it
    await expect(answerInquiry("GCC-SWD", "INC-Q", q.decisionId, "Cleared it", OFFICER)).rejects.toMatchObject({ status: 404 });
    await answerInquiry("GCC-SWM", "INC-Q", q.decisionId, "The whole street, 120 metres, and the corner bin point", OFFICER);
    await expect(answerInquiry("GCC-SWM", "INC-Q", q.decisionId, "Again", OFFICER)).rejects.toMatchObject({ status: 409 });
    expect((await detail("INC-Q")).grievance).toMatchObject({ stage: "verified", asked: false });
    const life = (await caseLifecycle("INC-Q"))!;
    expect(life.questions[0]).toMatchObject({ question: "Was the whole street cleared, or only the corner?", answer: { text: "The whole street, 120 metres, and the corner bin point" } });
    expect(life).toMatchObject({ open: false, canReopen: true, canAsk: true, pending: 0 });
    // no status moved: still closed for the Collector and the department
    expect(await caseNow("INC-Q")).toMatchObject({ open: 0, status: "Resolved" });
  });

  it("refused on an open case and on a rejected one", async () => {
    incident("INC-OQ");
    await expect(askDepartment("INC-OQ", "Why is this taking so long?", COLLECTOR)).rejects.toMatchObject({ status: 409 });
    incident("INC-RJ");
    decide("INC-RJ", "reject", "2026-11-28 11:00:00", "Duplicate");
    await expect(askDepartment("INC-RJ", "Why was this rejected?", COLLECTOR)).rejects.toThrow(/reopen it/);
  });
});
