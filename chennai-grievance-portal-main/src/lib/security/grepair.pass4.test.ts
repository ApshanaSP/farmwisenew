// QA4 g-repair 2: hunt-redsec2-1. A burst of parallel wrong guesses must not all reach the slow password check.
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ hash: "" }));
vi.mock("@/lib/db", () => ({ default: { query: async () => [[{ id: 4242, email: "a@b.test", password_hash: h.hash }]] } }));
vi.mock("@/lib/mailer", () => ({ isSmtpConfigured: () => false, otpEmailHtml: () => "", sendMail: async () => ({ ok: false }) }));

describe("G-REPAIR 2: the five-tries lock holds against a burst", () => {
  it("hunt-redsec2-1: 20 parallel wrong passwords, at most 5 are checked, the rest get 429", async () => {
    h.hash = await bcrypt.hash("right-one", 4);
    const spy = vi.spyOn(bcrypt, "compare");
    const { verifyFactor } = await import("./factors");
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => verifyFactor(4242, "password", `wrong-${i}`)));
    expect(res.filter((r) => !r.ok && (r as { status: number }).status === 401).length).toBeLessThanOrEqual(5);
    expect(res.filter((r) => !r.ok && (r as { status: number }).status === 429).length).toBeGreaterThanOrEqual(15);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
    // the next single wrong guess is still locked, and so is the right one while the lock holds
    expect((await verifyFactor(4242, "password", "right-one")).ok).toBe(false);
  });
  it("a right password clears the count (one wrong, then the right one, then four more wrong ones are all checked)", async () => {
    const { verifyFactor } = await import("./factors");
    const { clearFailures } = await import("@/lib/rate-limit");
    clearFailures("confirm-fail:4242");
    expect((await verifyFactor(4242, "password", "x")).ok).toBe(false);
    expect((await verifyFactor(4242, "password", "right-one")).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect((await verifyFactor(4242, "password", "x" + i) as { status: number }).status).toBe(401);
  });
});
