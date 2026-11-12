import { call } from "../../lib/live.mjs";
export const CH = { headers: { referer: "http://127.0.0.1:3106/collector" } };
export async function snap(id, label) {
  const out = { label };
  const od = await call(3106, "officerA", "GET", `/api/officer/grievances/${id}`);
  try { const j = JSON.parse(od.text); out.officer = { st: od.status, stage: j.stage ?? j.g?.stage ?? j.grievance?.stage, returned: j.returned ?? j.g?.returned, keys: Object.keys(j).slice(0,20).join(",") }; } catch { out.officer = { st: od.status, text: od.text.slice(0,200) }; }
  const tabs = {};
  for (const tab of ["new","action","sent","verified","all"]) {
    const r = await call(3106, "officerA", "GET", `/api/officer/grievances?tab=${tab}&period=quarterly&per=100&q=${id}`);
    const j = JSON.parse(r.text); tabs[tab] = j.total;
  }
  out.officerTabs = tabs;
  const cl = await call(3106, "collector", "GET", `/api/collector/list?scope=all&q=${id}`, CH);
  const cj = JSON.parse(cl.text); const row = cj.rows?.find((r) => r.id === id);
  out.collectorList = { total: cj.total, status: row?.status, open: row?.open, decision: row?.decision ?? row?.dec, acted: row?.acted };
  const ci = await call(3106, "collector", "GET", `/api/collector/incidents/${id}`, CH);
  try { const j = JSON.parse(ci.text); const inc = j.incident ?? j; out.collectorDetail = { st: ci.status, status: inc.status, open: inc.open ?? inc.is_open, keys: Object.keys(j).slice(0, 25).join(",") }; } catch { out.collectorDetail = { st: ci.status }; }
  return out;
}
