// officer-day p1b: open grievances that the default (Monthly) view hides because they were first reported earlier
import { as, log } from "./h.mjs";
const get = async (period, flag) => (await as("officerA", "GET", `/api/officer/grievances?tab=all&per=100&period=${period}&flag=${flag}`)).json;
for (const flag of ["overdue", "open"]) {
  const m = await get("monthly", flag), q = await get("quarterly", flag);
  const mid = new Set((m.rows ?? []).map((r) => r.id));
  const hidden = (q.rows ?? []).filter((r) => !mid.has(r.id));
  log("p1b", { flag, monthlyTotal: m.total, quarterlyTotal: q.total, quarterlyRowsRead: q.rows?.length, hiddenFromMonthly: hidden.map((r) => ({ id: r.id, stage: r.stage, sev: r.sev, reported: r.t, due: r.due_at })) });
}
const s = await as("officerA", "GET", "/api/officer/search?q=INC-");
log("p1b", { searchINC: s.json?.rows?.length });
