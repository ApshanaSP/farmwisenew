import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// reviewerA-04 (redsec2-15 and hunt2-sec-06, fix 99fda47). Goes in chennai-grievance-portal-main/src/app/api/auth/ next to
// enumeration.fixall.test.ts.
//
// The fix evens out the bcrypt work, but a registered e-mail still waits for database writes an unknown one never makes:
//  - sign-in: a wrong password on a staff account awaits securityLog (an INSERT into ops.audit_log) before the 401;
//  - forgot-password: a registered e-mail awaits createOtp's UPDATE and INSERT on password_resets before the answer.
// On the AWS store (DATA_BACKEND=aws, the PC with AWS_STORE_SAVE=1) every write outside a transaction ends with `await flush()`,
// a POST /store/write to AWS (lib/aws/store.ts, the pool's exec), so each of those writes adds a network round trip to the answer.
// WRITE_MS stands for that round trip; bcrypt is the same 20 ms on both sides. The Collector's and the officers' e-mails, the ones
// worth enumerating, answer a wrong password one round trip slower than an address with no account.

const T = vi.hoisted(() => ({ WRITE_MS: 150, BCRYPT_MS: 20, wait: (ms: number) => new Promise((r) => setTimeout(r, ms)) }));

vi.mock("@/lib/db", () => ({
  default: {
    query: async (sql: string, params: unknown[] = []) => {
      if (/FROM users WHERE email/i.test(sql)) {
        const e = String(params[0]);
        if (e === "collector@example.test") return [[{ id: 3, email: e, role: "collector", is_active: 1, password_hash: "$2a$10$staff", department_id: null, token_version: 0 }]];
        if (e === "citizen@example.test") return [[{ id: 1, email: e, role: "citizen", is_active: 1, password_hash: "$2a$10$citizen", department_id: null, token_version: 0 }]];
        return [[]];
      }
      if (/^\s*(INSERT|UPDATE)/i.test(sql)) { await T.wait(T.WRITE_MS); return [{ affectedRows: 1, insertId: 1 }]; }
      return [[]];
    }
  }
}));
vi.mock("@/lib/collector/db", () => ({
  default: { query: async (sql: string) => { if (/^\s*(INSERT|UPDATE)/i.test(sql)) await T.wait(T.WRITE_MS); return [[]]; } },
  ops: (t: string) => t
}));
vi.mock("bcryptjs", () => {
  const compare = async () => { await T.wait(T.BCRYPT_MS); return false; };
  const hash = async () => { await T.wait(T.BCRYPT_MS); return "$2a$10$stand.in.hash"; };
  return { default: { compare, hash }, compare, hash };
});
vi.mock("@/lib/mailer", () => ({ sendMail: async () => ({ ok: true }), otpEmailHtml: () => "<p>code</p>" }));
vi.mock("@/lib/security/session", () => ({ startSession: async () => new Response("{}", { status: 200 }) }));
vi.mock("@/lib/manu/login", () => ({ ensurePetitionLogin: async () => {} }));

const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: requestOtp } = await import("@/app/api/auth/forgot-password/request-otp/route");
const post = (body: unknown) => new NextRequest("http://localhost/api/auth/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const timed = async (f: () => Promise<Response>) => { const t = performance.now(); const r = await f(); return { ms: performance.now() - t, status: r.status }; };

describe("reviewerA-04: a registered e-mail does not wait for writes an unknown one never makes", () => {
  it("sign-in: a staff e-mail with a wrong password answers as fast as an unknown e-mail", async () => {
    const unknown = await timed(() => login(post({ email: "nobody.timing@example.test", password: "Wrong#Pass1" })));
    const staff = await timed(() => login(post({ email: "collector@example.test", password: "Wrong#Pass1" })));
    expect([unknown.status, staff.status]).toEqual([401, 401]);
    expect(Math.abs(staff.ms - unknown.ms)).toBeLessThan(T.WRITE_MS / 2); // today: the staff answer is one audit write slower
  });

  it("forgot-password: a registered e-mail answers as fast as an unknown e-mail", async () => {
    const unknown = await timed(() => requestOtp(post({ email: "nobody.timing.fp@example.test" })));
    const real = await timed(() => requestOtp(post({ email: "citizen@example.test" })));
    expect([unknown.status, real.status]).toEqual([200, 200]);
    expect(Math.abs(real.ms - unknown.ms)).toBeLessThan(T.WRITE_MS / 2); // today: two writes (UPDATE + INSERT) slower
  });
});
