/**
 * QA pass 7 (desk-and-accounts): account security rows from pass 6, through the real routes on an isolated store (the AWS store's MySQL ->
 * SQLite translation). Only the session, the mailer and the token signer are replaced.
 *   hunt2-sec-02  a signed-in citizen could ask whether any mobile number is registered, one after another
 *   hunt2-sec-03  the "verify mobile" code went to the e-mail, and the number was then shown Verified
 *   hunt2-sec-07  the profile photo was written under public/ with a guessable name
 *   hunt2-sec-09  change-password checked the current password with no limit
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/desk-and-accounts/account.sqlite.test.ts
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
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => fn(pool) }));
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
const { GET: viewPhoto } = await import("@/app/api/profile/photo/[name]/route");
const { POST: askCode } = await import("@/app/api/profile/mobile-otp/request/route");
const { POST: saveMobile } = await import("@/app/api/profile/mobile-otp/verify/route");
const { GET: profile, PUT: putProfile } = await import("@/app/api/profile/route");

const PASSWORD = "Correct-Horse9";
let dir = "";
const written: string[] = [];
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "p7acct-")); process.env.PROFILE_UPLOAD_DIR = dir; });
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  // a run without the fix writes under public/: take those files away again
  for (const p of written) if (p.startsWith("/uploads/")) fs.rmSync(path.join(process.cwd(), "public", p), { force: true });
});

let nextUser = 100;
const citizen = (): S => { const id = nextUser++; h.db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'citizen')").run(id, `c${id}@x`, HASH); return { userId: id, email: `c${id}@x`, role: "citizen" }; };
let HASH = "";
beforeAll(async () => { HASH = await bcrypt.hash(PASSWORD, 4); });

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
const codeIn = (m: { html: string }) => /code (\d+)/.exec(m.html)?.[1] ?? "";

// ---------------------------------------------------------------------------------------------------------------- hunt2-sec-09 --

describe("hunt2-sec-09: wrong current passwords are counted, and five lock it", () => {
  const change = (current: string) => changePassword(json("/api/profile/change-password", { currentPassword: current, newPassword: "New-Passw0rd!", confirmPassword: "New-Passw0rd!" }));

  it("after five wrong guesses in 15 minutes the sixth is refused, and so is the right password: the password is not changed", async () => {
    h.session = citizen();
    for (let i = 0; i < 5; i++) expect((await change(`Wrong-guess${i}`)).status).toBe(400);
    expect((await change("Wrong-guess5")).status).toBe(429);
    expect((await change(PASSWORD)).status).toBe(429);
    expect(await bcrypt.compare(PASSWORD, String(one("SELECT password_hash h FROM users WHERE id = ?", h.session.userId).h))).toBe(true);
  });

  it("the right password before the limit still changes it, and starts the count again", async () => {
    h.session = citizen();
    for (let i = 0; i < 4; i++) expect((await change(`Wrong-guess${i}`)).status).toBe(400);
    expect((await change(PASSWORD)).status).toBe(200);
    expect(await bcrypt.compare("New-Passw0rd!", String(one("SELECT password_hash h FROM users WHERE id = ?", h.session.userId).h))).toBe(true);
  });

  it("the count is the step-up check's own: guesses here use up the 'Confirm it's you' tries too", async () => {
    h.session = citizen();
    for (let i = 0; i < 5; i++) await change(`Wrong-guess${i}`);
    const { verifyFactor } = await import("@/lib/security/factors");
    expect(await verifyFactor(h.session.userId, "password", PASSWORD)).toMatchObject({ ok: false, status: 429 });
  });
});

// ---------------------------------------------------------------------------------------------------------------- hunt2-sec-07 --

describe("hunt2-sec-07: a profile photo is private, under a name nobody can guess", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
  async function upload(): Promise<string> {
    const fd = new FormData();
    fd.append("photo", new File([PNG], "me.png", { type: "image/png" }));
    const r = await uploadPhoto(new NextRequest("http://127.0.0.1/api/profile/photo", { method: "POST", body: fd }));
    expect(r.status).toBe(200);
    const p = String((await r.json()).profilePhoto);
    written.push(p);
    return p;
  }
  const view = (p: string) => viewPhoto(new NextRequest(`http://127.0.0.1${p}`), { params: Promise.resolve({ name: p.split("/").pop()! }) });

  it("is not written under public/, has no user id or time in its name, and opens for its owner only", async () => {
    const me = citizen();
    h.session = me;
    const before = fs.existsSync(path.join(process.cwd(), "public", "uploads", "profile")) ? fs.readdirSync(path.join(process.cwd(), "public", "uploads", "profile")).length : 0;
    const p = await upload();
    expect(p.startsWith("/uploads/")).toBe(false);
    expect(p).not.toContain(String(me.userId));
    const after = fs.existsSync(path.join(process.cwd(), "public", "uploads", "profile")) ? fs.readdirSync(path.join(process.cwd(), "public", "uploads", "profile")).length : 0;
    expect(after).toBe(before);
    expect((await view(p)).status).toBe(200);
    h.session = citizen();
    expect((await view(p)).status).toBe(404);
    h.session = null;
    expect((await view(p)).status).toBe(401);
  });

  it("a new photo replaces the old one, which no longer opens", async () => {
    h.session = citizen();
    const first = await upload();
    const second = await upload();
    expect(second).not.toBe(first);
    expect((await view(first)).status).toBe(404);
    expect(fs.readdirSync(dir)).not.toContain(first.split("/").pop());
  });
});

// ------------------------------------------------------------------------------------------------------- hunt2-sec-02, hunt2-sec-03 --

describe("hunt2-sec-02: whether a number is on another account is not answered to whoever asks", () => {
  it("asking for a code for a number on another account is answered as for a free number", async () => {
    const owner = citizen();
    h.db.prepare("INSERT INTO user_profiles (user_id, mobile_number) VALUES (?, '9000000001')").run(owner.userId);
    h.session = citizen();
    const used = await askCode(json("/api/profile/mobile-otp/request", { mobileNumber: "9000000001" }));
    const free = await askCode(json("/api/profile/mobile-otp/request", { mobileNumber: "9000000002" }));
    expect(used.status).toBe(free.status);
    const [u, f] = [await used.json(), await free.json()];
    expect(Object.keys(u).sort()).toEqual(Object.keys(f).sort());
    expect(u.message).toBe(f.message);
  });

  it("one account cannot test a list of numbers: the sixth number in an hour is refused", async () => {
    h.session = citizen();
    for (let i = 0; i < 5; i++) expect((await askCode(json("/api/profile/mobile-otp/request", { mobileNumber: `900000010${i}` }))).status).toBe(200);
    expect((await askCode(json("/api/profile/mobile-otp/request", { mobileNumber: "9000000109" }))).status).toBe(429);
  });

  it("the profile form does not answer either: a number on another account is not saved, with no error, and the rest is", async () => {
    const owner = citizen();
    h.db.prepare("INSERT INTO user_profiles (user_id, mobile_number) VALUES (?, '9000000001')").run(owner.userId);
    const me = citizen();
    h.session = me;
    const r = await putProfile(json("/api/profile", { firstName: "Qa", mobileNumber: "9000000001" }, "PUT"));
    expect(r.status).toBe(200);
    expect(one("SELECT first_name, mobile_number FROM user_profiles WHERE user_id = ?", me.userId)).toEqual({ first_name: "Qa", mobile_number: null });
  });
});

describe("hunt2-sec-03: a number is never called verified when only the e-mail was checked", () => {
  it("the code goes to the account's e-mail as a confirmation of the change, and the saved number is not verified", async () => {
    const me = citizen();
    h.session = me;
    expect((await askCode(json("/api/profile/mobile-otp/request", { mobileNumber: "9876543210" }))).status).toBe(200);
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0].to).toBe(me.email);
    expect(h.mails[0].subject).not.toMatch(/verify/i);
    const r = await saveMobile(json("/api/profile/mobile-otp/verify", { mobileNumber: "9876543210", otp: codeIn(h.mails[0]) }));
    expect(r.status).toBe(200);
    expect((await r.json()).message).not.toMatch(/verified and/i);
    expect(one("SELECT mobile_number, mobile_verified FROM user_profiles WHERE user_id = ?", me.userId)).toEqual({ mobile_number: "9876543210", mobile_verified: 0 });
    expect((await (await profile()).json()).profile.mobileVerified).toBe(false);
  });

  it("a number marked verified by the old e-mailed code is not shown as verified", async () => {
    const me = citizen();
    h.db.prepare("INSERT INTO user_profiles (user_id, mobile_number, mobile_verified) VALUES (?, '9876500000', 1)").run(me.userId);
    h.session = me;
    expect((await (await profile()).json()).profile.mobileVerified).toBe(false);
  });

  it("another account asking for the same number neither replaces the first account's code nor makes it wait", async () => {
    const a = citizen(), b = citizen();
    h.session = a;
    await askCode(json("/api/profile/mobile-otp/request", { mobileNumber: "9876543211" }));
    h.session = b;
    const rb = await askCode(json("/api/profile/mobile-otp/request", { mobileNumber: "9876543211" }));
    expect((await rb.json()).cooldownRemaining).toBeUndefined();
    expect(h.mails).toHaveLength(2);
    h.session = a;
    expect((await saveMobile(json("/api/profile/mobile-otp/verify", { mobileNumber: "9876543211", otp: codeIn(h.mails[0]) }))).status).toBe(200);
    // and b's own code does not take the number from a
    h.session = b;
    expect((await saveMobile(json("/api/profile/mobile-otp/verify", { mobileNumber: "9876543211", otp: codeIn(h.mails[1]) }))).status).toBe(409);
    expect(one("SELECT user_id FROM user_profiles WHERE mobile_number = '9876543211'").user_id).toBe(a.userId);
  });
});
