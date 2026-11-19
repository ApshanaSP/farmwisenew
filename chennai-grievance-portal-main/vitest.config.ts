import os from "os";
import path from "path";
import { defineConfig } from "vitest/config";

// Unit tests for Ask District IQ (src/**/*.test.ts). No database or AI provider is needed: the
// compiler and catalog tests run on the committed schema snapshot.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // 15 s: a test's first dynamic import of the assistant modules can take over 5 s when every file runs in parallel
  test: { include: ["src/**/*.test.ts"], environment: "node", testTimeout: 15_000,
    // v6: a mocked Claude call's pretend cost goes to a temporary spend record, never the owner's real one (claudebudget.isolated.v6.test.ts)
    env: { JARVIS_CLAUDE_BUDGET_FILE: path.join(os.tmpdir(), `jv-claude-budget-test-${process.pid}.sqlite`) },
    // the Studio's link fixtures (127.0.0.1:4599), one server for every test file
    globalSetup: ["scripts/studio-fixtures/global-setup.mjs"] }
});
