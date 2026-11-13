/**
 * Adversarial review 1 of 2b5d080 (hunt2-desk-04): the desk's Mobile box now keeps up to MOBILE_TYPED_MAX (24) characters as written, and
 * sends them as they are to the "came before" check (ManuDesk.tsx: action "repeats", mobile: f.mobile). The route's own schema for that
 * action still caps mobile at 20 characters. The route is the real one; the guard, the store and the lookup are replaced.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/desk-and-accounts/review1
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock("@/lib/manu/guard", () => ({ manuStaff: async () => ({ session: { email: "petition@x", role: "department_officer" } }), manuFailed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/manu/repeat", () => ({ findRepeats: async (c: { mobile: string }) => { h.asked.push(c.mobile); return { headline: null, matches: [], attachTo: null }; } }));
vi.mock("@/lib/manu/petitions", () => ({
  FileError: class extends Error {}, fileSchema: { parse: (x: unknown) => x }, deletePage: async () => false, deletePetition: async () => false, filePetition: async () => ({}),
  petitionDetail: async () => null, readAgain: async () => false, wardName: async () => null, getPetition: async (id: number) => ({ id, status: "needs_check" }), readingOf: () => null
}));

const { POST } = await import("@/app/api/manu/petitions/[id]/route");
const { typedMobile, MOBILE_TYPED_MAX } = await import("@/lib/manu/clean");
const repeats = (mobile: string) => POST(new NextRequest("http://x/api/manu/petitions/5", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "repeats", mobile, name: "R. Kumar", street: "", ward: 70, dept: "CMWSSB", problem: "Sewage overflow" }) }), { params: Promise.resolve({ id: "5" }) });

describe("review1 hunt2-desk-04: every value the desk's Mobile box can hold gets its 'came before' check", () => {
  // boxed digits as printed petition forms have them, copied as written; all are valid mobiles the server would store as 9840012345
  for (const w of ["0 9 8 4 0 0 1 2 3 4 5", "+91 9 8 4 0 0 1 2 3 4 5", "(+91) - 98400 - 12345"]) it(JSON.stringify(w), async () => {
    const box = typedMobile(w);
    expect(box.length).toBeLessThanOrEqual(MOBILE_TYPED_MAX);
    const r = await repeats(box);
    expect(r.status, `${box.length} characters`).toBe(200);
  });
});
