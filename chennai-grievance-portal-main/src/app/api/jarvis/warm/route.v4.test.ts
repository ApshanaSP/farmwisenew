import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// POST /api/jarvis/warm, without the network: the session, the world, the planner's prefix and Claude are stand-ins
const h = vi.hoisted(() => ({ user: 1 as number | null, key: true, warms: [] as { system: string; schema?: unknown }[], fail: false, withWarm: true }));
vi.mock("@/lib/collector/guard", async () => {
  const { NextResponse } = await import("next/server");
  return { collectorSession: async () => (h.user == null ? NextResponse.json({ error: "Not authenticated" }, { status: 401 }) : { email: `c${h.user}@x`, userId: h.user, role: "collector" }) };
});
vi.mock("@/lib/thunai/world", () => ({ serverWorld: async () => ({ zones: [], depts: [], cats: [] }) }));
const SCHEMA = z.object({ kind: z.string() });
vi.mock("@/lib/thunai/round", () => ({ plannerSystems: () => ["SYSTEM screens", "SYSTEM console"], plannerWarm: () => (h.withWarm ? { system: "SYSTEM screens", schema: SCHEMA } : null) }));
vi.mock("@/lib/ai/claude", () => ({
  claudeConfigured: () => h.key,
  claudeWarm: async (p: { system: string; schema?: unknown }) => { h.warms.push(p); return h.fail ? null : { model: "claude-opus-5-5", ms: 400, path: "format", maxTokens: 1, cacheWrite: 1900, cacheRead: 0, inputTokens: 1910 }; }
}));

import { POST } from "./route";

const post = async () => { const r = await POST(); return { status: r.status, body: await r.json() as Record<string, unknown> }; };

describe("POST /api/jarvis/warm", () => {
  beforeEach(() => { h.user = 1; h.key = true; h.warms.length = 0; h.fail = false; h.withWarm = true; global.__jarvisWarm = undefined; vi.useFakeTimers({ toFake: ["Date"] }); });
  afterEach(() => vi.useRealTimers());

  it("needs a Collector session", async () => {
    h.user = null;
    expect((await post()).status).toBe(401);
    expect(h.warms).toEqual([]);
  });

  it("is a no-op without a Claude key", async () => {
    h.key = false;
    expect((await post()).body).toMatchObject({ warmed: false, why: "no-key" });
    expect(h.warms).toEqual([]);
  });

  it("warms the planner's own prefix and schema, at most once in 4 minutes per user", async () => {
    const a = await post();
    expect(a.body).toMatchObject({ warmed: true, exact: true, cacheWrite: 1900, path: "format" });
    expect(h.warms).toEqual([{ system: "SYSTEM screens", schema: SCHEMA }]);
    expect((await post()).body).toMatchObject({ warmed: false, why: "recent" });
    h.user = 2;
    expect((await post()).body).toMatchObject({ warmed: true });
    h.user = 1;
    vi.setSystemTime(Date.now() + 4 * 60_000 + 1);
    expect((await post()).body).toMatchObject({ warmed: true });
    expect(h.warms.length).toBe(3);
  });

  it("without plannerWarm, the first of plannerSystems is warmed alone (not exact)", async () => {
    h.withWarm = false;
    expect((await post()).body).toMatchObject({ warmed: true, exact: false });
    expect(h.warms).toEqual([{ system: "SYSTEM screens" }]);
  });

  it("a failed warm says so and is not retried within the 4 minutes", async () => {
    h.fail = true;
    expect((await post()).body).toMatchObject({ warmed: false, why: "failed" });
    expect((await post()).body).toMatchObject({ warmed: false, why: "recent" });
    expect(h.warms.length).toBe(1);
  });
});
