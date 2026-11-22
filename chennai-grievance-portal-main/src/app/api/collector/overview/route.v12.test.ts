/**
 * v12 (21 Nov): the Collector's console polls GET /api/collector/overview?meta=1 every 20 s while it is open. Each read marks the Collector
 * as active, so Jarvis's keep-warm (lib/thunai/keepwarm.ts) keeps the first question's reads warm before Jarvis is even opened. Everything
 * behind the route is a stand-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 7, role: "collector" }), failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/collector/filters", () => ({ refuseBadFilter: () => null }));
vi.mock("@/lib/live/state", () => ({ liveMeta: () => ({ v: 1 }) }));
vi.mock("@/lib/collector/intel", () => ({ asOf: async () => "2026-11-21 12:00:00", exportMeta: async () => ({ exported_at: "2026-11-21 11:00:00" }), overview: async () => ({}),
  parsePeriod: () => "weekly", parseZone: () => null, parseDept: () => null, parseCat: () => null, parseTaluk: () => null }));

import { NextRequest } from "next/server";
import { activeWithin, resetKeepWarm } from "@/lib/thunai/keepwarm";
import { GET } from "./route";

beforeEach(() => resetKeepWarm());
afterEach(() => resetKeepWarm());

describe("v12: the overview poll marks the Collector active", () => {
  it("?meta=1 answers as before and the Collector counts as active (Jarvis does not)", async () => {
    expect(activeWithin("collector")).toBe(false);
    const r = await GET(new NextRequest("http://127.0.0.1:3000/api/collector/overview?meta=1"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ exportedAt: "2026-11-21 11:00:00" });
    expect(activeWithin("collector")).toBe(true);
    expect(activeWithin("jarvis")).toBe(false);
  });
});
