/**
 * RC-27: the closed time and the verified flag follow the Collector's decisions through the same translation the store
 * uses, and the window a "resolved this week" count uses (a column expression, not a column) counts a Collector's resolve.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";
import { effectiveSql } from "./effective";

const OPS = "`district_intel_ops`.`collector_decisions`";

function store() {
  setDatabaseNames(["district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, is_open INTEGER, status_std TEXT, verified INTEGER, closed_at TEXT);
           CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, decided_at TEXT);`);
  db.exec(`INSERT INTO incidents VALUES ('OPEN', 1, 'In progress', 0, NULL), ('OLD', 0, 'Resolved', 1, '2026-01-01 10:00:00'), ('NEW', 1, 'Assigned', 0, NULL)`);
  const all = (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    return db.prepare(s).all(...(p as never[])) as Record<string, any>[];
  };
  let n = 1;
  const decide = (id: string, d: string, at: string) => db.prepare("INSERT INTO collector_decisions VALUES (?,?,?,?)").run(n++, id, d, at);
  return { all, decide };
}

describe("effective closed time and verified flag (RC-27)", () => {
  it("a Collector's resolve is counted in the week it was made, a reopen removes the pipeline's close, an escalate changes nothing", () => {
    const s = store();
    const E = effectiveSql(OPS);
    const resolvedIn = (now: string) => s.all(
      `SELECT i.incident_id AS id FROM incidents i WHERE ${E.closedAt} > (? - INTERVAL ? HOUR) AND ${E.closedAt} <= ? AND ${E.open} = 0 AND ${E.status} = 'Resolved' ORDER BY id`,
      [now, 168, now]).map((r) => r.id);
    expect(resolvedIn("2026-11-06 12:00:00")).toEqual([]);
    s.decide("OPEN", "resolve", "2026-11-05 09:00:00");
    expect(resolvedIn("2026-11-06 12:00:00")).toEqual(["OPEN"]);
    s.decide("OPEN", "escalate", "2026-11-05 10:00:00");
    expect(resolvedIn("2026-11-06 12:00:00")).toEqual(["OPEN"]);
    s.decide("OLD", "reopen", "2026-11-05 11:00:00");
    expect(s.all(`SELECT ${E.closedAt} AS c FROM incidents i WHERE i.incident_id = 'OLD'`)[0].c).toBeNull();
    expect(s.all(`SELECT ${E.closedAt} AS c FROM incidents i WHERE i.incident_id = 'NEW'`)[0].c).toBeNull();
  });
  it("verified follows a resolve or a verify, and the alias is the caller's", () => {
    const s = store();
    const E = effectiveSql(OPS, "b");
    s.decide("NEW", "verify", "2026-11-05 09:00:00");
    s.decide("OLD", "reopen", "2026-11-05 09:00:00");
    const rows = s.all(`SELECT b.incident_id AS id, ${E.verified} AS v, ${E.open} AS o FROM incidents b ORDER BY id`);
    expect(rows.map((r) => [r.id, Number(r.v), Number(r.o)])).toEqual([["NEW", 1, 0], ["OLD", 1, 1], ["OPEN", 0, 1]]);
  });
});
