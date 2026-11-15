/**
 * The OTP flows through the AWS store's own MySQL -> SQLite translation (DATA_BACKEND=aws), on an isolated in-memory
 * copy. consumeOtp used UPDATE ... ORDER BY ... LIMIT 1, which SQLite rejects: a password reset changed the password,
 * then failed with "Something went wrong" and left its code reusable; mobile verification always failed.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    const st = h.db.prepare(s);
    if (/^\s*SELECT/i.test(s)) return [st.all(...(p as never[]))];
    const r = st.run(...(p as never[]));
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
  }
};
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/auth", () => ({ revokeSessions: async () => 1 }));
vi.mock("@/lib/mailer", () => ({ sendMail: async () => ({ ok: true }), otpEmailHtml: () => "" }));
const { consumeOtp, createOtp, verifyAndConsumeOtp } = await import("./otp");
const reset = (await import("@/app/api/auth/forgot-password/reset-password/route")).POST;
const { NextRequest } = await import("next/server");

beforeEach(() => {
  process.env.DATA_BACKEND = "aws";
  setDatabaseNames(["district_collector_dashboard"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT);
    CREATE TABLE password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, purpose TEXT, identifier TEXT,
      otp_hash TEXT, expires_at TEXT, attempts INTEGER DEFAULT 0, used INTEGER DEFAULT 0, created_at TEXT DEFAULT (NOW()));
    INSERT INTO users VALUES (7, 'citizen@test.local', 'old-hash');
    INSERT INTO users VALUES (8, 'reset@test.local', 'old-hash');`);
});

const unused = () => (h.db.prepare(`SELECT COUNT(*) AS n FROM password_resets WHERE used = 0`).get() as { n: number }).n;
// its own address: createOtp keeps a 60-second resend wait in memory per address, across these tests
const resetWith = (otp: string) =>
  reset(new NextRequest("http://localhost/api/auth/forgot-password/reset-password", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reset@test.local", otp, newPassword: "N3w-Passw0rd!x", confirmPassword: "N3w-Passw0rd!x" })
  }));

describe("one-time codes on the AWS store", () => {
  it("consumeOtp runs on SQLite and uses up the code", async () => {
    await createOtp("9876543210", "mobile_verify", 7);
    expect(unused()).toBe(1);
    await expect(consumeOtp("9876543210", "mobile_verify")).resolves.toBeUndefined();
    expect(unused()).toBe(0);
  });

  it("a code is valid now and refused once used", async () => {
    const { otp } = await createOtp("citizen@test.local", "password_reset", 7);
    expect(await verifyAndConsumeOtp("citizen@test.local", "password_reset", otp)).toMatchObject({ ok: true, userId: 7 });
    expect((await verifyAndConsumeOtp("citizen@test.local", "password_reset", otp)).ok).toBe(false);
  });

  it("a password reset succeeds once, and the same code cannot reset it again", async () => {
    const { otp } = await createOtp("reset@test.local", "password_reset", 8);
    const first = await resetWith(otp);
    expect(first.status).toBe(200);
    const hash = (h.db.prepare(`SELECT password_hash FROM users WHERE id = 8`).get() as { password_hash: string }).password_hash;
    expect(hash).not.toBe("old-hash");
    expect((await resetWith(otp)).status).toBe(400);
  });
});
