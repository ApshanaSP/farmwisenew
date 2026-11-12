// QA pass 4 mutation testing. Run from chennai-grievance-portal-main:
//   MUT_LABEL=baseline node tests/qa/pass4/with-lock.mjs stryker 1 -- npx stryker run tests/qa/pass4/stryker.conf.mjs
// MUT_FILES (comma list) limits the modules. Sandboxed copy in .stryker-tmp (not in place). Source is never changed.
import fs from "fs";
const all = JSON.parse(fs.readFileSync("tests/qa/pass4/critical-modules.json", "utf8")).files;
const label = process.env.MUT_LABEL || "baseline";
const files = process.env.MUT_FILES ? process.env.MUT_FILES.split(",") : all;
export default {
  mutate: files,
  testRunner: "vitest",
  vitest: { configFile: "tests/qa/pass4/stryker.vitest.config.mjs" },
  coverageAnalysis: "perTest",
  concurrency: 4,
  ignoreStatic: true,
  inPlace: false,
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
  thresholds: { high: 100, low: 0, break: null },
  reporters: ["json", "clear-text"],
  clearTextReporter: { allowColors: false, logTests: false, maxTestsToLog: 0 },
  jsonReporter: { fileName: `../docs/qa/pass4/mutation/${label}.json` },
  timeoutMS: 20000,
  ignorePatterns: [".next*", ".stryker-tmp", "docs", "data/aws-cache", "data/qa", "public", "tests/e2e"],
  disableTypeChecks: "src/**/*.ts"
};
