/**
 * Fix-all run after QA pass 6: the desk's approval, its SMS and its case. The harness is reviewer1's (tests/qa/pass6/known-failures/reviewer1/sms.probe.test.ts):
 * fetch and the mailer stubbed, in-memory SQLite through the store translation. Nothing leaves the machine.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ auditFails: false, db: null as unknown as DatabaseSync, mails: [] as { to: string; subject: string; html: string }[], mailImpl: null as null | (() => Promise<unknown>) }));
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
vi.mock("@/lib/collector/sources", () => ({ audit: async () => { if (h.auditFails) { h.auditFails = false; throw new Error("audit write failed (probe)"); } } }));
// the mailer: same rule for "configured" as the real one, but nothing is ever submitted
vi.mock("@/lib/mailer", () => ({
  isSmtpConfigured: () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  sendMail: async (to: string, subject: string, html: string) => { h.mails.push({ to, subject, html }); return h.mailImpl ? h.mailImpl() : { ok: true }; }
}));

const { createPetition, filePetition, getPetition, petitionDetail } = await import("@/lib/manu/petitions");
const { approvedWords } = await import("@/lib/manu/constants");
const { savePages } = await import("@/lib/manu/files");
const { caseIdFor, websiteCases } = await import("@/lib/manu/cases");
const sms = await import("@/lib/manu/sms");
const { findRepeats } = await import("@/lib/manu/repeat");
const { POST: track } = await import("@/app/api/track/route");
const trackAs = (body: unknown) => track(new NextRequest("http://x/api/track", { method: "POST", headers: { "x-forwarded-for": `10.9.1.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) }));
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

const withLimits = async (o: Partial<typeof sms.SMS_LIMITS>, fn: () => Promise<void>) => {
  const saved = { ...sms.SMS_LIMITS };
  Object.assign(sms.SMS_LIMITS, o);
  try { await fn(); } finally { Object.assign(sms.SMS_LIMITS, saved); }
};

// reviewer1-09: the 'registered' SMS row was made only at the very end of filePetition, so an approval that failed after the commit (here the
// audit write) never sent it, the retry's "already filed" answer did not either, and the desk then said the SMS service was not set up
describe("reviewer1-09: an approval that fails after the petition is filed still sends the 'registered' SMS", () => {
  it("live mode, the audit write throws once: the SMS goes once, and the retry's note says it went", async () => {
    live();
    const id = await uploaded();
    h.auditFails = true;
    await expect(filePetition(id, fields(), "x")).rejects.toThrow(/audit/);
    const again = await filePetition(id, fields(), "x"); // the officer presses Approve again
    due();
    await sms.retryFailedSms();
    expect(msg91().length).toBe(1);
    expect(again.sms.state).toBe("sent");
  });
  it("the server stopped between the commit and the send (no SMS row): the sweep queues and sends it once; the desk says 'sending', not 'not set up'", async () => {
    live();
    const { code } = await filePetition(await uploaded(), fields(), "x");
    expect(msg91().length).toBe(1);
    calls = [];
    h.db.exec(`DELETE FROM petition_sms`); // as if the process stopped before sendPetitionSms ran
    expect((await sms.smsNote(code)).state).toBe("sending");
    h.db.prepare(`UPDATE petitions SET filed_at = datetime('now', '+330 minutes', '-20 minutes')`).run();
    await sms.retryFailedSms();
    await sms.retryFailedSms();
    expect(msg91().length).toBe(1);
    expect(rowOf(code).status).toBe("sent");
  });
  it("the sweep does not text petitions older than a day, nor one filed in the last minutes (its own send is still running)", async () => {
    live();
    const a = (await filePetition(await uploaded(), fields(), "x")).code;
    const b = (await filePetition(await uploaded(), fields({ mobile: "9000041874" }), "x")).code;
    calls = [];
    h.db.exec(`DELETE FROM petition_sms`);
    h.db.prepare(`UPDATE petitions SET filed_at = datetime('now', '+330 minutes', '-2 days') WHERE complaint_code = ?`).run(a);
    await sms.retryFailedSms();
    expect(msg91().length).toBe(0);
    expect(one("SELECT COUNT(*) AS n FROM petition_sms WHERE complaint_code IN (?, ?)", a, b).n).toBe(0);
  });
  it("SMS off: nothing is queued, and the desk still says it is not set up", async () => {
    const { code } = await filePetition(await uploaded(), fields(), "x");
    h.db.exec(`DELETE FROM petition_sms`);
    h.db.prepare(`UPDATE petitions SET filed_at = datetime('now', '+330 minutes', '-20 minutes')`).run();
    await sms.retryFailedSms();
    expect(one("SELECT COUNT(*) AS n FROM petition_sms").n).toBe(0);
    expect((await sms.smsNote(code)).state).toBe("off");
  });
});

// P6-004: when the live add failed (any store error in addCaseLive), the desk still said the petition was added to the chosen case, though
// it joined no case in the build being served until the next build. This harness's collector_decisions has no decision_id, so the live
// attach's open-case read fails, as in the lead's probe (tests/qa/pass6/known-failures/lead/ml16.test.ts).
describe("P6-004: a petition the live build could not take is not called added", () => {
  it("attach fails: the approval says it joins the existing complaint at the next update; the petition keeps that case for the next build", async () => {
    const first = await filePetition(await uploaded(), fields(), "x");
    expect(first.inQueue).toBe(true);
    expect(approvedWords(first).title).toBe("Petition approved and forwarded");
    const id = await uploaded();
    const second = await filePetition(id, fields({ mobile: "9000041874", attachTo: caseIdFor(first.code) }), "x");
    expect(one("SELECT COUNT(*) AS n FROM events WHERE source_record_id = ?", second.code).n).toBe(0); // the live build did not take it
    expect(second.attached).toBe(true);
    expect(second.inQueue).toBe(false);
    expect(approvedWords(second).title).toBe("Petition approved; it joins the existing complaint at the next update");
    expect(approvedWords(second).where).toMatch(/at the next data update/);
    expect(approvedWords(second, true).title).toBe("Approved; it joins the existing complaint at the next update");
    expect(one("SELECT incident_id, attached FROM petitions WHERE id = ?", id)).toMatchObject({ incident_id: caseIdFor(first.code), attached: 1 });
    // opened again later, the desk reads the live build and says the same
    expect((await petitionDetail(id))!.approved).toMatchObject({ attached: true, inQueue: false });
  });
  it("attach works: added, in the queue now", async () => {
    h.db.exec(`DROP TABLE collector_decisions; CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT)`);
    const first = await filePetition(await uploaded(), fields(), "x");
    const second = await filePetition(await uploaded(), fields({ mobile: "9000041874", attachTo: caseIdFor(first.code) }), "x");
    expect(second).toMatchObject({ attached: true, inQueue: true });
    expect(approvedWords(second).title).toBe("Petition approved and added to the existing complaint");
    expect(approvedWords(second).where).toBe("is now with Metrowater and the Collector's Office.");
  });
  it("not on the AWS store (no live build): the wording is as before", async () => {
    process.env.DATA_BACKEND = "mysql";
    try {
      const a = await filePetition(await uploaded(), fields(), "x");
      expect(a.inQueue).toBeNull();
      expect(approvedWords(a).title).toBe("Petition approved and forwarded");
      expect(approvedWords({ ...a, attached: true }, true).title).toBe("Approved and added to the existing complaint");
    } finally { process.env.DATA_BACKEND = "aws"; }
  });
});

// reviewer1-07: a rebuild took petitions ORDER BY filed_at, id; filed_at has one-second resolution and id is the upload order, so a petition
// uploaded first that joined a case approved in the same second came before that case and got a case of its own
describe("reviewer1-07: the rebuild keeps a petition in the case it joined", () => {
  const withDecisionIds = () => h.db.exec(`DROP TABLE collector_decisions; CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT)`);
  const newBuild = () => h.db.exec(`DELETE FROM incidents; DELETE FROM events; DELETE FROM incident_members; DELETE FROM incident_timeline;`);
  it("B (uploaded first) joined A's case; both approved in the same second", async () => {
    withDecisionIds();
    const idB = await uploaded();
    const idA = await uploaded();
    const a = await filePetition(idA, fields(), "x");
    const b = await filePetition(idB, fields({ mobile: "9000041874", attachTo: caseIdFor(a.code) }), "x");
    expect(b.attached).toBe(true);
    h.db.exec(`UPDATE petitions SET filed_at = '2026-11-12 10:00:00'`);
    newBuild();
    await websiteCases(h.db);
    expect(one("SELECT incident_id x FROM events WHERE source_record_id = ?", b.code).x).toBe(caseIdFor(a.code));
    expect(one("SELECT COUNT(*) n FROM incidents").n).toBe(1);
    expect(one("SELECT member_count m FROM incidents").m).toBe(2);
  });
  it("in a different order of upload and approval, still one case of three", async () => {
    withDecisionIds();
    const ids = [await uploaded(), await uploaded(), await uploaded()];
    const owner = await filePetition(ids[2], fields(), "x");
    await filePetition(ids[0], fields({ mobile: "9000041874", attachTo: caseIdFor(owner.code) }), "x");
    await filePetition(ids[1], fields({ mobile: "9000041875", attachTo: caseIdFor(owner.code) }), "x");
    h.db.exec(`UPDATE petitions SET filed_at = '2026-11-12 10:00:00'`);
    newBuild();
    await websiteCases(h.db);
    expect(h.db.prepare("SELECT DISTINCT incident_id x FROM events").all()).toEqual([{ x: caseIdFor(owner.code) }]);
  });
});

// reviewer1-03: test mode's time limit rejected with a plain Error, so a team-inbox mail the server took after the limit was 'failed', and the
// sweep mailed a second copy (the reviewer's probe, tests/qa/pass6/known-failures/reviewer1/sms.probe.test.ts "team inbox")
describe("reviewer1-03: a team-inbox mail that answers after the limit is 'unsure', not mailed again", () => {
  it("the first mail lands after the limit: one mail in all, the row 'unsure'", async () => {
    testMode();
    await withLimits({ inlineWaitMs: 50, sendMs: 200 }, async () => {
      let n = 0;
      h.mailImpl = () => { n++; return n === 1 ? new Promise((r) => setTimeout(() => r({ ok: true }), 600)) : Promise.resolve({ ok: true }); };
      const r = await filePetition(await uploaded(), fields(), "x");
      await sleep(800);
      expect(rowOf(r.code).status).toBe("unsure");
      due();
      await sms.retryFailedSms();
      expect(h.mails.length).toBe(1);
    });
  });
  it("a mail the server refused is still 'failed' and tried again", async () => {
    testMode();
    let n = 0;
    h.mailImpl = async () => (++n === 1 ? { ok: false, reason: "send_failed", detail: "550 refused" } : { ok: true });
    const r = await filePetition(await uploaded(), fields(), "x");
    expect(rowOf(r.code).status).toBe("failed");
    due();
    await sms.retryFailedSms();
    expect(h.mails.length).toBe(2);
    expect(rowOf(r.code).status).toBe("test");
  });
});

// reviewer1-06: the live send gave up at 8 s, before Node's fetch gives up a connection it cannot open (10 s, UND_ERR_CONNECT_TIMEOUT), so a
// send that never connected (provider or network down, dropped SYNs, slow DNS) ended as a TimeoutError: 'unsure', never tried again. Time is
// scaled down 100 times here: fetch's connect limit is 100 ms, and the send's own limit is what AbortSignal.timeout is given, / 100.
describe("reviewer1-06: a live send that never connected is 'failed' and tried again; one that connected and stalled stays 'unsure'", () => {
  const CONNECT_MS = 100;
  let sends = 0;
  const scaled = (stallAfterConnect: boolean) => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => timeout(ms / 100));
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => new Promise((resolve, reject) => {
      if (!String(url).includes("msg91")) return reject(new TypeError("fetch failed (test: no outward calls)")); // the reader's PaddleOCR call
      sends++;
      const signal = init.signal!;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      // undici: no connection by its connect limit -> "fetch failed" with cause UND_ERR_CONNECT_TIMEOUT; connected -> no answer at all
      if (!stallAfterConnect) setTimeout(() => reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } })), CONNECT_MS);
      void resolve;
    })));
  };
  it("never connected: 'failed', and the sweep sends it again", async () => {
    live();
    sends = 0;
    scaled(false);
    await withLimits({ inlineWaitMs: 1_000 }, async () => {
      const r = await filePetition(await uploaded(), fields(), "x");
      expect(rowOf(r.code).status).toBe("failed");
      due();
      await sms.retryFailedSms();
      expect(sends).toBe(2);
    });
  });
  it("connected, then no answer: 'unsure', not sent again", async () => {
    live();
    sends = 0;
    scaled(true);
    await withLimits({ inlineWaitMs: 1_000 }, async () => {
      const r = await filePetition(await uploaded(), fields(), "x");
      expect(rowOf(r.code).status).toBe("unsure");
      due();
      await sms.retryFailedSms();
      expect(sends).toBe(1);
    });
  });
});

// hunt2-desk-06: /track told an online complainant "Received at the Collector's office and sent to the department" (one note per status,
// whatever the channel), and its due date was blank (read only from the petitions table)
describe("hunt2-desk-06: /track for an online complaint", () => {
  const online = (sev = "Medium") => h.db.exec(`
    INSERT INTO complaints (id, complaint_code, user_id, first_name, gender, street_address, mobile_number, zone_id, ward_number, department_id, title, description, is_anonymous, needs_manual_review, status, created_at, updated_at)
      VALUES (900, '2026-900ONL', 5, 'Rani', 'Female', '9 Jawahar Street', '9000041899', 6, 70, 1, 'Garbage not cleared near the temple', 'x', 0, 0, 'Complaint Filed', '2026-11-12 10:00:00', '2026-11-12 10:00:00');
    INSERT INTO complaint_status_history (complaint_id, status, stage, remarks, created_at) VALUES (900, 'Complaint Filed', 'Citizen', 'Complaint registered by citizen.', '2026-11-12 10:00:00');
    INSERT INTO events (event_id, source, source_record_id, incident_id) VALUES ('GRV-2026-900ONL', 'grievance', '2026-900ONL', 'INC-W-2026-900ONL');
    INSERT INTO incidents (incident_id, severity_level, sla_due_at) VALUES ('INC-W-2026-900ONL', '${sev}', '2026-11-17 10:00:00');`);
  it("says it was received online, and gives its case's deadline", async () => {
    online();
    const v = await (await trackAs({ code: "2026-900ONL", last4: "1899" })).json();
    expect(v.steps[0].note).toBe("Received online and sent to the department.");
    expect(v.dueBy).toBe("2026-11-17 10:00:00");
  });
  it("a petition keeps 'Received at the Collector's office' and its own deadline", async () => {
    const r = await filePetition(await uploaded(), fields(), "x");
    const v = await (await trackAs({ code: r.code, last4: "1873" })).json();
    expect(v.steps[0].note).toBe("Received at the Collector's office and sent to the department.");
    expect(v.dueBy).toBe(one("SELECT due_at FROM petitions WHERE complaint_code = ?", r.code).due_at);
  });
});

// P5-025: the Tamil SMS named the department in English (department labels were English only)
describe("P5-025: a Tamil petitioner's SMS names the department in Tamil", () => {
  it("test mode, a Tamil petition to Metrowater: the message is all Tamil", async () => {
    testMode();
    await filePetition(await uploaded(), fields(), "x"); // no reading here: the language is the text's, Tamil
    const text = h.mails[0].html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("அனுப்பப்பட்ட துறை சென்னை குடிநீர் வாரியம்.");
    expect(text).not.toContain("Metrowater");
  });
  it("an English petition keeps the English name", async () => {
    testMode();
    await filePetition(await uploaded(), fields({ name: "R. Kumar", subject: "Sewage", fullText: "From: R. Kumar, Perambur" }), "x"); // no reading: the language is the text's
    expect(h.mails[0].html).toContain("Sent to Metrowater.");
  });
  it("every department has a Tamil name within DLT's 30 characters, and the longest Tamil message stays within 2 segments", async () => {
    const { MANU_DEPTS } = await import("@/lib/manu/constants");
    for (const d of MANU_DEPTS) {
      expect(d.ta, d.code).toMatch(/[஀-௿]/);
      expect([...d.ta].length, d.code).toBeLessThanOrEqual(30);
      const msg = sms.SMS_WORDING.received.ta.replace("{#var#}", "2026-123ABC").replace("{#var#}", d.ta);
      expect(msg.length, d.code).toBeLessThanOrEqual(134); // two UCS-2 segments of 67
    }
  });
});

// hunt2-desk-15 (the API's part): /track kept "Expected by" after the case was closed, and did not say the petition was in Tamil
describe("hunt2-desk-15: /track's answer for a closed case and a Tamil petition", () => {
  it("open: the due date and the petition's language", async () => {
    const r = await filePetition(await uploaded(), fields(), "x");
    const v = await (await trackAs({ code: r.code, last4: "1873" })).json();
    expect(v.lang).toBe("ta");
    expect(v.dueBy).toBeTruthy();
  });
  it.each([["the department closed it", "close"], ["the Collector rejected it", "reject"]])("closed (%s): no 'expected by'", async (_k, how) => {
    const r = await filePetition(await uploaded(), fields(), "x");
    if (how === "close") step(r.code, "close", 1); else decide(r.code, "reject", 1);
    const v = await (await trackAs({ code: r.code, last4: "1873" })).json();
    expect(v.status).toBe(how === "close" ? "Resolved by Department" : "Rejected");
    expect(v.dueBy).toBeNull();
  });
  it("an English petition says en", async () => {
    const r = await filePetition(await uploaded(), fields({ name: "R. Kumar", subject: "Sewage", fullText: "From: R. Kumar" }), "x");
    expect((await (await trackAs({ code: r.code, last4: "1873" })).json()).lang).toBe("en");
  });
});

// hunt2-desk-14: the person's own petitions shared one LIMIT 200 with the ward-and-department rows, newest first, so in a busy ward the
// person's own older petition was cut and "came before" missed it
describe("hunt2-desk-14: a person's own earlier petition is found in a ward with more than 200 petitions to the department", () => {
  it("210 newer petitions from others in ward 70 to Metrowater: the person's own still comes first", async () => {
    const mine = await filePetition(await uploaded(), fields({ mobile: "9000041873" }), "x");
    h.db.prepare(`UPDATE petitions SET filed_at = '2026-01-05 10:00:00' WHERE complaint_code = ?`).run(mine.code);
    const ins = h.db.prepare(`INSERT INTO petitions (status, pages, name, mobile, address, ward_number, dept_code, problem, complaint_code, incident_id, filed_at, created_at)
      VALUES ('filed', '[]', ?, ?, 'x', 70, 'CMWSSB', 'Water supply irregular', ?, ?, ?, ?)`);
    for (let i = 0; i < 210; i++) {
      const code = `2026-${String(100 + i).padStart(3, "0")}BZY`;
      ins.run(`Neighbour ${i}`, `98${String(10000000 + i)}`, code, `INC-W-${code}`, `2026-10-${String(1 + (i % 28)).padStart(2, "0")} 10:00:00`, "2026-10-01 10:00:00");
    }
    const r = await findRepeats({ mobile: "9000041873", name: "க. பார்வதி", street: "ஜவஹர் தெரு", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing on the street", excludeId: -1 });
    expect(r.matches[0]).toMatchObject({ code: mine.code, samePerson: true, sameProblem: true });
    expect(r.headline).toMatch(/this person's second petition on this problem/);
  });
});
