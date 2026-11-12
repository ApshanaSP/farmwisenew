/**
 * QA pass 7 (desk-and-accounts): the Manu Desk's P1 rows from pass 6, on an isolated store (the AWS store's MySQL -> SQLite translation),
 * as src/lib/manu/manu.sqlite.test.ts runs the petition loop. Only the AI reader is replaced.
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/desk-and-accounts/desk.sqlite.test.ts
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

const { createPetition, deskList, filePetition, fileSchema, getPetition } = await import("@/lib/manu/petitions");
const { savePages } = await import("@/lib/manu/files");
const { caseIdFor } = await import("@/lib/manu/cases");
const { istNow, addHours } = await import("@/lib/manu/clean");
const { POST: track } = await import("@/app/api/track/route");

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "p7desk-")); process.env.PETITION_UPLOAD_DIR = dir; process.env.DATA_BACKEND = "aws"; });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const reading = (o: Partial<Reading> = {}): Reading => ({ name: "R. Kumar", mobile: null, door_no: "27", street: "Jawahar Street", area_en: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", aadhaar_last4: null, subject: "Street light",
  problem_en: "Street light not working near the school", request_en: "Repair it", language: "en", department: "GCC-ELE", category: "STREETLIGHT_ELECTRICAL", urgent: false, unsure_fields: [], full_text: "From R. Kumar", ...o });
const raw = (o: Record<string, unknown> = {}) => ({ name: "R. Kumar", mobile: "", door: "27", street: "Jawahar Street", area: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", subject: "Street light",
  problem: "Street light not working near the school", request: "Repair it", dept: "GCC-ELE", urgent: false, fullText: "From R. Kumar", ...o });
/** the fields as the approve route takes them: through fileSchema, as POST /api/manu/petitions/<id> does */
const fields = (o: Record<string, unknown> = {}) => fileSchema.parse(raw(o));

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL DEFAULT 'counter', status TEXT NOT NULL DEFAULT 'reading', pages TEXT NOT NULL, uploaded_by INT, uploaded_email TEXT, citizen_user_id INT, reading TEXT, read_model TEXT, read_ms INT, read_error TEXT,
      name TEXT, mobile TEXT, address TEXT, area TEXT, ward_number INT, dept_code TEXT, category_code TEXT, urgent INT NOT NULL DEFAULT 0, subject TEXT, problem TEXT, request TEXT, full_text TEXT, petition_date TEXT, language TEXT, complaint_code TEXT, complaint_id INT, incident_id TEXT,
      attached INT NOT NULL DEFAULT 0, filed_by TEXT, filed_at TEXT, due_at TEXT, reject_reason TEXT, recurrence INT NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, rejected_stage TEXT, remarks TEXT, user_id INT, first_name TEXT NOT NULL, gender TEXT NOT NULL, street_address TEXT NOT NULL, pincode TEXT, mobile_number TEXT, zone_id INT NOT NULL, ward_number INT NOT NULL, ward_source TEXT, specific_location TEXT,
      department_id INT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, is_anonymous INT NOT NULL, needs_manual_review INT NOT NULL, status TEXT NOT NULL, is_synthetic INT NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INT, status TEXT, stage TEXT, remarks TEXT, changed_by INT, created_at TEXT);
    CREATE TABLE zone_wards (ward_number INT, zone_id INT); INSERT INTO zone_wards VALUES (70, 6);
    CREATE TABLE zones (id INT, zone_name TEXT); INSERT INTO zones VALUES (6, 'Thiru-Vi-Ka-Nagar');
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO departments VALUES (1, 'General Administration'), (3, 'Electrical Department');
    CREATE TABLE gcc_areas (id INT, name TEXT); INSERT INTO gcc_areas VALUES (163, 'PERAMBUR');
    CREATE TABLE area_wards (area_id INT, ward_number INT, is_primary INT); INSERT INTO area_wards VALUES (163, 70, 1);
    CREATE TABLE petition_sms (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', result TEXT, detail TEXT, attempts INTEGER NOT NULL DEFAULT 0, tried_at TEXT, sent_at TEXT, created_at TEXT);
    CREATE UNIQUE INDEX petition_sms__one ON petition_sms (complaint_code, kind);
    CREATE TABLE officer_steps (incident_id TEXT, step TEXT, note TEXT, report_id INT, at TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT);
    CREATE TABLE officer_reports (report_id INT, incident_id TEXT, photo_dir TEXT, photos TEXT);
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT, first_reported_at TEXT, last_update_at TEXT, ward_no INT, zone_no INT, zone_name TEXT, taluk_code TEXT, lat REAL, lon REAL, loc_precision_m REAL,
      place_text TEXT, member_count INT, sources TEXT, channels TEXT, citizen_complaints INT, status_std TEXT, is_open INT, severity_score REAL, severity_level TEXT, severity_reasons TEXT, sla_hours REAL, sla_due_at TEXT, priority_score REAL, attention_flag INT, attention_reason TEXT,
      recurrence_90d INT, needs_review INT, review_reason TEXT, title TEXT, headline TEXT, summary TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT, title TEXT, channel TEXT, reporter_hash TEXT, ward_no INT, severity_level TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, source_record_id TEXT, channel TEXT, reported_at TEXT, title TEXT, severity_level TEXT);
    CREATE TABLE incident_timeline (event_id TEXT, at TEXT, step TEXT, status_std TEXT, actor TEXT, note TEXT, source TEXT, incident_id TEXT);
    CREATE TABLE ref_wards (ward_no INT PRIMARY KEY, zone_no INT, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    INSERT INTO ref_wards VALUES (70, 6, 'Thiru-Vi-Ka-Nagar', 'TLK-PER', 13.11, 80.23);
    CREATE TABLE ref_categories (category_code TEXT PRIMARY KEY, label TEXT, family TEXT, sla_severe_h REAL, sla_high_h REAL, sla_medium_h REAL, sla_low_h REAL);
    INSERT INTO ref_categories VALUES ('STREETLIGHT_ELECTRICAL', 'Streetlights & electrical', 'UTILITIES', 4, 24, 48, 96), ('SOLID_WASTE', 'Solid waste', 'SANITATION', 12, 24, 48, 72), ('OTHER', 'Other', 'OTHER', 24, 72, 168, 240);`);
  h.db = db;
  h.reading = reading();
});

async function uploaded(): Promise<number> {
  const id = await createPetition({ pages: await savePages([JPG]), uploadedBy: 1, uploadedEmail: "petition@x" });
  for (let i = 0; i < 200 && (await getPetition(id))!.status === "reading"; i++) await new Promise((r) => setTimeout(r, 5));
  return id;
}
const one = (sql: string, ...p: unknown[]) => h.db.prepare(sql).get(...(p as never[])) as Record<string, any>;
const trackAs = (body: unknown) => track(new NextRequest("http://x/api/track", { method: "POST", headers: { "x-forwarded-for": `10.0.1.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) }));

// ---------------------------------------------------------------------------------------------------------------- hunt2-desk-04 --

describe("hunt2-desk-04: a mobile number written with +91 or a 0 is stored as the petitioner's own number", () => {
  for (const [written, kind] of [["+91 98400 12345", "+91 and spaces"], ["098400 12345", "a leading 0"], ["+91-98400-12345", "+91 and dashes"], ["0091 98400 12345", "0091"],
    ["௯௮௪௦௦ ௧௨௩௪௫", "Tamil digits"]] as const) {
    it(`"${written}" (${kind}), as the desk's box keeps it and the server reads it, is 9840012345`, async () => {
      const { typedMobile } = await import("@/lib/manu/clean");
      expect(fields({ mobile: typedMobile(written) }).mobile).toBe("9840012345");
    });
  }

  it("a number that is not a mobile is refused, not stored for an SMS: 0984001234, 9198400, 5840012345", () => {
    for (const m of ["0984001234", "9198400", "5840012345", "98400 12345 98400"]) expect(fileSchema.safeParse(raw({ mobile: m })).success, m).toBe(false);
    expect(fields({ mobile: "" }).mobile).toBe("");
  });

  it("the desk's box no longer cuts what is typed at 10 characters before it is read", async () => {
    const { typedMobile, MOBILE_TYPED_MAX } = await import("@/lib/manu/clean");
    expect(typedMobile("+91 98400 12345")).toBe("+91 98400 12345");
    const desk = fs.readFileSync(path.join(process.cwd(), "src/components/manu/ManuDesk.tsx"), "utf8");
    const box = desk.split("\n").find((l) => /label="Mobile"/.test(l)) ?? "";
    expect(box).toContain("typedMobile(e.target.value)");
    expect(box).toContain("maxLength={MOBILE_TYPED_MAX}");
    expect(MOBILE_TYPED_MAX).toBeGreaterThanOrEqual("0091 98400 12345".length);
  });

  it("approved with '+91 98400 12345', the petition holds 9840012345 and the petitioner tracks with the real last 4 digits (2345)", async () => {
    const id = await uploaded();
    const r = await filePetition(id, fields({ mobile: "+91 98400 12345" }), "x");
    expect(one("SELECT mobile FROM petitions WHERE id = ?", id).mobile).toBe("9840012345");
    expect(one("SELECT mobile_number m FROM complaints WHERE complaint_code = ?", r.code).m).toBe("9840012345");
    expect((await trackAs({ code: r.code, last4: "2345" })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------- hunt2-desk-13 --

describe("hunt2-desk-13: petitions waiting for the check never drop off the desk in a busy week", () => {
  it("a petition waiting since before 300 newer approvals of the week is still on the desk, and one left 'reading' is restarted", async () => {
    const now = istNow();
    const at = (h: number) => addHours(now, h);
    // one waiting for the check, one left half-read by a restart, both uploaded two days ago
    h.db.prepare(`INSERT INTO petitions (status, pages, reading, created_at, updated_at) VALUES ('needs_check', '[]', ?, ?, ?)`).run(JSON.stringify(reading()), at(-48), at(-48));
    h.db.prepare(`INSERT INTO petitions (status, pages, created_at, updated_at) VALUES ('reading', '[]', ?, ?)`).run(at(-47), at(-47));
    // a busy grievance day after them: 310 approved since
    const ins = h.db.prepare(`INSERT INTO petitions (status, pages, name, problem, dept_code, complaint_code, filed_at, created_at, updated_at) VALUES ('filed', '[]', 'X', 'Y', 'GCC-ELE', ?, ?, ?, ?)`);
    for (let i = 0; i < 310; i++) ins.run(`2026-${String(100 + (i % 900)).padStart(3, "0")}AA${String.fromCharCode(65 + (i % 26))}`, at(-24 + i / 100), at(-24 + i / 100), at(-24 + i / 100));
    const list = await deskList();
    expect(list.filter((x) => x.status === "needs_check")).toHaveLength(1);
    expect(list.some((x) => x.status === "reading" || x.status === "read_failed")).toBe(true);
  });
});
