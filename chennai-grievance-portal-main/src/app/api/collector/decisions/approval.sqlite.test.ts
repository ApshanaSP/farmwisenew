/**
 * The owner's decision of 27 Nov: an officer may send any open case to the Collector for approval. The Collector's verify was refused for
 * every case that was not Severe, so a Medium case the department sent could only be resolved, returned or rejected, never verified. Now
 * it can be verified while it waits for the Collector; a non-severe case nobody sent is still the department's to close.
 */
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, synced: [] as string[][] }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const conn = { query: async (sql: string, params: unknown[] = []) => run(sql, params), beginTransaction: async () => void h.db.exec("BEGIN"),
  commit: async () => void h.db.exec("COMMIT"), rollback: async () => void h.db.exec("ROLLBACK"), release: () => undefined };
vi.mock("@/lib/collector/db", () => ({ default: { query: async (s: string, p: unknown[]) => run(s, p), getConnection: async () => conn }, ops: (t: string) => t }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "collector@x", role: "collector", userId: 1 }) }));
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async (ids: string[]) => { h.synced.push(ids); return 0; } }));

const { POST } = await import("./route");
process.env.STEP_UP = "off";

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  h.synced = [];
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, lead_dept TEXT, severity_level TEXT, status_std TEXT, verified INTEGER, is_open INTEGER);
    CREATE TABLE ref_departments (code TEXT, route TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, at TEXT);
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY, actor TEXT, action TEXT, table_name TEXT, record_id TEXT, before_value TEXT, after_value TEXT);
    INSERT INTO incidents VALUES ('INC-SENT', 'GCC-SWM', 'Medium', 'Open', 0, 1), ('INC-OWN', 'GCC-SWM', 'Medium', 'Open', 0, 1), ('INC-BACK', 'GCC-SWM', 'Low', 'Open', 0, 1);
    INSERT INTO officer_steps (incident_id, dept_code, step, at) VALUES
      ('INC-SENT', 'GCC-SWM', 'approve', '2026-11-26 10:00:00'), ('INC-SENT', 'GCC-SWM', 'send', '2026-11-26 11:00:00'),
      ('INC-OWN', 'GCC-SWM', 'approve', '2026-11-26 10:00:00'),
      ('INC-BACK', 'GCC-SWM', 'send', '2026-11-26 11:00:00');
    INSERT INTO collector_decisions (incident_id, decision, decided_by, decided_role, decided_at) VALUES ('INC-BACK', 'reopen', 'collector@x', 'collector', '2026-11-26 12:00:00');`);
});

const decide = (ids: string[], decision: string) =>
  POST(new NextRequest("http://localhost/api/collector/decisions", { method: "POST", body: JSON.stringify({ incidentIds: ids, decision }) }));

describe("the Collector acts on a non-severe case its department sent for approval", () => {
  it("verify: recorded, and the citizen's tracker is updated", async () => {
    const r = await decide(["INC-SENT"], "verify");
    expect(r.status).toBe(201);
    expect(h.db.prepare("SELECT incident_id, decision FROM collector_decisions WHERE incident_id = 'INC-SENT'").all()).toEqual([{ incident_id: "INC-SENT", decision: "verify" }]);
    expect(h.synced).toEqual([["INC-SENT"]]);
  });

  it("a non-severe case nobody sent, or one already sent back, is still refused a verify", async () => {
    for (const id of ["INC-OWN", "INC-BACK"]) {
      const r = await decide([id], "verify");
      expect(r.status, id).toBe(409);
      expect((await r.json()).error).toMatch(/sent for your approval/);
    }
    // a bulk verify with one such case among them is refused whole
    expect((await decide(["INC-SENT", "INC-OWN"], "verify")).status).toBe(409);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM collector_decisions WHERE decision = 'verify'").get()).toEqual({ n: 0 });
  });

  it("a store without the officer tables keeps the old rule", async () => {
    h.db.exec("DROP TABLE officer_steps");
    expect((await decide(["INC-SENT"], "verify")).status).toBe(409);
  });
});
