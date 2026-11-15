/**
 * v5 G3: the store keeps a remembered note's turn id and refuses a note copied off the Stage's news or complaint text (`shown`), but the
 * route's schema stripped both fields, so neither rule ran on the live path. The route now passes them on (never kept: `shown` is for
 * the check only, in store.ts).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ops: [] as Record<string, unknown>[] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 7, role: "collector" }), failed: (e: unknown) => new Response(String(e), { status: 500 }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/thunai/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/thunai/store")>()),
  changeMemory: (_u: number, op: Record<string, unknown>) => { h.ops.push(op); return { notes: [], habits: {} }; }
}));

const post = (body: unknown) => new NextRequest("http://localhost/api/collector/thunai/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { h.ops = []; });

describe("G3 on the live path: the remember op carries its turn id and what the Stage showed", () => {
  it("turn and shown reach the store", async () => {
    const { POST } = await import("./route");
    const r = await POST(post({ op: "remember", text: "I follow Adyar closely", said: "remember that I follow Adyar closely", yes: true, turn: "turn-42", shown: ["an invented headline about a road"] }));
    expect(r.status).toBe(200);
    expect(h.ops[0]).toMatchObject({ op: "remember", turn: "turn-42", shown: ["an invented headline about a road"] });
  });
  it("without them the op is as before", async () => {
    const { POST } = await import("./route");
    await POST(post({ op: "remember", text: "I follow Adyar closely", yes: true }));
    expect(h.ops[0]).toEqual({ op: "remember", text: "I follow Adyar closely", yes: true });
  });
});
