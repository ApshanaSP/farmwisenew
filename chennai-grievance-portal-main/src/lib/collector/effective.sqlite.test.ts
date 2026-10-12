/**
 * KPI-001 on an isolated in-memory copy (no team data touched): the effective-status SQL, run through the same
 * MySQL -> SQLite translation the AWS store uses, against the shapes of the KPI tile query and the list filters it
 * opens. Resolving moves an incident out of "ongoing" and into "resolved" in both at once; reopening moves it back;
 * and every row's SQL status equals the list's overlay rule (effectiveStatus).
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";
import { effectiveSql, effectiveStatus } from "./effective";

const OPS = "`district_intel_ops`.`collector_decisions`";
const EFF = effectiveSql(OPS);

function store() {
  setDatabaseNames(["district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, is_open INTEGER, status_std TEXT, severity_level TEXT, citizen_complaints INTEGER);
           CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT);`);
  const ins = db.prepare(`INSERT INTO incidents VALUES (?, ?, ?, ?, ?)`);
  ins.run("A", 1, "In progress", "High", 2);
  ins.run("B", 1, "Assigned", "Medium", 1);
  ins.run("C", 0, "Resolved", "Low", 0);
  let next = 1;
  const decide = (id: string, decision: string) =>
    db.prepare(`INSERT INTO collector_decisions (decision_id, incident_id, decision) VALUES (?, ?, ?)`).run(next++, id, decision);
  const all = (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    return db.prepare(s).all(...(p as never[])) as Record<string, any>[];
  };
  // the KPI tile's columns (intel.ts kpiBlock) and the list's status filters (intel.ts list)
  const kpi = () => all(`SELECT SUM(CASE WHEN ${EFF.open} = 1 THEN i.citizen_complaints ELSE 0 END) AS complaints,
      SUM(${EFF.open} = 1) AS ongoing, SUM(${EFF.open} = 0 AND ${EFF.status} = 'Resolved') AS resolved FROM incidents i`)[0];
  const listOpen = () => all(`SELECT i.incident_id AS id FROM incidents i WHERE ${EFF.open} = 1 ORDER BY id`).map((r) => r.id);
  const listStatus = (st: string) => all(`SELECT i.incident_id AS id FROM incidents i WHERE ${EFF.status} = ? ORDER BY id`, [st]).map((r) => r.id);
  // what the list's overlay() shows for each row: the latest decision that is not a note
  const overlayRows = () => all(`SELECT i.incident_id AS id, i.is_open, i.status_std, ${EFF.open} AS eff_open, ${EFF.status} AS eff_status,
      (SELECT d.decision FROM collector_decisions d WHERE d.incident_id = i.incident_id AND d.decision <> 'note' ORDER BY d.decision_id DESC LIMIT 1) AS latest
      FROM incidents i ORDER BY id`);
  return { decide, kpi, listOpen, listStatus, overlayRows };
}

function sameAsOverlay(rows: Record<string, any>[]) {
  for (const r of rows) {
    const o = effectiveStatus(r.is_open, r.status_std, r.latest);
    expect([Number(r.eff_open), r.eff_status], r.id).toEqual([o.open, o.status]);
  }
}

describe("KPI tiles and lists use the same effective status (KPI-001)", () => {
  it("resolving and reopening move the tile and the list together", () => {
    const s = store();
    expect(s.kpi()).toMatchObject({ ongoing: 2, resolved: 1, complaints: 3 });
    expect(s.listOpen()).toEqual(["A", "B"]);

    s.decide("A", "resolve");
    expect(s.kpi()).toMatchObject({ ongoing: 1, resolved: 2, complaints: 1 });
    expect(s.listOpen()).toEqual(["B"]);
    expect(s.listStatus("Resolved")).toEqual(["A", "C"]);
    sameAsOverlay(s.overlayRows());

    s.decide("A", "note"); // a note does not change the status
    expect(s.kpi()).toMatchObject({ ongoing: 1, resolved: 2 });

    s.decide("A", "reopen");
    expect(s.kpi()).toMatchObject({ ongoing: 2, resolved: 1, complaints: 3 });
    expect(s.listOpen()).toEqual(["A", "B"]);
    expect(s.listStatus("Open")).toEqual(["A"]);
    sameAsOverlay(s.overlayRows());
  });

  it("reject closes; reopening a pipeline-resolved incident opens it; verify leaves the status", () => {
    const s = store();
    s.decide("B", "reject");
    s.decide("C", "reopen");
    expect(s.kpi()).toMatchObject({ ongoing: 2, resolved: 0 });
    expect(s.listOpen()).toEqual(["A", "C"]);
    expect(s.listStatus("Rejected")).toEqual(["B"]);
    sameAsOverlay(s.overlayRows());
    s.decide("A", "verify");
    expect(s.kpi()).toMatchObject({ ongoing: 2 });
    sameAsOverlay(s.overlayRows());
  });
});
