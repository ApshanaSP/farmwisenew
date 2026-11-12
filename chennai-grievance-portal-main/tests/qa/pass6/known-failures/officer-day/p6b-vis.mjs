// officer-day p6b: is a case the Collector just sent back in the officer's queue (default Monthly view, counts, search)?
import { as, log } from "./h.mjs";
const [inc, k = "officerB"] = process.argv.slice(2);
for (const period of ["monthly", "quarterly"]) {
  const l = await as(k, "GET", `/api/officer/grievances?tab=action&per=100&period=${period}`);
  const ov = await as(k, "GET", `/api/officer/overview?period=${period}`);
  log("p6b", { period, inActionTab: (l.json?.rows ?? []).some((x) => x.id === inc), returnedCount: ov.json?.counts?.returned,
    inFeedback: (ov.json?.feedback ?? []).some((f) => f.id === inc), inQueue: (ov.json?.queue?.action ?? []).some((x) => x.id === inc) });
}
const s = await as(k, "GET", `/api/officer/search?q=${encodeURIComponent(inc)}`);
log("p6b", { search: (s.json?.rows ?? []).map((x) => x.id) });
