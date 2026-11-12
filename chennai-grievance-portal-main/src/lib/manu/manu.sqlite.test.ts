/**
 * The whole petition loop on an isolated store (the AWS store's MySQL -> SQLite translation): photos in, the reader's answer, the check,
 * filing, the case the officer and Collector see, the public tracker, a repeat petition added to the case, and the case coming back on
 * a new build. Only the AI reader is replaced.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";
import type { Reading } from "./constants";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, reading: null as unknown, fail: false, smtp: false, mails: [] as { to: string; subject: string; html: string }[], mailResult: { ok: true } as Record<string, unknown> }));
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
vi.mock("@/lib/mailer", () => ({ isSmtpConfigured: () => h.smtp, sendMail: async (to: string, subject: string, html: string) => { h.mails.push({ to, subject, html }); return h.mailResult; } }));
vi.mock("@/lib/manu/read", () => ({ readPetition: async () => { if (h.fail) throw new Error("no key"); return { reading: h.reading, model: "test-model", ms: 1500 }; } }));

const { createPetition, deletePage, deletePetition, deskList, filePetition, getPetition, petitionDetail, readAgain } = await import("./petitions");
const { readPhoto, savePages, UploadError, kindOf } = await import("./files");
const { websiteCases, caseIdFor, onlineCase, addCaseLive } = await import("./cases");
const { trackKey } = await import("./track");
const { retryFailedSms, sendPetitionSms, smsMode, SMS_RESULT } = await import("./sms");
const { syncComplaints } = await import("@/lib/complaint-progress");
const { MANU_DEPTS } = await import("./constants");
const { POST: track } = await import("@/app/api/track/route");

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "manu-")); process.env.PETITION_UPLOAD_DIR = dir; process.env.DATA_BACKEND = "aws"; });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const reading = (o: Partial<Reading> = {}): Reading => ({ name: "க. பார்வதி", mobile: "9000041873", door_no: "27", street: "ஜவஹர் தெரு", area_en: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", aadhaar_last4: null, subject: "கழிவுநீர் தொடர்பாக",
  problem_en: "Sewage overflowing on the street", request_en: "Clear the block", language: "ta", department: "CMWSSB", category: "DRAINAGE_SEWAGE", urgent: false, unsure_fields: ["mobile"], full_text: "அனுப்புநர்: க. பார்வதி", ...o });
const fields = (o: Record<string, unknown> = {}) => ({ name: "க. பார்வதி", mobile: "9000041873", door: "27", street: "ஜவஹர் தெரு", area: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", subject: "கழிவுநீர் தொடர்பாக", problem: "Sewage overflowing on the street", request: "Clear the block", dept: "CMWSSB", urgent: false, fullText: "அனுப்புநர்: க. பார்வதி", ...o }) as never;

function buildTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT, first_reported_at TEXT, last_update_at TEXT, ward_no INT, zone_no INT, zone_name TEXT, taluk_code TEXT, lat REAL, lon REAL, loc_precision_m REAL,
      place_text TEXT, member_count INT, sources TEXT, channels TEXT, citizen_complaints INT, status_std TEXT, is_open INT, severity_level TEXT, sla_hours REAL, sla_due_at TEXT, priority_score REAL, attention_flag INT, attention_reason TEXT, recurrence_90d INT, title TEXT, headline TEXT, summary TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT, title TEXT, channel TEXT, reporter_hash TEXT, ward_no INT);
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
      attached INT NOT NULL DEFAULT 0, filed_by TEXT, filed_at TEXT, due_at TEXT, reject_reason TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, rejected_stage TEXT, remarks TEXT, user_id INT, first_name TEXT NOT NULL, gender TEXT NOT NULL, street_address TEXT NOT NULL, pincode TEXT, mobile_number TEXT, zone_id INT NOT NULL, ward_number INT NOT NULL, ward_source TEXT, specific_location TEXT,
      department_id INT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, is_anonymous INT NOT NULL, needs_manual_review INT NOT NULL, status TEXT NOT NULL, is_synthetic INT NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INT, status TEXT, stage TEXT, remarks TEXT, changed_by INT, created_at TEXT);
    CREATE TABLE zone_wards (ward_number INT, zone_id INT); INSERT INTO zone_wards VALUES (70, 6);
    CREATE TABLE zones (id INT, zone_name TEXT); INSERT INTO zones VALUES (6, 'Thiru-Vi-Ka-Nagar');
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO departments VALUES (1, 'General Administration'), (2, 'Revenue Department'), (3, 'Electrical Department');
    CREATE TABLE gcc_areas (id INT, name TEXT); INSERT INTO gcc_areas VALUES (163, 'PERAMBUR');
    CREATE TABLE area_wards (area_id INT, ward_number INT, is_primary INT); INSERT INTO area_wards VALUES (163, 70, 1);
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT, department_id INT, dept_code TEXT, is_active INT, email_verified_at TEXT, email_verification_exempt INT, token_version INT, created_at TEXT, updated_at TEXT);
    CREATE TABLE petition_sms (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', result TEXT, detail TEXT, attempts INTEGER NOT NULL DEFAULT 0, tried_at TEXT, sent_at TEXT, created_at TEXT);
    CREATE UNIQUE INDEX petition_sms__one ON petition_sms (complaint_code, kind);
    CREATE TABLE officer_steps (incident_id TEXT, step TEXT, note TEXT, report_id INT, at TEXT);
    CREATE TABLE collector_decisions (incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT);
    CREATE TABLE officer_reports (report_id INT, incident_id TEXT, photo_dir TEXT, photos TEXT);`);
  buildTables(db);
  h.db = db;
  h.reading = reading();
  h.fail = false;
  h.smtp = false;
  h.mails = [];
  h.mailResult = { ok: true };
});

async function uploaded(): Promise<number> {
  const id = await createPetition({ pages: await savePages([JPG]), uploadedBy: 1, uploadedEmail: "petition@x" });
  for (let i = 0; i < 200 && (await getPetition(id))!.status === "reading"; i++) await new Promise((r) => setTimeout(r, 5));
  return id;
}
const one = (sql: string, ...p: unknown[]) => h.db.prepare(sql).get(...(p as never[])) as Record<string, any>;
const count = (sql: string, ...p: unknown[]) => Number(one(sql, ...p).n);
const trackAs = (body: unknown) => track(new NextRequest("http://x/api/track", { method: "POST", headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) }));

describe("a petition from photo to case", () => {
  it("is read and waits for a person: nothing is filed by the reader alone", async () => {
    const id = await uploaded();
    expect((await getPetition(id))!.status).toBe("needs_check");
    expect(count("SELECT COUNT(*) n FROM complaints")).toBe(0);
    expect((await deskList())[0]).toMatchObject({ id, status: "needs_check", unsure: 1, problem: "Sewage overflowing on the street" });
  });

  it("files into a complaint and a case the department can see at once", async () => {
    const id = await uploaded();
    const r = await filePetition(id, fields(), "petition@x");
    expect(r).toMatchObject({ dept: "Metrowater", attached: false });
    const c = one("SELECT * FROM complaints WHERE complaint_code = ?", r.code);
    expect(c).toMatchObject({ ward_number: 70, zone_id: 6, status: "Complaint Filed", user_id: null, gender: "Not stated" });
    const i = one("SELECT * FROM incidents WHERE incident_id = ?", caseIdFor(r.code));
    expect(i).toMatchObject({ lead_dept: "CMWSSB", is_open: 1, status_std: "Open", ward_no: 70, zone_name: "Thiru-Vi-Ka-Nagar", channels: "manu", citizen_complaints: 1, severity_level: "Medium", loc_precision_m: 500 });
    expect(i.lat).toBeCloseTo(13.11, 1);
    expect(i.place_text).toBe("ஜவஹர் தெரு, Perambur"); // no door number in what lists show
    expect(one("SELECT source_record_id x FROM events WHERE incident_id = ?", i.incident_id).x).toBe(r.code);
    expect(count("SELECT COUNT(*) n FROM incident_timeline WHERE incident_id = ?", i.incident_id)).toBe(1);
  });

  it("a double click gets the same slip, and one complaint", async () => {
    const id = await uploaded();
    const [a, b] = await Promise.all([filePetition(id, fields(), "x"), filePetition(id, fields(), "x")]);
    expect(a.code).toBe(b.code);
    expect(count("SELECT COUNT(*) n FROM complaints")).toBe(1);
  });

  it("an urgent petition is flagged for attention and gets a short deadline", async () => {
    const r = await filePetition(await uploaded(), fields({ urgent: true }), "x");
    expect(one("SELECT * FROM incidents WHERE incident_id = ?", caseIdFor(r.code))).toMatchObject({ severity_level: "High", attention_flag: 1, sla_hours: 48 });
  });

  it("refuses a ward that does not exist, and leaves the petition to be checked", async () => {
    const id = await uploaded();
    await expect(filePetition(id, fields({ ward: 199 }), "x")).rejects.toThrow(/not one of the Corporation/);
    expect((await getPetition(id))!.status).toBe("needs_check");
  });

  it("an Aadhaar number a person typed in is hidden too", async () => {
    const id = await uploaded();
    await filePetition(id, fields({ fullText: "ஆதார் 9999 4512 7731", problem: "Card 999945127731 sewage overflow" }), "x");
    const all = JSON.stringify([one("SELECT * FROM petitions WHERE id = ?", id), one("SELECT * FROM complaints"), one("SELECT * FROM incidents"), one("SELECT * FROM events")]);
    expect(all).not.toMatch(/9999\s?4512/);
  });

  it("when the reader fails, the petition stays for typing in and can be read again", async () => {
    h.fail = true;
    const id = await uploaded();
    expect(await getPetition(id)).toMatchObject({ status: "read_failed" });
    h.fail = false;
    expect(await readAgain(id)).toBe(true);
    for (let i = 0; i < 200 && (await getPetition(id))!.status === "reading"; i++) await new Promise((r) => setTimeout(r, 5));
    expect((await getPetition(id))!.status).toBe("needs_check");
  });

  it("deletes an unwanted upload and its photo, while it waits or even while it is being read", async () => {
    const id = await uploaded();
    const [name] = JSON.parse(String((await getPetition(id))!.pages));
    expect(await readPhoto(name)).not.toBeNull();
    expect(await deletePetition(id, "x")).toBe(true);
    expect(await getPetition(id)).toBeNull();
    expect(await readPhoto(name)).toBeNull();
    expect(count("SELECT COUNT(*) n FROM complaints")).toBe(0);
    expect(await deletePetition(id, "x")).toBe(false);
  });

  it("will not delete a petition once it is approved", async () => {
    const id = await uploaded();
    await filePetition(id, fields(), "x");
    expect(await deletePetition(id, "x")).toBe(false);
    expect((await getPetition(id))!.status).toBe("filed");
  });

  it("deletes one page and reads what is left again", async () => {
    const id = await createPetition({ pages: await savePages([JPG, JPG]), uploadedBy: 1, uploadedEmail: "petition@x" });
    for (let i = 0; i < 200 && (await getPetition(id))!.status === "reading"; i++) await new Promise((r) => setTimeout(r, 5));
    const [first, second] = JSON.parse(String((await getPetition(id))!.pages));
    expect(await deletePage(id, 5, "x")).toBe(false);
    expect(await deletePage(id, 1, "x")).toBe(true);
    expect(await readPhoto(second)).toBeNull();
    expect(await readPhoto(first)).not.toBeNull();
    expect(JSON.parse(String((await getPetition(id))!.pages))).toEqual([first]);
    for (let i = 0; i < 200 && (await getPetition(id))!.status === "reading"; i++) await new Promise((r) => setTimeout(r, 5));
    expect((await getPetition(id))!.status).toBe("needs_check");
    expect(await deletePage(id, 0, "x")).toBe(true); // the last page: the whole upload goes
    expect(await getPetition(id)).toBeNull();
  });

  it("suggests the ward from the area when the paper does not say", async () => {
    h.reading = reading({ ward: null });
    expect((await petitionDetail(await uploaded()))!.suggestedWard).toMatchObject({ ward: 70, area: "PERAMBUR", zone: "Thiru-Vi-Ka-Nagar" });
  });
});

describe("the same person again", () => {
  it("is told at the check, and can be added to the open case", async () => {
    const first = await filePetition(await uploaded(), fields(), "x");
    const id = await uploaded();
    const d = await petitionDetail(id);
    expect(d!.repeats!.headline).toContain("second petition on this problem");
    expect(d!.repeats!.attachTo).toBe(caseIdFor(first.code));
    const second = await filePetition(id, fields({ attachTo: caseIdFor(first.code) }), "x");
    expect(second.attached).toBe(true);
    const i = one("SELECT * FROM incidents WHERE incident_id = ?", caseIdFor(first.code));
    expect(i).toMatchObject({ member_count: 2, citizen_complaints: 2 });
    expect(count("SELECT COUNT(*) n FROM incidents")).toBe(1);
  });
});

describe("the public tracker", () => {
  it("opens with the slip's key or the mobile's last 4 digits, and shows no personal detail", async () => {
    const r = await filePetition(await uploaded(), fields(), "x");
    for (const body of [{ code: r.code, key: trackKey(r.code) }, { code: r.code, last4: "1873" }]) {
      const res = await trackAs(body);
      expect(res.status).toBe(200);
      const j = await res.json();
      expect(j).toMatchObject({ code: r.code, status: "Complaint Filed", department: "Metrowater" });
      expect(JSON.stringify(j)).not.toMatch(/பார்வதி|9000041873|ஜவஹர்/);
    }
  });
  it("gives one answer for a wrong number and a wrong mobile", async () => {
    const r = await filePetition(await uploaded(), fields(), "x");
    const [a, b] = await Promise.all([trackAs({ code: r.code, last4: "0000" }), trackAs({ code: "2026-999ZZZ", last4: "1873" })]);
    expect([a.status, b.status]).toEqual([404, 404]);
    expect((await a.json()).error).toBe((await b.json()).error);
  });
  it("a petition with no mobile opens only with the slip", async () => {
    const r = await filePetition(await uploaded(), fields({ mobile: "" }), "x");
    expect((await trackAs({ code: r.code, last4: "1873" })).status).toBe(404);
    expect((await trackAs({ code: r.code, key: trackKey(r.code) })).status).toBe(200);
  });
  it("follows the officer's work", async () => {
    const r = await filePetition(await uploaded(), fields(), "x");
    h.db.prepare("INSERT INTO officer_steps VALUES (?, 'approve', NULL, NULL, datetime('now', '+1 day'))").run(caseIdFor(r.code));
    expect((await (await trackAs({ code: r.code, key: trackKey(r.code) })).json()).status).toBe("Approved by Department Officer");
  });
});

describe("a new build", () => {
  const wrapBuild = () => { h.db.exec("DROP TABLE incidents; DROP TABLE events; DROP TABLE incident_members; DROP TABLE incident_timeline; DROP TABLE ref_wards; DROP TABLE ref_categories;"); buildTables(h.db); };

  it("gets every filed petition back as a case, attached ones included", async () => {
    const first = await filePetition(await uploaded(), fields(), "x");
    await filePetition(await uploaded(), fields({ attachTo: caseIdFor(first.code) }), "x");
    wrapBuild();
    await websiteCases(h.db);
    expect(one("SELECT * FROM incidents WHERE incident_id = ?", caseIdFor(first.code))).toMatchObject({ member_count: 2, lead_dept: "CMWSSB" });
    expect(count("SELECT COUNT(*) n FROM incidents")).toBe(1);
  });

  it("does not repeat a filing the pipeline already holds", async () => {
    const r = await filePetition(await uploaded(), fields(), "x");
    wrapBuild();
    h.db.prepare("INSERT INTO events (event_id, source, source_record_id, incident_id) VALUES ('GRV-P', 'grievance', ?, 'INC-P')").run(r.code);
    await websiteCases(h.db);
    expect(count("SELECT COUNT(*) n FROM incidents")).toBe(0);
  });

  it("brings an online complaint to the department too, and leaves generated ones out", async () => {
    h.db.exec(`INSERT INTO complaints (complaint_code, user_id, first_name, gender, street_address, zone_id, ward_number, department_id, title, description, is_anonymous, needs_manual_review, status, is_synthetic, created_at)
      VALUES ('2026-100AAA', 7, 'A', 'Male', 'Main Road', 6, 70, 3, 'Street light broken', 'It has been dark for days', 0, 0, 'Complaint Filed', 0, '2026-11-08 10:00:00'),
             ('2026-200BBB', NULL, 'B', 'Male', 'Main Road', 6, 70, 3, 'Generated', 'Generated', 0, 0, 'Complaint Filed', 1, '2026-11-08 10:00:00')`);
    await websiteCases(h.db);
    expect(one("SELECT * FROM incidents")).toMatchObject({ incident_id: caseIdFor("2026-100AAA"), lead_dept: "GCC-ELE", channels: "citizen_grievance", category_code: "OTHER" });
    expect(count("SELECT COUNT(*) n FROM incidents")).toBe(1);
  });

  it("an online complaint reaches the current build at once", async () => {
    await addCaseLive(onlineCase({ complaint_code: "2026-300CCC", created_at: "2026-11-09 10:00:00", title: "Street light broken", description: "Dark", ward_number: 70, street_address: "Main Road", user_id: 7 }, "Electrical Department"));
    expect(one("SELECT lead_dept x FROM incidents").x).toBe("GCC-ELE");
  });
});

describe("uploads", () => {
  it("takes photos by their first bytes, not their names", () => { expect(kindOf(JPG)).toBe("jpg"); expect(kindOf(Buffer.from("<html>not a photo</html>"))).toBeNull(); });
  it("refuses anything that is not a photo or PDF", async () => { await expect(savePages([Buffer.from("<script>alert(1)</script>")])).rejects.toBeInstanceOf(UploadError); });
  it("refuses a page too large for the reader", async () => { await expect(savePages([Buffer.concat([JPG, Buffer.alloc(5_000_000)])])).rejects.toThrow(/too large/); });
  it("refuses too many pages", async () => { await expect(savePages(Array(9).fill(JPG))).rejects.toThrow(/at most 8/); });
});

describe("the petition officer's login", () => {
  it("is there from the first sign-in, as a fixed login that opens only the desk", async () => {
    const { ensurePetitionLogin } = await import("./login");
    await ensurePetitionLogin("someone@else.com");
    expect(count("SELECT COUNT(*) n FROM users")).toBe(0);
    await ensurePetitionLogin("petition@chennai.gov.in");
    await ensurePetitionLogin("petition@chennai.gov.in");
    expect(count("SELECT COUNT(*) n FROM users")).toBe(1);
    const u = one("SELECT * FROM users");
    expect(u).toMatchObject({ role: "department_officer", dept_code: "COL-PET", is_active: 1 });
    expect(await bcrypt.compare("Petition@2026", String(u.password_hash))).toBe(true);
  });

  it("goes back to the fixed password if the account had another one", async () => {
    const { ensurePetitionLogin } = await import("./login");
    h.db.exec(`INSERT INTO users (email, password_hash, role, dept_code, is_active) VALUES ('petition@chennai.gov.in', 'made-earlier', 'department_officer', 'COL-PET', 1)`);
    await ensurePetitionLogin("petition@chennai.gov.in");
    expect(count("SELECT COUNT(*) n FROM users")).toBe(1);
    expect(await bcrypt.compare("Petition@2026", String(one("SELECT password_hash FROM users").password_hash))).toBe(true);
  });
  // QA pass 5, P5-005: putting the fixed password back must never switch a deactivated account on again. Before, any sign-in attempt with
  // the desk's email (no password needed) set is_active = 1 whenever the stored password differed, so "deactivate and change the password"
  // was undone by the next person to type the email.
  it("never switches a deactivated desk account back on", async () => {
    const { ensurePetitionLogin } = await import("./login");
    h.db.exec(`INSERT INTO users (email, password_hash, role, dept_code, is_active) VALUES ('petition@chennai.gov.in', 'changed-after-a-leak', 'department_officer', 'COL-PET', 0)`);
    await ensurePetitionLogin("petition@chennai.gov.in");
    expect(one("SELECT is_active FROM users")).toMatchObject({ is_active: 0 });
  });
});

// QA pass 5, P5-007: what the officer types on the check screen is masked wherever it is stored, not only in petitions.address
describe("an Aadhaar number typed into the address", () => {
  it("is masked in the complaint, the petition and the case", async () => {
    const r = await filePetition(await uploaded(), fields({ door: "9999 4512 7731", street: "Aadhaar 9999 4512 7731, Jawahar St" }), "x");
    const all = JSON.stringify([one("SELECT * FROM petitions WHERE complaint_code = ?", r.code), one("SELECT * FROM complaints WHERE complaint_code = ?", r.code), one("SELECT * FROM incidents"), one("SELECT * FROM events")]);
    expect(all).not.toMatch(/9999\s?4512/);
  });
});

describe("a Manu among the other complaints", () => {
  it("added to an online complaint's case, the case shows both ways it came in", async () => {
    await addCaseLive(onlineCase({ complaint_code: "2026-300CCC", created_at: "2026-11-09 10:00:00", title: "Street light broken", description: "Dark", ward_number: 70, street_address: "Main Road", user_id: 7 }, "Electrical Department"));
    await filePetition(await uploaded(), fields({ attachTo: caseIdFor("2026-300CCC") }), "x");
    expect(one("SELECT channels FROM incidents")).toMatchObject({ channels: "citizen_grievance|manu" });
    expect(h.db.prepare("SELECT source, channel FROM incident_members ORDER BY channel").all()).toEqual([{ source: "grievance", channel: "citizen_grievance" }, { source: "grievance", channel: "manu" }]);
  });
});

describe("the SMS to the person who wrote it", () => {
  const SET = { MSG91_AUTH_KEY: "key", MSG91_SENDER: "CHNCOL", MSG91_TEMPLATE_RECEIVED_EN: "t-re", MSG91_TEMPLATE_RECEIVED_TA: "t-rt", MSG91_TEMPLATE_CLOSED_EN: "t-ce", MSG91_TEMPLATE_CLOSED_TA: "t-ct" };
  const gateway = (body: unknown = { type: "success", message: "req1" }) => {
    const f = vi.fn(async () => new Response(JSON.stringify(body)));
    vi.stubGlobal("fetch", f);
    return f;
  };
  const sent = (f: ReturnType<typeof gateway>, k = 0) => {
    const [url, init] = (f.mock.calls[k] as unknown as [string, RequestInit]);
    return { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
  };
  const on = () => Object.assign(process.env, SET, { SMS_MODE: "live" });
  const testMode = () => { h.smtp = true; process.env.EMAIL_SANDBOX_TO = "team@x.in"; };
  // Each test starts from no SMS setting at all, whatever the process was started with (a QA run sets AWS_STORE_DRY_RUN=1) and in
  // whatever order the tests run (QA pass 5, P5-004: shuffled, the live-mode test ran first under the ambient dry run and failed).
  const clear = () => { for (const k of [...Object.keys(SET), "SMS_TEST_NUMBER", "AWS_STORE_DRY_RUN", "SMS_MODE", "EMAIL_SANDBOX_TO"]) delete process.env[k]; };
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => { for (const k of [...Object.keys(SET), "SMS_TEST_NUMBER", "AWS_STORE_DRY_RUN", "SMS_MODE", "EMAIL_SANDBOX_TO"]) saved[k] = process.env[k]; });
  afterAll(() => { clear(); for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v; });
  beforeEach(clear);
  afterEach(() => { clear(); vi.unstubAllGlobals(); });

  it("sends nothing until the service is set up, and says so", async () => {
    const f = gateway();
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(f).not.toHaveBeenCalled();
    expect(r.sms).toEqual({ state: "off", last4: "1873" });
  });

  it("tells the writer once when it is approved, in the petition's language", async () => {
    on();
    const f = gateway();
    const id = await uploaded();
    const r = await filePetition(id, fields(), "x");
    expect(r.sms).toEqual({ state: "sent", last4: "1873" });
    expect(f).toHaveBeenCalledTimes(1);
    const c = sent(f);
    expect(c.url).toBe("https://control.msg91.com/api/v5/flow/");
    expect(c.headers.authkey).toBe("key");
    expect(c.body).toMatchObject({ template_id: "t-rt", sender: "CHNCOL", recipients: [{ mobiles: "919000041873", var1: r.code, var2: "Metrowater" }] });
    expect(JSON.stringify(c.body)).not.toContain("Sewage"); // the number and the department, no details of the complaint
    await filePetition(id, fields(), "x");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("uses the English message for an English petition", async () => {
    on();
    const f = gateway();
    h.reading = { ...(h.reading as Reading), language: "en" };
    await filePetition(await uploaded(), fields(), "x");
    expect(sent(f).body.template_id).toBe("t-re");
  });

  it("sends nothing without a valid mobile number", async () => {
    on();
    const f = gateway();
    const r = await filePetition(await uploaded(), fields({ mobile: "" }), "x");
    expect(f).not.toHaveBeenCalled();
    expect(r.sms.state).toBe("none");
  });

  it("goes to the test number while one is set", async () => {
    on();
    process.env.SMS_TEST_NUMBER = "9876500000";
    const f = gateway();
    await filePetition(await uploaded(), fields(), "x");
    expect(sent(f).body.recipients[0].mobiles).toBe("919876500000");
  });

  it("never sends from a test copy of the site", async () => {
    on();
    process.env.AWS_STORE_DRY_RUN = "1";
    const f = gateway();
    await filePetition(await uploaded(), fields(), "x");
    expect(f).not.toHaveBeenCalled();
  });

  it("a failed send does not stop the approval, and is tried again later", async () => {
    on();
    gateway({ type: "error", message: "flow id missing" });
    const id = await uploaded();
    const r = await filePetition(id, fields(), "x");
    expect((await getPetition(id))!.status).toBe("filed");
    expect(r.sms.state).toBe("failed");
    expect(one("SELECT * FROM petition_sms")).toMatchObject({ status: "failed", attempts: 1, detail: "flow id missing" });
    const again = gateway();
    await retryFailedSms();
    expect(again).not.toHaveBeenCalled(); // too soon
    h.db.exec("UPDATE petition_sms SET tried_at = '2026-01-01 00:00:00'");
    await retryFailedSms();
    expect(again).toHaveBeenCalledTimes(1);
    expect(one("SELECT * FROM petition_sms")).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("tells the writer once when the department closes it", async () => {
    on();
    const f = gateway();
    const r = await filePetition(await uploaded(), fields(), "x");
    f.mockClear();
    h.db.prepare("INSERT INTO officer_steps VALUES (?, 'close', NULL, NULL, datetime('now', '+1 day'))").run(caseIdFor(r.code));
    await syncComplaints([caseIdFor(r.code)], 1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(sent(f).body).toMatchObject({ template_id: "t-ct", recipients: [{ var1: r.code, var2: "பணி முடிக்கப்பட்டது" }] });
    await syncComplaints([caseIdFor(r.code)], 1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("test mode: the exact message goes to the team inbox and no phone is contacted", async () => {
    testMode();
    const f = gateway();
    const id = await uploaded();
    const r = await filePetition(id, fields(), "x");
    expect(f).not.toHaveBeenCalled();
    expect(r.sms).toEqual({ state: "test", last4: "1873" });
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0]).toMatchObject({ to: "team@x.in", subject: "[Test SMS] to 9000041873" });
    expect(h.mails[0].html).toContain("Nothing was sent to this phone");
    expect(h.mails[0].html).toContain(`மனு பதிவு செய்யப்பட்டது. எண் ${r.code}. அனுப்பப்பட்ட துறை Metrowater.`);
    expect(one("SELECT * FROM petition_sms")).toMatchObject({ kind: "received", status: "test", attempts: 1 });
    await filePetition(id, fields(), "x");
    expect(h.mails).toHaveLength(1);
  });

  it("test mode: the closing message goes to the team inbox too", async () => {
    testMode();
    const r = await filePetition(await uploaded(), fields(), "x");
    h.db.prepare("INSERT INTO officer_steps VALUES (?, 'close', NULL, NULL, datetime('now', '+1 day'))").run(caseIdFor(r.code));
    await syncComplaints([caseIdFor(r.code)], 1);
    expect(h.mails).toHaveLength(2);
    expect(h.mails[1].html).toContain(`${r.code}: பணி முடிக்கப்பட்டது.`);
  });

  it("test mode: a mail that fails does not stop the approval, and is tried again", async () => {
    testMode();
    h.mailResult = { ok: false, reason: "send_failed", detail: "mail server down" };
    const id = await uploaded();
    const r = await filePetition(id, fields(), "x");
    expect((await getPetition(id))!.status).toBe("filed");
    expect(r.sms.state).toBe("failed");
    h.mailResult = { ok: true };
    h.db.exec("UPDATE petition_sms SET tried_at = '2026-01-01 00:00:00'");
    await retryFailedSms();
    expect(one("SELECT * FROM petition_sms")).toMatchObject({ status: "test", attempts: 2 });
  });

  it("is off without an email account or a team inbox, and live without its keys sends nothing", async () => {
    h.smtp = true; // an email account but no team inbox
    expect(smsMode()).toBe("off");
    testMode();
    expect(smsMode()).toBe("test");
    process.env.SMS_MODE = "live"; // asked for real SMS with no keys: never falls back to pretending
    expect(smsMode()).toBe("off");
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(h.mails).toHaveLength(0);
    expect(r.sms.state).toBe("off");
  });

  it("a test copy of the site sends no test mail either", async () => {
    testMode();
    process.env.AWS_STORE_DRY_RUN = "1";
    await filePetition(await uploaded(), fields(), "x");
    expect(h.mails).toHaveLength(0);
  });

  it("does nothing for a complaint that did not come from a Manu", async () => {
    on();
    const f = gateway();
    await sendPetitionSms("2026-000AAA", "closed", "done");
    expect(f).not.toHaveBeenCalled();
  });

  it("every message fits DLT's 30 characters a variable", () => {
    for (const d of MANU_DEPTS) expect(d.label.length).toBeLessThanOrEqual(30);
    for (const r of Object.values(SMS_RESULT)) for (const t of Object.values(r)) expect(t.length).toBeLessThanOrEqual(30);
  });
});
