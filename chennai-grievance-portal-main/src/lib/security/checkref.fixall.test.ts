import crypto from "crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// hunt2-sec-11: each "Check an email" lookup recomputed the HMAC of up to 20,000 emails, and any staff account could run it with no
// limit. A reference is now worked out once per email, and one account may check 20 in 15 minutes.

const ROWS = Array.from({ length: 300 }, (_, i) => ({
  email_id: i + 1, owner: "collector@example.test", to_contact_ids: "[]", subject: `Subject ${i}`, body_hash: "ab".repeat(32),
  approved_at: `2026-11-0${(i % 9) + 1} 10:00:00`, mode: "sandbox", status: "sent", incident_id: null
}));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [ROWS] }, ops: (t: string) => t }));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => ({ userId: 77, email: "officerB@example.test", role: "department_officer", departmentId: 2, tv: 0 }),
  revokeSessions: async () => 1, setAuthCookie: async () => {}
}));
vi.mock("@/lib/security/audit", () => ({ securityLog: async () => {}, recentEvents: async () => [] }));

const { checkRef, emailRef } = await import("./stamp");
const { POST } = await import("@/app/api/auth/security/route");

// QA pass 7 gate: these tests run as a sequence over shared state (the reference cache and the account's check counter), so they keep their order when the suite is shuffled
describe("hunt2-sec-11: checking an email reference", { shuffle: false }, () => {
  it("works each email's reference out once, not on every check", async () => {
    const spy = vi.spyOn(crypto, "createHmac");
    await checkRef("DIQ-ZZZZ-ZZZZ");
    const first = spy.mock.calls.length;
    await checkRef("DIQ-YYYY-YYYY");
    const second = spy.mock.calls.length - first;
    spy.mockRestore();
    expect(first).toBe(ROWS.length);
    expect(second).toBe(0);
  });

  it("still finds a genuine one", async () => {
    const r = ROWS[42];
    const ref = emailRef({ owner: r.owner, subject: r.subject, bodyHash: r.body_hash, at: r.approved_at });
    expect(await checkRef(ref)).toMatchObject({ genuine: true, email: { id: 43 } });
  });

  it("one account may check 20 in 15 minutes; the 21st is refused", async () => {
    const ask = () => POST(new NextRequest("http://localhost/api/auth/security", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check_ref", ref: "DIQ-ABCD-EFGH" })
    }));
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await ask()).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
