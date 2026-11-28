/**
 * With DATA_BACKEND=aws the district data and the accounts are downloaded from AWS when the server starts, not on the
 * first request (a sign-in on a fresh start used to wait 90 seconds for it). The build steps (derive.ts) are registered
 * first, so the first build is adjusted before it is served.
 */
import fs from "fs";
import path from "path";
import { warmUp } from "@/lib/aws/store";
import { assertSecrets } from "@/lib/secrets";
import { startJobs } from "@/lib/scheduler";
import "@/lib/collector/derive";
// the search box's build step: its indexes, and every day of the reservoir figures kept for past-day searches (lib/search/hooks.ts)
import "@/lib/search/hooks";

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
      await ready(); // the Collector's status SQL is built when intel.ts loads: after the officer table check
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
    ready().then(() => import("@/lib/map/suggest")).then((m) => m.suggestions()).catch((e) => console.warn("[map] warm-up skipped:", (e as Error).message));
  }, 3000);
}

// The grievance dataset's keys are read here, not by the first filing or officer step after a start: grievances.csv (about 13 MB)
// is parsed in one go, which held every request for about a second (reviewerA-06)
if (process.env.NEXT_PHASE !== "phase-production-build") {
  setTimeout(() => {
    import("@/lib/dataset/append").then((m) => m.warmDatasetKeys()).catch((e) => console.warn("[dataset] warm-up skipped:", (e as Error).message));
  }, 4500);
}

// v12 (21 Nov): Jarvis, ready before the first question (the report, first-question-latency RC1 and RC7). About 20 s after the start and once
// the store is in: Jarvis's server modules and the meaning model are loaded (production loaded each on its first use), then the keep-warm
// starts (lib/thunai/keepwarm.ts): the hourly city parts, and while the console is in use the insights, live traffic, THE DISTRICT NOW and
// the planner's prompt cache, one step at a time. DIQ_WARM=0 leaves all of it off (the start-up tests), JARVIS_KEEPWARM=0 the keep-warm only.
if (process.env.NEXT_PHASE !== "phase-production-build" && process.env.DIQ_WARM !== "0") {
  setTimeout(() => {
    ready()
      .then(() => preloadJarvis())
      .then(() => import("@/lib/thunai/keepwarm"))
      .then((m) => m.startKeepWarm())
      .catch((e) => console.warn("[jarvis warm] the keep-warm could not start:", (e as Error).message));
  }, 20_000);
}

/** the port this server listens on (the dev warm-up below and the preload use it to open their own routes) */
const ownPort = () => process.env.PORT || /(?:-p|--port)[ =](\d+)/.exec(process.argv.join(" "))?.[1] || "3000";

/** Jarvis's routes, opened once with no session in production (each answers 401 and does nothing) so their bundles are loaded */
const JARVIS_ROUTES: ["GET" | "POST", string][] = [
  ["POST", "/api/jarvis/hear"], ["GET", "/api/collector/thunai/world"], ["POST", "/api/collector/thunai/agent/round"], ["POST", "/api/jarvis/say"]
];

/**
 * v12 (21 Nov): loads what the first spoken question needs, one piece after another: Jarvis's server modules (round, agent, quick, the
 * browser lanes), in production its route bundles (measured cold: /api/jarvis/hear 533 ms, /thunai/world 251 ms, /thunai/agent/round
 * 208 ms; the start-up code and the routes are bundled apart, so a route's own copy is loaded by opening it), and the multilingual-e5 meaning
 * model on its worker thread when it is already on disk (never downloaded here): the first news question that needed it waited its
 * 1.5 s and went on without it. A failure only means the first question loads it.
 */
async function preloadJarvis(): Promise<void> {
  const t0 = Date.now();
  const breathe = () => new Promise<void>((r) => setImmediate(r));
  const loads: [string, () => Promise<unknown>][] = [
    ["round", () => import("@/lib/thunai/round")], ["agent", () => import("@/lib/thunai/agent")],
    ["quick", () => import("@/lib/thunai/quick")], ["browser10", () => import("@/lib/thunai/v10/browser10")]
  ];
  for (const [name, load] of loads) {
    try { await load(); } catch (e) { console.warn(`[warm] Jarvis's ${name} module could not be loaded ahead:`, (e as Error).message); }
    await breathe();
  }
  if (process.env.NODE_ENV === "production") {
    for (const [method, route] of JARVIS_ROUTES) {
      try { await fetch(`http://127.0.0.1:${ownPort()}${route}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined }); }
      catch { /* not listening yet: loaded on first use instead */ }
      await breathe();
    }
  }
  let model = "not on disk";
  try {
    const emb = await import("@/lib/assistant/embed");
    if (fs.existsSync(emb.modelFile(path.join(process.cwd(), ".cache", "models")))) {
      await emb.embed(["query: warm"]);
      model = "ready";
    }
  } catch (e) { model = `not loaded (${(e as Error).message?.slice(0, 80)})`; }
  console.info(`[warm] Jarvis's modules are loaded; the meaning model is ${model} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

/**
 * Whether the store has the officer console's step table (npm run setup:officer on MySQL; an AWS store only when the MySQL it was migrated
 * from had it), which the Collector's status reads (collector/effective.ts officerStepsOn, hunt2-ops-09). Without it the status reads no
 * officer step, as before. Checked before the first request and again at most every 60 s while the status is read (effective.ts calls
 * __diqOfficerStepsRecheck), as intel.ts officerOpsReady() looks again: a check that failed because MySQL was still starting, or a
 * setup:officer run while the server is up, is picked up without a restart (reviewerG-02). The AWS store is checked too, through its
 * information_schema, never assumed (reviewerG-03).
 */
const RECHECK_MS = 60_000;
let checked: { at: number; done: Promise<void> } | null = null;
export function ready(): Promise<void> {
  if (!checked || Date.now() - checked.at >= RECHECK_MS) checked = { at: Date.now(), done: checkOfficerSteps() };
  return checked.done;
}
if (process.env.NEXT_PHASE !== "phase-production-build") globalThis.__diqOfficerStepsRecheck = () => { ready().catch(() => undefined); };

/**
 * What register() waits for before the first request: on MySQL the first check (a moment; at most mysql2's 10 s connect timeout when the
 * host is down). On the AWS store the check waits for the store's download (up to 90 s), so it runs on without holding the start; the status
 * reads no officer step until it says the table is there.
 */
export function beforeFirstRequest(): Promise<void> {
  const first = ready();
  return process.env.DATA_BACKEND === "aws" ? Promise.resolve() : first;
}

let failing = false;
async function checkOfficerSteps(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { setOfficerSteps } = await import("@/lib/collector/effective");
  try {
    const { default: pool, OPS_DB } = await import("@/lib/collector/db");
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'officer_steps'", [OPS_DB]);
    setOfficerSteps(Number((rows as { n: number }[])[0]?.n) > 0);
    failing = false;
  } catch (e) {
    // a failed check changes nothing (off until one says the table is there; a passing outage is not a missing table): tried again in 60 s
    if (!failing) console.warn("[officer] the officer step table could not be checked; looking again every minute:", (e as Error).message);
    failing = true;
  }
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

