// QA4 gate fix: redteam-final-1. The Collector's audit tab must not list a citizen's sign-in (email, user id, IP, browser).
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sql: [] as string[], args: [] as unknown[][], writes: [] as unknown[][] }));
vi.mock("@/lib/collector/db", () => ({
  default: { query: async (sql: string, a: unknown[]) => { if (/INSERT/.test(sql)) h.writes.push(a); else { h.sql.push(sql); h.args.push(a); } return [[], []]; } },
  ops: (t: string) => t
}));
vi.mock("@/lib/db", () => ({ default: { query: async () => [[{ email: "officer@x.test" }, { email: "collector@x.test" }]] } }));
vi.mock("@/lib/auth", () => ({ migrateLegacyCookie: async () => {}, setAuthCookie: async () => {} }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => {}, auditIn: async () => {}, inTransaction: async (f: unknown) => f }));

describe("what the Collector's audit tab lists", () => {
  it("redteam-final-1: security rows are listed only for staff accounts, never for a citizen", async () => {
    const { auditLog } = await import("./workspaces");
    await auditLog(50);
    const i = h.sql.length - 1;
    expect(h.sql[i]).toMatch(/table_name\s*<>\s*'security'\s+OR\s+actor\s+IN/i);
    expect(h.args[i]).toEqual(["officer@x.test", "collector@x.test", 50]);
  });
  it("a citizen's sign-in is not written to the security log at all (nothing in the app reads it)", async () => {
    const { startSession } = await import("@/lib/security/session");
    h.writes.length = 0;
    await startSession({ id: 9, email: "citizen@x.test", role: "citizen", department_id: null, tv: 0 }, { factor: null, ip: "direct", ua: "ua" });
    expect(h.writes.length).toBe(0);
    await startSession({ id: 3, email: "officer@x.test", role: "department_officer", department_id: 1, tv: 0 }, { factor: null, ip: "direct", ua: "ua" });
    expect(h.writes.length).toBe(1);
  });
});
