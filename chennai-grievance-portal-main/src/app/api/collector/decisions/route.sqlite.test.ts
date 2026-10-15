/** A Collector's double-clicked decision is recorded (and audited) once, on an in-memory store through the AWS dialect. */
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
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
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async () => 0 }));

const { POST } = await import("./route");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, lead_dept TEXT, severity_level TEXT, status_std TEXT, verified INTEGER, is_open INTEGER);
    CREATE TABLE ref_departments (code TEXT, route TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY, actor TEXT, action TEXT, table_name TEXT, record_id TEXT, before_value TEXT, after_value TEXT);
    INSERT INTO incidents VALUES ('INC-1', 'GCC-SWD', 'Severe', 'Awaiting verification', 0, 1);`);
});

const verify = () => POST(new NextRequest("http://localhost/api/collector/decisions", { method: "POST", body: JSON.stringify({ incidentIds: ["INC-1"], decision: "verify" }) }));

describe("Collector decisions", () => {
  it("records a double-clicked verify once, with one audit row, and answers both with the same decision", async () => {
    const a = await (await verify()).json();
    const b = await (await verify()).json();
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM collector_decisions").get()).toEqual({ n: 1 });
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM audit_log").get()).toEqual({ n: 1 });
    expect(b.saved[0].decision_id).toBe(a.saved[0].decision_id);
  });
});
