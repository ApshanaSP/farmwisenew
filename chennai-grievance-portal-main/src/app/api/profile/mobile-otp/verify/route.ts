import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSessionFromCookies } from "@/lib/auth";
import { mobileSchema, otpSchema } from "@/lib/validators";
import { verifyAndConsumeOtp } from "@/lib/otp";
import { mobileOtpId, onAnotherAccount } from "@/lib/profile-mobile";
import { RowDataPacket } from "mysql2";

const OTP_ERROR_MESSAGES: Record<string, string> = {
  not_found: "No code was asked for. Please ask for a new one.",
  expired: "This code has expired. Please ask for a new one.",
  too_many_attempts: "Too many incorrect attempts. Please ask for a new code.",
  incorrect: "Incorrect code. Please try again."
};

/**
 * Saves the number once the account's holder has entered the e-mailed code. The number is saved as not verified: the code went to the
 * e-mail, not to the phone, so nobody proved they hold it (QA pass 6, hunt2-sec-03; lib/profile-mobile.ts).
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null); // a malformed body is a 400 from the schema, not a 500
  const mobileParsed = mobileSchema.safeParse(body?.mobileNumber);
  const otpParsed = otpSchema.safeParse(body?.otp);
  if (!mobileParsed.success || !otpParsed.success) {
    return NextResponse.json({ error: "Invalid mobile number or code." }, { status: 400 });
  }
  const mobileNumber = mobileParsed.data;
  const otp = otpParsed.data;

  // checked and used up in one step, so the same code cannot save twice
  const result = await verifyAndConsumeOtp(mobileOtpId(session.userId, mobileNumber), "mobile_verify", otp);
  if (!result.ok) {
    return NextResponse.json({ error: OTP_ERROR_MESSAGES[result.reason] }, { status: 400 });
  }

  // a profile's number is unique; whether this one is on another account is said only now, after the account's own code, and asking for
  // codes is limited per account (request route)
  const taken = () => NextResponse.json({ error: "This number cannot be added to your account. If it is yours, please contact the Collector's office." }, { status: 409 });
  if (await onAnotherAccount(session.userId, mobileNumber)) return taken();

  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM user_profiles WHERE user_id = ?",
    [session.userId]
  );

  try {
    if (existing.length === 0) {
      await pool.query(
        "INSERT INTO user_profiles (user_id, mobile_number, mobile_verified) VALUES (?, ?, FALSE)",
        [session.userId, mobileNumber]
      );
    } else {
      await pool.query(
        "UPDATE user_profiles SET mobile_number = ?, mobile_verified = FALSE WHERE user_id = ?",
        [mobileNumber, session.userId]
      );
    }
  } catch (err) {
    // another account saved the same number in between (the column is unique)
    if (/ER_DUP_ENTRY|UNIQUE constraint/i.test(`${(err as { code?: string }).code ?? ""} ${(err as Error).message ?? ""}`)) return taken();
    throw err;
  }

  return NextResponse.json({ message: "Mobile number saved. It is not verified: the code was sent to your e-mail, not to the phone." });
}
