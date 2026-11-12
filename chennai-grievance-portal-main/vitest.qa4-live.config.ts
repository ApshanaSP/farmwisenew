import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import { PIN_URL } from "./tests/qa/pass4/lib/env.mjs";

// QA pass 4: the sentence runner against live Groq. The same rules as vitest.qa-live.config.ts: Groq ONLY. Every other provider key the gateway or Jarvis's ladder could read is
// removed from this test process (the .env file itself is untouched), so nothing but Groq can answer. A row answered by anything else is refused as invalid by run.test.ts.
// The store stays on the pinned API (never AWS, never saved). THUNAI_DIR is data/thunai, so the quota ledger is the real one and a run spends what it says it spent.
// Not run by this file's author. It needs a brief that names a Groq run:
//   set QA_P4_MODE=live&& set QA_P4_SET=open&& set QA_P4_LABEL=open-live&& set QA_P4_SAMPLE=40&& set QA_P4_SEED=20261106&& npx vitest run --config vitest.qa4-live.config.ts
const env = fs.existsSync(path.join(__dirname, ".env")) ? dotenv.parse(fs.readFileSync(path.join(__dirname, ".env"))) : {};
const NOT_GROQ = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENAI_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AZURE_SPEECH_KEY", "AI_FORCE_PROVIDER", "AI_CHAT_PROVIDER", "JARVIS_BEDROCK", "SMTP_PASS", "SMTP_USER"];
const groqOnly: Record<string, string> = Object.fromEntries(Object.entries(env).filter(([k]) => !NOT_GROQ.includes(k)));
for (const k of NOT_GROQ) delete process.env[k];
const srv = path.join("data", "aws-cache", "qa", "srv", `vitest-live-${process.pid}`);
fs.mkdirSync(path.join(__dirname, srv), { recursive: true });
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/qa/pass4/grader/run.test.ts"], environment: "node", testTimeout: 7_200_000, hookTimeout: 300_000, fileParallelism: false,
    globalSetup: ["tests/qa/pass4/lib/global-setup.mjs"],
    env: { ...groqOnly, ...Object.fromEntries(NOT_GROQ.map((k) => [k, ""])), AI_PROVIDER: "groq", AI_FALLBACK_PROVIDER: "groq", AI_CHAT_PROVIDER: "groq", AI_FORCE_PROVIDER: "",
      DATA_BACKEND: "aws", AWS_STORE_SAVE: "", AWS_STORE_DRY_RUN: "1", AWS_STORE_RELOAD_MINUTES: "100000", AWS_DURABLE_FILE: path.join(srv, "durable.sqlite"), AWS_API_URL: PIN_URL, REFRESH_API_KEY: "qa-pinned",
      THUNAI_DIR: path.join("data", "thunai"), SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", EMAIL_MODE: "sandbox", QA_GROQ_ONLY: "1", QA_P4_MODE: "live" }
  }
});
