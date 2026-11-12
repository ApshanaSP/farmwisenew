// QA pass 4 red-team / security hunt (redsec2). Needs the hunter's own server:
//   node tests/qa/pass4/server.mjs start --port 3214 --frozen --ticking --instance redsec2
// Run: npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/hunt-redsec2.test.ts
//
// Scope: cover what redsec1 did not run (CSRF on state-changing routes, path traversal on dir/name/file
// params, SSRF on collector source/map links, SQL injection shapes, IDOR across the six test accounts).
// Those all came back clean in this pass (see docs/qa/pass4/findings/hunt-redsec2.json for the full,
// honest not-run / clean list and the evidence for each). The one thing that broke is the step-up
// "Confirm it's you" box's own brute-force lockout, found while probing it as part of the same sweep
// (it sits right next to the actions IDOR/CSRF would otherwise reach).
import { describe, it, expect } from "vitest";
import { login } from "./lib/access-lib.mjs";

const base = "http://127.0.0.1:3214";
const up = await fetch(`${base}/login`).then((r) => r.status < 500).catch(() => false);

describe.skipIf(!up)("hunt-redsec2: step-up confirmation brute-force lockout", () => {
  it.fails(
    "hunt-redsec2-1: sending wrong step-up passwords in parallel is not rate-limited to 5 attempts",
    async () => {
      const { cookie } = await login(base, "officerB");
      const body = (code: string) =>
        JSON.stringify({ step: "check", action: "export", scope: "a".repeat(32), method: "password", code });

      // /api/auth/confirm's verifyFactor (src/lib/security/factors.ts) checks failuresOver(key, 5) *before*
      // the slow bcrypt.compare, and only calls addFailure *after* it resolves. Sent one at a time, the 6th
      // wrong guess is refused (429). Sent together, every one of them reads the same "0 failures so far"
      // before any of them finishes bcrypt and writes its failure back, so all of them get a real password
      // check (401, not 429) -- the 5-attempt lockout never engages for a burst sent in parallel.
      const N = 20;
      const rs = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          fetch(`${base}/api/auth/confirm`, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: body(`guess-${i}`)
          })
        )
      );
      const statuses = rs.map((r) => r.status);
      const got401 = statuses.filter((s) => s === 401).length;
      const got429 = statuses.filter((s) => s === 429).length;
      // What should happen: at most 5 of these are checked against the real password (401); the rest are
      // refused by the lockout (429) before ever reaching bcrypt.compare.
      expect(got401).toBeLessThanOrEqual(5);
      expect(got429).toBeGreaterThanOrEqual(N - 5);
    }
  );
});
