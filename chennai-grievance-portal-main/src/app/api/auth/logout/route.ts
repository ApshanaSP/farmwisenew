import { NextResponse } from "next/server";
import { clearAuthCookie, getSessionFromCookies, migrateLegacyCookie, resolvePortal } from "@/lib/auth";
import { roleToPortal } from "@/lib/session-cookies";

// Signs out only the portal the request came from, and only in the tab that asked: every tab keeps its own
// sign-ins (lib/session-cookies.ts), so a duplicated tab, or the officer console in the next tab, stays signed in.
// The account's other sessions are not revoked here; a password change or reset still ends all of them.
export async function POST() {
  // Knowing the portal is enough to clear its cookie: the account is looked up only when the portal cannot be told, so signing out
  // does not wait on the store.
  let portal = resolvePortal();
  if (!portal) {
    const session = await getSessionFromCookies();
    portal = session ? roleToPortal(session.role) : null;
  }

  const res = NextResponse.json({ message: "Logged out" });
  await migrateLegacyCookie(res);
  if (portal) clearAuthCookie(res, portal);
  return res;
}
