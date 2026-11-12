// QA pass 6, redsec2: IDOR and role probes on 127.0.0.1:3106 with the shared QA cookies (live.mjs). Prints statuses, counts and
// ids only; never a cookie, password or a citizen's personal detail.
import { call } from "../../lib/live.mjs";

const P = 3106;
const short = (t) => t.replace(/\s+/g, " ").slice(0, 140);
const show = async (who, method, url, body) => {
  const r = await call(P, who, method, url, body === undefined ? {} : { body });
  console.log(`${who ?? "anon"} ${method} ${url} -> ${r.status} ${short(r.text).replace(/"(mobile|mobile_number|phone|email|name|first_name|last_name|address|description)":"[^"]*"/g, '"$1":"<cut>"')}`);
  return r;
};

// citizenA's complaint codes (codes only), then citizenB asks for them
const listA = await call(P, "citizenA", "GET", "/api/complaints", { headers: { referer: "http://127.0.0.1:3106/citizen" } });
const codesA = [...new Set(listA.text.match(/\b\d{4}-\d{3}[A-Z]{3}\b|\bCMP-[A-Z0-9-]+\b/g) ?? [])];
console.log("citizenA complaints", listA.status, "codes", codesA.length);
for (const c of codesA.slice(0, 2)) {
  await show("citizenB", "GET", `/api/complaints/${c}`);
  await show("officerB", "GET", `/api/complaints/${c}`);
}

// officerA's grievance ids (GCC-SWM), then officerB (GCC-ELE), manu (COL-PET) and citizenB ask for them
const gA = await call(P, "officerA", "GET", "/api/officer/grievances?tab=all&period=quarterly");
const idsA = [...new Set(gA.text.match(/INC-\d{8}-[A-F0-9]{6}/g) ?? [])];
console.log("officerA grievances", gA.status, "ids", idsA.length);
for (const id of idsA.slice(0, 1)) {
  await show("officerB", "GET", `/api/officer/grievances/${id}`);
  await show("manu", "GET", `/api/officer/grievances/${id}`);
  await show("officerB", "GET", `/api/manu/case/${id}`);
  await show("citizenB", "GET", `/api/manu/case/${id}`);
  await show("officerB", "POST", `/api/officer/grievances/${id}`, { step: "approve" });
}

// the desk login: anything beyond the desk?
for (const u of ["/api/officer/overview", "/api/officer/grievances?tab=all", "/api/officer/search?q=road", "/api/officer/insights", "/api/officer/geo", "/api/rehearsal/tasks",
  "/api/collector/assistant/sessions", "/api/collector/assistant/pins", "/api/collector/overview", "/api/manu/petitions"]) await show("manu", "GET", u);

// other roles on the desk
for (const who of ["citizenB", "officerB", "collector"]) await show(who, "GET", "/api/manu/petitions");
await show("officerB", "GET", "/api/manu/petitions/1");
