// QA pass 6: runs the unit suite (vitest.config.ts) once, shuffled, under one time zone, with nothing able to send or spend.
//   node tests/qa/pass6/suite.mjs --tz Asia/Kolkata --seed 101 --tag base-1 [--config vitest.qa4.config.ts]
// Writes docs/qa/pass6/results/suite-<tag>.json (vitest's JSON report) and prints one summary line. No .env value is read or printed.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..", "..");
const OUT = path.resolve(APP, "..", "docs", "qa", "pass6", "results");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const tz = opt("tz", "Asia/Kolkata"), seed = opt("seed", String(Date.now() % 100000)), tag = opt("tag", `run-${seed}`);
const config = opt("config", "vitest.config.ts");
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `suite-${tag}.json`);

const blank = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENAI_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AZURE_SPEECH_KEY", "AI_FORCE_PROVIDER", "SMTP_PASS", "SMTP_USER", "GROQ_API_KEY", "GROQ_API_KEY_2",
  "GROQ_API_KEY_3", "MSG91_AUTH_KEY", "MSG91_SENDER", "SMS_TEST_NUMBER", "EMAIL_SANDBOX_TO", "EMAIL_LIVE_ALLOWLIST", "AWS_STORE_SAVE"];
const env = { ...process.env, TZ: tz, AWS_STORE_DRY_RUN: "1", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", EMAIL_MODE: "sandbox", SMS_MODE: "off",
  MANU_PADDLE_URL: "http://127.0.0.1:1", NEXT_TELEMETRY_DISABLED: "1" };
for (const k of blank) env[k] = "";

const t0 = Date.now();
const r = spawnSync(process.execPath, [path.join(APP, "node_modules", "vitest", "vitest.mjs"), "run", "--config", config, "--sequence.shuffle", `--sequence.seed=${seed}`,
  "--reporter=dot", "--reporter=json", `--outputFile.json=${file}`], { cwd: APP, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const secs = Math.round((Date.now() - t0) / 1000);
let sum = { numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0, numFailedTestSuites: 0 };
const failed = [];
try {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  sum = { numTotalTests: j.numTotalTests, numPassedTests: j.numPassedTests, numFailedTests: j.numFailedTests, numPendingTests: j.numPendingTests + (j.numTodoTests ?? 0), numFailedTestSuites: j.numFailedTestSuites };
  for (const s of j.testResults) {
    if (s.status === "failed" && !s.assertionResults.some((a) => a.status === "failed")) failed.push(`${path.relative(APP, s.name)} :: (file failed) ${String(s.message ?? "").slice(0, 200)}`);
    for (const a of s.assertionResults) if (a.status === "failed") failed.push(`${path.relative(APP, s.name)} :: ${a.fullName}`);
  }
} catch (e) { failed.push(`no JSON report: ${e.message}; exit ${r.status}; ${String(r.stderr).slice(-800)}`); }
const line = { tag, tz, seed, config, exit: r.status, secs, ...sum, failed };
fs.writeFileSync(path.join(OUT, `suite-${tag}.summary.json`), JSON.stringify(line, null, 2));
console.log(JSON.stringify({ ...line, failed: failed.length }));
for (const f of failed) console.log("FAIL", f);
