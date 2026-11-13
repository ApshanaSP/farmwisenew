import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { signToken } from "@/lib/jwt";

// reviewer4-06: a tab copy (/api/auth/tab -> copySlot) and the legacy-cookie move set a staff session's cookie with the citizen's
// 7-day Max-Age. The token inside still ended at 12 h, but the cookie lingered. A copied cookie now lasts as long as its token.

const JAR = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (JAR.has(n) ? { name: n, value: JAR.get(n) } : undefined),
    getAll: () => [...JAR].map(([name, value]) => ({ name, value }))
  }),
  headers: async () => new Headers()
}));
vi.mock("@/lib/db", () => ({ default: { query: async () => [[]] } }));

const { copySlot, migrateLegacyCookie } = await import("./auth");

const maxAgeOf = (res: NextResponse, name: string) => res.cookies.get(name)?.maxAge;
const officer = { userId: 9, email: "officer@example.test", role: "department_officer" as const, departmentId: 2, tv: 0 };

describe("reviewer4-06: a copied session cookie lasts as long as its token", () => {
  it("a staff tab copy gets at most the token's 12 hours, not 7 days", async () => {
    JAR.clear();
    JAR.set("dcd_session_officer__fromtab01", await signToken(officer, "12h"));
    const res = NextResponse.json({});
    await copySlot(res, "fromtab01", "newtab0001");
    const age = maxAgeOf(res, "dcd_session_officer__newtab0001");
    expect(age).toBeGreaterThan(12 * 3600 - 60);
    expect(age).toBeLessThanOrEqual(12 * 3600);
  });

  it("moving a pre-per-tab staff cookie keeps the token's length too", async () => {
    JAR.clear();
    JAR.set("dcd_session", await signToken(officer, "2h"));
    const res = NextResponse.json({});
    await migrateLegacyCookie(res);
    const age = maxAgeOf(res, "dcd_session_officer");
    expect(age).toBeGreaterThan(2 * 3600 - 60);
    expect(age).toBeLessThanOrEqual(2 * 3600);
  });

  it("a citizen's copy still gets its 7 days", async () => {
    JAR.clear();
    JAR.set("dcd_session_citizen__fromtab01", await signToken({ ...officer, role: "citizen", departmentId: null }));
    const res = NextResponse.json({});
    await copySlot(res, "fromtab01", "newtab0001");
    expect(maxAgeOf(res, "dcd_session_citizen__newtab0001")).toBeGreaterThan(7 * 86400 - 60);
  });
});
