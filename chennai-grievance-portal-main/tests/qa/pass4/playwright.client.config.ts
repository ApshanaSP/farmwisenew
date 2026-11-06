import { defineConfig } from "@playwright/test";

/**
 * QA pass 4: the audit of the client fixes (BUG-012, BUG-014, BUG-015, BUG-016) in a real browser, on the production build.
 *   node tests/qa/pass4/server.mjs start --port 3135 --ticking --env STUDIO_DIR=data/aws-cache/qa/srv/3135/studio
 *   node tests/qa/pass4/with-lock.mjs browser 3 -- npx playwright test --config tests/qa/pass4/playwright.client.config.ts
 * It starts no server of its own (the launcher does that: dry-run, no model key, its own data folder).
 */
export default defineConfig({
  testDir: "../../e2e",
  testMatch: "pass4-client-fixes.spec.ts",
  // QA_GREP: a regular expression for part of the run (the lock's shell cannot pass a | on the command line)
  grep: process.env.QA_GREP ? new RegExp(process.env.QA_GREP) : undefined,
  outputDir: "../../../data/aws-cache/qa/run/pw-3135",
  timeout: 150_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.QA_BASE ?? "http://127.0.0.1:3135",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["microphone"]
  }
});
