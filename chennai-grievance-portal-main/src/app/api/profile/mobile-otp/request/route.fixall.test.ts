// QA pass 6, hunt2-sec-05: with SMTP off, the mobile tab's "send me a code" answered that the code was e-mailed. mailer.ts's sendMail says
// whether the server took the mail ({ ok: false, reason: "not_configured" }), and its callers must not claim a mail was sent unless ok.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ mail: { ok: true } as { ok: boolean; reason?: string; detail?: string }, discarded: [] as string[] }));
vi.mock("@/lib/auth", () => ({ getSessionFromCookies: async () => ({ userId: 7, email: "citizen@x.test", role: "citizen" }) }));
vi.mock("@/lib/otp", () => ({
  createOtp: async () => ({ otp: "123456" }),
  devOtpForResponse: () => undefined,
  discardOtp: async (id: string) => { h.discarded.push(id); }
}));
vi.mock("@/lib/mailer", () => ({ sendMail: async () => h.mail, otpEmailHtml: () => "<p>code</p>" }));
vi.mock("@/lib/profile-mobile", () => ({
  mobileTry: () => ({ allowed: true }), mobileOtpId: (u: number, m: string) => `mobile:${u}:${m}`, tryAgainIn: () => "later"
}));

const ask = async () => {
  const { POST } = await import("./route");
  const res = await POST(new Request("http://x/api/profile/mobile-otp/request", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mobileNumber: "9876543210" }) }) as never);
  return { status: res.status, body: (await res.json()) as { message?: string; error?: string } };
};

describe("hunt2-sec-05: the mobile tab says a code was e-mailed only when the mail server took it", () => {
  beforeEach(() => { h.discarded.length = 0; });

  it("SMTP not set up: no 'we have e-mailed you a code', and the unsent code is dropped", async () => {
    h.mail = { ok: false, reason: "not_configured" };
    const r = await ask();
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(r.body)).not.toMatch(/e-?mailed you|code sent|OTP sent/i);
    expect(r.body.error).toMatch(/could not be e-mailed/i);
    expect(h.discarded).toEqual(["mobile:7:9876543210"]);
  });

  it("a send the mail server refused: the same", async () => {
    h.mail = { ok: false, reason: "send_failed", detail: "550" };
    const r = await ask();
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(r.body.error).toMatch(/could not be e-mailed/i);
  });

  it("a mail the server took: the code was e-mailed", async () => {
    h.mail = { ok: true };
    const r = await ask();
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/e-mailed you a code/);
    expect(h.discarded).toEqual([]);
  });
});
