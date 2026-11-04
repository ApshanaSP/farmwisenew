/**
 * Checking "it's you" for a guarded action (lib/security/stepup.ts): the account's password, or a code sent by email
 * (lib/otp.ts). Five wrong tries in 15 minutes lock these checks for the account.
 */
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { addFailure, clearFailures, failuresOver } from "@/lib/rate-limit";
import { createOtp, discardOtp, verifyAndConsumeOtp } from "@/lib/otp";
import { isSmtpConfigured, otpEmailHtml, sendMail } from "@/lib/mailer";
import type { RowDataPacket } from "mysql2";

export type Factor = "email" | "password";

interface Row { id: number; email: string; password_hash: string }

export const isStaff = (role: string) => role === "collector" || role === "department_officer";

async function row(userId: number): Promise<Row | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, email, password_hash FROM users WHERE id = ? LIMIT 1", [userId]);
  return (rows[0] as Row | undefined) ?? null;
}

export type FactorCheck = { ok: true; factor: Factor } | { ok: false; error: string; status: number };

/** One check for an account. `kind` says which the person gave: the password, or the code that was emailed. */
export async function verifyFactor(userId: number, kind: Factor, value: string): Promise<FactorCheck> {
  const key = `confirm-fail:${userId}`;
  const gate = failuresOver(key, 5);
  if (!gate.allowed) return { ok: false, status: 429, error: `Too many wrong tries. Wait ${Math.ceil((gate.retryAfterSeconds ?? 900) / 60)} minutes and try again.` };
  const res = await checkOne(userId, kind, value);
  if (res.ok) clearFailures(key); else if (res.status === 401) addFailure(key, 15 * 60);
  return res;
}

async function checkOne(userId: number, kind: Factor, value: string): Promise<FactorCheck> {
  const r = await row(userId);
  if (!r) return { ok: false, status: 401, error: "The account was not found." };
  const v = String(value ?? "").trim();
  if (kind === "email") {
    const res = await verifyAndConsumeOtp(r.email, "action_confirm", v);
    if (!res.ok) return { ok: false, status: 401, error: res.reason === "expired" ? "That code has expired. Send a new one." : res.reason === "too_many_attempts" ? "Too many tries. Send a new code." : "That code is not right." };
    return { ok: true, factor: "email" };
  }
  if (!(await bcrypt.compare(v, r.password_hash))) return { ok: false, status: 401, error: "The password is not right." };
  return { ok: true, factor: "password" };
}

/**
 * A 6-digit code by email, instead of typing the password. Live mode sends it to the account's own address; sandbox
 * mode (the default) to the team inbox (EMAIL_SANDBOX_TO), as every email of this server. The code is never returned.
 */
export async function emailCode(userId: number): Promise<{ ok: true; to: string } | { ok: false; error: string; status: number }> {
  const r = await row(userId);
  if (!r) return { ok: false, status: 401, error: "The account was not found." };
  const live = process.env.EMAIL_MODE === "live";
  const to = live ? r.email : (process.env.EMAIL_SANDBOX_TO || "").trim();
  if (!isSmtpConfigured() || !to) return { ok: false, status: 503, error: "Email is not set up on this server. Use your password." };
  const made = await createOtp(r.email, "action_confirm", r.id);
  if (made.cooldownRemaining) return { ok: false, status: 429, error: `Wait ${made.cooldownRemaining} s before asking for another code.` };
  const sent = await sendMail(to, `${live ? "" : "[Sandbox] "}Your District IQ code`, otpEmailHtml(made.otp, `confirming an action in District IQ as ${r.email}`));
  if (!sent.ok) { await discardOtp(r.email, "action_confirm"); return { ok: false, status: 502, error: "The code could not be emailed. Use your password." }; }
  return { ok: true, to: maskEmail(to) };
}

/** "co*****@chennai.gov.in": enough to know which inbox to open */
export const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, (_m, a: string, b: string) => `${a}${"*".repeat(5)}${b}`);
