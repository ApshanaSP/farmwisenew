import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import { GROQ_KEYS, NOT_GROQ, PIN_URL } from "./tests/qa/pass4/lib/env.mjs";

// QA pass 4: tests that run on the real snapshot through the real code path (tests/qa/pass4/**/*.test.ts), or that drive a test server.
//   npx vitest run --config vitest.qa4.config.ts
// The store is the real store.ts, reading the pinned snapshot from the local stand-in API (never AWS). No model key is in the
// process, so nothing can call a model and only the code lanes answer. Each process has its own durable file.
const env = fs.existsSync(path.join(__dirname, ".env")) ? dotenv.parse(fs.readFileSync(path.join(__dirname, ".env"))) : {};
const blank = [...NOT_GROQ, ...GROQ_KEYS];
const kept = Object.fromEntries(Object.entries(env).filter(([k]) => !blank.includes(k)));
const instance = `vitest-${process.pid}`;
const srv = path.join("data", "aws-cache", "qa", "srv", instance);
fs.mkdirSync(path.join(__dirname, srv, "thunai"), { recursive: true });
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/qa/pass4/**/*.test.ts"], environment: "node", testTimeout: 180_000, hookTimeout: 300_000,
    globalSetup: ["tests/qa/pass4/lib/global-setup.mjs"],
    env: { ...kept, ...Object.fromEntries(blank.map((k) => [k, ""])), AI_PROVIDER: "groq", AI_FALLBACK_PROVIDER: "groq", AI_CHAT_PROVIDER: "groq",
      DATA_BACKEND: "aws", AWS_STORE_SAVE: "", AWS_STORE_DRY_RUN: "1", AWS_STORE_RELOAD_MINUTES: "100000", AWS_DURABLE_FILE: path.join(srv, "durable.sqlite"),
      THUNAI_DIR: path.join(srv, "thunai"), AWS_API_URL: PIN_URL, REFRESH_API_KEY: "qa-pinned", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", EMAIL_MODE: "sandbox", QA_GROQ_ONLY: "1" }
  }
});
