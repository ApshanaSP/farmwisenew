import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }), failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/collector/sources", () => ({
  runSource: async (...a: unknown[]) => (h.calls.push(["run", ...a]), { ok: true }),
  updateSource: async (id: number, ...a: unknown[]) => { h.calls.push(["update", id, ...a]); if (id === 404) throw new Error("Source not found."); },
  removeSource: async (...a: unknown[]) => void h.calls.push(["remove", ...a])
}));

import { DELETE, PATCH, POST } from "./route";

const req = (body?: unknown) => new NextRequest("http://localhost/api/collector/sources/1", { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });

describe("source routes validate before touching the store", () => {
  it("refuses an id that is not a number", async () => {
    for (const id of ["abc", "1;DROP", "-3", "0", "1e3"]) {
      expect((await POST(req(), { params: { id } })).status).toBe(400);
      expect((await DELETE(req(), { params: { id } })).status).toBe(400);
    }
    expect(h.calls).toEqual([]);
  });
  it("refuses a change it does not understand, and says 'not found' as 404", async () => {
    expect((await PATCH(req({ refreshMinutes: 5 }), { params: { id: "2" } })).status).toBe(400);
    expect((await PATCH(req({}), { params: { id: "2" } })).status).toBe(400);
    expect((await PATCH(req({ enabled: false }), { params: { id: "404" } })).status).toBe(404);
    expect((await PATCH(req({ enabled: true, refreshMinutes: 60 }), { params: { id: "2" } })).status).toBe(200);
    expect(h.calls.at(-1)).toEqual(["update", 2, { enabled: true, refreshMinutes: 60 }, "c@x"]);
  });
});
