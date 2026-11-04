import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// The QA pass's live runs: Groq ONLY. Every other provider key the gateway or Jarvis's ladder could read is removed from
// this test process (the .env file itself is untouched), so nothing but Groq can answer. Each run's rows record the model
// that answered, and a row answered by anything else is invalid.
//   set QA_LIVE=first40&& npx vitest run --config vitest.qa-live.config.ts src/lib/thunai/qa.live.ts
const env = fs.existsSync(path.join(__dirname, ".env")) ? dotenv.parse(fs.readFileSync(path.join(__dirname, ".env"))) : {};
const NOT_GROQ = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENAI_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AZURE_SPEECH_KEY", "AI_FORCE_PROVIDER", "AI_CHAT_PROVIDER", "JARVIS_BEDROCK"];
const groqOnly: Record<string, string> = Object.fromEntries(Object.entries(env).filter(([k]) => !NOT_GROQ.includes(k)));
for (const k of NOT_GROQ) delete process.env[k];
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/qa.live.ts"], environment: "node", testTimeout: 3_600_000, hookTimeout: 300_000, fileParallelism: false,
    env: { ...groqOnly, ...Object.fromEntries(NOT_GROQ.map((k) => [k, ""])), AI_PROVIDER: "groq", AI_FALLBACK_PROVIDER: "groq", AI_CHAT_PROVIDER: "groq",
      DATA_BACKEND: "aws", AWS_STORE_SAVE: "", AWS_STORE_DRY_RUN: "1", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", QA_GROQ_ONLY: "1" }
  }
});
