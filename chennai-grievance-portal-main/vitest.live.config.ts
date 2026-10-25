import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Ask District IQ on frozen data WITH the language models (.env's Groq and Gemini keys): the live check of the router and
// the composer. Paced for the free tiers (LIVE_GAP_MS between questions). Questions from LIVE_FILE, answers to LIVE_OUT.
//   set LIVE_FILE=questions.json&& npx vitest run --config vitest.live.config.ts
const env = fs.existsSync(path.join(__dirname, ".env")) ? dotenv.parse(fs.readFileSync(path.join(__dirname, ".env"))) : {};
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.live.ts"], environment: "node", testTimeout: 3_600_000, hookTimeout: 300_000, fileParallelism: false,
    // AI_* set in the shell win over .env (AI_CHAT_MODE=agent, AI_PROVIDER=none to keep background calls off the free tier)
    env: { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("AI_")) as [string, string][]), DATA_BACKEND: "aws", AWS_STORE_SAVE: "" }
  }
});
