/**
 * QA pass 6, P6-003: filing an online complaint is the citizen's. The citizen pages are citizen-only (middleware), but POST /api/complaints
 * asked only "is someone signed in", so the Collector, any department officer and the petition-desk account (which "opens the Manu Desk
 * and nothing else") could each file a citizen complaint under their own staff account by calling the API directly. Found by the pass 6
 * access matrix once it sent a valid body: the 400 on "{}" had hidden it.
 * Only the session and the database are replaced; the route is the real one.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type S = { userId: number; email: string; role: string; dept_code?: string | null };
const h = vi.hoisted(() => ({ session: null as null | S, queries: [] as string[] }));
const portalOf = (s: S) => (s.role === "collector" ? "collector" : s.role === "citizen" ? "citizen" : "officer");
vi.mock("@/lib/auth", () => ({
  getActiveSession: async () => h.session,
  getSessionFromCookies: async () => h.session,
  getActivePortalSession: async (p: string) => (h.session && portalOf(h.session) === p ? h.session : null),
  getPortalSession: async (p: string) => (h.session && portalOf(h.session) === p ? h.session : null)
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const query = async (sql: string) => { h.queries.push(sql); return [[], []]; };
  return { ...(await importOriginal<object>()), default: { query }, withTransaction: async (fn: (c: { query: typeof query }) => unknown) => fn({ query }) };
});
vi.mock("@/lib/collector/db", () => ({ default: { query: async (sql: string) => { h.queries.push(sql); return [[], []]; } }, ops: (t: string) => t, TITLE: "i.title" }));

const { POST } = await import("./route");
const valid = { firstName: "Qa", lastName: "Six", gender: "Male", streetAddress: "1 Test Street", mobileNumber: "9876543210", zoneId: 1, wardNumber: 1,
  manualStreetName: "Test Street", complaintSubtypeId: 1, title: "Garbage not cleared", description: "Garbage not cleared for three days near the corner shop." };
const file = (body: unknown) => POST(new NextRequest("http://127.0.0.1/api/complaints", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

beforeEach(() => { h.session = null; h.queries = []; });

describe("QA pass 6, P6-003: only a citizen files an online complaint", () => {
  const staff: [string, S][] = [
    ["the Collector", { userId: 1, email: "c@x", role: "collector" }],
    ["a department officer", { userId: 2, email: "o@x", role: "department_officer", dept_code: "GCC-SWM" }],
    ["the petition-desk account", { userId: 7, email: "petition@x", role: "department_officer", dept_code: "COL-PET" }]
  ];
  for (const [who, s] of staff) {
    it(`${who} is refused with a valid body, before anything is read or written`, async () => {
      h.session = s;
      const r = await file(valid);
      expect([401, 403]).toContain(r.status);
      expect(h.queries, "queries run for a refused filer").toEqual([]);
    });
  }

  it("a citizen gets past the check (a bad body is the schema's 400, not a refusal)", async () => {
    h.session = { userId: 5, email: "a@x", role: "citizen" };
    const r = await file({});
    expect(r.status).toBe(400);
  });

  it("no session is still 401", async () => {
    expect((await file(valid)).status).toBe(401);
  });
});
