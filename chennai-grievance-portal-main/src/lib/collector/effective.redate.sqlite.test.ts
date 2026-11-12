/**
 * QA pass 7, hunt2-ops-07 (P0): a closing decision (resolve, verify, reject) on a case that is already closed is recorded but does not
 * re-date its closure, so "Resolved" in a window counts a case's first closing since it was last open, never a second resolve of a case
 * closed in May. Run through the same MySQL -> SQLite translation the AWS store uses.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";
import { effectiveSql } from "./effective";

const OPS = "`district_intel_ops`.`collector_decisions`";
const E = effectiveSql(OPS);
const NOW = "2026-11-13 10:00:00";

function store() {
  setDatabaseNames(["district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, is_open INTEGER, status_std TEXT, verified INTEGER, closed_at TEXT);
           CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, decided_at TEXT);`);
  const ins = db.prepare("INSERT INTO incidents VALUES (?, ?, ?, ?, ?)");
  ins.run("MAY", 0, "Resolved", 1, "2026-05-13 10:00:00");   // resolved by the department in May
  ins.run("OPEN", 1, "In progress", 0, null);                 // open in the pipeline
  ins.run("LAPSED", 0, "Lapsed", 0, null);                    // closed, time unknown
  ins.run("REJ", 0, "Rejected", 0, "2026-04-01 10:00:00");    // rejected in April
  const all = (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    return db.prepare(s).all(...(p as never[])) as Record<string, any>[];
  };
  let n = 1;
  const decide = (id: string, d: string, at: string) => db.prepare("INSERT INTO collector_decisions VALUES (?,?,?,?)").run(n++, id, d, at);
  const closedAt = (id: string) => all(`SELECT ${E.closedAt} AS c FROM incidents i WHERE i.incident_id = ?`, [id])[0].c as string | null;
  // the Resolved tile's shape (intel.ts kpiBlock: scopeWhere(closed) + done), over the last `hours`
  const resolvedIn = (hours: number) => all(`SELECT i.incident_id AS id FROM incidents i WHERE ${E.closedAt} > (? - INTERVAL ? HOUR)
      AND ${E.open} = 0 AND ${E.status} = 'Resolved' ORDER BY id`, [NOW, hours]).map((r) => r.id);
  const setPipeline = (id: string, open: number, status: string, closed: string | null) =>
    db.prepare("UPDATE incidents SET is_open = ?, status_std = ?, closed_at = ? WHERE incident_id = ?").run(open, status, closed, id);
  return { decide, closedAt, resolvedIn, setPipeline };
}

describe("hunt2-ops-07: a closing decision on a closed case leaves its closed time alone", () => {
  it("resolve and verify today on a case resolved in May: still closed in May, not resolved today", () => {
    const s = store();
    s.decide("MAY", "resolve", "2026-11-13 09:00:00");
    expect(s.closedAt("MAY")).toBe("2026-05-13 10:00:00");
    s.decide("MAY", "verify", "2026-11-13 09:30:00");
    expect(s.closedAt("MAY")).toBe("2026-05-13 10:00:00");
    expect(s.resolvedIn(24)).toEqual([]);
  });

  it("a second closing decision does not move the first one: resolved Monday, verified today = resolved Monday", () => {
    const s = store();
    s.decide("OPEN", "resolve", "2026-11-09 09:00:00");
    s.decide("OPEN", "verify", "2026-11-13 09:00:00");
    expect(s.closedAt("OPEN")).toBe("2026-11-09 09:00:00");
    expect(s.resolvedIn(24)).toEqual([]);
    expect(s.resolvedIn(168)).toEqual(["OPEN"]);
  });

  it("a reopen starts a new closing: reopened and resolved again today counts today, once", () => {
    const s = store();
    s.decide("MAY", "reopen", "2026-11-13 08:00:00");
    expect(s.closedAt("MAY")).toBeNull();
    s.decide("MAY", "resolve", "2026-11-13 09:00:00");
    s.decide("MAY", "resolve", "2026-11-13 09:40:00");
    expect(s.closedAt("MAY")).toBe("2026-11-13 09:00:00");
    expect(s.resolvedIn(24)).toEqual(["MAY"]);
  });

  it("the Collector's own first closing is kept when the pipeline closes the case later", () => {
    const s = store();
    s.decide("OPEN", "resolve", "2026-11-01 09:00:00");
    s.setPipeline("OPEN", 0, "Resolved", "2026-11-12 18:00:00");
    expect(s.closedAt("OPEN")).toBe("2026-11-01 09:00:00");
    expect(s.resolvedIn(24)).toEqual([]);
  });

  it("closing a lapsed or rejected case today does not count it as resolved today", () => {
    const s = store();
    s.decide("LAPSED", "resolve", "2026-11-13 09:00:00");
    s.decide("REJ", "resolve", "2026-11-13 09:00:00");
    expect(s.closedAt("LAPSED")).toBeNull();
    expect(s.closedAt("REJ")).toBe("2026-04-01 10:00:00");
    expect(s.resolvedIn(24)).toEqual([]);
  });

  it("a resolve of an open case still counts at once (RC-27)", () => {
    const s = store();
    s.decide("OPEN", "resolve", "2026-11-13 09:00:00");
    expect(s.resolvedIn(24)).toEqual(["OPEN"]);
  });
});
