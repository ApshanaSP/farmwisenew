/**
 * QA pass 5, hunter sms-ocr: the petition SMS on every path (approve, close, retry). Only `fetch` and the mailer are replaced (plus the
 * database, an in-memory SQLite through the store's own MySQL translation, and the collector audit log, which has no table here).
 * The fetch stub never calls the real fetch: nothing leaves this process.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, mails: [] as { to: string; subject: string; html: string }[], mailImpl: null as null | (() => Promise<unknown>) }));
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
// the mailer: same rule for "configured" as the real one, but nothing is ever submitted
vi.mock("@/lib/mailer", () => ({
  isSmtpConfigured: () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  sendMail: async (to: string, subject: string, html: string) => { h.mails.push({ to, subject, html }); return h.mailImpl ? h.mailImpl() : { ok: true }; }
}));

const { createPetition, filePetition, getPetition } = await import("@/lib/manu/petitions");
const { savePages } = await import("@/lib/manu/files");
const { caseIdFor } = await import("@/lib/manu/cases");
const sms = await import("@/lib/manu/sms");
const { syncComplaints } = await import("@/lib/complaint-progress");

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
const KEYS = { MSG91_AUTH_KEY: "key", MSG91_SENDER: "CHNCOL", MSG91_TEMPLATE_RECEIVED_EN: "t-re", MSG91_TEMPLATE_RECEIVED_TA: "t-rt", MSG91_TEMPLATE_CLOSED_EN: "t-ce", MSG91_TEMPLATE_CLOSED_TA: "t-ct" };
const TOUCHED = [...Object.keys(KEYS), "SMS_MODE", "SMS_TEST_NUMBER", "AWS_STORE_DRY_RUN", "SMTP_USER", "SMTP_PASS", "EMAIL_SANDBOX_TO"];
const saved: Record<string, string | undefined> = {};
let dir = "";
beforeAll(() => { for (const k of TOUCHED) saved[k] = process.env[k]; dir = fs.mkdtempSync(path.join(os.tmpdir(), "p5-sms-")); process.env.PETITION_UPLOAD_DIR = dir; process.env.DATA_BACKEND = "aws"; });
afterAll(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } fs.rmSync(dir, { recursive: true, force: true }); });

/** Every outward call, recorded and never made. msg91 answers with `answer`; anything else (PaddleOCR) is refused. */
type Call = { url: string; body: any };
let calls: Call[] = [];
let answer: (c: Call) => Promise<Response> = async () => new Response(JSON.stringify({ type: "success", message: "req" }));
const msg91 = () => calls.filter((c) => c.url.includes("msg91"));
const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
  const c = { url: String(url), body: (() => { try { return JSON.parse(String(init?.body)); } catch { return null; } })() };
  calls.push(c);
  if (c.url.includes("msg91")) return answer(c);
  throw new TypeError("fetch failed (probe: no outward calls)");
});

const fields = (o: Record<string, unknown> = {}) => ({ name: "க. பார்வதி", mobile: "9000041873", door: "27", street: "ஜவஹர் தெரு", area: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", subject: "கழிவுநீர் தொடர்பாக", problem: "Sewage overflowing on the street", request: "Clear the block", dept: "CMWSSB", urgent: false, fullText: "அனுப்புநர்: க. பார்வதி மனு", ...o }) as never;

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
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO departments VALUES (1, 'General Administration');
    CREATE TABLE gcc_areas (id INT, name TEXT); INSERT INTO gcc_areas VALUES (163, 'PERAMBUR');
    CREATE TABLE area_wards (area_id INT, ward_number INT, is_primary INT); INSERT INTO area_wards VALUES (163, 70, 1);
    CREATE TABLE petition_sms (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', result TEXT, detail TEXT, attempts INTEGER NOT NULL DEFAULT 0, tried_at TEXT, sent_at TEXT, created_at TEXT);
    CREATE UNIQUE INDEX petition_sms__one ON petition_sms (complaint_code, kind);
    CREATE TABLE officer_steps (incident_id TEXT, step TEXT, note TEXT, report_id INT, at TEXT);
    CREATE TABLE collector_decisions (incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT);
    CREATE TABLE officer_reports (report_id INT, incident_id TEXT, photo_dir TEXT, photos TEXT);
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT, first_reported_at TEXT, last_update_at TEXT, ward_no INT, zone_no INT, zone_name TEXT, taluk_code TEXT, lat REAL, lon REAL, loc_precision_m REAL,
      place_text TEXT, member_count INT, sources TEXT, channels TEXT, citizen_complaints INT, status_std TEXT, is_open INT, severity_level TEXT, sla_hours REAL, sla_due_at TEXT, priority_score REAL, attention_flag INT, attention_reason TEXT, recurrence_90d INT, title TEXT, headline TEXT, summary TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT, title TEXT, channel TEXT, reporter_hash TEXT, ward_no INT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, source_record_id TEXT, channel TEXT, reported_at TEXT, title TEXT);
    CREATE TABLE incident_timeline (event_id TEXT, at TEXT, step TEXT, status_std TEXT, actor TEXT, note TEXT, source TEXT, incident_id TEXT);
    CREATE TABLE ref_wards (ward_no INT PRIMARY KEY, zone_no INT, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    INSERT INTO ref_wards VALUES (70, 6, 'Thiru-Vi-Ka-Nagar', 'TLK-PER', 13.11, 80.23);
    CREATE TABLE ref_categories (category_code TEXT PRIMARY KEY, label TEXT, family TEXT);
    INSERT INTO ref_categories VALUES ('DRAINAGE_SEWAGE', 'Drainage & sewage', 'DRAINAGE'), ('OTHER', 'Other', 'OTHER');`);
  h.db = db;
  h.mails = [];
  h.mailImpl = null;
  calls = [];
  answer = async () => new Response(JSON.stringify({ type: "success", message: "req" }));
  fetchStub.mockClear();
  vi.stubGlobal("fetch", fetchStub);
  // back to the QA settings of vitest.p5probe.config.ts each time
  for (const k of TOUCHED) process.env[k] = "";
  process.env.AWS_STORE_DRY_RUN = "1";
  process.env.SMS_MODE = "off";
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const one = (sql: string, ...p: unknown[]) => h.db.prepare(sql).get(...(p as never[])) as Record<string, any>;
async function uploaded(): Promise<number> {
  const id = await createPetition({ pages: await savePages([JPG]), uploadedBy: 1, uploadedEmail: "petition@x" });
  for (let i = 0; i < 400 && (await getPetition(id))!.status === "reading"; i++) await new Promise((r) => setTimeout(r, 5));
  return id;
}
const step = (code: string, s: string, plusDays: number) => h.db.prepare(`INSERT INTO officer_steps VALUES (?, ?, NULL, NULL, datetime('now', '+330 minutes', '+${plusDays} day'))`).run(caseIdFor(code), s);
const decide = (code: string, d: string, plusDays: number) => h.db.prepare(`INSERT INTO collector_decisions VALUES (?, ?, NULL, 'collector', datetime('now', '+330 minutes', '+${plusDays} day'))`).run(caseIdFor(code), d);
const oldFailed = (code: string, kind: string, result: string | null = null) =>
  h.db.prepare(`INSERT INTO petition_sms (complaint_code, kind, status, result, detail, attempts, tried_at, created_at) VALUES (?, ?, 'failed', ?, 'x', 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`).run(code, kind, result);
const live = () => Object.assign(process.env, KEYS, { SMS_MODE: "live", AWS_STORE_DRY_RUN: "" });
const everything = () => Object.assign(process.env, KEYS, { SMS_MODE: "live", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_SANDBOX_TO: "team@x.in", SMS_TEST_NUMBER: "9876500000" });

async function allThreePaths(): Promise<string> {
  const r = await filePetition(await uploaded(), fields(), "x"); // approve
  step(r.code, "close", 1);
  await syncComplaints([caseIdFor(r.code)], 1); // close
  oldFailed("2026-999ZZZ", "received");
  h.db.prepare(`INSERT INTO petitions (status, pages, mobile, language, dept_code, complaint_code) VALUES ('filed', '[]', '9000011111', 'ta', 'CMWSSB', '2026-999ZZZ')`).run();
  h.db.exec(`UPDATE petition_sms SET status = 'failed', tried_at = '2026-01-01 00:00:00'`); // every row due for the sweep
  await sms.retryFailedSms(); // retry
  return r.code;
}

describe("QA settings (AWS_STORE_DRY_RUN=1, SMS_MODE=off, MSG91 blank): nothing leaves on any path", () => {
  it("approve, close and retry: no msg91 fetch, no sendMail", async () => {
    expect(sms.smsMode()).toBe("off");
    await allThreePaths();
    expect(msg91()).toHaveLength(0);
    expect(h.mails).toHaveLength(0);
  });
  it("still nothing when every other SMS and mail setting is filled in, as long as AWS_STORE_DRY_RUN=1", async () => {
    everything();
    expect(sms.smsMode()).toBe("off");
    await allThreePaths();
    expect(msg91()).toHaveLength(0);
    expect(h.mails).toHaveLength(0);
  });
});

describe("live with SMS_TEST_NUMBER: every path goes to the test number", () => {
  it("approve, close and retry all address 919876500000", async () => {
    live();
    process.env.SMS_TEST_NUMBER = "9876500000";
    await allThreePaths();
    expect(msg91().length).toBeGreaterThanOrEqual(3);
    expect(new Set(msg91().map((c) => c.body.recipients[0].mobiles))).toEqual(new Set(["919876500000"]));
  });
});

describe("findings", () => {
  it("F: SMS_MODE=off does not turn SMS off: with an email account and a team inbox it sends a test mail per approval", async () => {
    Object.assign(process.env, { AWS_STORE_DRY_RUN: "", SMS_MODE: "off", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_SANDBOX_TO: "team@x.in" });
    expect(sms.smsMode()).toBe("test");
    await filePetition(await uploaded(), fields(), "x");
    expect(h.mails).toHaveLength(1);
    console.log("[F off] mail subject:", h.mails[0].subject);
  });

  it("F: with SMS_TEST_NUMBER the desk says 'sent' to the petitioner's last 4, though the petitioner got nothing", async () => {
    live();
    process.env.SMS_TEST_NUMBER = "9876500000";
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(msg91()[0].body.recipients[0].mobiles).toBe("919876500000");
    expect(r.sms).toEqual({ state: "sent", last4: "1873" });
    console.log("[F testnum] desk note:", JSON.stringify(r.sms), "actually sent to", msg91()[0].body.recipients[0].mobiles, "var2 of the Tamil template:", msg91()[0].body.recipients[0].var2);
  });

  it("F: the closing SMS is frozen at the first close: a Collector reopen and reject after the department's close sends nothing", async () => {
    live();
    const r = await filePetition(await uploaded(), fields(), "x");
    step(r.code, "close", 1);
    await syncComplaints([caseIdFor(r.code)], 1);
    decide(r.code, "reopen", 2);
    await syncComplaints([caseIdFor(r.code)], 1);
    decide(r.code, "reject", 3);
    await syncComplaints([caseIdFor(r.code)], 1);
    const status = one("SELECT status FROM complaints WHERE complaint_code = ?", r.code).status;
    const closed = msg91().filter((c) => c.body.template_id === "t-ct");
    console.log("[F frozen] final status:", status, "closing SMS sent:", closed.map((c) => c.body.recipients[0].var2));
    expect(status).toBe("Rejected");
    expect(closed).toHaveLength(1);
    expect(closed[0].body.recipients[0].var2).toBe("பணி முடிக்கப்பட்டது"); // "the work is completed", the only message the writer gets
  });

  it("F: a failed 'rejected' closing SMS retried after the case was reopened and completed still says it could not be taken up", async () => {
    live();
    const r = await filePetition(await uploaded(), fields(), "x");
    answer = async () => new Response(JSON.stringify({ type: "error", message: "gateway down" }));
    decide(r.code, "reject", 1);
    await syncComplaints([caseIdFor(r.code)], 1);
    answer = async () => new Response(JSON.stringify({ type: "success", message: "req" }));
    decide(r.code, "reopen", 2);
    step(r.code, "close", 3);
    await syncComplaints([caseIdFor(r.code)], 1);
    h.db.exec(`UPDATE petition_sms SET tried_at = '2026-01-01 00:00:00'`);
    await sms.retryFailedSms();
    const status = one("SELECT status FROM complaints WHERE complaint_code = ?", r.code).status;
    const delivered = msg91().filter((c) => c.body.template_id === "t-ct").at(-1)!;
    console.log("[F stale] final status:", status, "closing SMS delivered:", delivered.body.recipients[0].var2);
    expect(status).toBe("Resolved by Department");
    expect(delivered.body.recipients[0].var2).toBe("ஏற்றுக்கொள்ள இயலவில்லை");
  });

  it("F: two server processes (two module instances) retry the same failed row: the writer gets it twice", async () => {
    live();
    const r = await filePetition(await uploaded(), fields(), "x");
    h.db.exec(`UPDATE petition_sms SET status = 'failed', tried_at = '2026-01-01 00:00:00'`);
    calls = [];
    answer = async () => { await new Promise((res) => setTimeout(res, 50)); return new Response(JSON.stringify({ type: "success", message: "req" })); };
    vi.resetModules();
    const other = await import("@/lib/manu/sms");
    expect(other).not.toBe(sms);
    await Promise.all([sms.retryFailedSms(), other.retryFailedSms()]);
    console.log("[F dup] sends of one message:", msg91().length, "row:", JSON.stringify(one("SELECT status, attempts FROM petition_sms WHERE complaint_code = ?", r.code)));
    expect(msg91()).toHaveLength(2);
    // in one process the flag holds
    calls = [];
    h.db.exec(`UPDATE petition_sms SET status = 'failed', tried_at = '2026-01-01 00:00:00'`);
    await Promise.all([sms.retryFailedSms(), sms.retryFailedSms()]);
    expect(msg91()).toHaveLength(1);
  });

  it("F: a provider that accepted but answered late (timeout) or not in JSON is counted failed and sent again", async () => {
    live();
    answer = async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); };
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(r.sms.state).toBe("failed");
    answer = async () => new Response("<html>OK</html>", { status: 200 });
    h.db.exec(`UPDATE petition_sms SET tried_at = '2026-01-01 00:00:00'`);
    await sms.retryFailedSms();
    const row = one("SELECT status, detail, attempts FROM petition_sms WHERE complaint_code = ?", r.code);
    answer = async () => new Response(JSON.stringify({ type: "success", message: "req" }));
    h.db.exec(`UPDATE petition_sms SET tried_at = '2026-01-01 00:00:00'`);
    await sms.retryFailedSms();
    console.log("[F resend] posts of the same message:", msg91().length, "after the HTML 200 the row said:", JSON.stringify(row));
    expect(msg91()).toHaveLength(3);
    expect(row.detail).toBe("HTTP 200");
  });

  it("F: in test mode an approval waits on the mail with no time limit, holding the petition; the desk calls the in-flight SMS 'failed'", async () => {
    Object.assign(process.env, { AWS_STORE_DRY_RUN: "", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_SANDBOX_TO: "team@x.in" });
    h.mailImpl = () => new Promise(() => undefined); // an SMTP server that never answers
    const id = await uploaded();
    const first = filePetition(id, fields(), "x");
    const outcome = await Promise.race([first.then(() => "returned"), new Promise((res) => setTimeout(() => res("still waiting after 3 s"), 3000))]);
    const code = String(one("SELECT complaint_code FROM petitions WHERE id = ?", id).complaint_code);
    const note = await sms.smsNote(code);
    console.log("[F hang] approval:", outcome, "petition status:", one("SELECT status FROM petitions WHERE id = ?", id).status, "desk SMS note while in flight:", JSON.stringify(note));
    expect(outcome).toBe("still waiting after 3 s");
    expect(note.state).toBe("failed");
  });

  it("checked: $ in a value is safe (function replacers); {#var#} inside the first value takes the second value's place", async () => {
    Object.assign(process.env, { AWS_STORE_DRY_RUN: "", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_SANDBOX_TO: "team@x.in" });
    h.db.prepare(`INSERT INTO petitions (status, pages, mobile, language, dept_code, complaint_code) VALUES ('filed', '[]', '9000011111', 'en', '$& $1', '2026-$&A')`).run();
    await sms.sendPetitionSms("2026-$&A", "received");
    h.db.prepare(`INSERT INTO petitions (status, pages, mobile, language, dept_code, complaint_code) VALUES ('filed', '[]', '9000022222', 'en', 'CMWSSB', '2026-{#var#}')`).run();
    await sms.sendPetitionSms("2026-{#var#}", "received");
    const text = (k: number) => h.mails[k]?.html.match(/<p style[^>]*>(.*)<\/p>/)?.[1];
    console.log("[checked $] text:", text(0), "| with {#var#} in the code:", text(1));
    expect(text(0)).toContain("Number 2026-$&amp;A. Sent to $&amp; $1.");
  });
});
