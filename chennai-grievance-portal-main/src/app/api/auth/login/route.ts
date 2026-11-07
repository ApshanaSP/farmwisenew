import { readJsonCapped, tooLargeResponse } from "@/lib/body-cap";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { loginSchema } from "@/lib/validators";
import { roleToPortal } from "@/lib/session-cookies";
import { checkRateLimit, getClientIp, ipLimit } from "@/lib/rate-limit";
import { RowDataPacket } from "mysql2";
import { UserRow } from "@/types";
import { startSession } from "@/lib/security/session";
import { securityLog } from "@/lib/security/audit";

const GENERIC_ERROR = "Invalid email or password.";

export async function POST(req: NextRequest) {
  try {
    const { body, tooLarge } = await readJsonCapped(req); // a malformed body is a 400 from the schema, not a 500; a huge one is a 413
    if (tooLarge) return tooLargeResponse();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const ip = getClientIp(req.headers);

    // Rate limit by IP and by email to slow down brute force / credential
    // stuffing without letting one IP lock out a legitimate user forever.
    const ipCheck = checkRateLimit(`login-ip:${ip}`, ipLimit(ip, 20), 60 * 15);
    const emailLimit = checkRateLimit(`login-email:${email}`, 8, 60 * 15);

    if (!ipCheck.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const user = rows[0] as UserRow;

    if (!user.is_active) {
      return NextResponse.json({ error: "This account has been deactivated." }, { status: 403 });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      if (user.role !== "citizen") await securityLog(user.email, "auth:password_wrong", String(user.id), { ip });
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const tv = Number((user as UserRow & { token_version?: unknown }).token_version) || 0;
    const how = { ip, ua: req.headers.get("user-agent") };
    if (!roleToPortal(user.role)) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }
    return startSession({ id: user.id, email: user.email, role: user.role, department_id: user.department_id, tv }, { factor: null, ...how });
  } catch (err) {
    console.error("[api/auth/login]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
