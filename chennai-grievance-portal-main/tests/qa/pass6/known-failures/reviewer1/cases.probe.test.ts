/**
 * reviewer1 (QA pass 6): tries to break 3708211 (P5-031). Harness copied from src/lib/manu/cases.pass6.test.ts (isolated store through
 * the MySQL -> SQLite translation; reading and mailer stubbed).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";
import type { Reading } from "@/lib/manu/constants";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, reading: null as unknown }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => { h.db.exec("BEGIN"); try { const v = await fn(pool); h.db.exec("COMMIT"); return v; } catch (e) { h.db.exec("ROLLBACK"); throw e; } } }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => undefined }));
vi.mock("@/lib/mailer", () => ({ isSmtpConfigured: () => false, sendMail: async () => ({ ok: true }) }));
vi.mock("@/lib/manu/read", () => ({ readPetition: async () => ({ reading: h.reading, model: "test-model", ms: 1500 }) }));

const { createPetition, filePetition, getPetition } = await import("@/lib/manu/petitions");
const { savePages } = await import("@/lib/manu/files");
const { websiteCases, caseIdFor, onlineCase, addCaseLive } = await import("@/lib/manu/cases");
const { findRepeats, judgeRepeats } = await import("@/lib/manu/repeat");
const { trackKey } = await import("@/lib/manu/track");
const { POST: track } = await import("@/app/api/track/route");

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "manu-p6-")); process.env.PETITION_UPLOAD_DIR = dir; process.env.DATA_BACKEND = "aws"; });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const reading = (o: Partial<Reading> = {}): Reading => ({ name: "க. பார்வதி", mobile: "9000041873", door_no: "27", street: "ஜவஹர் தெரு", area_en: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", aadhaar_last4: null, subject: "கழிவுநீர் தொடர்பாக",
  problem_en: "Sewage overflowing on the street", request_en: "Clear the block", language: "ta", department: "CMWSSB", category: "DRAINAGE_SEWAGE", urgent: false, unsure_fields: [], full_text: "அனுப்புநர்: க. பார்வதி", ...o });
const fields = (o: Record<string, unknown> = {}) => ({ name: "க. பார்வதி", mobile: "9000041873", door: "27", street: "ஜவஹர் தெரு", area: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", subject: "கழிவுநீர் தொடர்பாக", problem: "Sewage overflowing on the street", request: "Clear the block", dept: "CMWSSB", urgent: false, fullText: "அனுப்புநர்: க. பார்வதி", ...o }) as never;

function buildTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT, first_reported_at TEXT, last_update_at TEXT, ward_no INT, zone_no INT, zone_name TEXT, taluk_code TEXT, lat REAL, lon REAL, loc_precision_m REAL,
      place_text TEXT, member_count INT, sources TEXT, channels TEXT, citizen_complaints INT, status_std TEXT, is_open INT, severity_level TEXT, sla_hours REAL, sla_due_at TEXT, priority_score REAL, priority_reasons TEXT, attention_flag INT, attention_reason TEXT, recurrence_90d INT, title TEXT, headline TEXT, summary TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT, title TEXT, channel TEXT, reporter_hash TEXT, ward_no INT, place_text TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, source_record_id TEXT, channel TEXT, reported_at TEXT, title TEXT);
    CREATE TABLE incident_timeline (event_id TEXT, at TEXT, step TEXT, status_std TEXT, actor TEXT, note TEXT, source TEXT, incident_id TEXT);
    CREATE TABLE ref_wards (ward_no INT PRIMARY KEY, zone_no INT, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    INSERT INTO ref_wards VALUES (70, 6, 'Thiru-Vi-Ka-Nagar', 'TLK-PER', 13.11, 80.23);
    CREATE TABLE ref_categories (category_code TEXT PRIMARY KEY, label TEXT, family TEXT);
    INSERT INTO ref_categories VALUES ('DRAINAGE_SEWAGE', 'Drainage & sewage', 'DRAINAGE'), ('OTHER', 'Other', 'OTHER');`);
}

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL DEFAULT 'counter', status TEXT NOT NULL DEFAULT 'reading', pages TEXT NOT NULL, uploaded_by INT, uploaded_email TEXT, citizen_user_id INT, reading TEXT, read_model TEXT, read_ms INT, read_error TEXT,
      name TEXT, mobile TEXT, address TEXT, area TEXT, ward_number INT, dept_code TEXT, category_code TEXT, urgent INT NOT NULL DEFAULT 0, subject TEXT, problem TEXT, request TEXT, full_text TEXT, petition_date TEXT, language TEXT, complaint_code TEXT, complaint_id INT, incident_id TEXT,
      attached INT NOT NULL DEFAULT 0, filed_by TEXT, filed_at TEXT, due_at TEXT, reject_reason TEXT, created_at TEXT, updated_at TEXT, recurrence TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, rejected_stage TEXT, remarks TEXT, user_id INT, first_name TEXT NOT NULL, gender TEXT NOT NULL, street_address TEXT NOT NULL, pincode TEXT, mobile_number TEXT, zone_id INT NOT NULL, ward_number INT NOT NULL, ward_source TEXT, specific_location TEXT,
      department_id INT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, is_anonymous INT NOT NULL, needs_manual_review INT NOT NULL, status TEXT NOT NULL, is_synthetic INT NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INT, status TEXT, stage TEXT, remarks TEXT, changed_by INT, created_at TEXT);
    CREATE TABLE zone_wards (ward_number INT, zone_id INT); INSERT INTO zone_wards VALUES (70, 6);
    CREATE TABLE zones (id INT, zone_name TEXT); INSERT INTO zones VALUES (6, 'Thiru-Vi-Ka-Nagar');
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO departments VALUES (1, 'General Administration'), (2, 'Revenue Department'), (3, 'Electrical Department');
    CREATE TABLE gcc_areas (id INT, name TEXT); INSERT INTO gcc_areas VALUES (163, 'PERAMBUR');
    CREATE TABLE area_wards (area_id INT, ward_number INT, is_primary INT); INSERT INTO area_wards VALUES (163, 70, 1);
    CREATE TABLE petition_sms (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', result TEXT, detail TEXT, attempts INTEGER NOT NULL DEFAULT 0, tried_at TEXT, sent_at TEXT, created_at TEXT);
    CREATE UNIQUE INDEX petition_sms__one ON petition_sms (complaint_code, kind);
    CREATE TABLE officer_steps (incident_id TEXT, step TEXT, note TEXT, report_id INT, at TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT);
    CREATE TABLE officer_reports (report_id INT, incident_id TEXT, photo_dir TEXT, photos TEXT);`);
  buildTables(db);
  h.db = db;
  h.reading = reading();
});

async function uploaded(): Promise<number> {
  const id = await createPetition({ pages: await savePages([JPG]), uploadedBy: 1, uploadedEmail: "petition@x" });
  for (let i = 0; i < 200 && (await getPetition(id))!.status === "reading"; i++) await new Promise((r) => setTimeout(r, 5));
  return id;
}
const one = (sql: string, ...p: unknown[]) => h.db.prepare(sql).get(...(p as never[])) as Record<string, any>;
const count = (sql: string, ...p: unknown[]) => Number(one(sql, ...p).n);
const trackAs = (body: unknown) => track(new NextRequest("http://x/api/track", { method: "POST", headers: { "x-forwarded-for": `10.9.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) }));
const wrapBuild = () => { h.db.exec("DROP TABLE incidents; DROP TABLE events; DROP TABLE incident_members; DROP TABLE incident_timeline; DROP TABLE ref_wards; DROP TABLE ref_categories;"); buildTables(h.db); };


describe("reviewer1: rebuild order of petitions that joined another petition's case", () => {
  it("B (uploaded first) joined A's case; both approved in the same second: the rebuild keeps B in A's case", async () => {
    const idB = await uploaded();
    const idA = await uploaded();
    const a = await filePetition(idA, fields(), "x");
    const b = await filePetition(idB, fields({ attachTo: caseIdFor(a.code) }), "x");
    expect(b.attached).toBe(true);
    h.db.exec(`UPDATE petitions SET filed_at = '2026-11-12 10:00:00'`); // filed_at has one-second resolution
    wrapBuild();
    await websiteCases(h.db);
    const where = one("SELECT incident_id x FROM events WHERE source_record_id = ?", b.code).x;
    console.log(`[reviewer1] B's case after rebuild: ${where} (live: ${caseIdFor(a.code)}); incidents ${count("SELECT COUNT(*) n FROM incidents")}`);
    expect(where).toBe(caseIdFor(a.code));
  });

  it("recurrence: A, B (own case, written 1 time before), C attached to B's case: live and rebuilt cases match", async () => {
    await filePetition(await uploaded(), fields(), "x");
    const b = await filePetition(await uploaded(), fields(), "x");
    const c = await filePetition(await uploaded(), fields({ attachTo: caseIdFor(b.code) }), "x");
    expect(c.attached).toBe(true);
    const q = "SELECT incident_id, recurrence_90d, priority_score, priority_reasons, member_count, citizen_complaints FROM incidents ORDER BY incident_id";
    const live = h.db.prepare(q).all();
    const stored = h.db.prepare("SELECT complaint_code, recurrence, typeof(recurrence) t FROM petitions ORDER BY id").all();
    wrapBuild();
    await websiteCases(h.db);
    const rebuilt = h.db.prepare(q).all();
    console.log(`[reviewer1] stored ${JSON.stringify(stored)}\n live ${JSON.stringify(live)}\n rebuilt ${JSON.stringify(rebuilt)}`);
    expect(rebuilt).toEqual(live);
  });
});
