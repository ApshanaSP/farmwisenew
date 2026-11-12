/**
 * QA pass 5, P5-011: the petition desk account (an officer login of the department COL-PET) "opens the Manu Desk and nothing else"
 * (lib/manu/constants.ts). assistantSession() let any officer with a department through, so the desk login reached Jarvis, Ask District
 * IQ's status, pins and sessions, the map's suggestions and live traffic (the pass 5 access matrix: 7 cells).
 */
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ session: null as null | { email: string; userId: number; role: string }, dept: null as string | null }));
vi.mock("@/lib/auth", () => ({ resolvePortal: async () => "officer", getActivePortalSession: async (p: string) => (p === "officer" ? h.session : null) }));
vi.mock("@/lib/officer/guard", () => ({ officerDeptCode: async () => h.dept }));

const { assistantSession } = await import("./access");
const { PETITION_DEPT } = await import("@/lib/manu/constants");

describe("who may ask District IQ", () => {
  beforeEach(() => { h.session = { email: "o@x.in", userId: 7, role: "department_officer" }; });
  it("a department officer is locked to their department", async () => {
    h.dept = "GCC-SWM";
    expect(await assistantSession()).toMatchObject({ role: "department_officer", lockDept: "GCC-SWM" });
  });
  it("the petition desk login is refused: it opens the Manu Desk only", async () => {
    h.dept = PETITION_DEPT;
    const r = await assistantSession();
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });
});
