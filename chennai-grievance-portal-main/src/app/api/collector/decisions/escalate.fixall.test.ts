/** hunt2-ops-03: an escalate naming another department was accepted (confirmed, recorded, audited) but no reader moves a case: the officer of that department got 404 and the case stayed with its own department. */
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
    INSERT INTO incidents VALUES ('INC-1', 'GCC-SWD', 'Severe', 'Awaiting verification', 0, 1);
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'AE > EE > SE'), ('GCC-ELE', 'AE > EE');`);
});

const verify = () => POST(new NextRequest("http://localhost/api/collector/decisions", { method: "POST", body: JSON.stringify({ incidentIds: ["INC-1"], decision: "verify" }) }));

// the route's own logic, without a person to type the confirmation code (step-up is tested in lib/security/stepup.test.ts)
process.env.STEP_UP = "off";

const escalate = (to?: string) => POST(new NextRequest("http://localhost/api/collector/decisions", { method: "POST", body: JSON.stringify({ incidentIds: ["INC-1"], decision: "escalate", ...(to ? { escalateTo: to } : {}) }) }));
const rows = () => h.db.prepare("SELECT decision, escalate_to FROM collector_decisions").all();

describe("hunt2-ops-03: an escalate never claims to send a case to another department", () => {
  it("escalateTo another department is refused, and nothing is recorded or audited", async () => {
    const r = await escalate("GCC-ELE");
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/another department/);
    expect(rows()).toEqual([]);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM audit_log").get()).toEqual({ n: 0 });
  });
  it("an escalate up the case's own department's chain is recorded as before", async () => {
    expect((await escalate()).status).toBeLessThan(300);
    expect((await escalate("GCC-SWD")).status).toBeLessThan(300);
    expect(rows().every((x) => (x as { escalate_to: string }).escalate_to === "GCC-SWD")).toBe(true);
  });
});
