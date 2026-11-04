import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Staff sign in with the password alone, and confirm a guarded action with it: no authenticator step anywhere.
const PASSWORD = "test-only-password";
let hash = "";
const user = () => ({ id: 7, email: "collector@test", role: "collector", department_id: null, is_active: 1, token_version: 2, password_hash: hash });

vi.mock("@/lib/db", () => ({ default: { query: vi.fn(async () => [[user()]]) } }));
vi.mock("@/lib/security/audit", () => ({ securityLog: vi.fn(async () => undefined), recentEvents: vi.fn(async () => []) }));
vi.mock("@/lib/auth", () => ({
  migrateLegacyCookie: vi.fn(async () => undefined), setAuthCookie: vi.fn(),
  getSessionFromCookies: vi.fn(async () => ({ userId: 7, email: "collector@test", role: "collector", departmentId: null, tv: 2 }))
}));

const post = (url: string, body: unknown, ip: string) => new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": ip } });

describe("password only", () => {
  beforeAll(async () => { hash = await bcrypt.hash(PASSWORD, 4); });
  beforeEach(() => { process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret"; });

  it("a right password starts a staff session at once, with no second step", async () => {
    const { POST } = await import("./login/route");
    const { setAuthCookie } = await import("@/lib/auth");
    const r = await POST(post("/api/auth/login", { email: "collector@test.gov.in", password: PASSWORD }, "10.0.0.1"));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.redirectTo).toBe("/collector");
    expect(j.step).toBeUndefined();
    expect(j.ticket).toBeUndefined();
    expect(setAuthCookie).toHaveBeenCalled();
  });

  it("a wrong password is still refused", async () => {
    const { POST } = await import("./login/route");
    const r = await POST(post("/api/auth/login", { email: "collector@test.gov.in", password: "not-it" }, "10.0.0.2"));
    expect(r.status).toBe(401);
  });

  it("a guarded action is confirmed with the password; the app and recovery codes are gone", async () => {
    const { POST } = await import("./confirm/route");
    const check = { step: "check", action: "send_email", scope: "abcdefghijklmnop", summary: "Send 1 email" };
    const ok = await POST(post("/api/auth/confirm", { ...check, method: "password", code: PASSWORD }, "10.0.0.3"));
    const j = await ok.json();
    expect(ok.status).toBe(200);
    expect(j.factor).toBe("password");
    expect(typeof j.grant).toBe("string");
    expect((await POST(post("/api/auth/confirm", { ...check, method: "password", code: "wrong-password" }, "10.0.0.3"))).status).toBe(401);
    for (const method of ["authenticator", "recovery"]) expect((await POST(post("/api/auth/confirm", { ...check, method, code: "123456" }, "10.0.0.3"))).status).toBe(400);
  });
});
