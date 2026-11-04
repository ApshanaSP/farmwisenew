/**
 * Every email District IQ sends in the Collector's name carries a reference, "DIQ-7F3A-K2QZ": an HMAC (a key only the
 * server holds) of who approved it, when, its subject and a hash of its text. Anyone can type the reference into a
 * console (Menu → Security → Check an email) and see whether such an email was really sent, by whom, to whom and when.
 * A spoofed email has no reference, or one that matches nothing; an edited one no longer matches its own.
 *
 * Nothing new is stored: the reference is worked out again from the outbound_emails row (owner, subject, body_hash,
 * approved_at), so a check reads the rows and compares in constant time.
 */
import crypto from "crypto";
import intelPool, { ops } from "@/lib/collector/db";
import { jwtSecret } from "@/lib/secrets";
import type { RowDataPacket } from "mysql2";
import { factorWords } from "./stepup";
import type { Factor } from "./factors";

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let key: Buffer | null = null;
const K = () => (key ??= crypto.createHash("sha256").update(`district-iq email|${jwtSecret()}`).digest());

export interface StampOf { owner: string; subject: string; bodyHash: string; at: string }

export function emailRef(e: StampOf): string {
  const mac = crypto.createHmac("sha256", K()).update([e.owner.toLowerCase(), e.at.slice(0, 19), e.subject, e.bodyHash].join("\u0000")).digest();
  const s = [...mac.subarray(0, 8)].map((b) => B32[b & 31]).join("");
  return `DIQ-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}
export const bodyHash = (body: string) => crypto.createHash("sha256").update(body).digest("hex");
export const normRef = (r: string) => r.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^DIQ/, "");

const fmtAt = (at: string) => {
  const d = new Date(at.slice(0, 19).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? at : `${d.getUTCDate()} ${d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} IST`;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The footer of an approved email: who approved it, how, and the reference to check it with. */
export function stampHtml(e: StampOf, factor: Factor | null): string {
  const ref = emailRef(e);
  return `<div style="margin-top:16px;padding:10px 12px;border:1px solid #BBF7D0;border-radius:8px;background:#F0FDF4;font:12px/1.5 Arial,Helvetica,sans-serif;color:#14532D">
  <b>Approved by ${esc(e.owner)}</b> on ${esc(fmtAt(e.at))}${factor ? `, confirmed with ${esc(factorWords(factor))}` : ""}.<br>
  Reference <b style="font-family:Consolas,monospace;letter-spacing:1px">${ref}</b>. To check that this email is genuine, open the District IQ console,
  Menu &rarr; Security &rarr; Check an email, and type this reference. Act on it from the console, not from links in emails.
</div>`;
}

export interface RefCheck {
  genuine: boolean;
  email?: { id: number; from: string; to: string; subject: string; at: string; atText: string; mode: string; status: string; incident: string | null };
}

/** Is this reference one of ours? The newest 20,000 emails are checked (a district's emails of several years). */
export async function checkRef(ref: string): Promise<RefCheck> {
  const want = normRef(ref);
  if (want.length !== 8) return { genuine: false };
  const [rows] = await intelPool.query<RowDataPacket[]>(
    `SELECT email_id, owner, to_contact_ids, subject, body_hash, approved_at, mode, status, incident_id FROM ${ops("outbound_emails")} ORDER BY email_id DESC LIMIT 20000`);
  for (const r of rows) {
    if (!r.approved_at || !r.body_hash) continue;
    const at = String(r.approved_at instanceof Date ? r.approved_at.toISOString().replace("T", " ") : r.approved_at);
    const got = normRef(emailRef({ owner: String(r.owner), subject: String(r.subject), bodyHash: String(r.body_hash), at }));
    if (crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
      let to = "the department officer";
      try { const t = JSON.parse(String(r.to_contact_ids ?? "[]")); if (Array.isArray(t) && t[0]?.name) to = `${t[0].name}${t[0].email ? ` <${t[0].email}>` : ""}`; } catch { /* kept */ }
      return { genuine: true, email: { id: Number(r.email_id), from: String(r.owner), to, subject: String(r.subject), at, atText: fmtAt(at), mode: String(r.mode), status: String(r.status), incident: r.incident_id ? String(r.incident_id) : null } };
    }
  }
  return { genuine: false };
}
