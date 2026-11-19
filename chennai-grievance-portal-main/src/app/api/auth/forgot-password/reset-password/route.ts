import { readJsonCapped, tooLargeResponse } from "@/lib/body-cap";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { forgotPasswordResetSchema } from "@/lib/validators";
import { verifyAndConsumeOtp } from "@/lib/otp";
import { RowDataPacket } from "mysql2";
import { revokeSessions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { body, tooLarge } = await readJsonCapped(req); // a malformed body is a 400 from the schema, not a 500; a huge one is a 413
    if (tooLarge) return tooLargeResponse();
    const parsed = forgotPasswordResetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, otp, newPassword } = parsed.data;

    // Verify AND claim the code before the password changes: the code is single-use even if a step below fails, and
    // two requests racing with one code cannot both reset the password.
    const verifyResult = await verifyAndConsumeOtp(email, "password_reset", otp);
    if (!verifyResult.ok) {
      return NextResponse.json({ error: "OTP is invalid or has expired. Please start over." }, { status: 400 });
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "OTP is invalid or has expired. Please start over." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, rows[0].id]);
    // whoever held the old password is signed out everywhere
    await revokeSessions(Number(rows[0].id));

    return NextResponse.json({ message: "Password reset successfully." });
  } catch (err) {
    console.error("[api/auth/forgot-password/reset-password]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
