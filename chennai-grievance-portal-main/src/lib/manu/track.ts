/**
 * Public tracking, for petitioners with no account. The QR code on the slip carries a key made from the complaint number; typing the
 * number needs the last 4 digits of the mobile written on the petition. The answer holds the status only, no personal detail.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { progressFor, withProgress } from "@/lib/complaint-progress";
import { jwtSecret } from "@/lib/secrets";
import { manuDeptLabel } from "./constants";
import { digits } from "./clean";

export const CODE_RE = /^\d{4}-\d{3}[A-Z]{3}$/;

export const trackKey = (code: string): string => createHmac("sha256", jwtSecret()).update(`track:${code}`).digest("base64url").slice(0, 20);

const same = (a: string, b: string): boolean => {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

/** Does this person hold the slip (key) or know the end of the mobile number on it? */
export function mayTrack(code: string, mobile: string | null | undefined, key: string | null | undefined, last4: string | null | undefined): boolean {
  if (key && same(key, trackKey(code))) return true;
  const end = digits(mobile).slice(-4), given = digits(last4);
  return end.length === 4 && given.length === 4 && same(end, given);
}

export interface TrackStep { status: string; stage: string; note: string | null; at: string }
export interface TrackView { code: string; status: string; filedAt: string; department: string; dueBy: string | null; steps: TrackStep[] }

const str = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v ?? ""));

export async function complaintForTrack(code: string): Promise<RowDataPacket | null> {
  const [r] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.complaint_code, c.status, c.created_at, c.mobile_number, d.name AS department_name FROM complaints c LEFT JOIN departments d ON d.id = c.department_id WHERE c.complaint_code = ? LIMIT 1`, [code]);
  return r[0] ?? null;
}

export async function trackView(c: RowDataPacket): Promise<TrackView> {
  const code = String(c.complaint_code);
  const [hist] = await pool.query<RowDataPacket[]>(
    `SELECT status, stage, remarks, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM complaint_status_history WHERE complaint_id = ? ORDER BY created_at, id`, [c.id]);
  const prog = await progressFor([{ code, createdAt: c.created_at }]).catch(() => new Map());
  const p = prog.get(code);
  let department = String(c.department_name ?? ""), dueBy: string | null = null;
  try {
    const [pet] = await pool.query<RowDataPacket[]>(`SELECT dept_code, DATE_FORMAT(due_at, '%Y-%m-%d %H:%i:%s') AS due_at FROM petitions WHERE complaint_code = ? LIMIT 1`, [code]);
    if (pet[0]) { department = manuDeptLabel(pet[0].dept_code) || department; dueBy = pet[0].due_at ?? null; }
  } catch { /* an older store with no petitions table */ }
  const merged = withProgress(hist as { status: string; stage: string; remarks: string | null; created_at: string }[], p);
  return {
    code, status: p?.status ?? String(c.status), filedAt: str(c.created_at), department, dueBy,
    steps: merged.map((h) => ({ status: h.status, stage: String((h as { stage?: string }).stage ?? ""), note: (h as { remarks?: string | null }).remarks ?? null, at: str(h.created_at) }))
  };
}
