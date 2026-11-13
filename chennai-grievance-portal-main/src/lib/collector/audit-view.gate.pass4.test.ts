// QA4 gate fix: redteam-final-1. The Collector's audit tab must not list a citizen's sign-in (email, user id, IP, browser).
import { describe, expect, it, vi } from "vitest";

// QA pass 7 merge: the first case tests what the tab lists, not pass 4's SQL text: pass 7's filter (staffVisible in workspaces.ts) is kept over
// pass 4's, so the log's rows are read and each actor's role decides (src/lib/collector/auditview.pass7.test.ts has the rest).
const h = vi.hoisted(() => ({ sql: [] as string[], args: [] as unknown[][], writes: [] as unknown[][], log: [] as Record<string, unknown>[] }));
vi.mock("@/lib/collector/db", () => ({
  default: { query: async (sql: string, a: unknown[]) => { if (/INSERT/.test(sql)) h.writes.push(a); else { h.sql.push(sql); h.args.push(a); } return [/FROM audit_log/.test(sql) && Number(a[1] ?? 0) === 0 ? h.log : [], []]; } },
  ops: (t: string) => t
}));
vi.mock("@/lib/db", () => ({ default: { query: async () => [[{ email: "officer@x.test", role: "department_officer" }, { email: "collector@x.test", role: "collector" }, { email: "citizen@x.test", role: "citizen" }]] } }));
vi.mock("@/lib/auth", () => ({ migrateLegacyCookie: async () => {}, setAuthCookie: async () => {} }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => {}, auditIn: async () => {}, inTransaction: async (f: unknown) => f }));

describe("what the Collector's audit tab lists", () => {
  it("redteam-final-1: security rows are listed only for staff accounts, never for a citizen", async () => {
    h.log = [
      { id: 4, actor: "citizen@x.test", action: "auth:signin", table_name: "security", after_value: '{"ip":"203.0.113.9"}' },
      { id: 3, actor: "officer@x.test", action: "auth:signin", table_name: "security", after_value: '{"ip":"10.0.0.2"}' },
      { id: 2, actor: "gone@x.test", action: "auth:signin", table_name: "security", after_value: '{"ip":"198.51.100.7"}' },
      { id: 1, actor: "collector@x.test", action: "decision:verify", table_name: "collector_decisions", after_value: "{}" }
    ];
    const { auditLog } = await import("./workspaces");
    const rows = await auditLog(50);
    expect(rows.map((r) => r.actor)).toEqual(["officer@x.test", "collector@x.test"]);
    expect(JSON.stringify(rows)).not.toMatch(/citizen@x\.test|203\.0\.113\.9|gone@x\.test/);
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
