import { readJsonCapped, tooLargeResponse } from "@/lib/body-cap";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { forgotPasswordRequestSchema } from "@/lib/validators";
import { createOtp, devOtpForResponse } from "@/lib/otp";
import { sendMail, otpEmailHtml } from "@/lib/mailer";
import { checkRateLimit, getClientIp, ipLimit } from "@/lib/rate-limit";
import { RowDataPacket } from "mysql2";
import bcrypt from "bcryptjs";
import { OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/constants";

const GENERIC_MESSAGE =
  "If an account exists with this email, an OTP has been sent to it.";

// The resend cooldown for an e-mail with no account, kept here because there is no OTP row for it. Without it the second request
// carried cooldownRemaining only for a registered e-mail (hunt2-sec-06). Entries older than the cooldown are dropped as it is read.
const unknownAsked = new Map<string, number>();
const UNKNOWN_CAP = 10_000;

/** Seconds left before this unknown e-mail may ask again (0: it may ask now, and the clock starts). */
function unknownEmailCooldown(email: string, now = Date.now()): number {
  const windowMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
  for (const [k, at] of unknownAsked) {
    if (now - at < windowMs) break; // insertion order: the rest are newer
    unknownAsked.delete(k);
  }
  const at = unknownAsked.get(email);
  if (at !== undefined && now - at < windowMs) return Math.ceil((windowMs - (now - at)) / 1000);
  if (unknownAsked.size >= UNKNOWN_CAP) unknownAsked.delete(unknownAsked.keys().next().value as string);
  unknownAsked.delete(email);
  unknownAsked.set(email, now);
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`fp-request:${ip}`, ipLimit(ip, 10), 60 * 15);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const { body, tooLarge } = await readJsonCapped(req); // a malformed body is a 400 from the schema, not a 500; a huge one is a 413
    if (tooLarge) return tooLargeResponse();
    const parsed = forgotPasswordRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email } = parsed.data;

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    // Always return the same answer, in the same time, whether or not the account exists, so the endpoint can't be used to
    // enumerate registered emails (hunt2-sec-06): the same cooldown field, the same hashing work, and the mail is sent after the
    // answer, so the mail server's time is not in it. Only actually send an OTP if the account exists.
    if (rows.length > 0) {
      const userId = rows[0].id as number;
      const result = await createOtp(email, "password_reset", userId);

      if (result.cooldownRemaining) {
        return NextResponse.json(
          { message: GENERIC_MESSAGE, cooldownRemaining: result.cooldownRemaining },
          { status: 200 }
        );
      }

      void sendMail(email, "Your password reset OTP", otpEmailHtml(result.otp, "password reset"))
        .catch((err) => console.error("[api/auth/forgot-password/request-otp] mail", err instanceof Error ? err.message : err));

      const devOtp = devOtpForResponse(result.otp, req.headers);
      return NextResponse.json({ message: GENERIC_MESSAGE, devOtp });
    }

    const cooldownRemaining = unknownEmailCooldown(email);
    if (cooldownRemaining) {
      return NextResponse.json({ message: GENERIC_MESSAGE, cooldownRemaining }, { status: 200 });
    }
    await bcrypt.hash("000000", 10); // the work createOtp does for a real account
    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (err) {
    console.error("[api/auth/forgot-password/request-otp]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
