/**
 * QA pass 6, P5-022, P5-023, P5-024: what the petition SMS records and what the desk is told, on the real code path (sms.ts, petitions.ts).
 * The harness is the sms-ocr hunter's from pass 5 (tests/qa/pass5/known-failures/sms.probe.test.ts): only `fetch` and the mailer are
 * replaced (plus the database: in-memory SQLite through the store's own MySQL translation). The fetch stub never calls the real fetch.
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
const TOUCHED = [...Object.keys(KEYS), "AWS_STORE_SAVE", "SMTP_HOST", "SMS_MODE", "SMS_TEST_NUMBER", "AWS_STORE_DRY_RUN", "SMTP_USER", "SMTP_PASS", "EMAIL_SANDBOX_TO"];
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
const live = () => Object.assign(process.env, KEYS, { SMS_MODE: "live", AWS_STORE_DRY_RUN: "", AWS_STORE_SAVE: "1" }); // the one copy that saves (P5-012)
const testMode = () => Object.assign(process.env, { SMS_MODE: "test", AWS_STORE_DRY_RUN: "", AWS_STORE_SAVE: "1", SMTP_HOST: "mail.test", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_SANDBOX_TO: "team@x.in" });

const success = async () => new Response(JSON.stringify({ type: "success", message: "req" }));
const due = () => h.db.exec(`UPDATE petition_sms SET tried_at = '2026-01-01 00:00:00'`);
const rowOf = (code: string) => one("SELECT status, detail, attempts FROM petition_sms WHERE complaint_code = ? AND kind = 'received'", code);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("QA pass 6: a petition SMS the provider may already have taken is never sent twice (P5-022)", () => {
  it("a send that timed out after it went out is 'unsure': the sweep does not send it again, and the desk says so", async () => {
    live();
    answer = async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); };
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(msg91()).toHaveLength(1);
    expect(rowOf(r.code).status).toBe("unsure");
    expect(r.sms.state).toBe("unsure");
    answer = success;
    due();
    await sms.retryFailedSms();
    expect(msg91()).toHaveLength(1);
  });

  it("a 200 answer that is not the provider's JSON is 'unsure' and is not sent again", async () => {
    live();
    answer = async () => new Response("<html>OK</html>", { status: 200 });
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(rowOf(r.code).status).toBe("unsure");
    answer = success;
    due();
    await sms.retryFailedSms();
    expect(msg91()).toHaveLength(1);
  });

  it("a send the provider refused, or that never connected, is still 'failed' and tried again", async () => {
    live();
    answer = async () => new Response(JSON.stringify({ type: "error", message: "gateway down" }));
    const a = await filePetition(await uploaded(), fields(), "x");
    expect(a.sms.state).toBe("failed");
    answer = async () => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) }); };
    const b = await filePetition(await uploaded(), fields({ mobile: "9000041874" }), "x");
    expect(rowOf(b.code).status).toBe("failed");
    answer = async () => new Response("Service Unavailable", { status: 503 });
    const c = await filePetition(await uploaded(), fields({ mobile: "9000041875" }), "x");
    expect(rowOf(c.code).status).toBe("failed");
    answer = success;
    calls = [];
    due();
    await sms.retryFailedSms();
    expect(msg91()).toHaveLength(3);
    for (const x of [a, b, c]) expect(rowOf(x.code).status).toBe("sent");
  });
});

describe("QA pass 6: approval does not wait on the SMS without a limit, and the desk never calls a send in flight 'failed' (P5-023)", () => {
  it("in test mode, an approval whose mail never answers returns within the inline wait; the desk says the SMS is being sent", async () => {
    testMode();
    h.mailImpl = () => new Promise(() => undefined); // an SMTP server that never answers
    const id = await uploaded();
    const t0 = Date.now();
    const outcome = await Promise.race([filePetition(id, fields(), "x"), sleep(sms.SMS_LIMITS.inlineWaitMs + 3000).then(() => null)]);
    expect(outcome, "the approval was still waiting on the mail").not.toBeNull();
    expect(Date.now() - t0).toBeLessThan(sms.SMS_LIMITS.inlineWaitMs + 2000);
    expect(one("SELECT status FROM petitions WHERE id = ?", id).status).toBe("filed");
    expect(outcome!.sms.state).toBe("sending");
    expect((await sms.smsNote(outcome!.code)).state).toBe("sending");
  });

  it("a send that never answers is given up after its own time limit and left for the sweep, not held forever", async () => {
    testMode();
    const saved = { ...sms.SMS_LIMITS };
    sms.SMS_LIMITS.inlineWaitMs = 50;
    sms.SMS_LIMITS.sendMs = 300;
    try {
      h.mailImpl = () => new Promise(() => undefined);
      const r = await filePetition(await uploaded(), fields(), "x");
      expect(r.sms.state).toBe("sending");
      await sleep(800);
      expect(rowOf(r.code).status).toBe("failed");
      expect((await sms.smsNote(r.code)).state).toBe("failed");
      h.mailImpl = null;
      due();
      await sms.retryFailedSms();
      expect(rowOf(r.code).status).toBe("test");
    } finally {
      Object.assign(sms.SMS_LIMITS, saved);
    }
  });

  it("a fresh send in flight is not picked by the sweep in another process", async () => {
    live();
    let release: () => void = () => undefined;
    answer = () => new Promise<Response>((res) => { release = () => res(new Response(JSON.stringify({ type: "success", message: "req" }))); });
    const saved = { ...sms.SMS_LIMITS };
    sms.SMS_LIMITS.inlineWaitMs = 50;
    try {
      const r = await filePetition(await uploaded(), fields(), "x");
      expect(rowOf(r.code).status).toBe("sending");
      await sms.retryFailedSms();
      expect(msg91()).toHaveLength(1);
      release();
      await sleep(50);
      expect(rowOf(r.code).status).toBe("sent");
    } finally {
      Object.assign(sms.SMS_LIMITS, saved);
    }
  });
});

describe("QA pass 6: with SMS_TEST_NUMBER the desk names the test number, not the petitioner's (P5-024)", () => {
  it("the note says the SMS went to the test number's last 4, and the petitioner got nothing", async () => {
    live();
    process.env.SMS_TEST_NUMBER = "9876500000";
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(msg91()[0].body.recipients[0].mobiles).toBe("919876500000");
    expect(r.sms).toEqual({ state: "testnumber", last4: "0000" });
    // the note is what was done at the time, not what the setting says now
    process.env.SMS_TEST_NUMBER = "";
    expect(await sms.smsNote(r.code)).toEqual({ state: "testnumber", last4: "0000" });
  });

  it("without a test number, a live send still names the petitioner's last 4", async () => {
    live();
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(r.sms).toEqual({ state: "sent", last4: "1873" });
  });
});

describe("QA pass 6, P6-010 (reviewer 1 on the P5-022/P5-023 fix): closing many petitions, and a send cut off by a restart", () => {
  it("one decision that closes three petition cases waits the inline limit once, not once per petition", async () => {
    testMode();
    const saved = { ...sms.SMS_LIMITS };
    sms.SMS_LIMITS.inlineWaitMs = 300;
    sms.SMS_LIMITS.sendMs = 60_000;
    try {
      const codes: string[] = [];
      for (const m of ["9000041873", "9000041874", "9000041875"]) codes.push((await filePetition(await uploaded(), fields({ mobile: m }), "x")).code);
      h.mailImpl = () => new Promise(() => undefined); // the team inbox stops answering before the cases close
      for (const c of codes) step(c, "close", 1);
      const t0 = Date.now();
      await syncComplaints(codes.map(caseIdFor), 1);
      expect(Date.now() - t0).toBeLessThan(sms.SMS_LIMITS.inlineWaitMs + 250);
    } finally {
      Object.assign(sms.SMS_LIMITS, saved);
    }
  });

  it("a row left 'sending' by a server that stopped mid-send is not sent again an hour later: it is 'unsure'", async () => {
    live();
    h.db.prepare(`INSERT INTO petitions (status, pages, mobile, language, dept_code, complaint_code) VALUES ('filed', '[]', '9000011111', 'en', 'CMWSSB', '2026-777AAA')`).run();
    h.db.prepare(`INSERT INTO petition_sms (complaint_code, kind, status, attempts, tried_at, created_at) VALUES ('2026-777AAA', 'received', 'sending', 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`).run();
    await sms.retryFailedSms();
    expect(msg91()).toHaveLength(0);
    expect(rowOf("2026-777AAA").status).toBe("unsure");
  });

  it("a fresh 'sending' row (a send in flight) is left alone", async () => {
    live();
    h.db.prepare(`INSERT INTO petitions (status, pages, mobile, language, dept_code, complaint_code) VALUES ('filed', '[]', '9000011112', 'en', 'CMWSSB', '2026-778AAA')`).run();
    h.db.prepare(`INSERT INTO petition_sms (complaint_code, kind, status, attempts, tried_at, created_at) VALUES ('2026-778AAA', 'received', 'sending', 0, datetime('now', '+330 minutes'), datetime('now', '+330 minutes'))`).run();
    await sms.retryFailedSms();
    expect(msg91()).toHaveLength(0);
    expect(rowOf("2026-778AAA").status).toBe("sending");
  });
});
