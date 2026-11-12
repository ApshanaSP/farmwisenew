/**
 * QA pass 6, P6-016 (redsec2-10): changing the password signs this browser in again, and for a staff account (the Collector, an officer, the
 * petition desk) that new session lasted the citizen's 7 days, not the staff session's 12 hours (STAFF_SESSION_HOURS). The route is real; the
 * session, the store and the cookie writer are replaced so the test can read the token it would set.
 */
import bcrypt from "bcryptjs";
import { decodeJwt } from "jose";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ role: "collector", cookie: null as null | { token: string; maxAge?: number } }));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => ({ userId: 9, email: "x@example.test", role: h.role, departmentId: null }),
  resolvePortal: async () => (h.role === "citizen" ? "citizen" : h.role === "collector" ? "collector" : "officer"),
  revokeSessions: async () => 3,
  setAuthCookie: async (_res: unknown, token: string, _portal: string, maxAge?: number) => { h.cookie = { token, maxAge }; }
}));
const hash = bcrypt.hashSync("Old-Passw0rd!", 4);
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: { query: async (sql: string) => (/^SELECT/i.test(sql) ? [[{ id: 9, password_hash: hash }]] : [{ affectedRows: 1 }]) } }));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));

const { POST } = await import("./route");
const change = () => POST(new NextRequest("http://x/api/profile/change-password", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ currentPassword: "Old-Passw0rd!", newPassword: "New-Passw0rd!2026", confirmPassword: "New-Passw0rd!2026" }) }));
const lifeHours = () => { const p = decodeJwt(h.cookie!.token); return ((p.exp ?? 0) - (p.iat ?? 0)) / 3600; };

beforeEach(() => { h.cookie = null; });

describe("QA pass 6, P6-016: a new session after a password change keeps the account's session length", () => {
  for (const role of ["collector", "department_officer"]) {
    it(`${role}: the staff session's 12 hours, in the token and the cookie`, async () => {
      h.role = role;
      const r = await change();
      expect(r.status, await r.clone().text()).toBe(200);
      expect(lifeHours()).toBeLessThanOrEqual(24);
      expect(h.cookie!.maxAge).toBeLessThanOrEqual(24 * 3600);
    });
  }
  it("a citizen keeps 7 days, as before", async () => {
    h.role = "citizen";
    expect((await change()).status).toBe(200);
    expect(lifeHours()).toBeGreaterThan(24);
  });
});
