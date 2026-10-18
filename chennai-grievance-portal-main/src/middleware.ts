import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import {
  LEGACY_COOKIE_NAME,
  PORTAL_FALLBACK_ORDER,
  PORTAL_HEADER,
  Portal,
  SLOT_INDEX_COOKIE,
  TAB_COOKIE,
  TAB_HEADER,
  portalCookieName,
  portalFromPath,
  portalRole,
  rememberSlot,
  requestSlot,
  slotStale
} from "@/lib/session-cookies";
import { JwtPayload } from "@/types";

// The department officer console and the Collector console each sign in
// separately; every portal has its own session cookie, so all three can be
// signed in at the same time in one browser. Every tab keeps its own cookies (its slot), so tabs sign in
// and out independently: three tabs can hold three different logins.

const PUBLIC_ONLY_PREFIXES = ["/register", "/forgot-password"];

async function readSession(request: NextRequest, cookieName: string, portal: Portal): Promise<JwtPayload | null> {
  const token = request.cookies.get(cookieName)?.value;
  if (!token) return null;
  const session = await verifyToken(token);
  return session && session.role === portalRole(portal) ? session : null;
}

function tabSlot(request: NextRequest): string | null {
  return requestSlot(request.headers.get(TAB_HEADER), request.cookies.get(TAB_COOKIE)?.value);
}

async function portalSession(request: NextRequest, portal: Portal): Promise<JwtPayload | null> {
  const slot = tabSlot(request);
  return (
    (await readSession(request, portalCookieName(portal, slot), portal)) ??
    (slot ? null : await readSession(request, LEGACY_COOKIE_NAME, portal))
  );
}

async function anySession(request: NextRequest): Promise<JwtPayload | null> {
  for (const portal of PORTAL_FALLBACK_ORDER) {
    const session = await portalSession(request, portal);
    if (session) return session;
  }
  return null;
}

function toLogin(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Tell server components which portal (and so which session cookie) this page uses.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(PORTAL_HEADER);

  const portal = portalFromPath(pathname);
  if (portal) {
    if (!(await portalSession(request, portal))) return toLogin(request, pathname);
    requestHeaders.set(PORTAL_HEADER, portal);
  } else if (pathname.startsWith("/profile")) {
    if (!(await anySession(request))) return toLogin(request, pathname);
  } else if (PUBLIC_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    // registering / resetting a password is a citizen flow; a signed-in citizen goes home
    if (await portalSession(request, "citizen")) {
      const url = request.nextUrl.clone();
      url.pathname = "/citizen";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  // /login is always reachable, so another role can sign in alongside existing sessions.

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  // a signed-in tab in use: note it (at most every 10 minutes) so its cookies are the last to be dropped
  const slot = tabSlot(request);
  const index = request.cookies.get(SLOT_INDEX_COOKIE)?.value;
  if (portal && slot && slotStale(index, slot, 600)) {
    rememberSlot(res, request.cookies.getAll().map((c) => c.name), index, slot);
  }
  return res;
}

export const config = {
  matcher: [
    "/citizen/:path*",
    "/officer/:path*",
    "/collector/:path*",
    "/profile/:path*",
    "/login",
    "/register",
    "/forgot-password"
  ]
};
