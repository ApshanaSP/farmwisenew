import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 28 Nov, the owner's rule on the completion report route (lib/cases/rules.ts): a severe case is only sent to the Collector, with remarks and
// at least one photo; any other is closed by the department with remarks (photos optional) or sent to the Collector with a photo. Every
// refusal comes before the password is asked.

const H = vi.hoisted(() => ({ recorded: 0, saved: 0 }));
const CASES: Record<string, { stage: string; sev: string }> = {
  "INC-SEV": { stage: "action", sev: "Severe" },
  "INC-MED": { stage: "action", sev: "Medium" }
};
vi.mock("@/lib/officer/guard", () => ({
  ID_RE: /^[A-Za-z0-9_-]{1,64}$/,
  officerSession: async () => ({ session: { userId: 21, email: "officerA@example.test", role: "department_officer", departmentId: 2, tv: 0 }, dept: { code: "GCC-SWD" } })
}));
vi.mock("@/lib/officer/data", () => ({
  WorkflowError: class extends Error { status = 409; },
  grievanceDetail: async (_d: unknown, id: string) => (CASES[id] ? { grievance: { id, ...CASES[id] } } : null),
  recordStep: async () => { H.recorded++; return { stage: "verified", reportId: 1 }; }
}));
vi.mock("@/lib/officer/photos", () => ({
  newPhotoDir: () => "20261128-0123456789abcdef", removePhotoDir: async () => {}, savePhotos: async () => { H.saved++; return ["1.jpg"]; }, sniff: () => "jpg"
}));

const { POST } = await import("./route");

const send = (id: string, step: "send" | "close", photos: number, remarks = "Drain cleared and the slab replaced.") => {
  const form = new FormData();
  form.set("remarks", remarks);
  form.set("step", step);
  for (let k = 0; k < photos; k++) form.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], `p${k}.jpg`, { type: "image/jpeg" }));
  return POST(new NextRequest(`http://localhost/api/officer/grievances/${id}/report`, { method: "POST", body: form }), { params: Promise.resolve({ id }) });
};
const asksPassword = async (r: Response) => r.status === 428 || Boolean((await r.clone().json().catch(() => ({}))).confirm);

beforeEach(() => { H.recorded = 0; H.saved = 0; delete process.env.STEP_UP; });

describe("the severe rule and the photo rule on the report route", () => {
  it("a severe case closed by the department: 409 with the rule, no password asked", async () => {
    const r = await send("INC-SEV", "close", 2);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/verified by the Collector/);
  });

  it("a severe case sent without a photo: 400, and with one the password is asked", async () => {
    const r = await send("INC-SEV", "send", 0);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/at least one photo/);
    expect(await asksPassword(await send("INC-SEV", "send", 1))).toBe(true);
  });

  it("any other case: closed with no photo (the password is asked, then it is recorded with no photo saved); sent only with a photo", async () => {
    const r = await send("INC-MED", "close", 0);
    expect(await asksPassword(r)).toBe(true);
    process.env.STEP_UP = "off";
    expect((await send("INC-MED", "close", 0)).status).toBe(201);
    expect(H.recorded).toBe(1);
    expect(H.saved).toBe(0);
    const s = await send("INC-MED", "send", 0);
    expect(s.status).toBe(400);
    expect((await s.json()).error).toMatch(/Collector approves the work from your photos/);
    expect((await send("INC-MED", "close", 0, "ok")).status).toBe(400);
  });
});
