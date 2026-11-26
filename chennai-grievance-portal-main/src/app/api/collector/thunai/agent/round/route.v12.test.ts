/**
 * v12 (21 Nov): POST /api/collector/thunai/agent/round. A round the browser gave up on (a barge-in, Esc) goes on no decision record (the
 * 06:42:15 flooded-roads answer was recorded but never shown), THE DISTRICT NOW is read only while Claude can lead, and a round marks Jarvis
 * as in use for the keep-warm. Everything behind the route is a stand-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ claude: true, logged: 0, snapshots: 0, snapshotOut: null as unknown }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 7, role: "collector" }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/collector/intel", () => ({ exportMeta: async () => ({ build_id: "b1" }) }));
vi.mock("@/lib/brain", () => ({ brainOn: () => false }));
vi.mock("@/lib/thunai/brainturn", () => ({ brainTurn: async () => null }));
vi.mock("@/lib/thunai/data", () => ({ serverHands: () => ({}) }));
vi.mock("@/lib/thunai/decisions", () => ({ logDecision: () => { h.logged++; } }));
vi.mock("@/lib/thunai/store", () => ({ readMemory: () => ({ notes: [], habits: {} }) }));
vi.mock("@/lib/thunai/streamturn", () => ({ roundStream: () => new Response("") }));
vi.mock("@/lib/thunai/world", () => ({ serverWorld: async () => ({}) }));
vi.mock("@/lib/ai/claude", () => ({ claudeConfigured: () => h.claude }));
vi.mock("@/lib/thunai/v11/snapshot", () => ({ districtSnapshot: async () => { h.snapshots++; return { at: 0, ms: 0, parts: [] }; } }));
vi.mock("@/lib/thunai/round", () => ({
  RoundBody: { safeParse: () => ({ success: true, data: { text: "where are the flooded roads", turnId: "t1", round: 0 } }) },
  decisionOf: () => ({ said: "where are the flooded roads" }),
  // the round asks for the snapshot as round.ts does, then answers
  planRound: async (_b: unknown, _w: unknown, _hands: unknown, _u: unknown, _m: unknown, _s: unknown, deps: { snapshot?: () => Promise<unknown> }) => {
    h.snapshotOut = deps.snapshot ? await deps.snapshot() : undefined;
    return { done: true, result: { kind: "do" }, lane: "quick", steps: [], tokens: 0, calls: 0 };
  }
}));

import { NextRequest } from "next/server";
import { activeWithin, resetKeepWarm } from "@/lib/thunai/keepwarm";
import { POST } from "./route";

const req = (signal?: AbortSignal) => new NextRequest("http://127.0.0.1:3000/api/collector/thunai/agent/round", { method: "POST", body: "{}", signal });

beforeEach(() => { h.claude = true; h.logged = 0; h.snapshots = 0; h.snapshotOut = null; resetKeepWarm(); });
afterEach(() => resetKeepWarm());

describe("v12: the round route", () => {
  it("an answered round is recorded, and Jarvis counts as in use", async () => {
    const r = await POST(req());
    expect(r.status).toBe(200);
    expect(h.logged).toBe(1);
    expect(activeWithin("jarvis")).toBe(true);
  });

  it("a round whose request was given up is not recorded", async () => {
    const ac = new AbortController();
    ac.abort();
    await POST(req(ac.signal)).catch(() => null);
    expect(h.logged).toBe(0);
  });

  it("with Claude off the snapshot is not read at all (no turn could attach it); with Claude leading it is", async () => {
    h.claude = false;
    await POST(req());
    expect(h.snapshots).toBe(0);
    expect(h.snapshotOut).toBeNull();
    h.claude = true;
    await POST(req());
    expect(h.snapshots).toBe(1);
  });
});
