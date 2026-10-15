/**
 * The whole loop, end to end, through the real route handlers on an isolated in-memory store (the AWS store's MySQL ->
 * SQLite translation): a citizen's complaint is in an incident (as the pipeline files it), the department officer approves
 * it and sends a completion report with a photo, the Collector verifies it, and the citizen's tracker shows
 * "Verified by Collector" with that photo, which the citizen may open and another citizen may not.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, who: { citizen: null as null | object, officer: null as null | object, collector: null as null | object } }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const conn = () => ({ query: async (sql: string, params: unknown[] = []) => run(sql, params), beginTransaction: async () => void h.db.exec("BEGIN"),
  commit: async () => void h.db.exec("COMMIT"), rollback: async () => void h.db.exec("ROLLBACK"), release: () => undefined });
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params), getConnection: async () => conn() };
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-10-14 12:00:00" }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => h.who.collector, failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/officer/guard", async (orig) => ({ ...(await orig<typeof import("@/lib/officer/guard")>()),
  officerSession: async () => h.who.officer, officerDeptCode: async () => "GCC-ELE" }));
vi.mock("@/lib/auth", () => ({ getSessionFromCookies: async () => h.who.citizen, getActiveSessions: async () => [h.who.citizen, h.who.officer, h.who.collector].filter(Boolean) }));

let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "loop-")); process.env.OFFICER_UPLOAD_DIR = dir; });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const ELE = { code: "GCC-ELE", name: "Street Lighting & Electrical", org: "GCC", head: "EE", route: "AE → EE", short: "Elec", remarkHint: "" };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, user_id INTEGER, status TEXT, rejected_stage TEXT, remarks TEXT, created_at TEXT,
      department_id INTEGER, complaint_subtype_id INTEGER, complaint_type_id INTEGER, zone_id INTEGER, gcc_locality_id INTEGER, gcc_area_id INTEGER,
      gcc_street_id INTEGER, locality_id INTEGER, street_id INTEGER, manual_street_name TEXT, street_type TEXT, title TEXT, media_path TEXT);
    CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INTEGER, status TEXT, stage TEXT, remarks TEXT, changed_by INTEGER, created_at TEXT);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE complaint_subtypes (id INTEGER PRIMARY KEY, label TEXT, category_id INTEGER, mapping_status TEXT);
    CREATE TABLE complaint_categories (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE complaint_types (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE zones (id INTEGER PRIMARY KEY, zone_name TEXT);
    CREATE TABLE gcc_localities (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE gcc_areas (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE gcc_streets (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE localities (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE streets (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT);
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_no INTEGER,
      zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT, verified INTEGER);
    CREATE TABLE ref_departments (code TEXT, route TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT,
      actor_user_id INTEGER, at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, remarks TEXT, photo_dir TEXT, photos TEXT,
      sent_by TEXT, sent_user_id INTEGER, sent_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY, actor TEXT, action TEXT, table_name TEXT, record_id TEXT, before_value TEXT, after_value TEXT);
    CREATE TABLE incident_timeline (incident_id TEXT, at TEXT, step TEXT, note TEXT, actor TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, channel TEXT, reported_at TEXT, title TEXT, role TEXT);
    CREATE TABLE documents (publisher TEXT, title TEXT, url TEXT, published_at TEXT, linked_incident_id TEXT, story_id TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, subject TEXT, body TEXT, created_at TEXT);
    INSERT INTO zones VALUES (9, 'Teynampet');
    -- the citizen's complaint, filed in the morning, and the incident the pipeline filed it into (severe: the Collector checks it)
    INSERT INTO complaints (id, complaint_code, user_id, status, created_at, zone_id, manual_street_name, title)
      VALUES (1, '2026-777AAA', 50, 'Complaint Filed', '2026-10-14 08:00:00', 9, 'Test Street', 'Live wire hanging');
    INSERT INTO complaint_status_history (complaint_id, status, stage, remarks, changed_by, created_at)
      VALUES (1, 'Complaint Filed', 'Citizen', 'Complaint registered by citizen.', 50, '2026-10-14 08:00:00');
    INSERT INTO events VALUES ('GRV-2026-777AAA', 'grievance', '2026-777AAA', 'INC-LOOP', 'Live wire hanging');
    INSERT INTO incidents (incident_id, title, lead_dept, severity_level, status_std, first_reported_at, last_update_at, is_open, verified, citizen_complaints)
      VALUES ('INC-LOOP', 'Live wire hanging on Test Street', 'GCC-ELE', 'Severe', 'Open', '2026-10-14 08:00:00', '2026-10-14 08:00:00', 1, 0, 1);`);
  return db;
}

const OFFICER = { session: { email: "ele@x", userId: 20, role: "department_officer" }, dept: ELE };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

describe("citizen -> officer -> Collector -> citizen", () => {
  it("the resident sees the Collector's verification and the completion photo", async () => {
    h.db = fresh();
    const officerStep = await import("@/app/api/officer/grievances/[id]/route");
    const officerReport = await import("@/app/api/officer/grievances/[id]/report/route");
    const decisions = await import("@/app/api/collector/decisions/route");
    const tracker = await import("@/app/api/complaints/[code]/route");
    const photo = await import("@/app/api/officer/photos/[dir]/[name]/route");
    const params = { params: { id: "INC-LOOP" } };

    // 1. the officer approves
    h.who.officer = OFFICER;
    const a = await officerStep.POST(new NextRequest("http://x/api/officer/grievances/INC-LOOP", { method: "POST", body: JSON.stringify({ step: "approve" }) }), params);
    expect(a.status).toBe(201);

    // 2. the officer sends the completion report with a photo (severe: to the Collector)
    const fd = new FormData();
    fd.append("remarks", "Live wire removed and the line re-insulated; checked with the AE on site.");
    fd.append("step", "send");
    fd.append("photos", new File([PNG], "done.png", { type: "image/png" }));
    const r = await officerReport.POST(new NextRequest("http://x/api/officer/grievances/INC-LOOP/report", { method: "POST", body: fd }), params);
    expect(r.status).toBe(201);

    // the resident already sees the work waiting for the Collector
    h.who.citizen = { userId: 50, role: "citizen" };
    const mid = await (await tracker.GET(new NextRequest("http://x/api/complaints/2026-777AAA"), { params: { code: "2026-777AAA" } })).json();
    expect(mid.complaint.status).toBe("Completed - Pending Collector Verification");

    // 3. the Collector verifies
    h.who.collector = { email: "collector@x", role: "collector", userId: 1 };
    const v = await decisions.POST(new NextRequest("http://x/api/collector/decisions", { method: "POST", body: JSON.stringify({ incidentIds: ["INC-LOOP"], decision: "verify" }) }));
    expect(v.status).toBe(201);

    // 4. the resident's tracker: verified by the Collector, with the photo, once in the history
    h.who.collector = null; h.who.officer = null;
    const done = await (await tracker.GET(new NextRequest("http://x/api/complaints/2026-777AAA"), { params: { code: "2026-777AAA" } })).json();
    expect(done.complaint.status).toBe("Verified by Collector");
    expect(done.progress.checkedBy).toBe("collector");
    expect(done.progress.photos).toHaveLength(1);
    expect(done.history.map((x: { status: string }) => x.status)).toEqual(["Complaint Filed", "Approved by Department Officer",
      "Completed - Pending Collector Verification", "Verified by Collector"]);
    const [, , pdir, pname] = String(done.progress.photos[0]).match(/\/api\/officer\/photos\/(([^/]+)\/([^/]+))$/)!.slice(0);
    const mine = await photo.GET(new NextRequest(`http://x${done.progress.photos[0]}`), { params: { dir: pdir, name: pname } });
    expect(mine.status).toBe(200);
    // another resident cannot open it
    h.who.citizen = { userId: 51, role: "citizen" };
    const theirs = await photo.GET(new NextRequest(`http://x${done.progress.photos[0]}`), { params: { dir: pdir, name: pname } });
    expect(theirs.status).toBe(404);
  });
});
