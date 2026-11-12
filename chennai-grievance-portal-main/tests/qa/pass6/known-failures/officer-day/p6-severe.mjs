// officer-day p6: a severe grievance: the officer sends it to the Collector (with the password step), the Collector sends it back,
// then a stale Collector page verifies it although the officer has not worked it again.
// usage: node p6-severe.mjs <incidentId of a Severe case at approved/action in officerA's department>
import { as, log, short, form, grantFor } from "./h.mjs";

const inc = process.argv[2];
const officer = process.argv[3] ?? "officerA";
const look = async (tag) => {
  const d = await as(officer, "GET", `/api/officer/grievances/${inc}`);
  log("p6", { tag, stage: d.json?.grievance?.stage, sev: d.json?.grievance?.sev, returned: d.json?.grievance?.returned, next: d.json?.next,
    reports: (d.json?.reports ?? []).map((r) => ({ id: r.id, verifiedAt: r.verifiedAt, returned: r.returned })), tl: (d.json?.timeline ?? []).slice(-2).map((x) => `${x.t} ${x.label}`) });
  return d;
};
const d0 = await look("start");
if (d0.json?.grievance?.sev !== "Severe" || !["approved", "action"].includes(d0.json?.grievance?.stage)) { log("p6", "not a severe case in action; stop"); process.exit(1); }

// a 'close' on a severe case is refused before the password? (the confirm comes first)
const fields = { remarks: "Site cleared and made safe (officer-day probe).", step: "send" };
const s1 = await as(officer, "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true });
log("p6", { sendNoGrant: short(s1) });
const g = await grantFor(officer, s1.json.confirm);
const s2 = await as(officer, "POST", `/api/officer/grievances/${inc}/report`, { body: form(fields), raw: true, headers: { "x-diq-grant": g } });
log("p6", { sendWithGrant: short(s2) });
await look("sent");

const back = await as("collector", "POST", "/api/collector/decisions", { body: { incidentIds: [inc], decision: "reopen", note: "officer-day probe: not done properly" } });
log("p6", { reopen: short(back) });
await look("returned");

// the Collector's other tab, opened before the send-back, still shows "awaiting verification": Verify
const body = { incidentIds: [inc], decision: "verify", note: null };
let v = await as("collector", "POST", "/api/collector/decisions", { body });
if (v.status === 428 && v.json?.confirm) {
  log("p6", { verifyConfirm: v.json.confirm.summary });
  v = await as("collector", "POST", "/api/collector/decisions", { body, headers: { "x-diq-grant": await grantFor("collector", v.json.confirm) } });
}
log("p6", { staleVerify: short(v) });
await look("after stale verify");
