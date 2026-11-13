/**
 * Adversarial review 3 of the pass 7 account fixes (hunt2-sec-02, -03, -07, -09), through the real routes on an isolated store, as
 * account.sqlite.test.ts runs them (only the session, the mailer and the token signer are replaced). Each test states what SHOULD happen;
 * a failing test is a finding.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/desk-and-accounts/review3
 */
import fs from "fs";
import os from "os";
import path from "path";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

type S = { userId: number; email: string; role: string };
const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, session: null as null | { userId: number; email: string; role: string }, mails: [] as { to: string; subject: string; html: string }[] }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool, connectionSettings: () => ({}), withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => fn(pool) }));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => h.session, getActiveSessions: async () => (h.session ? [h.session] : []), resolvePortal: async () => "citizen",
  revokeSessions: async () => 1, setAuthCookie: async () => undefined
}));
vi.mock("@/lib/jwt", () => ({ signToken: async () => "token" }));
vi.mock("@/lib/mailer", () => ({
  isSmtpConfigured: () => false, otpEmailHtml: (otp: string, what: string) => `code ${otp} for ${what}`,
  sendMail: async (to: string, subject: string, html: string) => { h.mails.push({ to, subject, html }); return { ok: true }; }
}));

const { POST: changePassword } = await import("@/app/api/profile/change-password/route");
const { POST: uploadPhoto } = await import("@/app/api/profile/photo/route");

const PASSWORD = "Correct-Horse9";
let dir = "";
const legacyFiles: string[] = [];
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "p7acct-r3-")); process.env.PROFILE_UPLOAD_DIR = dir; });
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const f of legacyFiles) fs.rmSync(f, { force: true });
});

let nextUser = 300;
let HASH = "";
// the real cost (bcrypt.hash(newPassword, 10) in the route; seeded accounts use 10 too)
beforeAll(async () => { HASH = await bcrypt.hash(PASSWORD, 10); });
const citizen = (): S => { const id = nextUser++; h.db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'citizen')").run(id, `c${id}@x`, HASH); return { userId: id, email: `c${id}@x`, role: "citizen" }; };

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT, department_id INT, token_version INT DEFAULT 0);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE zones (id INT, zone_name TEXT);
    CREATE TABLE zone_wards (ward_number INT, zone_id INT);
    CREATE TABLE user_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INT NOT NULL UNIQUE, first_name TEXT, last_name TEXT, gender TEXT, date_of_birth TEXT, mobile_number TEXT, mobile_verified INT NOT NULL DEFAULT 0,
      alternate_email TEXT, door_no_and_street TEXT, area TEXT, locality TEXT, pincode TEXT, zone_id INT, ward_number INT, aadhaar_number_encrypted TEXT, aadhaar_last4 TEXT, profile_photo TEXT);
    CREATE UNIQUE INDEX user_profiles__mobile_number ON user_profiles (mobile_number);
    CREATE TABLE password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INT, purpose TEXT, identifier TEXT, otp_hash TEXT, expires_at TEXT, attempts INT NOT NULL DEFAULT 0, used INT NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));`);
  h.db = db;
  h.session = null;
  h.mails = [];
});

const json = (url: string, body: unknown, method = "POST") => new NextRequest(`http://127.0.0.1${url}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const one = (sql: string, ...p: unknown[]) => h.db.prepare(sql).get(...(p as never[])) as Record<string, any>;

// ---------------------------------------------------------------------------------------------------------------- hunt2-sec-09 --

describe("review3 hunt2-sec-09: the five-try limit holds for guesses sent at once, as a script with a stolen cookie sends them", () => {
  const change = (current: string) => changePassword(json("/api/profile/change-password", { currentPassword: current, newPassword: "New-Passw0rd!", confirmPassword: "New-Passw0rd!" }));

  it("30 wrong guesses sent together: no more than 5 are checked against the password, the rest are refused (429)", async () => {
    h.session = citizen();
    const statuses = (await Promise.all(Array.from({ length: 30 }, (_, i) => change(`Wrong-guess${i}`)))).map((r) => r.status);
    const checked = statuses.filter((s) => s === 400).length;
    expect(checked, `statuses: ${statuses.join(",")}`).toBeLessThanOrEqual(5);
  });

  it("24 wrong guesses and the right password sent together (the right one last): the password is NOT changed", async () => {
    const me = citizen();
    h.session = me;
    const guesses = [...Array.from({ length: 24 }, (_, i) => `Wrong-guess${i}`), PASSWORD];
    const statuses = (await Promise.all(guesses.map(change))).map((r) => r.status);
    const stillOld = await bcrypt.compare(PASSWORD, String(one("SELECT password_hash h FROM users WHERE id = ?", me.userId).h));
    expect({ rightOne: statuses[24], passwordUnchanged: stillOld }, `statuses: ${statuses.join(",")}`).toEqual({ rightOne: 429, passwordUnchanged: true });
  });
});

// ---------------------------------------------------------------------------------------------------------------- hunt2-sec-07 --

describe("review3 hunt2-sec-07: a photo uploaded before the fix", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
  const upload = async () => {
    const fd = new FormData();
    fd.append("photo", new File([PNG], "me.png", { type: "image/png" }));
    return uploadPhoto(new NextRequest("http://127.0.0.1/api/profile/photo", { method: "POST", body: fd }));
  };

  it("is no longer left under public/ (open to anyone, under user-<id>-<ms>.png) once the citizen uploads a new photo", async () => {
    const me = citizen();
    h.session = me;
    // what the old route wrote: public/uploads/profile/user-<id>-<ms>.png, and the value it stored
    const legacyName = `user-${me.userId}-1760000000000.png`;
    const legacyFile = path.join(process.cwd(), "public", "uploads", "profile", legacyName);
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    fs.writeFileSync(legacyFile, PNG);
    legacyFiles.push(legacyFile);
    h.db.prepare("INSERT INTO user_profiles (user_id, profile_photo) VALUES (?, ?)").run(me.userId, `/uploads/profile/${legacyName}`);

    const r = await upload();
    expect(r.status).toBe(200);
    expect(String(one("SELECT profile_photo p FROM user_profiles WHERE user_id = ?", me.userId).p).startsWith("/api/profile/photo/")).toBe(true);
    // the replaced photo is no longer the account's, yet the old file stays where Next serves it to anyone, under a guessable name
    expect(fs.existsSync(legacyFile), `${legacyFile} still exists`).toBe(false);
  });
});

describe("review3 hunt2-sec-07: two uploads at once (a double click, two tabs)", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 9)]);
  const upload = async () => {
    const fd = new FormData();
    fd.append("photo", new File([PNG], "me.png", { type: "image/png" }));
    return uploadPhoto(new NextRequest("http://127.0.0.1/api/profile/photo", { method: "POST", body: fd }));
  };

  it("leave one stored photo, the one the profile points to: no orphan copy of the citizen's face on disk", async () => {
    const me = citizen();
    h.session = me;
    expect((await upload()).status).toBe(200);
    const before = new Set(fs.readdirSync(dir));
    const rs = await Promise.all([upload(), upload()]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    const current = String(one("SELECT profile_photo p FROM user_profiles WHERE user_id = ?", me.userId).p).split("/").pop();
    const mine = fs.readdirSync(dir).filter((f) => !before.has(f) || f === current);
    expect(mine, `files on disk for this account: ${mine.join(", ")}; profile points to ${current}`).toEqual([current]);
  });
});
