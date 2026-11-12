import { as, log } from "./h.mjs";
const ci = await as("collector", "GET", `/api/collector/incidents/${process.argv[2]}`);
const i = ci.json?.incident ?? {};
log("p10b", { id: process.argv[2], status: ci.status, effStatus: i.status, open: i.open, verified: i.verified, decisions: (ci.json?.decisions ?? ci.json?.incident?.decisions ?? []).slice(-3) });
