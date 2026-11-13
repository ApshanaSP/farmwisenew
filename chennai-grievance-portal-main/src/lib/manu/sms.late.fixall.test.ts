// Fix-all round 2, reviewerC-04 (reviewer C's probe on reviewer1-03 / fix 341e10d4).
//
// withLimit now rejects with MaybeSent at SMS_LIMITS.sendMs (20 s), so a team-inbox send that has not answered by then is 'unsure' and never
// tried again. But nodemailer's own limits are longer (connectionTimeout 2 min, greetingTimeout 30 s, no transport options set in
// lib/mailer.ts), so a mail server that is down or drops SYNs ends here as 'unsure', though sendMail later says plainly that nothing was sent
// ({ ok: false, reason: "send_failed", detail: "Connection timeout" }). That late answer is thrown away (the race already settled), the row
// stays 'unsure' and the test SMS never reaches the team inbox: the reviewer1-06 bug (a send that never connected treated as maybe-sent)
// moved into test mode. Before 341e10d4 such a send was 'failed' and retried. Fix idea: let the work's own outcome, when it comes, settle the
// row ('failed' on ok:false, 'test' on ok:true) instead of leaving 'unsure'.
// Harness: in-memory SQLite through the store translation, the mailer stubbed, as src/lib/manu/desk.fixall.test.ts.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, mails: 0, mailImpl: null as null | (() => Promise<unknown>), transport: null as null | Record<string, unknown> }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => fn(pool) }));
vi.mock("@/lib/mailer", () => ({
  isSmtpConfigured: () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  sendMail: async () => { h.mails++; return h.mailImpl ? h.mailImpl() : { ok: true }; }
}));

// the real mailer (for its transport's limits) gets a stub nodemailer: nothing connects anywhere
vi.mock("nodemailer", () => ({ default: { createTransport: (o: Record<string, unknown>) => { h.transport = o; return { sendMail: async () => ({ accepted: ["team@x.in"], rejected: [] }) }; } } }));

const sms = await import("@/lib/manu/sms");

const TOUCHED = ["SMS_MODE", "AWS_STORE_DRY_RUN", "AWS_STORE_SAVE", "DATA_BACKEND", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_SANDBOX_TO"];
const saved: Record<string, string | undefined> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  for (const k of TOUCHED) saved[k] = process.env[k];
  Object.assign(process.env, { SMS_MODE: "test", AWS_STORE_DRY_RUN: "", AWS_STORE_SAVE: "1", DATA_BACKEND: "aws", SMTP_HOST: "mail.test", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_SANDBOX_TO: "team@x.in" });
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, mobile TEXT, language TEXT, dept_code TEXT, complaint_code TEXT, filed_at TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, status TEXT);
    CREATE TABLE petition_sms (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', result TEXT, detail TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, tried_at TEXT, sent_at TEXT, created_at TEXT);
    CREATE UNIQUE INDEX petition_sms__one ON petition_sms (complaint_code, kind);
    INSERT INTO petitions (status, mobile, language, dept_code, complaint_code, filed_at) VALUES ('filed', '9000041873', 'ta', 'CMWSSB', '2026-903LAT', '2026-11-13 10:00:00');`);
  h.db = db;
  h.mails = 0;
  h.mailImpl = null;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe("reviewerC-04: a team-inbox send that FAILED after the limit is tried again", () => {
  it("the mail server answers 'Connection timeout' (nothing sent) after the limit: the sweep mails it again", async () => {
    const before = { ...sms.SMS_LIMITS };
    Object.assign(sms.SMS_LIMITS, { inlineWaitMs: 50, sendMs: 200 });
    try {
      let n = 0;
      h.mailImpl = () => (++n === 1 ? new Promise((r) => setTimeout(() => r({ ok: false, reason: "send_failed", detail: "Connection timeout" }), 500)) : Promise.resolve({ ok: true }));
      await sms.sendPetitionSms("2026-903LAT", "received");
      await sleep(800); // the first send has now said plainly it was not sent
      h.db.exec(`UPDATE petition_sms SET tried_at = '2026-01-01 00:00:00'`);
      await sms.retryFailedSms();
      expect(h.mails).toBe(2);
      expect((h.db.prepare(`SELECT status FROM petition_sms`).get() as { status: string }).status).toBe("test");
    } finally {
      Object.assign(sms.SMS_LIMITS, before);
    }
  });

  it("with no late answer it stays 'unsure' and is not mailed again", async () => {
    const before = { ...sms.SMS_LIMITS };
    Object.assign(sms.SMS_LIMITS, { inlineWaitMs: 50, sendMs: 200 });
    try {
      h.mailImpl = () => new Promise(() => undefined);
      await sms.sendPetitionSms("2026-903LAT", "received");
      await sleep(400);
      h.db.exec(`UPDATE petition_sms SET tried_at = '2026-01-01 00:00:00'`);
      await sms.retryFailedSms();
      expect(h.mails).toBe(1);
      expect((h.db.prepare(`SELECT status FROM petition_sms`).get() as { status: string }).status).toBe("unsure");
    } finally {
      Object.assign(sms.SMS_LIMITS, before);
    }
  });

  it("the mailer gives up a mail server that is down (connect, greeting) before the SMS copy's own limit, so that ends plainly 'failed'", async () => {
    const mailer = await vi.importActual<typeof import("@/lib/mailer")>("@/lib/mailer");
    expect(await mailer.sendMail("team@x.in", "[Test SMS] to 9000041873", "<p>x</p>")).toEqual({ ok: true });
    const t = h.transport as { connectionTimeout?: number; greetingTimeout?: number };
    expect(t.connectionTimeout).toBeGreaterThan(0);
    expect(t.greetingTimeout).toBeGreaterThan(0);
    expect(t.connectionTimeout! + t.greetingTimeout!).toBeLessThan(sms.SMS_LIMITS.sendMs);
  });
});
