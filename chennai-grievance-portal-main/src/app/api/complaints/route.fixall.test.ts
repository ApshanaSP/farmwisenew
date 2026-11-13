// QA pass 6, hunt2-sec-12: filing a complaint had no rate limit (each filing a classifier call, a dataset append and a case on a department's
// list) and its JSON body was read with no size cap. Each try now counts, per account and per address, before the body is read or the
// store touched, as the track route does; the body is read with a cap.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: 1, storeCalls: 0 }));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => ({ userId: h.user, role: "citizen", email: "c@x.test" }),
  getActivePortalSession: async () => ({ userId: h.user, role: "citizen", email: "c@x.test" })
}));
vi.mock("@/lib/db", () => {
  const pool = { query: async () => { h.storeCalls++; return [[], []]; } };
  return { default: pool, withTransaction: async () => { h.storeCalls++; throw new Error("not in this test"); },
    connectionSettings: () => ({}), tlsFor: () => undefined };
});

const { POST } = await import("./route");
const { COMPLAINTS_PER_HOUR, COMPLAINTS_PER_DAY, COMPLAINTS_PER_IP_HOUR } = await import("@/lib/complaint-limit");

let ip = 0;
const file = (body: string, from: string) =>
  POST(new Request("http://x/api/complaints", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": from }, body }) as never);

describe("hunt2-sec-12: filing a complaint is limited per account and per address, and its body is capped", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    h.user = 1000 + Math.floor(Math.random() * 1e9); // a fresh account and address per test (the limiter's memory is the module's)
    ip = Math.floor(Math.random() * 250);
    h.storeCalls = 0;
  });

  it("an account's tries past the hourly limit are refused before the body is read or the store touched", async () => {
    const from = `10.1.${ip}.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < COMPLAINTS_PER_HOUR; i++) expect((await file("{}", from)).status).toBe(400); // a try that fails the form counts too
    h.storeCalls = 0;
    const r = await file(JSON.stringify({ title: "x" }), from);
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBeTruthy();
    expect((await r.json()).error).toMatch(/too many complaints/i);
    expect(h.storeCalls).toBe(0);
  });

  it("many accounts from one address meet the address's limit", async () => {
    const from = `10.2.${ip}.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < COMPLAINTS_PER_IP_HOUR; i++) {
      h.user += 1;
      expect((await file("{}", from)).status).toBe(400);
    }
    h.user += 1;
    expect((await file("{}", from)).status).toBe(429);
  });

  it("the limits are ones a real citizen never meets", () => {
    expect(COMPLAINTS_PER_HOUR).toBeGreaterThanOrEqual(10);
    expect(COMPLAINTS_PER_DAY).toBeGreaterThanOrEqual(COMPLAINTS_PER_HOUR);
    expect(COMPLAINTS_PER_DAY).toBeLessThanOrEqual(50);
  });

  it("a body far larger than any complaint is refused without being parsed", async () => {
    const r = await file(JSON.stringify({ title: "x", description: "y".repeat(200_000) }), `10.3.${ip}.1`);
    expect(r.status).toBe(413);
    expect(h.storeCalls).toBe(0);
  });
});
