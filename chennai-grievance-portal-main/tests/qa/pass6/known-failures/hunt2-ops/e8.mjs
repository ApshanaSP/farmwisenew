import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const decision of ["reject", "resolve", "escalate"]) {
  const r = await call(3106, "collector", "POST", "/api/collector/decisions", { ...CH, body: { incidentIds: ["INC-20261106-0B725B"], decision, note: "QA probe, not confirmed" } });
  console.log(decision, r.status, r.text.slice(0, 300));
}
