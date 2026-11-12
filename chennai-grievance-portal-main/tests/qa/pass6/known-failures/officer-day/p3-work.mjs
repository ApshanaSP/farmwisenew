// officer-day p3: the officer works a (non-severe) case end to end, with the Collector's reopen, and what the citizen sees at each step.
// usage: node p3-work.mjs <complaintCode>
import { as, log, short, form, grantFor, JPEG } from "./h.mjs";

const code = process.argv[2];
const inc = `INC-W-${code}`;
const officer = process.argv[3] ?? "officerA";
const seen = async (tag) => {
  const c = await as("citizenA", "GET", `/api/complaints/${code}`);
  const d = await as(officer, "GET", `/api/officer/grievances/${inc}`);
  log("p3", { tag, citizen: c.json?.complaint?.status, remarks: c.json?.complaint?.remarks, progress: c.json?.progress,
    last: (c.json?.history ?? []).slice(-2).map((h) => `${h.status} | ${h.created_at} | ${h.remarks}`),
    officerStage: d.json?.grievance?.stage, returned: d.json?.grievance?.returned, next: d.json?.next, closedByDept: d.json?.closedByDept,
    tl: (d.json?.timeline ?? []).slice(-3).map((x) => `${x.t} ${x.label}: ${x.note}`) });
  return { c, d };
};

await seen("start");
// double approve, at once
const [a1, a2] = await Promise.all([1, 2].map(() => as(officer, "POST", `/api/officer/grievances/${inc}`, { body: { step: "approve" } })));
log("p3", { approveTwice: [short(a1), short(a2)] });
await seen("approved");

// close with the report: the step-up loop
const remarks = "Garbage cleared and area swept (officer-day probe).";
const fields = { remarks, step: "close" };
const r1 = await as(officer, "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true });
log("p3", { reportNoGrant: short(r1) });
const grant = await grantFor(officer, r1.json.confirm);
const r2 = await as(officer, "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true, headers: { "x-diq-grant": grant } });
log("p3", { reportWithGrant: short(r2) });
const r3 = await as(officer, "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true, headers: { "x-diq-grant": grant } });
log("p3", { replaySameGrant: short(r3) });
const { c } = await seen("closed");
const photo = c.json?.progress?.photos?.[0];
if (photo) for (const k of ["citizenA", "citizenB", "officerA", "officerB", "collector"]) log("p3", { photo, k, status: (await as(k, "GET", photo)).status });

// the Collector sends it back
const back = await as("collector", "POST", "/api/collector/decisions", { body: { incidentIds: [inc], decision: "reopen", note: "officer-day probe: please redo the sweep" } });
log("p3", { reopen: short(back) });
await seen("reopened");
const lists = {};
for (const tab of ["new", "action", "verified"]) {
  const l = await as(officer, "GET", `/api/officer/grievances?tab=${tab}&per=100&period=daily`);
  lists[tab] = (l.json?.rows ?? []).filter((x) => x.id === inc).map((x) => ({ stage: x.stage, returned: x.returned, returnNote: x.returnNote }));
}
log("p3", { listsAfterReopen: lists });
const fb = await as(officer, "GET", "/api/officer/overview?period=daily");
log("p3", { feedback: (fb.json?.feedback ?? []).filter((f) => f.id === inc), returnedCount: fb.json?.counts?.returned });

// works it again: the same remarks and photo, with the grant from before (still inside 5 minutes)
const r4 = await as(officer, "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true, headers: { "x-diq-grant": grant } });
log("p3", { reCloseWithOldGrant: short(r4) });
await seen("reclosed");
