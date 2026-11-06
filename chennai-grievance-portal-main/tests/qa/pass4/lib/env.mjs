// QA pass 4: the one place that says what a test server's or a test process's environment is.
// Rules it enforces (docs/qa/PASS4_TEST_PROMPT.md section 4 and 5): never saves to AWS, never sends mail, Groq only, and
// no model key at all unless the run names Groq. Values from .env are never printed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, "..", "..", "..", "..");
export const QA_DIR = path.join(APP_ROOT, "data", "aws-cache", "qa");   // gitignored
export const PIN_DIR = path.join(QA_DIR, "pinned");                     // the pinned snapshot, gitignored
export const RUN_DIR = path.join(QA_DIR, "run");                        // pid files and logs
export const PIN_PORT = Number(process.env.QA_PIN_PORT || 3199);
export const PIN_URL = `http://127.0.0.1:${PIN_PORT}`;
/** The frozen "now" used by the golden master and by every figure comparison: 6 Nov 2026, 12:00 IST. */
export const FROZEN_NOW = "2026-11-06T06:30:00.000Z";

export const NOT_GROQ = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENAI_API_KEY", "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AZURE_SPEECH_KEY", "AI_FORCE_PROVIDER", "JARVIS_BEDROCK", "SMTP_PASS", "SMTP_USER"];
export const GROQ_KEYS = ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3"];

/**
 * The environment for a test server or real-path test process.
 * @param {{port?: number|string, groq?: boolean, frozen?: string|null, ticking?: boolean, dist?: string, pinned?: boolean, instance?: string}} o
 */
export function qaEnv(o = {}) {
  const { port = "proc", groq = false, frozen = null, ticking = false, dist = ".next-qa", pinned = true, instance = String(port) } = o;
  const srvDir = path.join("data", "aws-cache", "qa", "srv", instance);
  const abs = path.join(APP_ROOT, srvDir);
  fs.mkdirSync(abs, { recursive: true });
  const env = {
    ...process.env,
    DATA_BACKEND: "aws", AWS_STORE_DRY_RUN: "1", AWS_STORE_SAVE: "", AWS_STORE_RELOAD_MINUTES: "100000",
    AWS_DURABLE_FILE: path.join(srvDir, "durable.sqlite"),
    SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", EMAIL_MODE: "sandbox", NEXT_DIST_DIR: dist,
    AI_PROVIDER: "groq", AI_FALLBACK_PROVIDER: "groq", AI_CHAT_PROVIDER: "groq", QA_GROQ_ONLY: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const k of NOT_GROQ) env[k] = "";
  if (!groq) for (const k of GROQ_KEYS) env[k] = "";
  // a server with no model key keeps its ledger and telemetry to itself; a Groq run shares the real quota ledger in data/thunai
  env.THUNAI_DIR = groq ? path.join("data", "thunai") : path.join(srvDir, "thunai");
  if (!groq) fs.mkdirSync(path.join(APP_ROOT, env.THUNAI_DIR), { recursive: true });
  if (pinned) { env.AWS_API_URL = PIN_URL; env.REFRESH_API_KEY = "qa-pinned"; }
  const extra = ["--max-old-space-size=2048"];
  if (frozen) {
    env.QA_FROZEN_NOW = frozen;
    if (ticking) env.QA_CLOCK_TICKING = "1"; else delete env.QA_CLOCK_TICKING;
    extra.push(`--require=${path.join(APP_ROOT, "tests", "qa", "pass4", "freeze-clock.cjs").replace(/\\/g, "/")}`);
  }
  env.NODE_OPTIONS = extra.join(" ");
  return env;
}
