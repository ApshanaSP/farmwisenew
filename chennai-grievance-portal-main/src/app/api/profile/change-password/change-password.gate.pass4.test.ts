// QA4 gate fix: redteam-final-2. Change-password answers password guesses; a copied cookie must not get unlimited ones.
import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ hash: "", updates: 0 }));
vi.mock("@/lib/db", () => ({
  default: { query: async (sql: string) => { if (/^UPDATE users SET password_hash/.test(sql)) { h.updates++; return [{ affectedRows: 1 }]; } return [[{ id: 77, email: "o@x.test", password_hash: h.hash, role: "department_officer" }]]; } }
}));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => ({ userId: 77, email: "o@x.test", role: "department_officer", departmentId: 1 }),
  resolvePortal: async () => "officer", revokeSessions: async () => 1, setAuthCookie: async () => {}
}));

const call = async (currentPassword: string) => {
  const { POST } = await import("./route");
  const req = new Request("http://x/api/profile/change-password", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword: "Brand-New-Pass-9!", confirmPassword: "Brand-New-Pass-9!" }) });
  return POST(req as never);
};

describe("change-password guesses are limited", () => {
  beforeAll(async () => { h.hash = await bcrypt.hash("Right-Pass-1!", 4); });
  beforeEach(async () => { h.updates = 0; (await import("@/lib/rate-limit")).clearFailures("confirm-fail:77"); });

  it("redteam-final-2: after five wrong passwords the next ones are refused with 429 and not checked", async () => {
    const spy = vi.spyOn(bcrypt, "compare");
    const st: number[] = [];
    for (let i = 0; i < 8; i++) st.push((await call(`Wrong-Guess-${i}-x!`)).status);
    expect(st.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(st.slice(5)).toEqual([429, 429, 429]);
    expect(spy.mock.calls.length).toBe(5);
    // the right password is refused too while the lock holds, as in Confirm it's you
    expect((await call("Right-Pass-1!")).status).toBe(429);
    expect(h.updates).toBe(0);
    spy.mockRestore();
  });
  it("a burst of 20 parallel guesses checks at most five", async () => {
    const spy = vi.spyOn(bcrypt, "compare");
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => call(`Burst-Guess-${i}-x!`)));
    expect(rs.filter((r) => r.status === 400).length).toBeLessThanOrEqual(5);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
    spy.mockRestore();
  });
  it("the right password still works with no earlier wrong ones, and clears the count", async () => {
    expect((await call("Wrong-1-x!")).status).toBe(400);
    expect((await call("Right-Pass-1!")).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await call(`W${i}-wrong-pass!`)).status).toBe(400);
  });
});
