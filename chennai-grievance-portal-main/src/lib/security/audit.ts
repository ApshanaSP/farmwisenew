/**
 * The security side of the audit log (ops.audit_log): every sign-in, every wrong second-step code, every confirmed
 * action and every email reference checked. Rows name the account and what happened, never a password or a code.
 * Writing one never fails the request it belongs to.
 */
import intelPool, { ops } from "@/lib/collector/db";
import type { RowDataPacket } from "mysql2";

export async function securityLog(actor: string, action: string, recordId: string | null, detail: Record<string, unknown>): Promise<void> {
  try {
    await intelPool.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, ?, 'security', ?, NULL, ?)`,
      [actor, action, recordId, JSON.stringify(detail)]);
  } catch (e) {
    console.warn(`[security] audit row not written (${action}): ${(e as Error).message}`);
  }
}

export interface SecurityEvent { at: string; action: string; detail: Record<string, unknown> }

/** The account's latest sign-ins, failed codes and confirmed actions, newest first. */
export async function recentEvents(actor: string, n = 12): Promise<SecurityEvent[]> {
  try {
    const [rows] = await intelPool.query<RowDataPacket[]>(
      `SELECT at, action, after_value FROM ${ops("audit_log")} WHERE actor = ? AND table_name = 'security' ORDER BY log_id DESC LIMIT ?`, [actor, n]);
    return rows.map((r) => {
      let detail: Record<string, unknown> = {};
      try { detail = JSON.parse(String(r.after_value ?? "{}")); } catch { /* kept empty */ }
      return { at: String(r.at), action: String(r.action), detail };
    });
  } catch {
    return [];
  }
}
