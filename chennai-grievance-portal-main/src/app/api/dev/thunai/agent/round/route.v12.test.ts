/**
 * v12 (21 Nov, first-question RC3): the dev test console's rounds read THE DISTRICT NOW only when Claude can lead, as the Collector's route
 * does: with Claude off every planner turn waited on it for a picture no turn could attach. Everything behind the route is a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ claude: true, snapshots: 0, snapshotOut: null as unknown }));
vi.mock("@/lib/thunai/devguard", () => ({ localOnly: () => true }));
vi.mock("@/lib/collector/intel", () => ({ exportMeta: async () => ({ build_id: "b1" }) }));
vi.mock("@/lib/thunai/data", () => ({ serverHands: () => ({}) }));
vi.mock("@/lib/thunai/streamturn", () => ({ roundStream: () => new Response("") }));
vi.mock("@/lib/thunai/world", () => ({ serverWorld: async () => ({}) }));
vi.mock("@/lib/ai/claude", () => ({ claudeConfigured: () => h.claude }));
vi.mock("@/lib/thunai/v11/snapshot", () => ({ districtSnapshot: async () => { h.snapshots++; return { at: 0, ms: 0, parts: [] }; } }));
vi.mock("@/lib/thunai/round", () => ({
  RoundBody: { safeParse: () => ({ success: true, data: { text: "show me live traffic", turnId: "t1", round: 0 } }) },
  planRound: async (_b: unknown, _w: unknown, _hands: unknown, _u: unknown, _m: unknown, _s: unknown, deps: { snapshot?: () => Promise<unknown> }) => {
    h.snapshotOut = deps.snapshot ? await deps.snapshot() : undefined;
    return { done: true, result: { kind: "do" }, lane: "quick", steps: [], tokens: 0, calls: 0 };
  }
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const req = () => new NextRequest("http://127.0.0.1:3000/api/dev/thunai/agent/round", { method: "POST", body: "{}" });

beforeEach(() => { h.claude = true; h.snapshots = 0; h.snapshotOut = null; });

describe("v12: the dev round route", () => {
  it("with Claude off the snapshot is not read; with Claude leading it is", async () => {
    h.claude = false;
    expect((await POST(req())).status).toBe(200);
    expect(h.snapshots).toBe(0);
    expect(h.snapshotOut).toBeNull();
    h.claude = true;
    await POST(req());
    expect(h.snapshots).toBe(1);
  });
});
