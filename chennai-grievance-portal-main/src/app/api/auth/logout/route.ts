import { NextResponse } from "next/server";
import { clearAuthCookie, getSessionFromCookies, migrateLegacyCookie, resolvePortal } from "@/lib/auth";
import { roleToPortal } from "@/lib/session-cookies";

// Signs out only the portal the request came from (e.g. logging out of the
// Collector console leaves the officer console signed in).
export async function POST() {
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
