import { describe, expect, it } from "vitest";
import { noticeFor, NOTICE_TA } from "./messages";

/**
 * QA pass 5, P5-017: the forgot-password server answers the same words whether or not the email has an account, and sends nothing during
 * its cooldown ("If an account exists with this email, an OTP has been sent to it."), so the notice must not say that a code was sent.
 */
describe("forgot password: the notice says no more than the server", () => {
  const done = noticeFor("POST", "/api/auth/forgot-password/request-otp")?.done ?? "";
  it("does not say a code was sent", () => {
    expect(done).toMatch(/^If /);
    expect(done).not.toBe("The one-time password has been sent.");
  });
  it("has its Tamil", () => expect(NOTICE_TA[done]).toBeTruthy());
});
