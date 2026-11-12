/**
 * QA pass 6, P5-039: the desk's repeat check is a phone-number lookup into earlier petitions and citizens' online complaints. It is there
 * for a petition still on the desk; for one approved long ago it was still answered, with any mobile in the request body. The route is the
 * real one; the guard, the petition store and the lookup are replaced so the test sees whether a lookup runs.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ status: "needs_check" as string | null, lookups: 0 }));
vi.mock("@/lib/manu/guard", () => ({ manuStaff: async () => ({ session: { email: "petition@x", role: "department_officer" } }), manuFailed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/manu/repeat", () => ({ findRepeats: async () => { h.lookups++; return { headline: null, matches: [], attachTo: null }; } }));
vi.mock("@/lib/manu/petitions", () => ({
  FileError: class extends Error {}, fileSchema: { parse: (x: unknown) => x }, deletePage: async () => false, deletePetition: async () => false, filePetition: async () => ({}),
  petitionDetail: async () => null, readAgain: async () => false, wardName: async () => null,
  getPetition: async (id: number) => (h.status ? { id, status: h.status } : null),
  // QA pass 7: the repeats action reads the petition's category from its reading
  readingOf: () => null
}));

const { POST } = await import("./route");
const repeats = (id: number) => POST(new NextRequest(`http://x/api/manu/petitions/${id}`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "repeats", mobile: "9000041873", name: "A", street: "", ward: null, dept: "CMWSSB", problem: "Sewage" }) }), { params: Promise.resolve({ id: String(id) }) });

beforeEach(() => { h.status = "needs_check"; h.lookups = 0; });

describe("QA pass 6, P5-039: the repeat check is only for a petition still on the desk", () => {
  it("a petition being checked gets its repeat check", async () => {
    const r = await repeats(5);
    expect(r.status).toBe(200);
    expect(h.lookups).toBe(1);
  });
  for (const status of ["read_failed"]) it(`a petition that could not be read (${status}) gets it too: the staff type it in`, async () => {
    h.status = status;
    expect((await repeats(5)).status).toBe(200);
  });
  it("an approved petition is refused, and no lookup runs", async () => {
    h.status = "filed";
    const r = await repeats(5);
    expect(r.status).toBe(409);
    expect(h.lookups).toBe(0);
  });
  it("an unknown petition is 404 with no lookup", async () => {
    h.status = null;
    expect((await repeats(5)).status).toBe(404);
    expect(h.lookups).toBe(0);
  });
});
