/**
 * Who checks the finished work of a citizen's case (the tracker's chain, StatusTracker chainFor): the Collector for a severe case and for
 * any other case its department sent for the Collector's approval (27 Nov); else the department. A case the Collector sent back is with
 * the department again: it may close it itself or send it again, so it is no longer "sent" (the Collector's My Tasks and verify gate read
 * the same: a reopen at or after the send ends it). On an in-memory store through the AWS dialect.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    const st = h.db.prepare(s);
    return /^\s*SELECT/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
  }
};
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t }));
const { checkerOf } = await import("./complaint-progress");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT);
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, severity_level TEXT, sla_due_at TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, at TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, decided_role TEXT, decided_at TEXT);
    INSERT INTO events VALUES ('GRV-2026-111AAA', 'grievance', '2026-111AAA', 'INC-1');
    INSERT INTO incidents VALUES ('INC-1', 'Medium', '2026-10-20 09:00:00');
    INSERT INTO officer_steps (incident_id, dept_code, step, at) VALUES ('INC-1', 'GCC-SWD', 'approve', '2026-10-10 10:00:00');`);
});
const step = (s: string, at: string) => h.db.prepare(`INSERT INTO officer_steps (incident_id, dept_code, step, at) VALUES ('INC-1', 'GCC-SWD', ?, ?)`).run(s, at);
const decide = (d: string, at: string) => h.db.prepare(`INSERT INTO collector_decisions (incident_id, decision, decided_role, decided_at) VALUES ('INC-1', ?, 'collector', ?)`).run(d, at);

describe("who checks a non-severe case's work", () => {
  it("the department, until it sends the case for the Collector's approval", async () => {
    expect(await checkerOf("2026-111AAA")).toBe("department");
    step("send", "2026-10-11 10:00:00");
    expect(await checkerOf("2026-111AAA")).toBe("collector");
  });

  it("the department again once the Collector sends it back; the Collector once more if it is sent again", async () => {
    step("send", "2026-10-11 10:00:00");
    decide("reopen", "2026-10-11 12:00:00");
    expect(await checkerOf("2026-111AAA")).toBe("department");
    step("send", "2026-10-12 10:00:00");
    expect(await checkerOf("2026-111AAA")).toBe("collector");
  });

  it("a severe case is always the Collector's", async () => {
    h.db.exec(`UPDATE incidents SET severity_level = 'Severe'`);
    decide("reopen", "2026-10-11 12:00:00");
    expect(await checkerOf("2026-111AAA")).toBe("collector");
  });
});
