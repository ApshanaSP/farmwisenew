// The integration review, 27 Nov: the "came before" check offered to attach a petition to an earlier online complaint's case by the
// website's id, INC-W-<code>. Once the hourly build imported that complaint into a case of its own, no build held INC-W any more, so the
// attach found nothing and opened a separate case. The check now names the case the build holds the filing in, and keeps INC-W only when
// the build has nothing else. Harness: in-memory SQLite through the store translation (repeat.own.fixall.test.ts), on the AWS store.
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => fn(pool) }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));

const { findRepeats } = await import("@/lib/manu/repeat");

let was: string | undefined;
beforeAll(() => { was = process.env.DATA_BACKEND; process.env.DATA_BACKEND = "aws"; });
afterAll(() => { process.env.DATA_BACKEND = was; });

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL DEFAULT 'counter', status TEXT NOT NULL DEFAULT 'reading', pages TEXT NOT NULL, name TEXT, mobile TEXT,
      address TEXT, area TEXT, ward_number INT, dept_code TEXT, category_code TEXT, problem TEXT, complaint_code TEXT, incident_id TEXT, filed_at TEXT, created_at TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, user_id INT, first_name TEXT, street_address TEXT, mobile_number TEXT, ward_number INT, department_id INT,
      title TEXT, description TEXT, is_anonymous INT NOT NULL DEFAULT 0, status TEXT, is_synthetic INT NOT NULL DEFAULT 0, complaint_subtype_id INT, created_at TEXT);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO departments VALUES (1, 'Storm Water Drain Department');
    CREATE TABLE events (event_id TEXT, source TEXT, source_record_id TEXT, incident_id TEXT);
    INSERT INTO complaints (complaint_code, user_id, first_name, street_address, mobile_number, ward_number, department_id, title, description, status, created_at)
      VALUES ('2026-119FJQ', 7, 'Parvathi', '27, Jawahar Street', '9000041873', 70, 1, 'Drain blocked near the school', 'Drain blocked', 'Complaint Filed', '2026-11-09 10:00:00');
    INSERT INTO petitions (status, pages, name, mobile, address, ward_number, dept_code, problem, complaint_code, incident_id, filed_at, created_at)
      VALUES ('filed', '[]', 'Parvathi', '9000041873', '27, Jawahar Street', 70, 'GCC-SWD', 'Drain blocked again', '2026-200PET', 'INC-W-2026-119FJQ', '2026-11-10 10:00:00', '2026-11-10 10:00:00');`);
  h.db = db;
});

const ask = () => findRepeats({ mobile: "9000041873", name: "Parvathi", street: "Jawahar Street", ward: 70, dept: "GCC-SWD", problem: "Drain blocked near the school", excludeId: -1 });

describe("the earlier filings' cases are the ones the build holds", () => {
  it("the pipeline's case, once the build has imported the online complaint (for it and for the petition that joined it)", async () => {
    h.db.exec(`INSERT INTO events VALUES ('GRV-2026-119FJQ', 'grievance', '2026-119FJQ', 'INC-20261109-5D433C')`);
    const r = await ask();
    const by = Object.fromEntries(r.matches.map((m) => [m.code, m.incidentId]));
    expect(by["2026-119FJQ"]).toBe("INC-20261109-5D433C");
    expect(by["2026-200PET"]).toBe("INC-20261109-5D433C");
  });

  it("the website's own case while the build has it, or has nothing for the filing", async () => {
    let r = await ask();
    expect(r.matches.find((m) => m.code === "2026-119FJQ")?.incidentId).toBe("INC-W-2026-119FJQ");
    h.db.exec(`INSERT INTO events VALUES ('GRV-2026-119FJQ', 'grievance', '2026-119FJQ', 'INC-W-2026-119FJQ')`);
    r = await ask();
    expect(r.matches.find((m) => m.code === "2026-119FJQ")?.incidentId).toBe("INC-W-2026-119FJQ");
  });
});
