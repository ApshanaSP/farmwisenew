import { NextResponse } from "next/server";
import { clearAuthCookie, getPortalSession, getSessionFromCookies, migrateLegacyCookie, resolvePortal } from "@/lib/auth";
import { roleToPortal } from "@/lib/session-cookies";

// Signs out only the portal the request came from, and only in the tab that asked: every tab keeps its own
// sign-ins (lib/session-cookies.ts), so a duplicated tab, or the officer console in the next tab, stays signed in.
// The account's other sessions are not revoked here; a password change or reset still ends all of them.
export async function POST() {
  let portal = resolvePortal();
  const session = portal ? await getPortalSession(portal) : await getSessionFromCookies();
  if (!portal) portal = session ? roleToPortal(session.role) : null;

  const res = NextResponse.json({ message: "Logged out" });
  await migrateLegacyCookie(res);
  if (portal) clearAuthCookie(res, portal);
  return res;
}
