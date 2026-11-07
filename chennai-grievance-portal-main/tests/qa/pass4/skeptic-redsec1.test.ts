// QA pass 4 red-team / security hunt (redsec1). Needs the hunter's own server:
//   node tests/qa/pass4/server.mjs start --port 3192 --frozen --ticking --instance redsec1
// Run: npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/hunt-redsec1.test.ts
import { describe, it, expect } from "vitest";
import { login } from "./lib/access-lib.mjs";

const base = "http://127.0.0.1:3192";
const up = await fetch(`${base}/login`).then((r) => r.status < 500).catch(() => false);

describe.skipIf(!up)("hunt-redsec1: session revocation on logout", () => {
  it("skeptic-redsec1-1 (expects fix): a cookie copied before logout is rejected after the user logs out", async () => {
    const { cookie } = await login(base, "citizenA");
    const before = await fetch(`${base}/api/auth/me`, { headers: { cookie, "x-dcd-portal": "citizen" } });
    expect(before.status).toBe(200);

    const out = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie, "x-dcd-portal": "citizen" } });
    expect(out.status).toBe(200);

    // Simulate an attacker who captured the cookie value before logout (XSS, a shared machine, a leaked log, a
    // proxy log, etc). The server must refuse this old token once the user has signed out.
    const after = await fetch(`${base}/api/auth/me`, { headers: { cookie, "x-dcd-portal": "citizen" } });
    expect(after.status).toBe(401);
  });
});
