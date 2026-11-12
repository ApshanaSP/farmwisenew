import path from "path";
import { defineConfig } from "vitest/config";

// QA pass 7 (P0 fixes, run as several sessions at once): the unit tests WITHOUT the Studio fixture server on 127.0.0.1:4599.
// The default config starts that server once per run (globalSetup), so two default-config runs at once, in any worktree, break
// each other's links. This config never starts it and leaves out the three files that need it (connectors, outcomes, scans-code):
// run those only with the default config, alone, after checking that nothing listens on 4599.
//   npx vitest run --config vitest.p7.config.ts --maxWorkers=2 <files>
const blank = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "AWS_BEARER_TOKEN_BEDROCK", "AWS_SESSION_TOKEN", "SMTP_PASS", "SMTP_USER", "MSG91_AUTH_KEY", "MSG91_SENDER", "SMS_TEST_NUMBER", "EMAIL_SANDBOX_TO", "AWS_STORE_SAVE"];
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts", "tests/qa/pass7/**/*.test.ts"],
    exclude: ["**/node_modules/**", "src/lib/studio/connectors.test.ts", "src/lib/studio/outcomes.test.ts"],
    environment: "node", testTimeout: 15_000,
    env: { ...Object.fromEntries(blank.map((k) => [k, ""])), AWS_STORE_DRY_RUN: "1", SMS_MODE: "off", EMAIL_MODE: "sandbox" }
  }
});
