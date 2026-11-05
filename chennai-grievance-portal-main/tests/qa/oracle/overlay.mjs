// How many incidents the Collector's own decisions and department routings touch (durable store, read-only): what the
// snapshot-only oracle cannot see. Usage: node tests/qa/oracle/overlay.mjs <durable.sqlite>
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2], { readOnly: true });
for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%decision%' OR name LIKE '%assign%')").all())
  console.log(name, db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n);
// the decided and routed incidents, with their lead department and first-report time from the snapshot
import { loadTable } from "./load.mjs";
const inc = await loadTable("incidents");
const col = (n) => inc.columns.findIndex((c) => c[0] === n);
const byId = new Map(inc.rows.map((r) => [r[col("incident_id")], r]));
for (const [t, idc] of [["collector_decisions", "incident_id"], ["dept_assignments", "incident_id"]]) {
  for (const d of db.prepare(`SELECT * FROM "${t}"`).all()) {
    const r = byId.get(d[idc]);
    console.log(t, d[idc], d.decision ?? d.action ?? d.dept_code ?? "", r ? `${r[col("lead_dept")]} ${r[col("first_reported_at")]} open=${r[col("is_open")]}` : "not in snapshot");
  }
}
