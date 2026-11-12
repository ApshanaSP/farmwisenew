import { readJsonCapped, tooLargeResponse } from "@/lib/body-cap";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { forgotPasswordRequestSchema } from "@/lib/validators";
import { createOtp, devOtpForResponse, devOtpShown } from "@/lib/otp";
import { sendMail, otpEmailHtml } from "@/lib/mailer";
import { checkRateLimit, getClientIp, ipLimit } from "@/lib/rate-limit";
import { RowDataPacket } from "mysql2";
import { OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/constants";

const GENERIC_MESSAGE =
  "If an account exists with this email, an OTP has been sent to it.";

// The resend cooldown: one clock for EVERY e-mail, registered or not, kept here in milliseconds. hunt2-sec-06 first added it for
// unknown e-mails only, while a registered one took its cooldown from createOtp, counted from password_resets.created_at, which is
// stored in whole seconds: two requests 0.9 s apart got 59 for a real account and 60 for an unknown one (reviewerA-03). createOtp's
// own check stays behind this one. Entries older than the cooldown are dropped as it is read.
const asked = new Map<string, number>();
const ASKED_CAP = 10_000;

/** Seconds left before this e-mail may ask again (0: it may ask now, and the clock starts). */
function emailCooldown(email: string, now = Date.now()): number {
  const windowMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
  for (const [k, at] of asked) {
    if (now - at < windowMs) break; // insertion order: the rest are newer
    asked.delete(k);
  }
  const at = asked.get(email);
  if (at !== undefined && now - at < windowMs) return Math.ceil((windowMs - (now - at)) / 1000);
  if (asked.size >= ASKED_CAP) asked.delete(asked.keys().next().value as string);
  asked.delete(email);
  asked.set(email, now);
  return 0;
}

/** Makes and mails a reset OTP for a registered account. Returns the OTP, or null when none was made (the store's own cooldown, or
 *  an error, which is logged without the e-mail address). */
async function issueResetOtp(email: string, userId: number): Promise<string | null> {
  try {
    const result = await createOtp(email, "password_reset", userId);
    if (result.cooldownRemaining) return null;
    void sendMail(email, "Your password reset OTP", otpEmailHtml(result.otp, "password reset"))
      .catch((err) => console.error("[api/auth/forgot-password/request-otp] mail", err instanceof Error ? err.message : err));
    return result.otp;
  } catch (err) {
    console.error("[api/auth/forgot-password/request-otp] otp", err instanceof Error ? err.message : err);
    return null;
  }
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

    // Always the same answer, in the same time, whether or not the account exists, so the endpoint can't be used to enumerate
    // registered e-mails (hunt2-sec-06, reviewerA-03/04): one cooldown clock for every e-mail, the same read for every e-mail, and
    // the account's own work (createOtp's writes, which wait on the AWS store when it saves, its hashing, the mail) after the answer.
    const cooldownRemaining = emailCooldown(email);
    if (cooldownRemaining) {
      return NextResponse.json({ message: GENERIC_MESSAGE, cooldownRemaining }, { status: 200 });
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    const work = rows.length > 0 ? issueResetOtp(email, rows[0].id as number) : null;

    // Only a dev server showing OTPs on this PC waits for the code, to put it in the answer.
    if (work && devOtpShown(req.headers)) {
      const otp = await work;
      return NextResponse.json({ message: GENERIC_MESSAGE, devOtp: otp ? devOtpForResponse(otp, req.headers) : undefined });
    }
    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (err) {
    console.error("[api/auth/forgot-password/request-otp]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
