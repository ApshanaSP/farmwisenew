// QA4 gate fix: redteam-final-3. Only wrong passwords count against the sign-in limit; right ones never lock an account.
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ hash: "" }));
vi.mock("@/lib/db", () => ({ default: { query: vi.fn(async () => [[{ id: 7, email: "officer@test", role: "department_officer", department_id: 1, is_active: 1, token_version: 0, password_hash: h.hash }]]) } }));
vi.mock("@/lib/security/audit", () => ({ securityLog: vi.fn(async () => undefined), recentEvents: vi.fn(async () => []) }));
vi.mock("@/lib/auth", () => ({ migrateLegacyCookie: vi.fn(async () => undefined), setAuthCookie: vi.fn() }));

const PASSWORD = "Right-Password-1!";
const post = (email: string, password: string, ip = "10.1.1.1") => new NextRequest("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json", "x-forwarded-for": ip } });

describe("sign-in limit counts wrong passwords only", () => {
  beforeAll(async () => { h.hash = await bcrypt.hash(PASSWORD, 4); });
  beforeEach(async () => {
    process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret";
    process.env.TRUST_PROXY_HOPS = "1";
    const { clearFailures } = await import("@/lib/rate-limit");
    for (const k of ["login-fail:officer@test.gov.in", "login-fail:officer@test.gov.in|10.1.1.1", "login-fail:officer@test.gov.in|10.1.1.9"]) clearFailures(k);
  });

  it("redteam-final-3: the right password signs in 12 times in a row (the old limit was 8 tries of any kind)", async () => {
    const { POST } = await import("./route");
    const st: number[] = [];
    for (let i = 0; i < 12; i++) st.push((await POST(post("officer@test.gov.in", PASSWORD, `10.2.0.${i}`))).status);
    expect(st.every((s) => s === 200)).toBe(true);
  });
  it("eight wrong passwords from one address lock that address for this account, with 429, even for the right password", async () => {
    const { POST } = await import("./route");
    const st: number[] = [];
    for (let i = 0; i < 8; i++) st.push((await POST(post("officer@test.gov.in", `wrong-${i}`))).status);
    expect(st).toEqual([401, 401, 401, 401, 401, 401, 401, 401]);
    expect((await POST(post("officer@test.gov.in", "wrong-9"))).status).toBe(429);
    expect((await POST(post("officer@test.gov.in", PASSWORD))).status).toBe(429);
  });
  it("one address's wrong guesses do not lock the account's owner on another address", async () => {
    const { POST } = await import("./route");
    for (let i = 0; i < 9; i++) await POST(post("officer@test.gov.in", `wrong-${i}`, "10.1.1.9"));
    expect((await POST(post("officer@test.gov.in", PASSWORD, "10.1.1.1"))).status).toBe(200);
  });
  it("a right password clears the count; a burst of 30 parallel wrong passwords checks only eight", async () => {
    const { POST } = await import("./route");
    (await import("@/lib/rate-limit")).clearFailures("login-fail:officer@test.gov.in|10.4.4.4");
    for (let i = 0; i < 5; i++) await POST(post("officer@test.gov.in", `wrong-${i}`, "10.4.4.4"));
    expect((await POST(post("officer@test.gov.in", PASSWORD, "10.4.4.4"))).status).toBe(200);
    const spy = vi.spyOn(bcrypt, "compare");
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => POST(post("officer@test.gov.in", `burst-${i}`, "10.4.4.4"))));
    expect(rs.filter((r) => r.status === 401).length).toBe(8);
    expect(spy.mock.calls.length).toBe(8);
    spy.mockRestore();
  });
  it("all addresses together are held to 40 wrong passwords per account", async () => {
    const { POST } = await import("./route");
    const { clearFailures } = await import("@/lib/rate-limit");
    clearFailures("login-fail:officer@test.gov.in");
    let n401 = 0;
    for (let i = 0; i < 50; i++) if ((await POST(post("officer@test.gov.in", `spread-${i}`, `10.3.${Math.floor(i / 8)}.${i % 8}`))).status === 401) n401++;
    expect(n401).toBe(40);
    for (let i = 0; i < 8; i++) clearFailures(`login-fail:officer@test.gov.in|10.3.${Math.floor(i)}.${i}`);
  });
});
