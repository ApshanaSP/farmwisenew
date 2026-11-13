import path from "path";
import { defineConfig } from "vitest/config";

// The fix-all run's targeted test config: the default config without the Studio link fixtures' global setup, so a run does not
// take 127.0.0.1:4599 (shared by every worktree; a second run's teardown kills the first run's fixture server). Studio tests that
// fetch the fixtures fail here: run those with the default config, holding the 4599 lock (docs/qa/fixall/FIXER_RULES.md).
//   npx vitest run --config vitest.fixall.config.ts <files>
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/*.test.ts"], environment: "node", testTimeout: 15_000 }
});
