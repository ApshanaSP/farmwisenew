// Fix-all round 2, reviewerC-01 (reviewer C's probe on reviewer1-09 / fix f3bef2f2).
//
// The sweep's orphan query (sms.ts retryFailedSms) picks "filed in the last day, no 'received' row" ORDER BY filed_at LIMIT 20, and only
// then drops the rows with no valid mobile in JavaScript. A petition with no mobile (fileSchema allows "") never gets a petition_sms row
// (sendPetitionSms returns before the INSERT), so it is an "orphan" on every sweep for 24 hours. Twenty such petitions filed earlier in the
// day fill the LIMIT on every run, and a real orphan (the server stopped between the commit and the send) filed later is never queued: the
// petitioner is never texted, and the desk says "sending" for good (smsNote's new no-row rule). The mobile test belongs in the WHERE.
// Harness: in-memory SQLite through the store translation and fetch stubbed, as src/lib/manu/desk.fixall.test.ts. Nothing leaves the machine.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => fn(pool) }));
vi.mock("@/lib/mailer", () => ({ isSmtpConfigured: () => false, sendMail: async () => ({ ok: true }) }));

const sms = await import("@/lib/manu/sms");

const KEYS = { MSG91_AUTH_KEY: "key", MSG91_SENDER: "CHNCOL", MSG91_TEMPLATE_RECEIVED_EN: "t-re", MSG91_TEMPLATE_RECEIVED_TA: "t-rt", MSG91_TEMPLATE_CLOSED_EN: "t-ce", MSG91_TEMPLATE_CLOSED_TA: "t-ct" };
const TOUCHED = [...Object.keys(KEYS), "SMS_MODE", "SMS_TEST_NUMBER", "AWS_STORE_DRY_RUN", "AWS_STORE_SAVE", "DATA_BACKEND"];
const saved: Record<string, string | undefined> = {};
let msg91: string[] = [];
const ist = (minutesAgo: number) => new Date(Date.now() + 330 * 60_000 - minutesAgo * 60_000).toISOString().slice(0, 19).replace("T", " ");

beforeEach(() => {
  for (const k of TOUCHED) saved[k] = process.env[k];
  Object.assign(process.env, KEYS, { SMS_MODE: "live", SMS_TEST_NUMBER: "", AWS_STORE_DRY_RUN: "", AWS_STORE_SAVE: "1", DATA_BACKEND: "aws" });
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, mobile TEXT, language TEXT, dept_code TEXT, complaint_code TEXT, filed_at TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, status TEXT);
    CREATE TABLE petition_sms (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', result TEXT, detail TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, tried_at TEXT, sent_at TEXT, created_at TEXT);
    CREATE UNIQUE INDEX petition_sms__one ON petition_sms (complaint_code, kind);`);
  h.db = db;
  msg91 = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("msg91")) { msg91.push(String(url)); return new Response(JSON.stringify({ type: "success", message: "req" })); }
    throw new TypeError("fetch failed (probe: no outward calls)");
  }));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe("reviewerC-01: petitions with no mobile starve the orphan sweep", () => {
  it("20 petitions without a mobile filed this morning; the one real orphan filed later is still texted", async () => {
    const ins = h.db.prepare(`INSERT INTO petitions (status, mobile, language, dept_code, complaint_code, filed_at) VALUES ('filed', ?, 'ta', 'CMWSSB', ?, ?)`);
    for (let i = 0; i < 20; i++) ins.run("", `2026-${String(100 + i).padStart(3, "0")}NOM`, ist(180 - i)); // no mobile: never given a row
    ins.run("9000041873", "2026-900ORF", ist(30)); // the server stopped between this petition's commit and its send: no row
    await sms.retryFailedSms();
    await sms.retryFailedSms();
    expect(msg91.length).toBe(1);
    expect((h.db.prepare(`SELECT status FROM petition_sms WHERE complaint_code = '2026-900ORF'`).get() as { status?: string } | undefined)?.status).toBe("sent");
  });
});
