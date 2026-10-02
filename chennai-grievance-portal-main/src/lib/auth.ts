import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { JwtPayload, UserRole } from "@/types";
import {
  LEGACY_COOKIE_NAME,
  PORTAL_COOKIE_NAMES,
  PORTAL_FALLBACK_ORDER,
  PORTAL_HEADER,
  Portal,
  isPortal,
  portalFromUrl,
  portalRole,
  roleToPortal
} from "@/lib/session-cookies";

export type { Portal } from "@/lib/session-cookies";

/**
 * Which portal the current request belongs to: the header middleware sets on
 * page requests, else the page that made the call (Referer) for API requests.
 */
export function resolvePortal(): Portal | null {
  const h = headers();
  const explicit = h.get(PORTAL_HEADER);
  if (isPortal(explicit)) return explicit;
  return portalFromUrl(h.get("referer"));
}

async function readSession(cookieName: string, portal: Portal): Promise<JwtPayload | null> {
  const token = cookies().get(cookieName)?.value;
  if (!token) return null;
  const session = await verifyToken(token);
  return session && session.role === portalRole(portal) ? session : null;
}

/** The signed-in session of one portal (its own cookie, or a not-yet-migrated legacy cookie). */
export async function getPortalSession(portal: Portal): Promise<JwtPayload | null> {
  return (
    (await readSession(PORTAL_COOKIE_NAMES[portal], portal)) ??
    (await readSession(LEGACY_COOKIE_NAME, portal))
  );
}

/**
 * Session for this request. Each portal has its own cookie, so the citizen,
 * officer and Collector can be signed in side by side; the request's portal
 * picks which one applies. Requests with no portal (e.g. /profile) take the
 * first signed-in session in PORTAL_FALLBACK_ORDER.
 */
export async function getSessionFromCookies(): Promise<JwtPayload | null> {
  const portal = resolvePortal();
  if (portal) return getPortalSession(portal);
  for (const p of PORTAL_FALLBACK_ORDER) {
    const session = await getPortalSession(p);
    if (session) return session;
  }
  return null;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
};

export function setAuthCookie(res: NextResponse, token: string, portal: Portal) {
  res.cookies.set(PORTAL_COOKIE_NAMES[portal], token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 7 // 7 days
  });
}

export function clearAuthCookie(res: NextResponse, portal: Portal) {
  res.cookies.set(PORTAL_COOKIE_NAMES[portal], "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

/**
 * Move a pre-existing single-cookie session into its portal's own cookie, so
 * a new sign-in for another portal does not knock it out.
 */
export async function migrateLegacyCookie(res: NextResponse) {
  const token = cookies().get(LEGACY_COOKIE_NAME)?.value;
  if (!token) return;
  const session = await verifyToken(token);
  const portal = session ? roleToPortal(session.role) : null;
  if (portal && !cookies().get(PORTAL_COOKIE_NAMES[portal])?.value) {
    setAuthCookie(res, token, portal);
  }
  res.cookies.set(LEGACY_COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

export function requireRole(session: JwtPayload | null, roles: UserRole[]): boolean {
  if (!session) return false;
  return roles.includes(session.role);
}

/**
 * Session for a route that may only serve an account allowed to act.
 *
 * Re-checks the account against the database rather than trusting the token,
 * so deactivating a user takes effect immediately instead of waiting for the
 * 7-day token to expire.
 */
export async function getActiveSession(): Promise<JwtPayload | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT is_active FROM users WHERE id = ? LIMIT 1",
    [session.userId]
  );
  if (rows.length === 0 || !rows[0].is_active) return null;

  return session;
}
