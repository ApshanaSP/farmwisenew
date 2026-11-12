import path from "path";
import { defineConfig } from "vitest/config";

// QA pass 5: hunters' probe tests only (tests/qa/pass5/probes/<hunter>/*.test.ts). Never part of the unit suite. No key, no mail, no SMS.
//   npx vitest run --config vitest.p5probe.config.ts tests/qa/pass5/probes/<hunter>
const blank = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "AWS_BEARER_TOKEN_BEDROCK", "AWS_SESSION_TOKEN", "SMTP_PASS", "SMTP_USER", "MSG91_AUTH_KEY", "MSG91_SENDER", "SMS_TEST_NUMBER", "EMAIL_SANDBOX_TO", "AWS_STORE_SAVE"];
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/qa/pass5/probes/**/*.test.ts", "tests/qa/pass5/known-failures/**/*.test.ts"], environment: "node", testTimeout: 60_000,
    env: { ...Object.fromEntries(blank.map((k) => [k, ""])), AWS_STORE_DRY_RUN: "1", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", EMAIL_MODE: "sandbox", SMS_MODE: "off",
      MANU_PADDLE_URL: "http://127.0.0.1:1" }
  }
});
