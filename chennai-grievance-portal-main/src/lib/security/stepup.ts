/**
 * "Confirm it's you": the check a route makes before an outward or irreversible action (sending an email in the
 * Collector's name, approving or closing cases, an officer's report to the Collector, deleting a dataset, approving a
 * new data source, a bulk export). Being signed in is not enough for these: an unlocked laptop or a copied cookie
 * must not be able to do them.
 *
 * The route says what the action is and exactly what it touches (`scope`: recipients, text, case ids). Without a grant
 * it answers 428 with a plain summary and the scope's hash; the browser asks for the account's password (or a code sent
 * by email), api/auth/confirm checks it and returns a grant bound to this account, this session, this action and this
 * exact scope, for 5 minutes. The browser repeats the request with the grant (header x-diq-grant). Change a word of the
 * email after confirming and the hash no longer matches: it must be confirmed again. Enforced here on the server, not
 * only on the screen.
 */
import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { JwtPayload } from "@/types";
import { readTicket, signTicket } from "./tickets";
import type { Factor } from "./factors";

export type ActionKind = "send_email" | "decide" | "officer_report" | "delete_dataset" | "approve_source" | "export";

export const GRANT_HEADER = "x-diq-grant";
export const GRANT_TTL_S = 5 * 60;

export const ACTION_WORD: Record<ActionKind, string> = {
  send_email: "Send email", decide: "Record a decision", officer_report: "Send the completion report", delete_dataset: "Delete a dataset",
  approve_source: "Approve a new data source", export: "Export data"
};

export interface Grant { uid: number; tv: number; act: ActionKind; scope: string; fac: Factor }

/** The same JSON whatever the order of its keys, then SHA-256: what a grant is bound to. */
export function scopeHash(scope: unknown): string {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
  return crypto.createHash("sha256").update(JSON.stringify(canon(scope) ?? null)).digest("base64url").slice(0, 32);
}

export async function issueGrant(s: JwtPayload, act: ActionKind, scope: string, fac: Factor): Promise<string> {
  return signTicket("grant", { uid: s.userId, tv: Number(s.tv) || 0, act, scope, fac }, GRANT_TTL_S);
}

/** tests of the whole loop (loop.sqlite.test.ts) run the routes without a person to confirm */
const off = () => process.env.NODE_ENV === "test" && process.env.STEP_UP === "off";

/**
 * The grant of this request for this action on this scope, or the 428 to return. `summary` is what the confirm box
 * says ("Send 1 email to Storm Water Drain: 12 cases"). `scope` must hold everything that makes the action what it is.
 */
export async function requireConfirm(req: NextRequest | Request, s: { userId: number; tv?: number | null }, act: ActionKind, summary: string, scope: unknown):
  Promise<{ ok: true; grant: Grant | null } | { ok: false; res: NextResponse }> {
  if (off()) return { ok: true, grant: null };
  const hash = scopeHash(scope);
  const g = await readTicket<Grant & Record<string, unknown>>("grant", req.headers.get(GRANT_HEADER));
  // the session's token version too, where the route has it: a grant from a session signed out since does not count
  if (g && g.uid === s.userId && (s.tv === undefined || g.tv === (Number(s.tv) || 0)) && g.act === act && g.scope === hash) return { ok: true, grant: g };
  return {
    ok: false,
    res: NextResponse.json({
      error: g ? "The confirmation was for something else (the text or the cases changed). Confirm again." : "Confirm it's you first.",
      confirm: { action: act, title: ACTION_WORD[act], summary, scope: hash }
    }, { status: 428 })
  };
}

/** how an action was confirmed, for the email footer and the audit log */
export const factorWords = (f: Factor | null | undefined) =>
  f === "email" ? "an emailed code" : f === "password" ? "the account password" : "no confirmation";
