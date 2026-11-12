// officer-day p1: department scoping and the queue windows. Read-mostly: the only writes are refused ones (another department's case).
import { as, log, short, form } from "./h.mjs";

const lists = {};
for (const k of ["officerA", "officerB"]) {
  const ov = await as(k, "GET", "/api/officer/overview?meta=1");
  log("p1", { k, meta: short(ov) });
  for (const period of ["monthly", "quarterly"]) {
    const r = await as(k, "GET", `/api/officer/grievances?tab=all&per=100&period=${period}`);
    lists[`${k}:${period}`] = r.json?.rows ?? [];
    log("p1", { k, period, status: r.status, total: r.json?.total, n: r.json?.rows?.length, awaiting: r.json?.awaiting, now: r.json?.now });
  }
}
const aIds = lists["officerA:quarterly"].map((r) => r.id);
const bIds = new Set(lists["officerB:quarterly"].map((r) => r.id));
log("p1", { overlapAB: aIds.filter((x) => bIds.has(x)).length, aSample: aIds.slice(0, 5) });

// officerB on officerA's cases: detail, approve, report, search
const target = lists["officerA:quarterly"].find((r) => r.stage === "new") ?? lists["officerA:quarterly"][0];
if (target) {
  log("p1", { target: target.id, stage: target.stage, sev: target.sev });
  log("p1", { bDetail: short(await as("officerB", "GET", `/api/officer/grievances/${target.id}`)) });
  log("p1", { bApprove: short(await as("officerB", "POST", `/api/officer/grievances/${target.id}`, { body: { step: "approve" } })) });
  log("p1", { bReport: short(await as("officerB", "POST", `/api/officer/grievances/${target.id}/report`, { body: form({ remarks: "probe: not my department", step: "close" }), raw: true })) });
  log("p1", { bSearch: short(await as("officerB", "GET", `/api/officer/search?q=${encodeURIComponent(target.id)}`)) });
}

// does officerB's full overview mention any of officerA's case ids?
const ovB = await as("officerB", "GET", "/api/officer/overview?period=quarterly");
const leaked = aIds.filter((id) => ovB.text.includes(`"${id}"`));
log("p1", { ovBStatus: ovB.status, ovBBytes: ovB.text.length, aIdsInBOverview: leaked.slice(0, 10), nLeaked: leaked.length });
const depts = [...new Set([...ovB.text.matchAll(/"(?:lead_dept|dept|dept_code)":"([A-Z-]+)"/g)].map((m) => m[1]))];
log("p1", { deptCodesInBOverview: depts });

// open work by first-reported age: monthly vs quarterly
const mon = new Set(lists["officerA:monthly"].map((r) => r.id));
const onlyQ = lists["officerA:quarterly"].filter((r) => !mon.has(r.id) && ["new", "approved", "action", "sent"].includes(r.stage));
log("p1", { openOnlyInQuarterly: onlyQ.length, sample: onlyQ.slice(0, 5).map((r) => ({ id: r.id, stage: r.stage, t: r.t, due: r.due_at, sev: r.sev })) });
// due within 24 h / overdue: does each row's deadline agree with the flag?
for (const flag of ["due", "overdue"]) {
  const r = await as("officerA", "GET", `/api/officer/grievances?tab=all&per=100&period=quarterly&flag=${flag}`);
  const now = r.json?.now;
  const bad = (r.json?.rows ?? []).filter((x) => flag === "due" ? !(x.due_at > now) : false).map((x) => ({ id: x.id, due: x.due_at }));
  const oldest = (r.json?.rows ?? []).map((x) => x.due_at).sort()[0];
  log("p1", { flag, status: r.status, total: r.json?.total, now, oldestDue: oldest, notMatching: bad.slice(0, 5) });
}
const ovM = await as("officerA", "GET", "/api/officer/overview?period=monthly");
const ovQ = await as("officerA", "GET", "/api/officer/overview?period=quarterly");
log("p1", { countsMonthly: ovM.json?.counts, countsQuarterly: ovQ.json?.counts });
// the board's tiles (the Collector's numbers) against the list each one opens (the officer's own query)
const tiles = { open: ovM.json?.board?.kpi?.cur?.ongoing, serious: ovM.json?.board?.snapshot?.serious, overdue: ovM.json?.board?.snapshot?.overdue, due: ovM.json?.counts?.due,
  severe: ovM.json?.board?.kpi?.cur?.severe, resolved: ovM.json?.board?.kpi?.cur?.resolved };
const listTotals = {};
for (const [k, qs] of Object.entries({ open: "tab=all&flag=open", serious: "tab=all&flag=serious", overdue: "tab=all&flag=overdue", due: "tab=all&flag=due", severe: "tab=all&sev=Severe", resolved: "tab=verified" }))
  listTotals[k] = (await as("officerA", "GET", `/api/officer/grievances?${qs}&period=monthly&per=1`)).json?.total;
log("p1", { monthlyTiles: tiles, listsTheyOpen: listTotals, boardKpiKeys: Object.keys(ovM.json?.board?.kpi?.cur ?? {}) });
const stages = {};
for (const r of lists["officerA:quarterly"]) stages[`${r.stage}:${r.sev}`] = (stages[`${r.stage}:${r.sev}`] ?? 0) + 1;
log("p1", { aQuarterlyStages: stages });
