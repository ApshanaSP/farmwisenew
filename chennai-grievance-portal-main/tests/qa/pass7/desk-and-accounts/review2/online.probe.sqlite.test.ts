/**
 * Adversarial review 2 of 4069de1 / 0d7ac3e (officer-day-02, -07, -09): the real POST /api/complaints, the case screen route and the media
 * route over the AWS store's MySQL -> SQLite translation, as online.sqlite.test.ts runs them. Each test states what SHOULD happen; a failing
 * test is a finding. The pipeline's own grade for each input was computed by running district_intel's code (severity.grievance on the row the
 * loader builds, grievances.py title rule included); the numbers are quoted next to each test.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/desk-and-accounts/review2
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

type S = { userId: number; email: string; role: string };
const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, session: null as null | { userId: number; email: string; role: string }, classified: 0 }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
const portalOf = (s: S) => (s.role === "collector" ? "collector" : s.role === "citizen" ? "citizen" : "officer");
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => { h.db.exec("BEGIN"); try { const v = await fn(pool); h.db.exec("COMMIT"); return v; } catch (e) { h.db.exec("ROLLBACK"); throw e; } } }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => undefined }));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => h.session, getActiveSession: async () => h.session, getActiveSessions: async () => (h.session ? [h.session] : []),
  getActivePortalSession: async (p: string) => (h.session && portalOf(h.session) === p ? h.session : null),
  getPortalSession: async (p: string) => (h.session && portalOf(h.session) === p ? h.session : null)
}));
vi.mock("@/lib/ai-classifier", () => ({ classifyComplaint: async () => { h.classified++; return { department: "Electrical Department", needsManualReview: true, method: "keywords" }; } }));
vi.mock("@/lib/dataset/append", () => ({ appendComplaintToDataset: async () => undefined }));

const { POST: fileComplaint } = await import("@/app/api/complaints/route");
const { GET: caseScreen } = await import("@/app/api/manu/case/[incident]/route");
const { GET: openMedia } = await import("@/app/api/complaints/media/[name]/route");
const { caseIdFor, websiteCases } = await import("@/lib/manu/cases");

let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "p7review2-")); process.env.COMPLAINT_UPLOAD_DIR = dir; process.env.DATA_BACKEND = "aws"; });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const CITIZEN: S = { userId: 5, email: "a@x", role: "citizen" };
const OFFICER_SWM: S = { userId: 2, email: "swm@x", role: "department_officer" };
const OFFICER_ELE: S = { userId: 3, email: "ele@x", role: "department_officer" };

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE zones (id INT, zone_name TEXT); INSERT INTO zones VALUES (6, 'Thiru-Vi-Ka-Nagar');
    CREATE TABLE zone_wards (ward_number INT, zone_id INT); INSERT INTO zone_wards VALUES (70, 6);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO departments VALUES (1, 'General Administration'), (3, 'Electrical Department'), (4, 'Solid Waste Management Department'), (5, 'Storm Water Drain Department');
    CREATE TABLE complaint_types (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO complaint_types VALUES (5, 'Sewage Overflow');
    CREATE TABLE complaint_categories (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO complaint_categories VALUES (1, 'Flood'), (2, 'Garbage'), (3, 'Other'), (4, 'Public Health');
    CREATE TABLE complaint_subtypes (id INTEGER PRIMARY KEY, category_id INT, label TEXT, department_id INT, mapping_status TEXT, is_active INT DEFAULT 1);
    INSERT INTO complaint_subtypes VALUES (11, 1, 'EB wire cut/Spark seen', 5, 'assumed', 1), (21, 2, 'Removal of Garbage', 4, 'mapped', 1), (31, 3, 'Other / not listed above', NULL, 'unmapped', 1),
      (41, 4, 'Street Dogs', 4, 'mapped', 1);
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, role TEXT, department_id INT, dept_code TEXT);
    INSERT INTO users VALUES (1, 'c@x', 'collector', NULL, NULL), (2, 'swm@x', 'department_officer', 4, 'GCC-SWM'), (3, 'ele@x', 'department_officer', 3, 'GCC-ELE'), (5, 'a@x', 'citizen', NULL, NULL), (7, 'petition@x', 'department_officer', NULL, 'COL-PET');
    CREATE TABLE complaints (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT, user_id INT, initials TEXT, first_name TEXT, last_name TEXT, gender TEXT, street_address TEXT, pincode TEXT, mobile_number TEXT, phone_number TEXT, email TEXT,
      zone_id INT, ward_number INT, ward_source TEXT, gcc_area_id INT, gcc_locality_id INT, gcc_street_id INT, manual_street_name TEXT, street_type TEXT, location_pincode TEXT, specific_location TEXT, latitude REAL, longitude REAL,
      department_id INT, complaint_subtype_id INT, complaint_type_id INT, title TEXT, description TEXT, media_path TEXT, is_anonymous INT, needs_manual_review INT, status TEXT, is_synthetic INT NOT NULL DEFAULT 0, rejected_stage TEXT, remarks TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes')), updated_at TEXT);
    CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INT, status TEXT, stage TEXT, remarks TEXT, changed_by INT, created_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE petitions (id INTEGER PRIMARY KEY, complaint_code TEXT, subject TEXT, pages TEXT, dept_code TEXT, incident_id TEXT, status TEXT, filed_at TEXT, attached INTEGER NOT NULL DEFAULT 0); -- attached: as migrations/015_petitions.sql (cases.ts reads it since 5e336a51)
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT, first_reported_at TEXT, last_update_at TEXT, ward_no INT, zone_no INT, zone_name TEXT, taluk_code TEXT, lat REAL, lon REAL, loc_precision_m REAL,
      place_text TEXT, member_count INT, sources TEXT, channels TEXT, citizen_complaints INT, status_std TEXT, is_open INT, severity_score REAL, severity_level TEXT, severity_reasons TEXT, sla_hours REAL, sla_due_at TEXT, priority_score REAL, attention_flag INT, attention_reason TEXT,
      recurrence_90d INT, needs_review INT, review_reason TEXT, title TEXT, headline TEXT, summary TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT, title TEXT, channel TEXT, reporter_hash TEXT, ward_no INT, severity_level TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, source_record_id TEXT, channel TEXT, reported_at TEXT, title TEXT, severity_level TEXT);
    CREATE TABLE incident_timeline (event_id TEXT, at TEXT, step TEXT, status_std TEXT, actor TEXT, note TEXT, source TEXT, incident_id TEXT);
    CREATE TABLE ref_wards (ward_no INT PRIMARY KEY, zone_no INT, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    INSERT INTO ref_wards VALUES (70, 6, 'Thiru-Vi-Ka-Nagar', 'TLK-PER', 13.11, 80.23);
    CREATE TABLE ref_categories (category_code TEXT PRIMARY KEY, label TEXT, family TEXT, sla_severe_h REAL, sla_high_h REAL, sla_medium_h REAL, sla_low_h REAL);
    INSERT INTO ref_categories VALUES ('STREETLIGHT_ELECTRICAL', 'Streetlights & electrical', 'UTILITIES', 4, 24, 48, 96), ('SOLID_WASTE', 'Solid waste', 'SANITATION', 12, 24, 48, 72),
      ('STRAY_ANIMALS', 'Stray animals', 'HEALTH', 24, 72, 168, 240), ('FLOOD_WATERLOGGING', 'Flooding', 'WATER', 6, 12, 24, 48), ('OTHER', 'Other', 'OTHER', 24, 72, 168, 240);`);
  h.db = db;
  h.session = null;
  h.classified = 0;
});

const body = (o: Record<string, unknown> = {}) => ({ firstName: "Qa", lastName: "Seven", gender: "Male", streetAddress: "1 Test Street", mobileNumber: "9876543210", zoneId: 6, wardNumber: 70,
  manualStreetName: "Test Street", complaintSubtypeId: 21, title: "Garbage not cleared", description: "Garbage not cleared for three days near the corner shop.", ...o });
async function file(o: Record<string, unknown> = {}): Promise<string> {
  h.session = CITIZEN;
  const r = await fileComplaint(new NextRequest("http://127.0.0.1/api/complaints", { method: "POST", body: JSON.stringify(body(o)), headers: { "content-type": "application/json" } }));
  const j = await r.json();
  expect(r.status, JSON.stringify(j)).toBe(200);
  return String(j.complaintCode);
}
const one = (sql: string, ...p: unknown[]) => h.db.prepare(sql).get(...(p as never[])) as Record<string, any>;
const caseOf = (code: string) => one("SELECT * FROM incidents WHERE incident_id = ?", caseIdFor(code));
const screen = async (who: S, code: string) => {
  h.session = who;
  const r = await caseScreen(new NextRequest(`http://x/api/manu/case/${caseIdFor(code)}`), { params: Promise.resolve({ incident: caseIdFor(code) }) });
  return (await r.json()) as { media: { url: string; code: string; kind: string }[] };
};
const nameOf = (url: string) => url.slice("/api/complaints/media/".length);

// --------------------------------------------------------------------------------------------------------------- officer-day-02 --

describe("review2 officer-day-02: the live case is graded as the pipeline grades the same complaint", () => {
  // The form fills the title with the sub-type's label (file-complaint/page.tsx: "Autofill the title from the chosen subcomplaint"). The
  // pipeline's loader (grievances.py) then replaces such a title with "<sub-type>, <Street>, Ward <n>", and severity.grievance() reads the
  // street as text: "Kovil Street" is a place of worship (+8). Pipeline, run on this row: 33.0 Medium ("Street Dogs (+25); Affects worship (+8)").
  it("'Street Dogs' with the autofilled title on Kovil Street is Medium (168 h), as the pipeline grades it", async () => {
    const code = await file({ complaintSubtypeId: 41, title: "Street Dogs", manualStreetName: "Kovil Street", description: "A pack of dogs chases people at night." });
    const i = caseOf(code);
    expect({ severity_level: i.severity_level, sla_hours: i.sla_hours }, String(i.severity_reasons)).toEqual({ severity_level: "Medium", sla_hours: 168 });
  });

  // A complaint saved before migration 002 has complaint_type_id only. The dataset gives the pipeline its type name as the sub-type
  // (dataset-sql.js: COALESCE(cs.label, ct.name)); websiteCases joins complaint_subtypes only. Pipeline on this row: 50.0 High
  // ("High-risk issue: Sewage Overflow (+35); Describes an immediate hazard (+15)").
  it("rebuild: a legacy complaint typed 'Sewage Overflow' (no sub-type id) is High, as the pipeline grades it", async () => {
    h.db.prepare(`INSERT INTO complaints (complaint_code, user_id, first_name, gender, street_address, zone_id, ward_number, department_id, complaint_type_id, complaint_subtype_id, title, description, is_anonymous, needs_manual_review, status, created_at)
      VALUES ('2026-001LEG', 5, 'Qa', 'Male', '1 Test Street', 6, 70, 5, 5, NULL, 'Sewage', 'Sewage overflowing on the road for a week.', 0, 0, 'Complaint Filed', '2026-11-12 10:00:00')`).run();
    await websiteCases(h.db);
    const i = caseOf("2026-001LEG");
    expect({ severity_level: i.severity_level, category_code: i.category_code }, String(i.severity_reasons)).toMatchObject({ severity_level: "High" });
  });
});

// --------------------------------------------------------------------------------------------------------------- officer-day-07 --

describe("review2 officer-day-07: what the citizen and the Collector are told is what happened", () => {
  // 'assumed': the sub-type HAS a department (the portal's best match for the type); no classifier runs and nothing the citizen wrote is read.
  it("an assumed department is not described as 'no fixed department ... chosen from what the citizen wrote'", async () => {
    const code = await file({ complaintSubtypeId: 11, title: "Spark from EB wire", description: "EB wire sparking near the bus stop." });
    expect(h.classified, "the classifier ran").toBe(0);
    const c = one("SELECT id FROM complaints WHERE complaint_code = ?", code);
    const remark = String(one("SELECT remarks FROM complaint_status_history WHERE complaint_id = ?", c.id).remarks);
    const reason = String(caseOf(code).review_reason);
    expect(remark, remark).not.toMatch(/no fixed department/i);
    expect(reason, reason).not.toMatch(/no fixed department|from what the citizen wrote/i);
  });
});

// --------------------------------------------------------------------------------------------------------------- officer-day-09 --

describe("review2 officer-day-09: every attachment the case screen lists opens for that viewer", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 2)]);
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(200, 3)]);
  const put = (name: string, buf: Buffer) => {
    fs.writeFileSync(path.join(dir, name), buf);
    fs.writeFileSync(path.join(dir, `${name}.owner.json`), JSON.stringify({ userId: CITIZEN.userId }));
    return `/api/complaints/media/${name}`;
  };

  // The citizen's own upload may be attached to more than one of their complaints (POST checks only that they uploaded it). The case screen
  // filters by each complaint's department; the media route decides on the FIRST complaint holding the path (LIMIT 1).
  // QA pass 7 (author, after this probe): the mechanism is closed at filing instead, one upload to one complaint (POST /api/complaints refuses
  // a file another complaint holds), so the media route's lookup by path is never ambiguous. Kept as that check.
  it("the same upload cannot be attached to a second complaint, so no case screen lists a photo the media route refuses", async () => {
    const url = put("c-20261112-aaaaaaaaaaaaaaaa.png", PNG);
    await file({ mediaPath: url }); // Solid Waste
    h.session = CITIZEN;
    const r = await fileComplaint(new NextRequest("http://127.0.0.1/api/complaints", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body({ complaintSubtypeId: 31, otherDescription: "Street light pole leaning", title: "Pole leaning", description: "The street light pole is leaning over the footpath.", mediaPath: url })) }));
    expect(r.status).toBe(400);
  });

  // p7-desk-and-accounts-10, fixed in fixall (f16c92c8): the media route answers one byte range with 206 (was it.skip)
  it("a video attached by the citizen answers a Range request with 206 and Accept-Ranges", async () => {
    const url = put("c-20261112-bbbbbbbbbbbbbbbb.mp4", MP4);
    const code = await file({ mediaPath: url });
    const listed = (await screen(OFFICER_SWM, code)).media;
    expect(listed).toEqual([expect.objectContaining({ url, kind: "video" })]);
    h.session = OFFICER_SWM;
    const m = await openMedia(new NextRequest(`http://x${url}`, { headers: { range: "bytes=0-1" } }), { params: Promise.resolve({ name: nameOf(url) }) });
    expect({ status: m.status, ranges: m.headers.get("accept-ranges") }).toEqual({ status: 206, ranges: "bytes" });
  });
});
