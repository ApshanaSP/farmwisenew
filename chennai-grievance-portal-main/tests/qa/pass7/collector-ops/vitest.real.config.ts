import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../../vitest.qa4.config";

// QA pass 7, collector-ops: the real-path tests of this folder (*.real.spec.ts, so the unit config vitest.p7.config.ts, which takes tests/qa/pass7/**/*.test.ts, never runs them) on the pinned snapshot, through pass 4's config
// (DATA_BACKEND=aws, AWS_API_URL = the pinned API on QA_PIN_PORT, no model key, no mail, its own durable file per process).
//   QA_PIN_PORT=3192 npx vitest run --config tests/qa/pass7/collector-ops/vitest.real.config.ts tests/qa/pass7/collector-ops/<file>
// mergeConfig concatenates arrays, so the include is set after the merge: with mergeConfig alone this config also ran all of
// tests/qa/pass4 (QA pass 7 gate, 13 Nov 2026)
const merged = mergeConfig(base, defineConfig({}));
export default { ...merged, test: { ...merged.test, include: ["tests/qa/pass7/collector-ops/**/*.real.spec.ts"] } };
