import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/jarvis/ignored (v12): the session and the telemetry writer are stand-ins; what is written is checked to be codes only
const h = vi.hoisted(() => ({ user: 1 as number | null, rows: [] as { event: string; data: Record<string, unknown> }[] }));
vi.mock("@/lib/collector/guard", async () => {
  const { NextResponse } = await import("next/server");
  return { collectorSession: async () => (h.user == null ? NextResponse.json({ error: "Not authenticated" }, { status: 401 }) : { email: `c${h.user}@x`, userId: h.user, role: "collector" }) };
});
vi.mock("@/lib/thunai/telemetry", () => ({ telemetry: (event: string, data: Record<string, unknown>) => h.rows.push({ event, data }) }));

import { POST } from "./route";

const post = async (body: unknown) => POST(new Request("http://x/api/jarvis/ignored", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("POST /api/jarvis/ignored", () => {
  beforeEach(() => { h.user = 1; h.rows.length = 0; });
  it("needs a Collector session", async () => {
    h.user = null;
    expect((await post({ why: "side" })).status).toBe(401);
    expect(h.rows).toEqual([]);
  });
  it("writes one words-free row: the gate's code, the language, the confidence and the lane", async () => {
    const r = await post({ why: "unclear", lang: "ta", conf: 0.7349, engaged: true, called: true });
    expect(r.status).toBe(200);
    expect(h.rows).toEqual([{ event: "ignored", data: { why: "unclear", lang: "ta", conf: 0.73, lane: "engaged", act: false, kind: "called" } }]);
  });
  it("a reason that is not a short code, or any words, never reach the row", async () => {
    await post({ why: "he said the contractor will come", text: "he said the contractor will come", lang: "fr", conf: "high" });
    expect(h.rows).toEqual([{ event: "ignored", data: { why: "other", lang: undefined, conf: undefined, lane: "ambient", act: false } }]);
    await post("not json");
    expect(h.rows.at(-1)?.data.why).toBe("other");
  });
});
