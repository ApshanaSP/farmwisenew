import { afterEach, describe, expect, it, vi } from "vitest";

// reviewerA-05 (redsec2-13, fix 5a40442). Goes in chennai-grievance-portal-main/src/lib/ next to mailer.ts.
//
// scrubEmails() shortens e-mail addresses only, but the same three log lines still carry the subject. The SMS test mode (lib/manu/sms.ts
// viaTeamInbox) sends every petition SMS to the team inbox with the subject "[Test SMS] to <the citizen's mobile number>", so each
// failed send writes the citizen's full mobile number into the server log: the recipient's contact detail the row was about, by
// another channel. (Also: a local part of one or two letters is logged whole, "ab*****@gmail.com" for ab@gmail.com.)
const createTransport = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const logged = () => [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].flat().map(String).join("\n");

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("reviewerA-05: the mailer's log lines do not carry the recipient's mobile number either", () => {
  it("a failed SMS test copy does not log the citizen's mobile number", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test"); vi.stubEnv("SMTP_USER", "u"); vi.stubEnv("SMTP_PASS", "p");
    vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
    createTransport.mockReturnValue({ sendMail: async () => { throw new Error("connect ECONNREFUSED 10.0.0.1:587"); } });
    const { sendMail } = await import("@/lib/mailer");
    const r = await sendMail("team@district.example", "[Test SMS] to 9876543210", "<p>x</p>");
    expect(r.ok).toBe(false);
    expect(logged()).toMatch(/Failed to send/);
    expect(logged()).not.toContain("9876543210"); // today: the subject, with the number, is in the log line
  });
});

describe("reviewerA-05: the log scrubber itself", () => {
  it("cuts short e-mail names, every 6+ digit run (with spaces or dashes) and keeps short numbers", async () => {
    const { scrubEmails } = await import("@/lib/mailer");
    expect(scrubEmails("to ab@x.in")).toBe("to *****@x.in");
    expect(scrubEmails("to arjun@x.in")).toBe("to a*****@x.in");
    expect(scrubEmails("[Test SMS] to +91 98765 43210")).toBe("[Test SMS] to ******10");
    expect(scrubEmails("to 98765-43210 now")).toBe("to ******10 now");
    expect(scrubEmails("550 5.1.1 rejected on port 587")).toBe("550 5.1.1 rejected on port 587");
  });
});
