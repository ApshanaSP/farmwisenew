/**
 * reviewer1 (QA pass 6): tries to break e65ac51 (P6-003) with the REAL session code (lib/auth.ts, lib/jwt.ts, lib/session-cookies.ts):
 * only next/headers (the request's cookies and headers) and the database are replaced. A throwaway JWT secret is set for this file only.
 * A body of "{}" is the schema's 400, which proves the guard let the caller through; 401 is the guard's refusal.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "reviewer1-probe-only-not-a-real-secret-0123456789";
const h = vi.hoisted(() => ({ jar: new Map<string, string>(), hdr: new Headers(), users: new Map<number, { is_active: number; token_version: number }>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined), getAll: () => [...h.jar].map(([name, value]) => ({ name, value })) }),
  headers: async () => h.hdr
}));
const query = async (sql: string, params: unknown[] = []) => {
  if (/FROM users WHERE id = \?/.test(sql)) { const u = h.users.get(Number(params[0])); return [u ? [u] : [], []]; }
  return [[], []];
};
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: { query }, withTransaction: async (fn: (c: { query: typeof query }) => unknown) => fn({ query }) }));
vi.mock("@/lib/collector/db", () => ({ default: { query }, ops: (t: string) => t, TITLE: "i.title" }));

const { signToken } = await import("@/lib/jwt");
const { POST } = await import("@/app/api/complaints/route");
const tok = (userId: number, role: string, email: string) => signToken({ userId, role, email, tv: 0 } as never);
const file = () => POST(new NextRequest("http://127.0.0.1/api/complaints", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));

beforeEach(() => {
  h.jar.clear(); h.hdr = new Headers();
  for (const id of [1, 2, 5, 7]) h.users.set(id, { is_active: 1, token_version: 0 });
});

describe("reviewer1: P6-003 with the real session code", () => {
  it("a citizen also signed in as an officer, calling from an officer page (Referer /officer): let through", async () => {
    h.jar.set("dcd_session_citizen", await tok(5, "citizen", "a@x"));
    h.jar.set("dcd_session_officer", await tok(2, "department_officer", "o@x"));
    h.hdr = new Headers({ referer: "http://127.0.0.1/officer" });
    expect((await file()).status).toBe(400);
  });
  it("a citizen also signed in as the Collector, no Referer: let through", async () => {
    h.jar.set("dcd_session_citizen", await tok(5, "citizen", "a@x"));
    h.jar.set("dcd_session_collector", await tok(1, "collector", "c@x"));
    expect((await file()).status).toBe(400);
  });
  it("officer and desk only, from a citizen page: refused", async () => {
    h.jar.set("dcd_session_officer", await tok(7, "department_officer", "petition@x"));
    h.hdr = new Headers({ referer: "http://127.0.0.1/citizen/complaints/new" });
    expect((await file()).status).toBe(401);
  });
  it("a staff token planted in the citizen cookie: refused", async () => {
    h.jar.set("dcd_session_citizen", await tok(2, "department_officer", "o@x"));
    expect((await file()).status).toBe(401);
  });
  it("a staff token in the legacy single cookie: refused", async () => {
    h.jar.set("dcd_session", await tok(1, "collector", "c@x"));
    expect((await file()).status).toBe(401);
  });
  it("a citizen signed in only in this tab's slot (x-dcd-tab) is let through; another tab's citizen is not used", async () => {
    h.jar.set("dcd_session_citizen__tabone1", await tok(5, "citizen", "a@x"));
    h.hdr = new Headers({ "x-dcd-tab": "tabone1" });
    const mine = (await file()).status;
    h.hdr = new Headers({ "x-dcd-tab": "tabtwo2" });
    const other = (await file()).status;
    console.log(`[reviewer1] slot t1 -> ${mine}, slot t2 -> ${other}`);
    expect([mine, other]).toEqual([400, 401]);
  });
});
