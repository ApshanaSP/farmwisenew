import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// redsec2-15 and hunt2-sec-06: sign-in and forgot-password told a registered e-mail from an unknown one.
//  - sign-in skipped bcrypt for an unknown e-mail (an instant 401) and said "deactivated" before checking the password;
//  - forgot-password carried cooldownRemaining on a second request only for a real account, and only a real account paid for
//    the OTP hashing and the mail send before the answer.
// The database is a stand-in: one active citizen, one deactivated citizen, nothing else.

const H = vi.hoisted(() => ({ compare: 0, hash: 0, mailPending: 0, otpRows: new Map<string, number>() }));

vi.mock("@/lib/db", () => {
  const users: Record<string, Record<string, unknown>> = {
    "real@example.test": { id: 1, email: "real@example.test", role: "citizen", is_active: 1, password_hash: "$2a$10$real", department_id: null, token_version: 0 },
    "gone@example.test": { id: 2, email: "gone@example.test", role: "citizen", is_active: 0, password_hash: "$2a$10$gone", department_id: null, token_version: 0 }
  };
  return {
    default: {
      query: async (sql: string, params: unknown[]) => {
        if (/FROM users WHERE email/i.test(sql)) { const u = users[String(params[0])]; return [u ? [u] : []]; }
        return [[]];
      }
    }
  };
});
vi.mock("bcryptjs", () => {
  const compare = async (pw: string, hash: string) => { H.compare++; await new Promise((r) => setTimeout(r, 5)); return pw === "Right#Pass1" && hash !== "$2a$10$xBGnKsd/9u1SMQo6r9/13OcEgaVN/tzNMJvYLyb6dVqr1e9y4/75S"; };
  const hash = async () => { H.hash++; return "$2a$10$h"; };
  return { default: { compare, hash }, compare, hash };
});
vi.mock("@/lib/otp", () => ({
  createOtp: async (email: string) => {
    H.hash++;
    const at = H.otpRows.get(email);
    if (at !== undefined && Date.now() - at < 60_000) return { otp: "", cooldownRemaining: Math.ceil((60_000 - (Date.now() - at)) / 1000) };
    H.otpRows.set(email, Date.now());
    return { otp: "123456" };
  },
  devOtpForResponse: () => undefined
}));
// a mail server that never answers: the route must not wait for it
vi.mock("@/lib/mailer", () => ({ sendMail: () => { H.mailPending++; return new Promise(() => {}); }, otpEmailHtml: () => "<p>code</p>" }));
vi.mock("@/lib/security/session", () => ({ startSession: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) }));
vi.mock("@/lib/security/audit", () => ({ securityLog: async () => {} }));
vi.mock("@/lib/manu/login", () => ({ ensurePetitionLogin: async () => {} }));

const { POST: login } = await import("./login/route");
const { POST: requestOtp } = await import("./forgot-password/request-otp/route");

let n = 0;
const post = (body: unknown) => new NextRequest("http://localhost/api/x", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${n % 250}.${++n % 250}` }, body: JSON.stringify(body)
});

beforeEach(() => { H.compare = 0; H.hash = 0; H.mailPending = 0; });

describe("redsec2-15: sign-in answers an unknown e-mail like a registered one", () => {
  it("an unknown e-mail runs the same bcrypt check as a registered one, and gets the same 401", async () => {
    const a = await login(post({ email: "real@example.test", password: "Wrong#Pass1" }));
    expect(H.compare).toBe(1);
    const b = await login(post({ email: `nobody.${n}@example.test`, password: "Wrong#Pass1" }));
    expect(H.compare).toBe(2);
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(await b.json()).toEqual(await a.json());
  });

  it("a deactivated account with a wrong password is the generic 401, not 'deactivated'", async () => {
    const r = await login(post({ email: "gone@example.test", password: "Wrong#Pass1" }));
    expect(r.status).toBe(401);
    expect(JSON.stringify(await r.json())).not.toMatch(/deactivated/i);
    expect(H.compare).toBe(1);
  });

  it("a deactivated account is told so only with the right password", async () => {
    const r = await login(post({ email: "gone@example.test", password: "Right#Pass1" }));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/deactivated/i);
  });
});

describe("hunt2-sec-06: forgot-password answers an unknown e-mail like a registered one", () => {
  it("the second request inside the cooldown carries cooldownRemaining for both", async () => {
    const real = "real@example.test", unknown = `nobody.fp.${Date.now()}@example.test`;
    const shapes: string[][] = [];
    for (const email of [real, unknown]) for (let i = 0; i < 2; i++) {
      const r = await requestOtp(post({ email }));
      expect(r.status).toBe(200);
      shapes.push(Object.keys(await r.json()).filter((k) => k !== "devOtp").sort());
    }
    expect(shapes[0]).toEqual(["message"]);
    expect(shapes[1]).toEqual(["cooldownRemaining", "message"]);
    expect(shapes[2]).toEqual(shapes[0]);
    expect(shapes[3]).toEqual(shapes[1]);
  });

  it("an unknown e-mail does the OTP hashing work too, and a real one does not wait for the mail server", async () => {
    const unknown = `nobody.work.${Date.now()}@example.test`;
    await requestOtp(post({ email: unknown }));
    expect(H.hash).toBe(1);
    H.otpRows.clear();
    const r = await Promise.race([
      requestOtp(post({ email: "real@example.test" })).then((x) => x.status),
      new Promise((res) => setTimeout(() => res("waited for the mail"), 2000))
    ]);
    expect(r).toBe(200);
    expect(H.mailPending).toBe(1);
  });
});
