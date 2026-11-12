/**
 * QA pass 7 (desk-and-accounts): an online complaint from filing to the case screens, through the real POST /api/complaints, on an isolated
 * store (the AWS store's MySQL -> SQLite translation). Only the session, the AI classifier and the dataset export are replaced.
 *   officer-day-02  every online complaint was Medium with a flat 120 h deadline
 *   officer-day-07  'Other' and assumed-department complaints were promised an officer review nobody does
 *   officer-day-09  the citizen's photo or video never reached the department officer or the Collector
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/desk-and-accounts/online.sqlite.test.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

type S = { userId: number; email: string; role: string };
const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, session: null as null | { userId: number; email: string; role: string } }));
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
vi.mock("@/lib/ai-classifier", () => ({ classifyComplaint: async () => ({ department: "Electrical Department", needsManualReview: true, method: "keywords" }) }));
vi.mock("@/lib/dataset/append", () => ({ appendComplaintToDataset: async () => undefined }));

const { POST: fileComplaint } = await import("@/app/api/complaints/route");
const { GET: caseScreen } = await import("@/app/api/manu/case/[incident]/route");
const { GET: openMedia } = await import("@/app/api/complaints/media/[name]/route");
const { caseIdFor } = await import("@/lib/manu/cases");
const { addHours } = await import("@/lib/manu/clean");

let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "p7online-")); process.env.COMPLAINT_UPLOAD_DIR = dir; process.env.DATA_BACKEND = "aws"; });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const CITIZEN: S = { userId: 5, email: "a@x", role: "citizen" };
const OFFICER_SWM: S = { userId: 2, email: "swm@x", role: "department_officer" };
const OFFICER_ELE: S = { userId: 3, email: "ele@x", role: "department_officer" };
const COLLECTOR: S = { userId: 1, email: "c@x", role: "collector" };
const DESK: S = { userId: 7, email: "petition@x", role: "department_officer" };

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE zones (id INT, zone_name TEXT); INSERT INTO zones VALUES (6, 'Thiru-Vi-Ka-Nagar');
    CREATE TABLE zone_wards (ward_number INT, zone_id INT); INSERT INTO zone_wards VALUES (70, 6);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO departments VALUES (1, 'General Administration'), (3, 'Electrical Department'), (4, 'Solid Waste Management Department'), (5, 'Storm Water Drain Department');
    CREATE TABLE complaint_types (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE complaint_categories (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO complaint_categories VALUES (1, 'Flood'), (2, 'Garbage'), (3, 'Other');
    CREATE TABLE complaint_subtypes (id INTEGER PRIMARY KEY, category_id INT, label TEXT, department_id INT, mapping_status TEXT, is_active INT DEFAULT 1);
    INSERT INTO complaint_subtypes VALUES (11, 1, 'EB wire cut/Spark seen', 5, 'assumed', 1), (21, 2, 'Removal of Garbage', 4, 'mapped', 1), (31, 3, 'Other / not listed above', NULL, 'unmapped', 1);
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, role TEXT, department_id INT, dept_code TEXT);
    INSERT INTO users VALUES (1, 'c@x', 'collector', NULL, NULL), (2, 'swm@x', 'department_officer', 4, 'GCC-SWM'), (3, 'ele@x', 'department_officer', 3, 'GCC-ELE'), (5, 'a@x', 'citizen', NULL, NULL), (7, 'petition@x', 'department_officer', NULL, 'COL-PET');
    CREATE TABLE complaints (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT, user_id INT, initials TEXT, first_name TEXT, last_name TEXT, gender TEXT, street_address TEXT, pincode TEXT, mobile_number TEXT, phone_number TEXT, email TEXT,
      zone_id INT, ward_number INT, ward_source TEXT, gcc_area_id INT, gcc_locality_id INT, gcc_street_id INT, manual_street_name TEXT, street_type TEXT, location_pincode TEXT, specific_location TEXT, latitude REAL, longitude REAL,
      department_id INT, complaint_subtype_id INT, title TEXT, description TEXT, media_path TEXT, is_anonymous INT, needs_manual_review INT, status TEXT, is_synthetic INT NOT NULL DEFAULT 0, rejected_stage TEXT, remarks TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes')), updated_at TEXT);
    CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INT, status TEXT, stage TEXT, remarks TEXT, changed_by INT, created_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE petitions (id INTEGER PRIMARY KEY, complaint_code TEXT, subject TEXT, pages TEXT, dept_code TEXT, incident_id TEXT, status TEXT, filed_at TEXT);
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
      ('OTHER', 'Other', 'OTHER', 24, 72, 168, 240);`);
  h.db = db;
  h.session = null;
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
const hoursBetween = (a: string, b: string) => (Date.parse(`${b.replace(" ", "T")}Z`) - Date.parse(`${a.replace(" ", "T")}Z`)) / 3_600_000;

// --------------------------------------------------------------------------------------------------------------- officer-day-02 --

describe("officer-day-02: an online complaint's case is graded and due as the pipeline grades it", () => {
  it("'EB wire cut/Spark seen' describing a live wire: High, Streetlights & electrical, due in 24 h", async () => {
    const code = await file({ complaintSubtypeId: 11, title: "Live wire hanging", description: "EB wire cut and sparking, live wire hanging over the road." });
    const i = caseOf(code);
    expect(i).toMatchObject({ severity_level: "High", category_code: "STREETLIGHT_ELECTRICAL", sla_hours: 24 });
    expect(hoursBetween(i.first_reported_at, i.sla_due_at)).toBe(24);
    expect(i.severity_reasons).toMatch(/immediate hazard/);
  });

  it("'Removal of Garbage': Low, Solid waste, due in 72 h", async () => {
    const i = caseOf(await file());
    expect(i).toMatchObject({ severity_level: "Low", category_code: "SOLID_WASTE", sla_hours: 72 });
    expect(hoursBetween(i.first_reported_at, i.sla_due_at)).toBe(72);
  });

  it("near a school, garbage complained of before: the place and the repeat raise it (Medium, 48 h)", async () => {
    const i = caseOf(await file({ description: "Garbage not cleared near the school, already complained twice, no action taken." }));
    expect(i).toMatchObject({ severity_level: "Medium", sla_hours: 48 });
  });

  it("a build without the deadline table keeps 120 h", async () => {
    h.db.exec("DROP TABLE ref_categories; CREATE TABLE ref_categories (category_code TEXT PRIMARY KEY, label TEXT, family TEXT); INSERT INTO ref_categories VALUES ('SOLID_WASTE', 'Solid waste', 'SANITATION');");
    expect(caseOf(await file())).toMatchObject({ sla_hours: 120 });
  });
});

// --------------------------------------------------------------------------------------------------------------- officer-day-07 --

describe("officer-day-07: a department the portal chose is not promised an officer review; the case flags it", () => {
  it("'Other': the citizen reads where it went and why; the Collector's case is flagged for review", async () => {
    const code = await file({ complaintSubtypeId: 31, otherDescription: "Street light pole leaning", title: "Pole leaning", description: "The street light pole is leaning over the footpath." });
    const c = one("SELECT id, department_id, needs_manual_review FROM complaints WHERE complaint_code = ?", code);
    expect(c).toMatchObject({ department_id: 3, needs_manual_review: 1 });
    const remark = String(one("SELECT remarks FROM complaint_status_history WHERE complaint_id = ?", c.id).remarks);
    expect(remark).not.toMatch(/pending officer review/i);
    expect(remark).toContain("Electrical Department");
    expect(caseOf(code)).toMatchObject({ needs_review: 1, lead_dept: "GCC-ELE" });
    expect(String(caseOf(code).review_reason)).toMatch(/check that it is the right department/);
  });

  it("an assumed department (EB wire under Flood, sent to Storm Water Drain) is flagged too; a mapped type is not", async () => {
    expect(caseOf(await file({ complaintSubtypeId: 11 }))).toMatchObject({ needs_review: 1 });
    expect(caseOf(await file())).toMatchObject({ needs_review: 0 });
  });
});

// --------------------------------------------------------------------------------------------------------------- officer-day-09 --

describe("officer-day-09: the citizen's photo reaches the department officer and the Collector on the case screen", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 2)]);
  async function withPhoto(): Promise<{ code: string; url: string; name: string }> {
    const name = "c-20261112-0123456789abcdef.png";
    fs.writeFileSync(path.join(dir, name), PNG);
    fs.writeFileSync(path.join(dir, `${name}.owner.json`), JSON.stringify({ userId: CITIZEN.userId }));
    const url = `/api/complaints/media/${name}`;
    return { code: await file({ mediaPath: url }), url, name };
  }
  const screen = async (who: S, code: string) => {
    h.session = who;
    const r = await caseScreen(new NextRequest(`http://x/api/manu/case/${caseIdFor(code)}`), { params: Promise.resolve({ incident: caseIdFor(code) }) });
    return { status: r.status, j: await r.json() };
  };

  it("the Solid Waste officer's case screen lists it, and the link opens for that officer", async () => {
    const { code, url, name } = await withPhoto();
    const { j } = await screen(OFFICER_SWM, code);
    expect(j.media).toEqual([expect.objectContaining({ code, url, kind: "photo" })]);
    const m = await openMedia(new NextRequest(`http://x${url}`), { params: Promise.resolve({ name }) });
    expect(m.status).toBe(200);
  });

  it("the Collector sees it; another department's officer and the petition desk do not", async () => {
    const { code } = await withPhoto();
    expect((await screen(COLLECTOR, code)).j.media).toHaveLength(1);
    expect((await screen(OFFICER_ELE, code)).j.media).toEqual([]);
    expect((await screen(DESK, code)).j.media).toEqual([]);
  });

  it("a complaint with no attachment lists none, and the paper petitions are still listed as before", async () => {
    const code = await file();
    h.db.prepare(`INSERT INTO petitions (complaint_code, subject, pages, dept_code, incident_id, status, filed_at) VALUES ('2026-111AAA', 'Garbage', '["p-1.jpg"]', 'GCC-SWM', ?, 'filed', ?)`).run(caseIdFor(code), addHours("2026-11-12 10:00:00", 0));
    const { j } = await screen(OFFICER_SWM, code);
    expect(j.media).toEqual([]);
    expect(j.items).toEqual([expect.objectContaining({ code: "2026-111AAA", pages: ["/api/manu/photos/p-1.jpg"] })]);
  });
});
