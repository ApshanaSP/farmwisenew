// QA4 gate fix: skeptic-redsec1-1 / redteam-final-13 / FB-6. A session cookie copied before sign-out must stop working.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ revoked: [] as number[], session: { userId: 31, role: "citizen" } as { userId: number; role: string } | null }));
vi.mock("@/lib/auth", () => ({
  clearAuthCookie: async () => {},
  getPortalSession: async () => h.session,
  getSessionFromCookies: async () => h.session,
  migrateLegacyCookie: async () => {},
  resolvePortal: async () => "citizen",
  revokeSessions: async (id: number) => { h.revoked.push(id); return 1; }
}));

describe("sign-out ends the session on the server", () => {
  it("skeptic-redsec1-1: signing out raises the account's token version, so a copied cookie is refused", async () => {
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(h.revoked).toEqual([31]);
  });
  it("signing out with no session still answers 200 and revokes nothing", async () => {
    h.revoked.length = 0;
    h.session = null;
    const { POST } = await import("./route");
    expect((await POST()).status).toBe(200);
    expect(h.revoked).toEqual([]);
  });
});
