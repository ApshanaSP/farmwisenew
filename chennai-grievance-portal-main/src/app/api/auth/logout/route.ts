import { NextResponse } from "next/server";
import { clearAuthCookie, getSessionFromCookies, migrateLegacyCookie, resolvePortal } from "@/lib/auth";
import { roleToPortal } from "@/lib/session-cookies";

// Signs out only the portal the request came from, and only in the tab that asked: every tab keeps its own
// sign-ins (lib/session-cookies.ts), so a duplicated tab, or the officer console in the next tab, stays signed in.
// The account's other sessions are not revoked here; a password change or reset still ends all of them.
// Open for the owner (QA pass 7 merge of pass 4's eec8c840): pass 4's gate made sign-out raise the account's token version
// (revokeSessions, skeptic-redsec1-1 / redteam-final-13), which ends a copied cookie but also signs out every other tab and
// device of the same account. That changes the per-tab design (Apshana's f49b4ec, kept as final), so it is not applied here;
// docs/qa/pass7/P0_FIXES.md has the exact change for the owner to decide.
export async function POST() {
  // Knowing the portal is enough to clear its cookie: the account is looked up only when the portal cannot be told, so signing out
  // does not wait on the store. (Next 15: the request headers are read asynchronously.)
  let portal = await resolvePortal();
  if (!portal) {
    const session = await getSessionFromCookies();
    portal = session ? roleToPortal(session.role) : null;
  }

  const res = NextResponse.json({ message: "Logged out" });
  await migrateLegacyCookie(res);
  if (portal) await clearAuthCookie(res, portal);
  return res;
}
