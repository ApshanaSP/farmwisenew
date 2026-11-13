/**
 * QA pass 7 (pass 4's red team, redteam-final-1, P0): a citizen's sign-in (their e-mail, user id, IP and browser) reached the Collector's
 * console. startSession() writes an auth:signin row for every role into ops.audit_log (each account's own sign-in history reads it back),
 * and auditLog() handed the newest 200 rows of that log to GET /api/collector/audit unfiltered.
 * The rule tested here: the Collector's view of the log never holds a row whose actor is a citizen account, nor a security row whose
 * actor is an e-mail that is no staff account (a deleted citizen), and the Collector still gets a full page of staff and system rows.
 * Runs on an in-memory store through the AWS store's MySQL -> SQLite translation, like glossary.sqlite.test.ts.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    const st = h.db.prepare(s);
    return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
  }
};
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => {}, auditIn: async () => {}, inTransaction: async () => {} }));

const { auditLog } = await import("./workspaces");

const CITIZEN = "qa.citizen.a@example.test", GONE = "deleted.citizen@example.test";
const COLLECTOR = "collector@chennai.gov.in", OFFICER = "officer.swm@chennai.gov.in";

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT '2026-11-13 10:00:00', actor TEXT, action TEXT,
      table_name TEXT, record_id TEXT, before_value TEXT, after_value TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, role TEXT);`);
  const u = db.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, ?)");
  u.run(1, COLLECTOR, "collector"); u.run(2, OFFICER, "department_officer"); u.run(3, CITIZEN.toUpperCase(), "citizen");
  h.db = db;
  return db;
}
const log = (actor: string, action: string, table: string, detail: Record<string, unknown> = {}) =>
  h.db.prepare("INSERT INTO audit_log (actor, action, table_name, record_id, after_value) VALUES (?, ?, ?, ?, ?)").run(actor, action, table, "1", JSON.stringify(detail));

describe("the Collector's audit log holds no citizen's details (redteam-final-1)", () => {
  beforeEach(() => { fresh(); });

  it("a citizen's sign-in, e-mail and IP never reach the Collector; staff and system rows still do", async () => {
    log(COLLECTOR, "auth:signin", "security", { ip: "10.0.0.1" });
    log(CITIZEN, "auth:signin", "security", { ip: "203.0.113.9", ua: "Mozilla/5.0" });
    log(OFFICER, "decision:verify", "collector_decisions", { incident: "INC-1" });
    log(GONE, "auth:signin", "security", { ip: "198.51.100.7" });
    log("pipeline", "source:run", "source_runs", { items: 4 });
    const rows = await auditLog();
    const text = JSON.stringify(rows);
    expect(text).not.toContain(CITIZEN);
    expect(text).not.toContain(GONE);
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("198.51.100.7");
    expect(rows.map((r) => r.actor).sort()).toEqual([COLLECTOR, OFFICER, "pipeline"].sort());
  });

  it("many citizen sign-ins do not push the staff rows out of the Collector's page", async () => {
    for (let i = 0; i < 30; i++) log(COLLECTOR, `decision:${i}`, "collector_decisions");
    for (let i = 0; i < 400; i++) log(CITIZEN, "auth:signin", "security", { ip: "203.0.113.9" });
    const rows = await auditLog(20);
    expect(rows).toHaveLength(20);
    expect(rows.every((r) => r.actor === COLLECTOR)).toBe(true);
  });
});
