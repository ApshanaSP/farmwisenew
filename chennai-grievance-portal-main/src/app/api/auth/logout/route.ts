import { NextResponse } from "next/server";
import { clearAuthCookie, getPortalSession, getSessionFromCookies, migrateLegacyCookie, resolvePortal, revokeSessions } from "@/lib/auth";
import { roleToPortal } from "@/lib/session-cookies";

// Signs out only the portal the request came from (e.g. logging out of the
// Collector console leaves the officer console signed in). The account's
// token version is raised, so a copy of the cookie stops working too.
export async function POST() {
  let portal = resolvePortal();
  const session = portal ? await getPortalSession(portal) : await getSessionFromCookies();
  if (!portal) portal = session ? roleToPortal(session.role) : null;

  const res = NextResponse.json({ message: "Logged out" });
  if (session) {
    try {
      await revokeSessions(session.userId);
    } catch (err) {
      // the cookie is still cleared below; the old token is only refused once the version is saved
      console.error("[api/auth/logout] could not end the session on the server", err);
    }
  }
  await migrateLegacyCookie(res);
  if (portal) clearAuthCookie(res, portal);
  return res;
}
