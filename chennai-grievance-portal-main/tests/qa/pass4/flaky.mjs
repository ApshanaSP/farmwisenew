// QA pass 4: the flaky hunt. Runs the full default suite again and again in shuffled order, in two time zones, one run at a time.
//   node tests/qa/pass4/flaky.mjs --label <label> [--runs 10] [--run-timeout-s 600] [--vitest-args "<more arguments>"]
// --runs is per time zone, so the default is 20 runs in all. Writes docs/qa/pass4/evidence/flaky/<label>.json after every run, so a
// stopped hunt still leaves what it saw; "complete" says whether it finished. Exit code: 0 no failure, 1 something failed, 2 could not run.
// --vitest-args narrows the suite, to repeat one suspect file, or to check this tool on a test project. It is left out for a real hunt.
// A seed fixes the order of the files and tests. It does not fix which files happen to run side by side, so a seed may not repeat a failure.
// No model can be asked: the keys are removed from each run's environment and the default suite does not load .env for its tests.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { APP_ROOT, GROQ_KEYS, NOT_GROQ, QA_DIR } from "./lib/env.mjs";

const ZONES = ["UTC", "Asia/Kolkata"];
const LOCK_NAME = "vitest-full";
const LOCK_SLOTS = 2;
const MESSAGE_LIMIT = 1500;
const REPO_ROOT = path.resolve(APP_ROOT, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
function usage(why) {
  console.error(`${why}\nusage: flaky.mjs --label <label> [--runs 10] [--run-timeout-s 600] [--vitest-args "<more arguments>"]`);
  process.exit(2);
}
const label = arg("label");
const runsPerZone = Number(arg("runs", "10"));
const runTimeoutMs = Number(arg("run-timeout-s", "600")) * 1000;
const vitestArgs = arg("vitest-args", "");
if (!label || !/^[\w.-]+$/.test(label)) usage("--label is needed: letters, digits, dot, dash or underscore");
if (!Number.isInteger(runsPerZone) || runsPerZone < 1) usage("--runs must be a whole number of 1 or more");
if (!(runTimeoutMs > 0)) usage("--run-timeout-s must be more than 0");

const outFile = path.join(REPO_ROOT, "docs", "qa", "pass4", "evidence", "flaky", `${label}.json`);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `qa-flaky-${label}-`));

// ---------------------------------------------------------------- the environment of one run --
function runEnv(tz) {
  const env = { ...process.env, TZ: tz, NO_COLOR: "1", FORCE_COLOR: "0" };
  // no model key, and nothing that would turn the default suite into a live or frozen-clock one
  for (const k of [...NOT_GROQ, ...GROQ_KEYS, "PARITY_OUT", "STUDIO_LIVE", "STUDIO_LIVE_OUT", "QA_FROZEN_NOW", "QA_CLOCK_TICKING", "NODE_OPTIONS"]) delete env[k];
  return env;
}
/** The zone a process under this environment really gets. A wrong zone would make the hunt's claim false, so it stops the hunt. */
function zoneCheck(tz) {
  const r = spawnSync(process.execPath, ["-e", "console.log(JSON.stringify({offset:new Date().getTimezoneOffset(),zone:Intl.DateTimeFormat().resolvedOptions().timeZone}))"], { env: runEnv(tz), encoding: "utf8" });
  const seen = JSON.parse(r.stdout);
  const want = { UTC: 0, "Asia/Kolkata": -330 }[tz];
  if (seen.offset !== want) { console.error(`TZ=${tz} gave offset ${seen.offset}, wanted ${want}`); process.exit(2); }
  return seen;
}

// ---------------------------------------------------------------- nothing secret leaves here --
const hide = (() => {
  const exact = new Set();
  const envFile = path.join(APP_ROOT, ".env");
  const fromFile = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
  for (const source of [fromFile, process.env]) {
    for (const [k, v] of Object.entries(source)) if (/KEY|SECRET|TOKEN|PASS|CREDENTIAL/i.test(k) && v && v.length >= 6) exact.add(v);
  }
  const patterns = [/gsk_[A-Za-z0-9]{10,}/g, /sk-ant-[\w-]{10,}/g, /AIza[\w-]{20,}/g, /\bA[KS]IA[0-9A-Z]{12,}\b/g, /\bBearer\s+[\w.~+/=-]{8,}/gi, /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*/g];
  return (text) => {
    let s = String(text ?? "");
    for (const v of exact) s = s.split(v).join("[hidden]");
    for (const p of patterns) s = s.replace(p, "[hidden]");
    return s.replace(/((?:password|passwd|secret|api[_-]?key)["'\s]*[:=]\s*["']?)[^\s"',]{4,}/gi, "$1[hidden]");
  };
})();
const clean = (text, limit = MESSAGE_LIMIT) => hide(text).replace(/\x1b\[[0-9;]*m/g, "").slice(0, limit);

// ---------------------------------------------------------------- the semaphore: the same files and rules as with-lock.mjs --
// It is held here and not through with-lock.mjs so that the time spent waiting is not counted as the run's time, and so a hung run can be told from a long wait.
const lockDir = path.join(QA_DIR, "locks");
fs.mkdirSync(lockDir, { recursive: true });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const lockFile = (i) => path.join(lockDir, `${LOCK_NAME}.${i}.lock`);
function tryTake() {
  for (let i = 0; i < LOCK_SLOTS; i++) {
    const f = lockFile(i);
    try { fs.writeFileSync(f, String(process.pid), { flag: "wx" }); return f; } catch { /* taken */ }
    try {
      const pid = Number(fs.readFileSync(f, "utf8"));
      if (!alive(pid)) { fs.rmSync(f, { force: true }); fs.writeFileSync(f, String(process.pid), { flag: "wx" }); return f; }
    } catch { /* raced */ }
  }
  return null;
}
async function takeSlot() {
  for (;;) {
    const f = tryTake();
    if (f) return f;
    await new Promise((r) => setTimeout(r, 3000));
  }
}
const slotHolders = () => {
  const held = [];
  for (let i = 0; i < LOCK_SLOTS; i++) { try { held.push(Number(fs.readFileSync(lockFile(i), "utf8"))); } catch { /* free */ } }
  return held;
};
let heldSlot = null, liveChild = null;
const killTree = (pid) => {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
};
const releaseSlot = () => { if (heldSlot) { try { fs.rmSync(heldSlot, { force: true }); } catch { /* gone */ } heldSlot = null; } };
process.on("exit", releaseSlot);
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { if (liveChild) killTree(liveChild.pid); process.exit(130); });

// ---------------------------------------------------------------- one run --
const git = (args) => spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).stdout?.trim() ?? "";
const seedFor = (tz, i) => crypto.createHash("sha256").update(`${label}:${tz}:${i}`).digest().readUInt32BE(0) >>> 1;
// The dot reporter is added only because the JSON reporter alone says nothing about an unhandled error: the run just exits 1 with every test passed.
const vitestCommand = (seed, report) => `npx vitest run ${vitestArgs} --sequence.shuffle --sequence.seed=${seed} --reporter=json --reporter=dot --outputFile.json="${report.replace(/\\/g, "/")}"`;
const relFile = (name) => path.relative(APP_ROOT, name).replace(/\\/g, "/");

function runVitest(command, env) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: APP_ROOT, env, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    liveChild = child;
    let output = "", timedOut = false;
    const keep = (d) => { output = (output + d).slice(-20000); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, runTimeoutMs);
    child.on("error", (e) => { output += `\n${e.message}`; });
    child.on("close", (code) => { clearTimeout(timer); liveChild = null; resolve({ code, output, timedOut }); });
  });
}
/** What a run printed, from its first unhandled error if it has one, otherwise its end. */
const whatItSaid = (output) => {
  const i = output.search(/Unhandled (Error|Rejection)/);
  return i > -1 ? output.slice(i) : output.slice(-MESSAGE_LIMIT);
};

/** One failure entry for every test that failed, every file that could not run, and a run that ended badly with no failed test. */
function failuresOf(report, exit) {
  const out = [];
  for (const f of report?.testResults ?? []) {
    const file = relFile(f.name);
    const failed = f.assertionResults.filter((a) => a.status === "failed");
    for (const a of failed) out.push({ name: a.fullName, file, message: a.failureMessages?.[0] ?? "" });
    if (f.status === "failed" && !failed.length) out.push({ name: "(the file failed before its tests ran)", file, message: f.message ?? "" });
  }
  const said = whatItSaid(exit.output);
  if (exit.timedOut) out.push({ name: "(the run hung and was stopped)", file: null, message: said });
  else if (!report) out.push({ name: "(the run wrote no report)", file: null, message: said });
  else if (exit.code !== 0 && !out.length) out.push({ name: "(the run failed with no failed test, such as an unhandled error)", file: null, message: said });
  return out;
}

async function oneRun(n, tz, seed, seen) {
  const report = path.join(tmpDir, `run-${n}.json`);
  const asked = Date.now();
  heldSlot = await takeSlot();
  const started = Date.now();
  const others = slotHolders().filter((pid) => pid !== process.pid);
  const exit = await runVitest(vitestCommand(seed, report), runEnv(tz));
  const duration = Date.now() - started;
  const othersAfter = slotHolders().filter((pid) => pid !== process.pid);
  releaseSlot();

  let rep = null;
  try { rep = JSON.parse(fs.readFileSync(report, "utf8")); } catch { /* counted as a failure below */ }
  fs.rmSync(report, { force: true });
  for (const f of failuresOf(rep, exit)) {
    const key = `${f.file}::${f.name}`;
    const s = seen.failures.get(key) ?? { name: clean(f.name, 300), file: f.file, failed_in_runs: [], first_failure_message: clean(f.message) };
    s.failed_in_runs.push(n);
    seen.failures.set(key, s);
  }
  const skippedNames = [];
  for (const f of rep?.testResults ?? []) {
    const file = relFile(f.name);
    for (const a of f.assertionResults) {
      const key = `${file}::${a.fullName}`;
      if (a.status === "skipped" || a.status === "pending") { skippedNames.push(key); seen.skips.set(key, (seen.skips.get(key) ?? 0) + 1); }
      const d = seen.times.get(key) ?? { name: a.fullName, file, max_ms: 0 };
      if ((a.duration ?? 0) > d.max_ms) d.max_ms = Math.round(a.duration);
      seen.times.set(key, d);
    }
  }
  return {
    n, tz, seed,
    duration_s: Math.round(duration / 100) / 10,
    lock_wait_s: Math.round((started - asked) / 100) / 10,
    other_vitest_slot_busy: others.length > 0 || othersAfter.length > 0,
    passed: rep?.numPassedTests ?? null,
    failed: rep?.numFailedTests ?? null,
    skipped: rep?.numPendingTests ?? null,
    todo: rep?.numTodoTests ?? null,
    total: rep?.numTotalTests ?? null,
    files: rep?.testResults?.length ?? null,
    exit_code: exit.code,
    timed_out: exit.timedOut,
    commit: git(["rev-parse", "--short", "HEAD"]),
    repro: `TZ=${tz} npx vitest run ${vitestArgs ? `${vitestArgs} ` : ""}--sequence.shuffle --sequence.seed=${seed}`,
  };
}

// ---------------------------------------------------------------- the hunt --
const seen = { failures: new Map(), skips: new Map(), times: new Map() };
const statusAt = (args) => git(["status", "--porcelain", "--", ...args]);
const startStatus = statusAt(["chennai-grievance-portal-main"]);
const zones = Object.fromEntries(ZONES.map((tz) => [tz, zoneCheck(tz)]));
const startedAt = new Date().toISOString();
const runs = [];

function summary(complete) {
  const failures = [...seen.failures.values()].map((f) => {
    const zonesFailed = Object.fromEntries(ZONES.map((tz) => [tz, f.failed_in_runs.filter((n) => runs[n - 1]?.tz === tz).length]));
    const changed = f.file ? git(["status", "--porcelain", "--", path.join("chennai-grievance-portal-main", f.file)]) : "";
    return { ...f, times_failed: f.failed_in_runs.length, by_time_zone: zonesFailed, file_differs_from_commit: Boolean(changed) };
  }).sort((a, b) => b.times_failed - a.times_failed);
  const nowStatus = statusAt(["chennai-grievance-portal-main"]).split("\n").filter(Boolean);
  const before = new Set(startStatus.split("\n").filter(Boolean));
  return {
    label, complete,
    command: `npx vitest run ${vitestArgs ? `${vitestArgs} ` : ""}--sequence.shuffle --sequence.seed=<seed> --reporter=json --reporter=dot --outputFile.json=<tmp>`,
    held_semaphore: `${LOCK_NAME} ${LOCK_SLOTS}`,
    runs_per_time_zone: runsPerZone,
    node: process.version,
    started: startedAt,
    finished: new Date().toISOString(),
    time_zones_checked: zones,
    runs_done: runs.length,
    runs_with_any_failure: runs.filter((r) => r.exit_code !== 0 || r.failed !== 0).length,
    tests_that_failed: failures.length,
    failures,
    // a test skipped in some runs and not in others is flaky too: a skip hides it
    skipped_in_only_some_runs: [...seen.skips].filter(([, c]) => c !== runs.length).map(([key, c]) => ({ test: clean(key, 300), skipped_in_runs: c })),
    skipped_in_every_run: [...seen.skips].filter(([, c]) => c === runs.length).length,
    slowest_tests: [...seen.times.values()].sort((a, b) => b.max_ms - a.max_ms).slice(0, 15).map((t) => ({ ...t, name: clean(t.name, 300) })),
    // paths that changed in the app folder during the hunt. This machine is shared, so another agent's work shows here too.
    paths_changed_during_hunt: nowStatus.filter((l) => !before.has(l)),
    runs,
  };
}
function save(complete) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const tmp = `${outFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(summary(complete), null, 1));
  fs.renameSync(tmp, outFile);
}

let n = 0;
save(false);
// the zones take turns, so a busy spell on the machine does not fall on one zone only
for (let i = 0; i < runsPerZone; i++) {
  for (const tz of ZONES) {
    n += 1;
    const run = await oneRun(n, tz, seedFor(tz, i), seen);
    runs.push(run);
    save(false);
    console.log(`run ${n}/${runsPerZone * ZONES.length} TZ=${tz} seed=${run.seed}: ${run.duration_s}s passed=${run.passed} failed=${run.failed} skipped=${run.skipped} exit=${run.exit_code} (waited ${run.lock_wait_s}s)`);
  }
}
save(true);
fs.rmSync(tmpDir, { recursive: true, force: true });
const anyFailure = seen.failures.size > 0 || runs.some((r) => r.exit_code !== 0);
console.log(anyFailure ? `done: ${seen.failures.size} test(s) failed at least once. See ${outFile}` : `done: no failure in ${runs.length} runs. See ${outFile}`);
process.exit(anyFailure ? 1 : 0);
