import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
import { confirmed } from "./confirm.mjs";
const qs = process.argv[2] || "period=weekly";
const ex = await confirmed("collector", "GET", "/api/collector/export?" + qs, undefined, CH.headers);
const csv = JSON.parse(ex.r.text).csv;
// naive CSV parse
const parse = (line) => { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
const lines = csv.split("\n"); const head = parse(lines[0]); const rows = lines.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [head[i], v])));
const yes = rows.filter((r) => r.past_deadline === "Yes"), no = rows.filter((r) => r.past_deadline === "No");
console.log(qs, "export rows", rows.length, "past_deadline Yes", yes.length, "No", no.length);
let mism = [];
for (const r of no.slice(0, 40)) {
  const l = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?scope=all&status=overdue&q=${r.id}`, CH)).text);
  const d = JSON.parse((await call(3106, "collector", "GET", `/api/collector/incidents/${r.id}`, CH)).text).incident;
  if (l.incidents > 0) mism.push({ id: r.id, export: "No", listOverdueInc: l.incidents, sla_due: d.sla_due ?? d.due, breached: d.breached, overdueField: d.overdue });
}
console.log("export says No but the Past-deadline list holds it:", mism.length, JSON.stringify(mism.slice(0, 8), null, 0));
