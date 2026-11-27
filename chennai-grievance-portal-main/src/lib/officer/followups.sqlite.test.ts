/**
 * The follow-ups the Collector's instructions set were never read back: every one stayed 'pending', and the department pop-up listed work
 * the department had long since sent (the integration review, 27 Nov). The job closes those the department answered, and those the
 * Collector closed meanwhile; the rest stay pending, which is what the pop-up lists as late. On an in-memory store through the AWS dialect.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, writes: [] as string[] }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  h.writes.push(s);
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
vi.mock("@/lib/collector/db", () => ({ default: { query: async (s: string, p: unknown[]) => run(s, p) }, ops: (t: string) => t }));

const { closeAnsweredFollowups, followupsTick } = await import("./followups");
const { dataEpoch } = await import("@/lib/collector/epoch");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  h.writes = [];
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, at TEXT);
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, sent_at TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, decided_at TEXT);
    CREATE TABLE followups (followup_id INTEGER PRIMARY KEY, email_id INTEGER, contact_id INTEGER, incident_id TEXT, summary TEXT, due_date TEXT,
      status TEXT DEFAULT 'pending', last_checked_at TEXT, created_at TEXT);
    INSERT INTO followups (followup_id, email_id, incident_id, summary, due_date, created_at) VALUES
      (1, 1, 'INC-SENT', 'Completion report with photos from SWD', '2026-11-10 10:00:00', '2026-11-09 10:00:00'),
      (2, 2, 'INC-CLOSED', 'Completion report with photos from SWD', '2026-11-10 10:00:00', '2026-11-09 10:00:00'),
      (3, 3, 'INC-OLD', 'Completion report with photos from SWD', '2026-11-10 10:00:00', '2026-11-09 10:00:00'),
      (4, 4, 'INC-WAIT', 'Completion report with photos from SWD', '2026-11-10 10:00:00', '2026-11-09 10:00:00'),
      (5, 5, 'INC-DECIDED', 'Completion report with photos from SWD', '2026-11-10 10:00:00', '2026-11-09 10:00:00'),
      (6, 6, 'INC-SENT', '[RR] {"r":"r1","d":"GCC-SWD"} Clear the drain', '2026-11-10', '2026-11-09 10:00:00'),
      (7, 7, 'INC-REPORT', 'Completion report with photos from SWD', '2026-11-10 10:00:00', '2026-11-09 10:00:00');
    INSERT INTO officer_steps (incident_id, dept_code, step, at) VALUES
      ('INC-SENT', 'GCC-SWD', 'send', '2026-11-09 15:00:00'),
      ('INC-CLOSED', 'GCC-SWD', 'close', '2026-11-09 16:00:00'),
      ('INC-OLD', 'GCC-SWD', 'close', '2026-11-08 16:00:00'),
      ('INC-WAIT', 'GCC-SWD', 'approve', '2026-11-09 12:00:00');
    INSERT INTO officer_reports (incident_id, sent_at) VALUES ('INC-REPORT', '2026-11-09 18:00:00');
    INSERT INTO collector_decisions (incident_id, decision, decided_at) VALUES ('INC-DECIDED', 'resolve', '2026-11-09 17:00:00'), ('INC-WAIT', 'note', '2026-11-09 17:00:00');`);
});

const status = () => Object.fromEntries((h.db.prepare("SELECT followup_id AS id, status FROM followups ORDER BY followup_id").all() as { id: number; status: string }[]).map((r) => [r.id, r.status]));

describe("the follow-ups job", () => {
  it("closes what the department answered after the follow-up was set, and what the Collector closed; the rest stay owed", async () => {
    expect(await closeAnsweredFollowups("2026-11-10 09:00:00")).toEqual({ done: 3, closed: 1 });
    expect(status()).toEqual({
      1: "done", // sent to the Collector with a report
      2: "done", // closed by the department
      3: "pending", // closed before the instruction: the instruction asks for more
      4: "pending", // only approved: no report yet (and a note is no decision)
      5: "closed", // the Collector resolved it
      6: "pending", // a rain rehearsal job: its own flow marks it done
      7: "done" // a completion report
    });
    expect((h.db.prepare("SELECT last_checked_at FROM followups WHERE followup_id = 1").get() as { last_checked_at: string }).last_checked_at).toBe("2026-11-10 09:00:00");
  });

  it("a second run changes nothing and writes nothing; a run with nothing to close leaves the caches alone", async () => {
    await closeAnsweredFollowups();
    h.writes = [];
    const e = dataEpoch();
    expect(await closeAnsweredFollowups()).toEqual({ done: 0, closed: 0 });
    expect(h.writes).toEqual([]);
    expect(dataEpoch()).toBe(e);
  });

  it("the scheduler's tick runs at most every 5 minutes, and a store without the tables is skipped quietly", async () => {
    global.__followupsAt = 0;
    await followupsTick();
    expect(status()[1]).toBe("done");
    h.db.exec(`UPDATE followups SET status = 'pending'`);
    await followupsTick(); // within 5 minutes: not run
    expect(status()[1]).toBe("pending");
    global.__followupsAt = 0;
    h.db.exec(`DROP TABLE followups`);
    await expect(followupsTick()).resolves.toBeUndefined();
  });
});
