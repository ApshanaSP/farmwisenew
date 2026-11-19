import { readJsonCapped, tooLargeResponse } from "@/lib/body-cap";
import { NextRequest, NextResponse } from "next/server";
import { forgotPasswordVerifySchema } from "@/lib/validators";
import { verifyOtp } from "@/lib/otp";
import { checkRateLimit, getClientIp, ipLimit } from "@/lib/rate-limit";

// "no code was ever asked for" reads the same as a wrong code: a different line would tell a stranger which emails
// have an account (request-otp is careful not to)
const OTP_ERROR_MESSAGES: Record<string, string> = {
  not_found: "Incorrect OTP. Please try again.",
  expired: "This OTP has expired. Please request a new one.",
  too_many_attempts: "Too many incorrect attempts. Please request a new OTP.",
  incorrect: "Incorrect OTP. Please try again."
};

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`fp-verify:${ip}`, ipLimit(ip, 20), 60 * 15);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const { body, tooLarge } = await readJsonCapped(req); // a malformed body is a 400 from the schema, not a 500; a huge one is a 413
    if (tooLarge) return tooLargeResponse();
    const parsed = forgotPasswordVerifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, otp } = parsed.data;
    const result = await verifyOtp(email, "password_reset", otp);

    if (!result.ok) {
      return NextResponse.json({ error: OTP_ERROR_MESSAGES[result.reason] }, { status: 400 });
    }

    return NextResponse.json({ message: "OTP verified. You can now reset your password." });
  } catch (err) {
    console.error("[api/auth/forgot-password/verify-otp]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
