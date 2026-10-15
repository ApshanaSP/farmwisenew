import path from "path";
import { defineConfig } from "vitest/config";

// Ask District IQ's golden questions on frozen data (npm run eval:golden; freeze it first with scripts/freeze-eval-store.cjs).
// Kept out of the unit suite: loading the frozen build takes about half a minute.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.golden.ts"], environment: "node", testTimeout: 60_000, hookTimeout: 300_000, fileParallelism: false,
    env: { DATA_BACKEND: "aws", AWS_STORE_SAVE: "", AI_PROVIDER: "none", AI_FALLBACK_PROVIDER: "none" }
  }
});
