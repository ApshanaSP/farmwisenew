// officer-day p9: the officer's search and list filter with '%' and '_' in the text; the citizen's status filter after progress
import { as, log } from "./h.mjs";
const code = process.argv[2];
for (const q of ["bin_50", "50% full", "bin_50% full", "bin", "full"]) {
  const s = await as("officerA", "GET", `/api/officer/search?q=${encodeURIComponent(q)}`);
  const l = await as("officerA", "GET", `/api/officer/grievances?tab=all&period=daily&per=100&q=${encodeURIComponent(q)}`);
  log("p9", { q, searchHit: (s.json?.rows ?? []).some((r) => r.id === `INC-W-${code}`), listHit: (l.json?.rows ?? []).some((r) => r.id === `INC-W-${code}`), listTotal: l.json?.total });
}
for (const st of ["Resolved by Department", "In Progress", "Rejected", "Verified by Collector", "Complaint Filed"]) {
  const r = await as("citizenA", "GET", `/api/complaints?status=${encodeURIComponent(st)}`);
  log("p9", { status: st, n: r.json?.complaints?.length, codes: (r.json?.complaints ?? []).slice(0, 4).map((c) => `${c.complaint_code}:${c.status}`) });
}
