// QA4 gate fix: redteam-final-12. Pausing a data source, changing its refresh or removing it asks "Confirm it's you"; turning one on does not.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }), failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/collector/sources", () => ({
  runSource: async () => ({ ok: true }),
  updateSource: async (...a: unknown[]) => void h.calls.push(["update", ...a]),
  removeSource: async (...a: unknown[]) => void h.calls.push(["remove", ...a])
}));
import { DELETE, PATCH } from "./route";

const req = (method: string, body?: unknown) => new NextRequest("http://localhost/api/collector/sources/3", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "3" }) };

describe("source changes ask Confirm it's you", () => {
  beforeEach(() => { h.calls.length = 0; delete process.env.STEP_UP; });
  it("redteam-final-12: pausing, changing the refresh and removing are answered 428 and change nothing", async () => {
    for (const r of [await PATCH(req("PATCH", { enabled: false }), ctx), await PATCH(req("PATCH", { refreshMinutes: 60 }), ctx), await DELETE(req("DELETE"), ctx)]) {
      expect(r.status).toBe(428);
      expect(((await r.json()) as { confirm: { action: string } }).confirm.action).toBe("change_source");
    }
    expect(h.calls).toEqual([]);
  });
  it("turning a source back on needs no confirmation", async () => {
    expect((await PATCH(req("PATCH", { enabled: true }), ctx)).status).toBe(200);
    expect(h.calls).toEqual([["update", 3, { enabled: true }, "c@x"]]);
  });
});
