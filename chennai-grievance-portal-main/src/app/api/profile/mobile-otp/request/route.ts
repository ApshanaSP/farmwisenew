import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { mobileSchema } from "@/lib/validators";
import { createOtp, devOtpForResponse, discardOtp } from "@/lib/otp";
import { sendMail, otpEmailHtml } from "@/lib/mailer";
import { mobileOtpId, mobileTry, tryAgainIn } from "@/lib/profile-mobile";

/**
 * A code, by e-mail, to confirm that the account's holder is the one putting this number on the account. It does not prove the phone
 * (lib/profile-mobile.ts). Nothing here says whether the number is on another account: that answer came at once, for any number, and
 * told a signed-in citizen who is registered (QA pass 6, hunt2-sec-02).
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null); // a malformed body is a 400 from the schema, not a 500
  const parsed = mobileSchema.safeParse(body?.mobileNumber);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const mobileNumber = parsed.data;

  const limit = mobileTry(session.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: tryAgainIn(limit) }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 3600) } });
  }

  const result = await createOtp(mobileOtpId(session.userId, mobileNumber), "mobile_verify", session.userId);
  if (result.cooldownRemaining) {
    return NextResponse.json({ message: "Code already sent.", cooldownRemaining: result.cooldownRemaining });
  }

  // "e-mailed" only when the mail server took it (mailer.ts): with SMTP off, or a refused send, the citizen was told to wait for a mail that
  // never comes, and the unsent code blocked a new one for the cooldown (QA pass 6, hunt2-sec-05)
  const sent = await sendMail(session.email, "Confirm the mobile number on your account", otpEmailHtml(result.otp, `adding the mobile number ${mobileNumber} to your account`));
  const devOtp = devOtpForResponse(result.otp, req.headers);
  if (!sent.ok) {
    if (devOtp) return NextResponse.json({ message: "E-mail is not working on this server, so no code was e-mailed. The code is shown here (development only).", devOtp });
    await discardOtp(mobileOtpId(session.userId, mobileNumber), "mobile_verify");
    return NextResponse.json({ error: "The code could not be e-mailed just now. Please try again later." }, { status: 503 });
  }
  return NextResponse.json({ message: "We have e-mailed you a code. Enter it to save this number.", devOtp });
}
