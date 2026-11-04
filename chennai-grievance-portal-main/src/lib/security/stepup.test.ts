import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GRANT_HEADER, issueGrant, requireConfirm, scopeHash } from "./stepup";
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
