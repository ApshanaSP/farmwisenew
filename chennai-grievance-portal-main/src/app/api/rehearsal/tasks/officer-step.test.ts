/**
 * The officer's rain task route: an update ("progress") or done, with what was done, for their own department (the session's,
 * whatever the form says); anything else is refused before the store is touched.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/officer/guard", () => ({
  officerSession: async () => ({ dept: { code: "GCC-SWD" }, session: { email: "swd.officer@example.test" } }),
  failed: () => new Response("failed", { status: 500 }),
  fresh: (b: unknown) => Response.json(b)
}));
vi.mock("@/lib/rehearsal/tasks", () => ({
  officerStep: async (...a: unknown[]) => { H.calls.push(a); return { status: 200, body: { ok: true } }; },
  readTasks: async () => []
}));
vi.mock("@/lib/officer/photos", () => ({ newPhotoDir: () => "20261128-aaaaaaaaaaaaaaaa", removePhotoDir: async () => {}, savePhotos: async () => ["1.jpg"], sniff: () => "jpg" }));

const { POST } = await import("./route");
const send = (f: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(f)) form.set(k, v);
  return POST(new NextRequest("http://localhost/api/rehearsal/tasks", { method: "POST", body: form }));
};

beforeEach(() => { H.calls = []; });

describe("the officer's step on a rain task", () => {
  it("done by default; an update with its remarks; the department is the session's", async () => {
    expect((await send({ id: "7" })).status).toBe(200);
    expect(H.calls[0]).toEqual([7, "GCC-SWD", "swd.officer@example.test", "done", null, null, null]);
    expect((await send({ id: "7", step: "progress", remarks: "  Desilting started, 40 m done  ", dept: "PWD-WRD", lat: "12.98", lon: "80.22" })).status).toBe(200);
    expect(H.calls[1]).toEqual([7, "GCC-SWD", "swd.officer@example.test", "progress", "Desilting started, 40 m done", null, { lat: 12.98, lon: 80.22 }]);
  });

  it("refuses an unknown step, a bad id and remarks past the limit, without touching the store", async () => {
    expect((await send({ id: "7", step: "verify" })).status).toBe(400);
    expect((await send({ id: "x", step: "done" })).status).toBe(400);
    expect((await send({ id: "7", step: "done", remarks: "x".repeat(2001) })).status).toBe(400);
    expect(H.calls).toEqual([]);
  });
});
