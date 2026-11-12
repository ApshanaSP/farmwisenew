/**
 * The petition officer's login: one fixed account, like the Collector's, so nobody has to create it or hand out a new password. It is
 * put in place the first time someone signs in with it, and set back to the fixed password if it ever differs.
 */
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { istNow } from "./clean";
import { PETITION_DEPT, PETITION_LOGIN_EMAIL } from "./constants";

// the fixed password, hashed; the password itself is listed in officer-accounts.local.csv with the other logins
const FIXED_HASH = "$2a$10$B7LSDamB0zFCY7eDZuhOT.11JLlP5vYC83JGGpo56Fjkr6JeTS1Sy";

export async function ensurePetitionLogin(email: string): Promise<void> {
  if (email !== PETITION_LOGIN_EMAIL) return;
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT id, password_hash FROM users WHERE email = ? LIMIT 1`, [email]);
  const now = istNow();
  if (!rows[0]) {
    await pool.query(
      `INSERT INTO users (email, password_hash, role, department_id, dept_code, is_active, email_verified_at, email_verification_exempt, token_version, created_at, updated_at)
       VALUES (?, ?, 'department_officer', NULL, ?, 1, ?, 1, 0, ?, ?)`,
      [email, FIXED_HASH, PETITION_DEPT, now, now, now]
    );
  } else if (rows[0].password_hash !== FIXED_HASH) {
    // the fixed password goes back, but a deactivated account stays deactivated: anyone can type this email, no password needed
    // (QA pass 5, P5-005), so this must never undo an administrator's "deactivate"
    await pool.query(`UPDATE users SET password_hash = ?, dept_code = ?, updated_at = ? WHERE id = ?`, [FIXED_HASH, PETITION_DEPT, now, rows[0].id]);
  }
}
