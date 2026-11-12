import { NextResponse } from "next/server";
import { clearAuthCookie, getPortalSession, getSessionFromCookies, migrateLegacyCookie, resolvePortal, revokeSessions } from "@/lib/auth";
import { roleToPortal } from "@/lib/session-cookies";

// Signs out only the portal the request came from, and only in the tab that asked: every tab keeps its own
// sign-ins (lib/session-cookies.ts), so a duplicated tab, or the officer console in the next tab, stays signed in.
// The signed token is ended on the server too (QA4 gate, skeptic-redsec1-1): clearing the cookie in the browser left a copy
// of it working for its whole life (7 days a citizen, 12 hours staff). Signing out raises the account's token version
// (migration 013), as a password change does, so every copy of that account's tokens stops working. The cost: another
// tab or device signed in as the SAME account is signed out with it. A different account or portal in another tab is not.
export async function POST() {
  let portal = await resolvePortal();
  const session = portal ? await getPortalSession(portal) : await getSessionFromCookies();
  if (!portal) portal = session ? roleToPortal(session.role) : null;
  // a failed write must not keep the browser signed in: the cookie is cleared either way, and the failure is logged
  if (session) await revokeSessions(session.userId).catch((e) => console.error("[api/auth/logout] token not revoked", e));

  const res = NextResponse.json({ message: "Logged out" });
  await migrateLegacyCookie(res);
  if (portal) await clearAuthCookie(res, portal);
  return res;
}
