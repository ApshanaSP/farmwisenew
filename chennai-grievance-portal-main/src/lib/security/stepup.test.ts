import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GRANT_HEADER, SOFT_HEADER as SOFT_HEADER_NAME, issueGrant, requireConfirm, scopeHash } from "./stepup";
import { signToken } from "@/lib/jwt";
import { emailRef, normRef } from "./stamp";
import { crossSite } from "@/middleware";

const S = { userId: 7, email: "collector@test", role: "collector" as const, departmentId: null, tv: 2 };
const SCOPE = { dept: "GCC-SWD", ids: ["A", "B"], subject: "Clear the drains", body: "Please clear the drains on these streets." };
const req = (grant?: string) => new NextRequest("http://x/api/map/send", { method: "POST", headers: grant ? { [GRANT_HEADER]: grant } : {} });

describe("Confirm it's you (step-up)", () => {
  it("answers 428 with a summary and the scope's hash when there is no grant", async () => {
    const r = await requireConfirm(req(), S, "send_email", "Send 1 email", SCOPE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.res.status).toBe(428);
    const j = await r.res.json();
    expect(j.confirm).toMatchObject({ action: "send_email", summary: "Send 1 email", scope: scopeHash(SCOPE) });
  });

  it("lets the exact same action through with a grant for it", async () => {
    const g = await issueGrant(S, "send_email", scopeHash(SCOPE), "password");
    const r = await requireConfirm(req(g), S, "send_email", "Send 1 email", { ...SCOPE });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.grant?.fac).toBe("password");
  });

  it("the hash does not depend on the order of keys", () => {
    expect(scopeHash({ b: 1, a: [2, { y: 1, x: 2 }] })).toBe(scopeHash({ a: [2, { x: 2, y: 1 }], b: 1 }));
  });

  it("refuses a grant once a word of the email changed, for another action, another account or a signed-out session", async () => {
    const g = await issueGrant(S, "send_email", scopeHash(SCOPE), "password");
    expect((await requireConfirm(req(g), S, "send_email", "", { ...SCOPE, body: SCOPE.body + " Now." })).ok).toBe(false);
    expect((await requireConfirm(req(g), S, "decide", "", SCOPE)).ok).toBe(false);
    expect((await requireConfirm(req(g), { ...S, userId: 8 }, "send_email", "", SCOPE)).ok).toBe(false);
    expect((await requireConfirm(req(g), { ...S, tv: 3 }, "send_email", "", SCOPE)).ok).toBe(false);
  });

  it("does not take a session token as a grant", async () => {
    const session = await signToken(S);
    expect((await requireConfirm(req(session), S, "send_email", "", SCOPE)).ok).toBe(false);
  });
});

describe("PB-316: the browser asks without a console error, the guard is the same", () => {
  const soft = (grant?: string) => new NextRequest("http://x/api/officer/grievances/INC-1/report", { method: "POST", headers: { "x-diq-confirm": "json", ...(grant ? { [GRANT_HEADER]: grant } : {}) } });

  it("a browser that says it can read it is answered 200 with the same body and a header, so the console logs no failed request", async () => {
    const r = await requireConfirm(soft(), S, "officer_report", "Send the report", SCOPE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get("x-diq-confirm")).toBe("required");
    expect(r.res.headers.get("cache-control")).toBe("no-store");
    const j = await r.res.json();
    expect(j.confirm).toMatchObject({ action: "officer_report", summary: "Send the report", scope: scopeHash(SCOPE) });
  });

  it("still never lets the action through without a grant, whatever the request says", async () => {
    for (const h of [{ "x-diq-confirm": "json" }, { "x-diq-confirm": "json", [GRANT_HEADER]: "not-a-grant" }, { "x-diq-confirm": "anything" }, {}] as Record<string, string>[]) {
      const r = await requireConfirm(new NextRequest("http://x/api/map/send", { method: "POST", headers: h }), S, "send_email", "Send", SCOPE);
      expect(r.ok, JSON.stringify(h)).toBe(false);
    }
  });

  it("a caller that does not send the header still gets the 428", async () => {
    const r = await requireConfirm(req(), S, "send_email", "Send", SCOPE);
    expect(r.ok === false && r.res.status).toBe(428);
    expect(r.ok === false && r.res.headers.get("x-diq-confirm")).toBeNull();
  });

  it("a grant for the exact action still passes when the header is there", async () => {
    const g = await issueGrant(S, "send_email", scopeHash(SCOPE), "password");
    const r = await requireConfirm(soft(g), S, "send_email", "Send", { ...SCOPE });
    expect(r.ok).toBe(true);
  });

  it("a grant for something else gets the 200 confirm again, not the action", async () => {
    const g = await issueGrant(S, "send_email", scopeHash(SCOPE), "password");
    const r = await requireConfirm(soft(g), S, "send_email", "Send", { ...SCOPE, body: SCOPE.body + " Now." });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.res.status).toBe(200); expect((await r.res.json()).error).toMatch(/for something else/); }
  });
});

describe("PB-316 class guard: every guarded route hands back requireConfirm's own answer, and the console asks the soft way", () => {
  const fs = require("node:fs") as typeof import("node:fs"), path = require("node:path") as typeof import("node:path");
  const root = path.resolve(__dirname, "../..");
  const routes: string[] = [];
  (function walk(d: string) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === "route.ts") routes.push(f); } })(path.join(root, "app/api"));

  it("every route that calls requireConfirm returns `c.res` untouched when it says no (so the 200 or the 428 is decided in one place)", () => {
    const guarded = routes.filter((f) => /requireConfirm\(/.test(fs.readFileSync(f, "utf8")));
    expect(guarded.length).toBeGreaterThanOrEqual(9);
    for (const f of guarded) {
      const src = fs.readFileSync(f, "utf8");
      const calls = (src.match(/requireConfirm\(/g) ?? []).length - (src.match(/import \{[^}]*requireConfirm/g) ?? []).length;
      expect((src.match(/if \(!c\.ok\) return c\.res;/g) ?? []).length, path.relative(root, f)).toBeGreaterThanOrEqual(calls);
    }
  });

  it("the confirm host sends x-diq-confirm on the console's own requests and turns the 200 answer back into a 428 for its callers", () => {
    const src = fs.readFileSync(path.join(root, "components/security/Confirm.tsx"), "utf8");
    expect(src).toMatch(/SOFT_HEADER\]: "json"/);
    expect(src).toMatch(/status: 428/);
    expect(src).toMatch(/SOFT_ANSWER\) === "required"/);
    // the header names agree with the server's
    expect(src).toContain(`SOFT_HEADER = "x-diq-confirm"`);
    expect(`${SOFT_HEADER_NAME}`).toBe("x-diq-confirm");
  });
});

describe("email references", () => {
  const e = { owner: "collector@test", subject: "Action needed", bodyHash: "ab".repeat(32), at: "2026-11-04 14:32:10" };
  it("are stable, look like DIQ-XXXX-XXXX and change with any part of the email", () => {
    const r = emailRef(e);
    expect(r).toMatch(/^DIQ-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(emailRef({ ...e })).toBe(r);
    expect(emailRef({ ...e, subject: "Action needed!" })).not.toBe(r);
    expect(emailRef({ ...e, bodyHash: "cd".repeat(32) })).not.toBe(r);
    expect(emailRef({ ...e, owner: "someone@else" })).not.toBe(r);
    expect(normRef(r.toLowerCase().replace(/-/g, " "))).toBe(normRef(r));
  });
});

describe("cross-site write requests", () => {
  const mk = (method: string, h: Record<string, string>) => new NextRequest("http://diq.local/api/collector/decisions", { method, headers: { host: "diq.local", ...h } });
  it("refuses a post from another site, lets the site's own pages and jobs through", () => {
    expect(crossSite(mk("POST", { origin: "https://evil.example" }))).toBe(true);
    expect(crossSite(mk("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(crossSite(mk("POST", { origin: "null" }))).toBe(true);
    expect(crossSite(mk("POST", { origin: "http://diq.local", "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(crossSite(mk("POST", {}))).toBe(false);
    expect(crossSite(mk("GET", { origin: "https://evil.example" }))).toBe(false);
  });
});
