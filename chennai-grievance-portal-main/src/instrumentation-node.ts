/**
 * With DATA_BACKEND=aws the district data and the accounts are downloaded from AWS when the server starts, not on the
 * first request (a sign-in on a fresh start used to wait 90 seconds for it). The build steps (derive.ts) are registered
 * first, so the first build is adjusted before it is served.
 */
import { warmUp } from "@/lib/aws/store";
import { assertSecrets } from "@/lib/secrets";
import { startJobs } from "@/lib/scheduler";
import "@/lib/collector/derive";

// production stops here when JWT_SECRET (or the encryption key) is missing or weak, not on the first sign-in
if (process.env.NEXT_PHASE !== "phase-production-build") assertSecrets();

if (process.env.DATA_BACKEND === "aws") warmUp();
// source and Data Studio refreshes run here, not from page reads
if (process.env.NEXT_PHASE !== "phase-production-build") startJobs();

// Ask the Map: the incidents, layers and place names are made ready while the server starts, so the Collector's first
// question is answered at once (it took 2-5 s when the first question built them); the suggested questions too
if (process.env.NEXT_PHASE !== "phase-production-build") {
  setTimeout(() => {
    import("@/lib/map/suggest").then((m) => m.suggestions()).catch((e) => console.warn("[map] warm-up skipped:", (e as Error).message));
  }, 3000);
}
