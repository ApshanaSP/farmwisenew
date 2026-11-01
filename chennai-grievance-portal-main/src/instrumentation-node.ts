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

// The Collector's first screen (today's Overview, the departments) is built once the server is up, not on the first
// sign-in: on this PC the first build of it took 90 s, which the Collector waited through after the password
if (process.env.NEXT_PHASE !== "phase-production-build") {
  setTimeout(async () => {
    const t0 = Date.now();
    try {
      const m = await import("@/lib/collector/intel");
      await Promise.all([m.overview("daily", null), m.deptList()]);
      console.info(`[warm] the Overview is ready (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) { console.warn("[warm] the Overview could not be built ahead:", (e as Error).message); }
  }, 1500);
}

// Ask the Map: the incidents, layers and place names are made ready while the server starts, so the Collector's first
// question is answered at once (it took 2-5 s when the first question built them); the suggested questions too
if (process.env.NEXT_PHASE !== "phase-production-build") {
  setTimeout(() => {
    import("@/lib/map/suggest").then((m) => m.suggestions()).catch((e) => console.warn("[map] warm-up skipped:", (e as Error).message));
  }, 3000);
}

/** the routes the dev server opens itself after start (Jarvis and the console's data) */
const WARM_ROUTES: ["GET" | "POST", string][] = [
  ["POST", "/api/jarvis/hear"], ["POST", "/api/jarvis/say"], ["POST", "/api/collector/thunai/agent"], ["GET", "/api/collector/thunai/world"],
  ["GET", "/api/collector/thunai/memory"], ["POST", "/api/collector/thunai/audit"], ["POST", "/api/collector/assistant/chat"], ["POST", "/api/i18n"],
  ["GET", "/api/collector/overview?meta=1"], ["GET", "/api/collector/alerts"], ["GET", "/api/rehearsal/state"], ["GET", "/api/collector/geo"],
  ["GET", "/api/collector/stories"], ["GET", "/api/collector/brief"], ["GET", "/api/collector/conflicts"], ["GET", "/api/collector/insights"],
  ["GET", "/api/collector/nearby"], ["GET", "/api/collector/assistant/insights"], ["POST", "/api/map/ask"], ["GET", "/api/map/suggest"]
];

// Dev mode compiles each page the first time it is opened: the login page and the Collector's console took 15-30 s
// on a fresh start, which felt like a slow sign-in. The server opens them itself once it is up, so they are ready.
if (process.env.NODE_ENV !== "production" && process.env.NEXT_PHASE !== "phase-production-build" && process.env.DIQ_WARM !== "0") {
  const argv = process.argv.join(" ");
  const port = process.env.PORT || /(?:-p|--port)[ =](\d+)/.exec(argv)?.[1] || "3000";
  setTimeout(async () => {
    for (const path of ["/login", "/collector", "/officer"]) {
      const t0 = Date.now();
      try {
        await fetch(`http://127.0.0.1:${port}${path}`, { headers: { "x-diq-warm": "1" }, redirect: "manual" });
        console.info(`[warm] ${path} compiled in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      } catch { /* the server is not listening yet: the first visit compiles it */ }
    }
    // Jarvis and the console's data: each route compiled on first use took 30-60 s here, so "Hi Jarvis" seemed dead on a
    // fresh dev server. They are opened once now, with no session (each answers 401 or 400 and does nothing), so the
    // compiler has done its work before the Collector speaks.
    const t1 = Date.now();
    for (const [method, path] of WARM_ROUTES) {
      try { await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined }); }
      catch { /* skipped: compiled on first use instead */ }
    }
    console.info(`[warm] Jarvis and the console's data routes compiled in ${((Date.now() - t1) / 1000).toFixed(0)} s: Jarvis is ready`);
  }, 4000);
}

