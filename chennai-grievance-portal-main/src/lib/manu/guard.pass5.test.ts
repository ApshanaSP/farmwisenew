import { describe, expect, it, vi } from "vitest";

/**
 * QA pass 5, P5-029: a store error while approving a petition was logged whole. A mysql2 error carries the statement with its values (err.sql)
 * and a duplicate-key message quotes the value, so the server log got the petitioner's name, mobile and address.
 */
vi.mock("@/lib/auth", () => ({ getActivePortalSession: async () => null }));
vi.mock("@/lib/officer/guard", () => ({ officerDeptCode: async () => null }));
const { manuFailed } = await import("./guard");

describe("a failed desk action is logged without the petitioner's details", () => {
  it("logs the error's code, not its statement, values or message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = Object.assign(new Error("Duplicate entry '9000041873' for key 'mobile'"), { code: "ER_DUP_ENTRY", errno: 1062, sql: "UPDATE petitions SET name = 'க. பார்வதி', mobile = '9000041873', address = '27 Jawahar St' WHERE id = 4" });
    const res = manuFailed(err, "approve the petition");
    expect(res.status).toBe(500);
    const logged = JSON.stringify(log.mock.calls.map((c) => c.map((x) => (x instanceof Error ? { m: x.message, s: (x as { sql?: string }).sql } : x))));
    expect(logged).not.toMatch(/9000041873|பார்வதி|Jawahar/);
    expect(logged).toContain("ER_DUP_ENTRY");
    log.mockRestore();
  });
});
