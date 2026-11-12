import { afterEach, describe, expect, it, vi } from "vitest";

// redsec2-13: the mailer wrote the recipient's full e-mail address into the server log on every failed or unconfigured send
// (for OTP and sign-up mail, a citizen's address). The log now has the first two letters and the domain only.
const createTransport = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const TO = "ravikumar.citizen@gmail.com";
const logged = () => [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].flat().map(String).join("\n");

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("redsec2-13: the mailer's log lines do not carry the recipient's address", () => {
  it("SMTP not configured", async () => {
    vi.stubEnv("SMTP_HOST", ""); vi.stubEnv("SMTP_USER", ""); vi.stubEnv("SMTP_PASS", "");
    vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendMail } = await import("./mailer");
    expect(await sendMail(TO, "Your password reset OTP", "<p>x</p>")).toEqual({ ok: false, reason: "not_configured" });
    expect(logged()).not.toContain(TO);
    expect(logged()).toContain("ra*****@gmail.com");
  });

  it("a failed send, and the SMTP server's own error naming the recipient", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test"); vi.stubEnv("SMTP_USER", "u"); vi.stubEnv("SMTP_PASS", "p");
    vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
    createTransport.mockReturnValue({ sendMail: async () => { throw new Error(`550 5.1.1 <${TO}>: Recipient address rejected`); } });
    const { sendMail } = await import("./mailer");
    const r = await sendMail(TO, "Your password reset OTP", "<p>x</p>");
    expect(r.ok).toBe(false);
    expect(logged()).not.toContain(TO);
    expect(logged()).toMatch(/Failed to send/);
  });

  it("a recipient the server rejected", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test"); vi.stubEnv("SMTP_USER", "u"); vi.stubEnv("SMTP_PASS", "p");
    vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
    createTransport.mockReturnValue({ sendMail: async () => ({ rejected: [TO], accepted: [] }) });
    const { sendMail } = await import("./mailer");
    await sendMail(TO, "Welcome", "<p>x</p>");
    expect(logged()).not.toContain(TO);
  });
});
