import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomDigits(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10).toString();
  return out;
}

function randomLetters(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return out;
}

/**
 * Format: YYYY-NNNXXX  (4-digit year, hyphen, 3 digits + 3 uppercase letters)
 * e.g. 2026-618SGP
 * Guaranteed unique via a check-and-retry loop against the DB unique
 * constraint on complaints.complaint_code.
 */
export async function generateUniqueComplaintCode(): Promise<string> {
  // the year in Chennai, not the server's: on a UTC server a complaint filed after midnight on 1 January in Chennai would carry last year's code (RC-16 getters, g-review)
  const year = new Date(Date.now() + 330 * 60_000).getUTCFullYear();
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = `${year}-${randomDigits(3)}${randomLetters(3)}`;
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM complaints WHERE complaint_code = ? LIMIT 1",
      [code]
    );
    if (rows.length === 0) {
      return code;
    }
  }

  throw new Error("Could not generate a unique complaint code after multiple attempts");
}
