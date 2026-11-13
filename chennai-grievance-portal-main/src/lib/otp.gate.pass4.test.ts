// QA4 gate fix: redteam-final-4. The resend cooldown must hold for a parallel burst, not only for requests one after another.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ inserts: 0, rows: [] as { created_at: string }[] }));
vi.mock("@/lib/db", () => ({
  default: {
    query: async (sql: string) => {
      await new Promise((r) => setTimeout(r, 2)); // a real query takes time: this is what let a burst all read "no code yet"
      if (/^SELECT created_at/.test(sql)) return [h.rows];
      if (/^INSERT/.test(sql)) { h.inserts++; h.rows = [{ created_at: new Date().toISOString() }]; }
      return [{ affectedRows: 1 }];
    }
  }
}));

describe("code cooldown under a burst", () => {
  it("redteam-final-4: 12 parallel requests for one number make one code; the others are told to wait", async () => {
    const { createOtp } = await import("./otp");
    const rs = await Promise.all(Array.from({ length: 12 }, () => createOtp("9000000001", "mobile_verify", 5)));
    expect(rs.filter((r) => !r.cooldownRemaining).length).toBe(1);
    expect(h.inserts).toBe(1);
    expect(rs.filter((r) => r.cooldownRemaining).every((r) => r.cooldownRemaining! > 0 && r.cooldownRemaining! <= 60)).toBe(true);
  });
  it("another number is not held back, and a discarded code frees the number for a new request", async () => {
    const { createOtp, discardOtp } = await import("./otp");
    h.rows = [];
    expect((await createOtp("9000000002", "mobile_verify", 5)).cooldownRemaining).toBeUndefined();
    expect((await createOtp("9000000002", "mobile_verify", 5)).cooldownRemaining).toBeGreaterThan(0);
    h.rows = [];
    await discardOtp("9000000002", "mobile_verify");
    expect((await createOtp("9000000002", "mobile_verify", 5)).cooldownRemaining).toBeUndefined();
  });
});
