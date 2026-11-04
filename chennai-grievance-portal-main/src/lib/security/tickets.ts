/**
 * Short-lived signed tickets, never sessions: the grant a confirmed action carries (5 minutes, one action on exactly
 * one thing). Signed with a key derived from JWT_SECRET for this use only, so a ticket can never be read as a session
 * token, nor a session as a ticket.
 */
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "@/lib/secrets";

export type TicketKind = "grant";

let key: Uint8Array | null = null;
const ticketKey = () => (key ??= new Uint8Array(crypto.createHash("sha256").update(`district-iq ticket|${jwtSecret()}`).digest()));

export async function signTicket(kind: TicketKind, claims: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(kind)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${Math.max(30, Math.round(ttlSeconds))}s`)
    .sign(ticketKey());
}

export async function readTicket<T extends Record<string, unknown>>(kind: TicketKind, token: string | null | undefined): Promise<(T & { jti: string; exp: number }) | null> {
  if (!token || token.length > 4000) return null;
  try {
    const { payload } = await jwtVerify(token, ticketKey(), { audience: kind });
    return payload as unknown as T & { jti: string; exp: number };
  } catch {
    return null;
  }
}
