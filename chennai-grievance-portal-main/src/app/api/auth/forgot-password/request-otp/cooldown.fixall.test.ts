import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// reviewerA-03 (hunt2-sec-06, fix 99fda47). Goes in chennai-grievance-portal-main/src/app/api/auth/forgot-password/request-otp/
// next to route.ts.
//
// The fix gives an unknown e-mail the same cooldownRemaining FIELD, but not the same VALUE. A registered e-mail's cooldown is counted
// by createOtp (lib/otp.ts) from password_resets.created_at, a DATETIME DEFAULT CURRENT_TIMESTAMP (schema.sql): whole seconds. The
// unknown e-mail's is counted in the route from Date.now(), in milliseconds. A second request 0.9 s after the first answers 60 for
// an unknown e-mail every time, and 59 for a registered one whenever the first request fell in the last 0.9 of its second (9 times
// in 10). Two requests tell them apart, which is the enumeration the row was about.
//
// The stand-in database below is the real createOtp's queries over a list; only the INSERT's timestamp rule (whole seconds) matters.

const H = vi.hoisted(() => ({ resets: [] as { identifier: string; purpose: string; used: boolean; created_at: Date }[] }));
vi.mock("@/lib/db", () => ({
  default: {
    query: async (sql: string, params: unknown[] = []) => {
      if (/FROM users WHERE email/i.test(sql)) return [String(params[0]) === "real@example.test" ? [{ id: 1 }] : []];
      if (/SELECT created_at FROM password_resets/i.test(sql)) {
        const open = H.resets.filter((r) => r.identifier === params[0] && r.purpose === params[1] && !r.used);
        return [open.length ? [{ created_at: open[open.length - 1].created_at }] : []];
      }
      if (/UPDATE password_resets SET used = TRUE/i.test(sql)) {
        for (const r of H.resets) if (r.identifier === params[0] && r.purpose === params[1]) r.used = true;
        return [{ affectedRows: 0 }];
      }
      if (/INSERT INTO password_resets/i.test(sql)) {
        // (user_id, purpose, identifier, otp_hash, expires_at); created_at is the column default: CURRENT_TIMESTAMP, whole seconds
        H.resets.push({ identifier: String(params[2]), purpose: String(params[1]), used: false, created_at: new Date(Math.floor(Date.now() / 1000) * 1000) });
        return [{ insertId: H.resets.length }];
      }
      return [[]];
    }
  }
}));
vi.mock("bcryptjs", () => {
  const hash = async () => "$2a$10$stand.in.hash";
  const compare = async () => false;
  return { default: { hash, compare }, hash, compare };
});
vi.mock("@/lib/mailer", () => ({ sendMail: async () => ({ ok: true }), otpEmailHtml: () => "<p>code</p>" }));

const { POST } = await import("@/app/api/auth/forgot-password/request-otp/route");
const ask = async (email: string) => {
  const r = await POST(new NextRequest("http://localhost/api/auth/forgot-password/request-otp", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email })
  }));
  return (await r.json()) as { cooldownRemaining?: number };
};

afterEach(() => { vi.useRealTimers(); });

describe("reviewerA-03: the resend cooldown's value does not tell a registered e-mail from an unknown one", () => {
  it("a second request 0.9 s after the first carries the same cooldownRemaining for both", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T10:00:00.500Z"));
    await ask("real@example.test");
    vi.setSystemTime(new Date("2026-11-13T10:00:01.400Z"));
    const real = await ask("real@example.test");

    vi.setSystemTime(new Date("2026-11-13T10:05:00.500Z"));
    await ask("nobody.reviewer@example.test");
    vi.setSystemTime(new Date("2026-11-13T10:05:01.400Z"));
    const unknown = await ask("nobody.reviewer@example.test");

    expect(real.cooldownRemaining).toBeDefined();
    expect(unknown.cooldownRemaining).toBeDefined();
    expect(unknown.cooldownRemaining).toBe(real.cooldownRemaining); // today: 60 for the unknown e-mail, 59 for the registered one
  });
});
