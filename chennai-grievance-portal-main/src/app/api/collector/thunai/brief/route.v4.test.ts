/**
 * Review (Phase 7, proactive MEDIUM): a followed change the brief told was noted as told, but its follow kept the old snapshot, so the
 * watch raised the same change again once the cooldown ran out. The brief route now marks each told followed item seen (followSeen).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ops: [] as Record<string, unknown>[], told: [] as { key: string; level: number }[] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 7, role: "collector" }), failed: (e: unknown) => new Response(String(e), { status: 500 }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/thunai/briefing", () => ({ briefFor: async () => ({ asOf: "2026-11-14 18:00:00", told: h.told, items: [], spoken: { en: [], ta: [] } }) }));
vi.mock("@/lib/thunai/signals", async (orig) => ({ ...(await orig<typeof import("@/lib/thunai/signals")>()), followedNow: async (fs: unknown[]) => fs.map(() => ({ open: false, status: "Closed" })) }));
vi.mock("@/lib/thunai/store", () => ({
  changeMemory: (_u: number, op: Record<string, unknown>) => { h.ops.push(op); return {}; },
  readMemory: () => ({ follows: [{ id: "f1", kind: "incident", ref: "INC-2026-004", at: "2026-11-10 10:00:00", snap: { open: true } }, { id: "f2", kind: "zone", ref: "13", at: "2026-11-10 10:00:00", snap: { openN: 40 } }] })
}));

beforeEach(() => { h.ops = []; h.told = []; });

describe("api/collector/thunai/brief: a followed change told in the brief is marked seen", () => {
  it("the told followed incident gets its snapshot now (followSeen); the one not told is left alone", async () => {
    h.told = [{ key: "followed:incident:INC-2026-004:closed", level: 1 }, { key: "rain:nungambakkam", level: 2 }];
    const { GET } = await import("./route");
    const r = await GET();
    expect(r.status).toBe(200);
    expect(h.ops).toContainEqual({ op: "watchSeen", items: h.told, told: true });
    expect(h.ops).toContainEqual({ op: "followSeen", id: "f1", snap: { open: false, status: "Closed" } });
    expect(h.ops.filter((o) => o.op === "followSeen").map((o) => o.id)).toEqual(["f1"]);
  });
  it("a brief with no followed item marks no follow", async () => {
    h.told = [{ key: "rain:nungambakkam", level: 2 }];
    const { GET } = await import("./route");
    await GET();
    expect(h.ops.some((o) => o.op === "followSeen")).toBe(false);
  });
});
