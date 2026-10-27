import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { registerSchema } from "@/lib/validators";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { checkRateLimit, getClientIp, ipLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`register:${ip}`, ipLimit(ip, 10), 60 * 15);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null); // a malformed body is a 400 from the schema, not a 500
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, password, firstName, lastName } = parsed.data;

    // Staff accounts cannot be self-made. Refuse a request that asks for one
    // outright instead of quietly turning it into a citizen account.
    if (body && typeof body === "object" && "role" in body && body.role !== "citizen") {
      return NextResponse.json(
        { error: "Only citizens can create an account here. Officer and Collector accounts are issued by the Collector's office." },
        { status: 403 }
      );
    }

    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Email verification is disabled, so the account is usable immediately.
    // email_verification_exempt records WHY it may sign in without a verified
    // address; email_verified_at stays NULL because nobody ever confirmed it.
    // The role is fixed server-side: a sign-up is always a citizen.
    const [ins] = await pool.query<ResultSetHeader>(
      `INSERT INTO users (email, password_hash, role, department_id, email_verification_exempt)
       VALUES (?, ?, 'citizen', NULL, 1)`,
      [email, passwordHash]
    );

    // Store the name straight away so the complaint form can prefill it and
    // never has to ask for the same details on every complaint.
    await pool.query(
      "INSERT INTO user_profiles (user_id, first_name, last_name) VALUES (?, ?, ?)",
      [ins.insertId, firstName, lastName || null]
    );

    return NextResponse.json({ message: "Account created successfully. Please sign in." });
  } catch (err) {
    console.error("[api/auth/register]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
