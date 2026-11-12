// QA pass 4, skeptic 2: the emailed-code check of "Confirm it's you" has the same race as the password check (hunt-redsec2-1): it reads the attempt
// count, then waits for bcrypt, and writes the failure after. A burst of guesses all read the count 0, so every guess in the burst is checked.
// A fake table stands in for the database; bcrypt is the real one.
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ row: { id: 1, user_id: 7, otp_hash: "", expires_at: new Date(Date.now() + 600000).toISOString(), attempts: 0, used: false } }));
vi.mock("@/lib/db", () => ({
  default: {
    query: async (sql: string, p: unknown[] = []) => {
      if (/^\s*SELECT/i.test(sql)) return [h.row.used ? [] : [{ ...h.row }]];
      if (/attempts = attempts \+ 1/.test(sql)) { const ok = !h.row.used && h.row.attempts < Number(p[1]); if (ok) h.row.attempts++; return [{ affectedRows: ok ? 1 : 0 }]; }
      if (/SET used = TRUE/.test(sql)) { const ok = !h.row.used; h.row.used = true; return [{ affectedRows: ok ? 1 : 0 }]; }
      return [[]];
    }
  }
}));
vi.mock("@/lib/thunai/devguard", () => ({ localOnly: () => true }));

describe("SK2 emailed code attempts", () => {
  it.fails("SK2-5 (the hunt-redsec2-1 race, second door): the right code sent as the 20th guess of a burst is refused, 5 tries being the limit", async () => {
    h.row.otp_hash = await bcrypt.hash("246810", 4);
    h.row.attempts = 0; h.row.used = false;
    const { verifyAndConsumeOtp } = await import("@/lib/otp");
    const guesses = [...Array.from({ length: 19 }, (_, i) => String(100000 + i)), "246810"];
    const res = await Promise.all(guesses.map((g) => verifyAndConsumeOtp("a@b.test", "action_confirm", g)));
    expect(res[19].ok, "the 20th guess, with 5 allowed").toBe(false);
  });
});
