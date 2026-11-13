/**
 * P5-033's Manu Desk route parts (pass 5's manu-sec-10, -11, -12, seam-07), through the real routes with the guard, the store and the
 * petition code replaced.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ every: false, officer: null as null | { role: string; userId: number }, dept: "GCC-SWM", queries: 0, storeDown: false, actions: 0, saved: 0 }));
vi.mock("@/lib/manu/guard", () => ({ manuStaff: async () => ({ session: { email: "petition@x", role: "department_officer", userId: 9 } }), manuFailed: () => new Response(null, { status: 500 }),
  seesEveryPetition: async () => h.every }));
vi.mock("@/lib/auth", () => ({ getActivePortalSession: async () => h.officer }));
vi.mock("@/lib/officer/guard", () => ({ officerDeptCode: async () => h.dept }));
vi.mock("@/lib/db", () => ({ default: { query: async () => { h.queries++; if (h.storeDown) throw new Error("store offline"); return [[{ dept_code: "GCC-SWM", status: "filed" }]]; } } }));
vi.mock("@/lib/manu/files", async (orig) => ({ ...(await orig<typeof import("@/lib/manu/files")>()), readPhoto: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  savePages: async (b: Buffer[]) => { h.saved += b.length; return b.map((_, k) => `p${k}.jpg`); } }));
vi.mock("@/lib/manu/repeat", () => ({ findRepeats: async () => ({ headline: null, matches: [], attachTo: null }) }));
vi.mock("@/lib/manu/petitions", () => ({
  FileError: class extends Error {}, fileSchema: { parse: (x: unknown) => x }, deletePage: async () => false, deletePetition: async () => false, filePetition: async () => ({}),
  petitionDetail: async () => null, readAgain: async () => { h.actions++; return true; }, wardName: async () => null, getPetition: async (id: number) => ({ id, status: "needs_check" }),
  readingOf: () => null, createPetition: async () => 1, deskList: async () => []
}));

const NAME = "0123456789abcdef0123456789abcdef.jpg";
beforeEach(() => { h.every = false; h.officer = null; h.dept = "GCC-SWM"; h.queries = 0; h.storeDown = false; h.actions = 0; h.saved = 0; });

describe("manu-sec-11: the photo route asks who is calling before it asks the store", () => {
  const get = async () => (await import("./photos/[name]/route")).GET(new NextRequest(`http://x/api/manu/photos/${NAME}`), { params: Promise.resolve({ name: NAME }) });
  it("an anonymous caller is refused without a store lookup, whatever the name", async () => {
    const r = await get();
    expect(r.status).toBe(403);
    expect(h.queries).toBe(0);
  });
  it("a store error is a plain 503, not an unhandled 500", async () => {
    h.every = true; h.storeDown = true;
    const r = await get();
    expect(r.status).toBe(503);
  });
  it("the petition officer, and the officer of the department it went to, still get the photo", async () => {
    h.every = true;
    expect((await get()).status).toBe(200);
    h.every = false; h.officer = { role: "department_officer", userId: 3 };
    expect((await get()).status).toBe(200);
    h.dept = "GCC-ELE";
    expect((await get()).status).toBe(403);
  });
});

describe("manu-sec-12 (the JSON part): a petition action is read only as JSON, and with a size limit", () => {
  const post = async (body: string, type: string) => (await import("./petitions/[id]/route")).POST(new NextRequest("http://x/api/manu/petitions/5", { method: "POST", headers: { "content-type": type }, body }),
    { params: Promise.resolve({ id: "5" }) });
  it("a text/plain or form body holding JSON is refused (415) and nothing runs", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const r = await post(JSON.stringify({ action: "read" }), type);
      expect(r.status, type).toBe(415);
    }
    expect(h.actions).toBe(0);
  });
  it("JSON as the desk sends it still works, and a body over the limit is a 413", async () => {
    expect((await post(JSON.stringify({ action: "read" }), "application/json")).status).toBe(200);
    expect(h.actions).toBe(1);
    expect((await post(JSON.stringify({ action: "read", pad: "x".repeat(400 * 1024) }), "application/json")).status).toBe(413);
  });
});

describe("seam-07 and manu-sec-10: the upload is read as multipart with a byte limit", () => {
  const upload = async (body: BodyInit, headers: Record<string, string>) => (await import("./petitions/route")).POST(new NextRequest("http://x/api/manu/petitions", { method: "POST", headers, body, duplex: "half" } as never));
  it("a request that is not multipart is a 400, not a 500", async () => {
    const r = await upload("{}", { "content-type": "application/json" });
    expect(r.status).toBe(400);
  });
  it("a chunked body with no Content-Length is refused once the bytes read pass the limit", async () => {
    const { MANU_LIMITS } = await import("@/lib/manu/constants");
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (pulled > MANU_LIMITS.maxRequestBytes * 2) return c.close(); pulled += 1 << 20; c.enqueue(new Uint8Array(1 << 20)); } });
    const r = await upload(stream, { "content-type": "multipart/form-data; boundary=b" });
    expect(r.status).toBe(413);
    expect(pulled).toBeLessThan(MANU_LIMITS.maxRequestBytes + 4 * (1 << 20));
    expect(h.saved).toBe(0);
  });
});
