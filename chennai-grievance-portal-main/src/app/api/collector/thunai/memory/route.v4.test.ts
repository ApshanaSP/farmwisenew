/**
 * Review (Phase 7, proactive LOW): the memory route still took the legacy `note` and `forget {all: true}` with no yes, though each keeps or
 * wipes the Collector's memory as a Level B change does. Both now need yes: true, refused with the same 403 shape as the other Level B ops.
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

describe("api/collector/thunai/memory: a note and forgetting everything need the Collector's yes", () => {
  it("a note with no yes is refused as the other Level B changes are, and nothing is kept", async () => {
    const { POST } = await import("./route");
    const r = await POST(post({ op: "note", text: "Zone 13 is my priority" }));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ needsYes: true, reply: { en: "That needs your yes first." } });
    expect(h.ops).toEqual([]);
  });
  it("forget all with no yes is refused; with yes it goes through", async () => {
    const { POST } = await import("./route");
    const r = await POST(post({ op: "forget", all: true }));
    expect(r.status).toBe(403);
    expect((await r.json()).needsYes).toBe(true);
    expect(h.ops).toEqual([]);
    const ok = await POST(post({ op: "forget", all: true, yes: true }));
    expect(ok.status).toBe(200);
    expect(h.ops).toEqual([{ op: "forget", all: true }]);
  });
  it("a note with yes is kept; forgetting one item by its own button needs none", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ op: "note", text: "Zone 13 is my priority", yes: true }))).status).toBe(200);
    expect((await POST(post({ op: "forget", id: "n1" }))).status).toBe(200);
    expect(h.ops).toEqual([{ op: "note", text: "Zone 13 is my priority" }, { op: "forget", id: "n1" }]);
  });
});
