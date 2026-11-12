import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
import { confirmed } from "./confirm.mjs";
for (const qs of (process.argv[2] || "period=daily,period=quarterly").split(",")) {
  const ov = JSON.parse((await call(3106, "collector", "GET", "/api/collector/overview?" + qs, CH)).text);
  const la = JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?status=awaiting&" + qs, CH)).text);
  const rp = JSON.parse((await call(3106, "collector", "GET", "/api/collector/report?" + qs, CH)).text);
  const ex = await confirmed("collector", "GET", "/api/collector/export?" + qs, undefined, CH.headers);
  let ej = {}; try { ej = JSON.parse(ex.r.text); } catch {}
  const lines = (ej.csv || "").split("\n").slice(1);
  const chk = lines.filter((l) => l.startsWith("Closed work to check") || l.startsWith("\"Closed work to check")).length;
  const need = lines.filter((l) => l.startsWith("Needs your attention") || l.startsWith("\"Needs your attention")).length;
  console.log(qs, "| My Tasks tile", ov.tasks.count, "left", ov.tasks.leftToDepts, "| list awaiting groups", la.total, "inc", la.incidents,
    "| export status", ex.first, ex.confirm, ex.r.status, "rows", ej.count, "check rows", chk, "need rows", need, "| report attentionTotal", rp.report?.attentionTotal, "routine", rp.report?.routine, "ongoing", ov.kpi.cur.ongoing);
  if (chk) console.log("  first check rows:", lines.filter((l) => l.includes("Closed work to check")).slice(0, 3).map((l) => l.slice(0, 160)).join("\n  "));
}
