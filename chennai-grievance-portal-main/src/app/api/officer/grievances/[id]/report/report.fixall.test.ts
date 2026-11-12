import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// officer-day-16: the completion report asked for the password before checking the case. officerB was asked to confirm "Close case
// ... with your report" for officerA's case, and an officer to confirm "Send case ... to the Collector" for a Medium case; both were
// refused only after the password was typed. The case is now checked first.

const H = vi.hoisted(() => ({ recorded: 0 }));
const CASES: Record<string, { stage: string; sev: string }> = {
  "INC-W-2026-SEV001": { stage: "action", sev: "Severe" },
  "INC-W-2026-MED001": { stage: "action", sev: "Medium" },
  "INC-W-2026-DONE01": { stage: "verified", sev: "Medium" }
};
vi.mock("@/lib/officer/guard", () => ({
  ID_RE: /^[A-Za-z0-9_-]{1,64}$/,
  officerSession: async () => ({ session: { userId: 21, email: "officerA@example.test", role: "department_officer", departmentId: 2, tv: 0 }, dept: { code: "GCC-SWD" } })
}));
vi.mock("@/lib/officer/data", () => ({
  WorkflowError: class extends Error { status = 409; },
  grievanceDetail: async (_d: unknown, id: string) => (CASES[id] ? { grievance: { id, ...CASES[id] } } : null),
  recordStep: async () => { H.recorded++; return { stage: "sent", reportId: 1 }; }
}));
vi.mock("@/lib/officer/photos", () => ({
  newPhotoDir: () => "20261113-0123456789abcdef", removePhotoDir: async () => {}, savePhotos: async () => ["1.jpg"], sniff: () => "jpg"
}));

const { POST } = await import("./route");

const send = (id: string, step: "send" | "close") => {
  const form = new FormData();
  form.set("remarks", "Drain cleared and the slab replaced.");
  form.set("step", step);
  form.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
  return POST(new NextRequest(`http://localhost/api/officer/grievances/${id}/report`, { method: "POST", body: form }), { params: Promise.resolve({ id }) });
};
const asksPassword = async (r: Response) => r.status === 428 || Boolean((await r.clone().json().catch(() => ({}))).confirm);

beforeEach(() => { H.recorded = 0; });

describe("officer-day-16: the case is checked before the password is asked", () => {
  it("another department's case: 404, no confirm box", async () => {
    const r = await send("INC-W-2026-OTHERD", "close");
    expect(r.status).toBe(404);
    expect(await asksPassword(r)).toBe(false);
  });

  it("a Medium case sent to the Collector: 409 with the reason, no confirm box", async () => {
    const r = await send("INC-W-2026-MED001", "send");
    expect(r.status).toBe(409);
    expect((await r.clone().json()).error).toMatch(/Only severe grievances go to the Collector/);
    expect(await asksPassword(r)).toBe(false);
  });

  it("a severe case closed by the department, or a case already verified: 409, no confirm box", async () => {
    for (const [id, step] of [["INC-W-2026-SEV001", "close"], ["INC-W-2026-DONE01", "close"]] as const) {
      const r = await send(id, step);
      expect(r.status, id).toBe(409);
      expect(await asksPassword(r)).toBe(false);
    }
  });

  it("a step the case allows still asks for the password, and nothing is recorded without it", async () => {
    const r = await send("INC-W-2026-SEV001", "send");
    expect(r).toBeInstanceOf(NextResponse);
    expect(await asksPassword(r)).toBe(true);
    expect(H.recorded).toBe(0);
  });
});
