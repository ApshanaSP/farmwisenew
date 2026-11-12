// QA pass 6, console-sync: one filter state, every view's count of the same set. Read-only (GETs as collector on 3106).
//   node tests/qa/pass6/probes/console-sync/consist.mjs "period=daily" "period=weekly&zone=9" ...
// Prints one JSON line per filter state; nothing is written to the server.
import { call } from "../../lib/live.mjs";

const PORT = 3106;
const get = async (u) => {
  const t0 = Date.now();
  const r = await call(PORT, "collector", "GET", u);
  let j = null;
  try { j = JSON.parse(r.text); } catch { /* not JSON */ }
  return { status: r.status, j, ms: Date.now() - t0, u };
};
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + Number(b ?? 0), 0);

export async function state(qs) {
  const ov = await get(`/api/collector/overview?${qs}`);
  if (ov.status !== 200) return { qs, error: ov.status, text: JSON.stringify(ov.j).slice(0, 200) };
  const d = ov.j;
  const L = async (extra) => {
    const r = await get(`/api/collector/list?${qs}&${extra}`);
    return r.status === 200 ? { total: r.j.total, inc: r.j.incidents, c: r.j.complaints } : { status: r.status, err: r.j?.error };
  };
  const lists = {};
  for (const [k, x] of Object.entries({
    open: "status=open", resolved: "status=Resolved", severe: "sev=Severe", all: "", awaiting: "status=awaiting", overdue: "status=overdue",
    critical: "status=critical&scope=all", openSevere: "status=open&sev=Severe", openHigh: "status=open&sev=High", openMedium: "status=open&sev=Medium", openLow: "status=open&sev=Low",
    unverified: "status=unverified"
  })) lists[k] = await L(x);
  const rep = await get(`/api/collector/report?${qs}`);
  const ins = await get(`/api/collector/insights?${qs}&part=briefing`);
  const R = rep.j?.report;
  const st = ins.j?.briefing?.stats ?? ins.j?.stats ?? null;
  return {
    qs, now: d.now,
    kpi: d.kpi.cur,
    sevCounts: d.severity.counts, sevCountsSum: sum(d.severity.counts),
    tasks: { count: d.tasks.count, left: d.tasks.leftToDepts, rows: d.tasks.rows.length },
    map: { total: d.map.total, unlocated: d.map.unlocated, layers: d.map.layerCounts, layersSum: sum(d.map.layerCounts) + d.map.unlocated, pins: d.map.pins.length },
    zoneTable: { n: d.zoneTable.reduce((a, z) => a + z.n, 0) + d.zoneUnassigned.n, open: d.zoneTable.reduce((a, z) => a + z.open, 0) + d.zoneUnassigned.open,
      complaints: d.zoneTable.reduce((a, z) => a + z.complaints, 0) + d.zoneUnassigned.complaints, severe: d.zoneTable.reduce((a, z) => a + z.severe, 0) + d.zoneUnassigned.severe },
    zoneCountsSum: sum(d.map.zoneCounts),
    severityMix: d.severityMix,
    snapshot: { kind: d.snapshot.kind, overdue: d.snapshot.overdue, critical: d.snapshot.critical, serious: d.snapshot.serious, newsOnly: d.snapshot.newsOnly,
      open: d.snapshot.open, active: d.snapshot.active, complaints: d.snapshot.complaints, severe: d.snapshot.severe },
    byDeptSum: d.bottom.byDept.reduce((a, r) => a + r.v, 0), byZone: d.bottom.byZone.map((r) => [r.l, r.n, r.v]),
    deptNav: d.deptNav.slice(0, 4).map((x) => [x.code, x.open, x.n, x.unverified]),
    deptNavSum: { open: d.deptNav.reduce((a, x) => a + x.open, 0), n: d.deptNav.reduce((a, x) => a + x.n, 0), unverified: d.deptNav.reduce((a, x) => a + x.unverified, 0) },
    bell: d.bell.map((b) => [b.id, b.zone, b.dept]),
    backlog: d.backlog,
    lists,
    report: rep.status === 200 ? { attentionTotal: R.attentionTotal, routine: R.routine, ongoing: rep.j.kpi.cur.ongoing, tasks: rep.j.tasks.count,
      zoneTop: [...rep.j.zoneTable].sort((a, b) => b.open - a.open)[0] } : { status: rep.status },
    insights: ins.status === 200 ? { stats: st, book: ins.j?.book ? { tiles: ins.j.book.glance?.tiles ?? null, resolved: ins.j.book.good?.resolved ?? null,
      critical: (ins.j.book.critical ?? []).length } : null,
      deptToCheck: (ins.j.deptActions ?? []).reduce((a, x) => a + Number(x.awaiting ?? 0), 0),
      deptToCheckTop: (ins.j.deptActions ?? []).slice(0, 4).map((x) => [x.code, x.awaiting, x.open]) } : { status: ins.status },
    ms: ov.ms
  };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("consist.mjs")) {
  for (const qs of process.argv.slice(2)) console.log(JSON.stringify(await state(qs)));
}
