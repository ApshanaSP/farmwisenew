import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRANT_HEADER, issueGrant, scopeHash } from "@/lib/security/stepup";

// hunt2-sec-10: "Sign out other sessions" needed no confirmation, so whoever held a copied staff cookie could end the owner's
// sessions and keep a fresh 12-hour one. It now asks for the password (or an e-mailed code) first, like every other guarded action.

const S = { userId: 41, email: "officer@example.test", role: "department_officer" as const, departmentId: 3, tv: 5 };
const H = vi.hoisted(() => ({ revoked: 0 }));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => S,
  revokeSessions: async () => { H.revoked++; return 6; },
  setAuthCookie: async () => {}
}));
vi.mock("@/lib/security/audit", () => ({ securityLog: async () => {}, recentEvents: async () => [] }));
vi.mock("@/lib/security/stamp", () => ({ checkRef: async () => ({ genuine: false }) }));

const { POST } = await import("./route");
const req = (headers: Record<string, string> = {}) => new NextRequest("http://localhost/api/auth/security", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ action: "signout_others" })
});

beforeEach(() => { H.revoked = 0; });

describe("hunt2-sec-10: signing out the other sessions is confirmed first", () => {
  it("a session cookie alone gets the confirm answer, and nothing is revoked", async () => {
    const r = await POST(req());
    expect(r.status).toBe(428);
    expect((await r.json()).confirm).toMatchObject({ action: "signout_others" });
    expect(H.revoked).toBe(0);
  });

  it("with a grant for this account and session, the other sessions are ended", async () => {
    const g = await issueGrant(S, "signout_others", scopeHash({ uid: S.userId, tv: S.tv }), "password");
    const r = await POST(req({ [GRANT_HEADER]: g }));
    expect(r.status).toBe(200);
    expect(H.revoked).toBe(1);
  });

  it("a grant for another action does not do it", async () => {
    const g = await issueGrant(S, "export", scopeHash({ uid: S.userId, tv: S.tv }), "password");
    const r = await POST(req({ [GRANT_HEADER]: g }));
    expect(r.status).toBe(428);
    expect(H.revoked).toBe(0);
  });
});
