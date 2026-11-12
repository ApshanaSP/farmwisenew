import path from "path";
import { defineConfig } from "vitest/config";
// Used only by Stryker (tests/qa/pass4/stryker.conf.mjs): fast unit tests of the critical modules, no globalSetup.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: {
    environment: "node", testTimeout: 15_000,
    include: [
      "src/lib/thunai/{privacy,privacy.redteam,injection,numbergate.one,owner,chunker,entities,pass2,pass3,narrate,quick,reach,xlit,frame,speechsweep,devguard}.test.ts",
      "src/lib/collector/{effective,locreview}.test.ts",
      "src/lib/security/stepup.test.ts", "src/lib/csv.test.ts", "src/lib/rate-limit.test.ts", "src/lib/netsafe.test.ts",
      "src/lib/assistant/__tests__/{compile,guards,answers}.test.ts",
      "src/app/api/collector/sources/[[]id]/route.test.ts"
    ]
  }
});
