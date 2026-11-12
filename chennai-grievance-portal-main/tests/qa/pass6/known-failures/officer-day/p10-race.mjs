// officer-day p10: double submit of the completion report, and the officer closing while the Collector sends back at the same moment.
// usage: node p10-race.mjs <code1> <code2>   (two fresh complaints of officerA's department)
import { as, log, short, form, grantFor } from "./h.mjs";

const [c1, c2] = process.argv.slice(2);
const view = async (code, tag) => {
  const d = await as("officerA", "GET", `/api/officer/grievances/INC-W-${code}`);
  const c = await as("citizenA", "GET", `/api/complaints/${code}`);
  log("p10", { tag, code, stage: d.json?.grievance?.stage, returned: d.json?.grievance?.returned, reports: d.json?.reports?.length,
    tl: (d.json?.timeline ?? []).slice(-3).map((x) => `${x.t} ${x.label}`), citizen: c.json?.complaint?.status,
    hist: (c.json?.history ?? []).slice(-3).map((h) => `${h.created_at} ${h.status}`) });
};
const closeWithGrant = async (code, remarks) => {
  const inc = `INC-W-${code}`;
  await as("officerA", "POST", `/api/officer/grievances/${inc}`, { body: { step: "approve" } });
  const fields = { remarks, step: "close" };
  const r1 = await as("officerA", "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true });
  return { inc, fields, grant: await grantFor("officerA", r1.json.confirm) };
};

// 1. the same report sent twice at once (a double click that got past the disabled button, or two tabs)
{
  const { inc, fields, grant } = await closeWithGrant(c1, "Bins replaced and street swept (officer-day race 1).");
  const rs = await Promise.all([1, 2].map(() => as("officerA", "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true, headers: { "x-diq-grant": grant } })));
  log("p10", { doubleSubmit: rs.map(short) });
  await view(c1, "after double submit");
}
// 2. officer closes while the Collector sends it back
{
  const { inc, fields, grant } = await closeWithGrant(c2, "Bins replaced and street swept (officer-day race 2).");
  const [o, k] = await Promise.all([
    as("officerA", "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true, headers: { "x-diq-grant": grant } }),
    as("collector", "POST", "/api/collector/decisions", { body: { incidentIds: [inc], decision: "reopen", note: "officer-day race: sent back" } })
  ]);
  log("p10", { close: short(o), reopen: short(k) });
  await view(c2, "after close + send-back together");
}
