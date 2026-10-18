// Session cookie names, shared by middleware.ts (Edge runtime) and lib/auth.ts.
//
// Each portal keeps its own cookie so the citizen, department officer and
// Collector logins can all be signed in at once in the same browser; signing
// in to one no longer replaces (logs out) the others.

import type { UserRole } from "@/types";

export type Portal = "citizen" | "officer" | "collector";

/** The single cookie used before per-portal sessions; still honoured until it is migrated. */
export const LEGACY_COOKIE_NAME = "dcd_session";

export const PORTAL_COOKIE_NAMES: Record<Portal, string> = {
  citizen: "dcd_session_citizen",
  officer: "dcd_session_officer",
  collector: "dcd_session_collector"
};

/** Request header middleware sets on page requests so server code knows which portal it is serving. */
export const PORTAL_HEADER = "x-dcd-portal";

// ---- Per-tab sessions -------------------------------------------------------------------------
//
// Cookies are shared by every tab, so one cookie per portal meant a duplicated tab shared the sign-in
// of the tab it came from (signing out of one signed out both) and a second officer could not sign in
// beside the first. Every tab now has its own slot (an id kept in sessionStorage, lib/tab-session.ts)
// and each slot keeps its own portal cookies: dcd_session_<portal>__<slot>. The tab's fetches carry its
// slot in TAB_HEADER; a page load (which cannot carry a header) uses TAB_COOKIE, which the tab sets
// whenever it is shown, clicked or about to navigate. A request with neither uses the unslotted cookies.

export const TAB_HEADER = "x-dcd-tab";
export const TAB_COOKIE = "dcd_tab";
/** TAB_HEADER value of a tab that is still on the unslotted cookies (before its first copy into a slot). */
export const UNSLOTTED = "-";
/** When each slot was last used ("slot.time~slot.time"), so the least recently used is dropped first. */
export const SLOT_INDEX_COOKIE = "dcd_tabs";
/** At most this many slots keep cookies (each holds a token per signed-in portal; request headers have a size limit). */
export const MAX_SLOTS = 10;

const SLOT_RE = /^[a-z0-9]{6,24}$/;
const SLOTTED_NAME = /^dcd_session_(?:citizen|officer|collector)__([a-z0-9]{6,24})$/;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
};

export function isSlot(value: string | null | undefined): value is string {
  return !!value && SLOT_RE.test(value);
}

/** The cookie of one portal in one tab's slot (null: the unslotted cookie). */
export function portalCookieName(portal: Portal, slot: string | null): string {
  return slot ? `${PORTAL_COOKIE_NAMES[portal]}__${slot}` : PORTAL_COOKIE_NAMES[portal];
}

/** The slot a request belongs to: its fetch header, else (a page load) the tab cookie; null = unslotted. */
export function requestSlot(header: string | null | undefined, tabCookie: string | null | undefined): string | null {
  if (header != null) return isSlot(header) ? header : null;
  return isSlot(tabCookie) ? tabCookie : null;
}

function parseSlotIndex(value: string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of (value ?? "").split("~")) {
    const [slot, t] = part.split(".");
    if (isSlot(slot) && t) out.set(slot, parseInt(t, 36) || 0);
  }
  return out;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** The slot was used more than `seconds` ago (or never recorded), so its time is worth writing again. */
export function slotStale(indexValue: string | null | undefined, slot: string, seconds: number): boolean {
  return nowSec() - (parseSlotIndex(indexValue).get(slot) ?? 0) > seconds;
}

interface CookieWriter {
  cookies: { set(name: string, value: string, options?: Record<string, unknown>): unknown };
}

export function setSessionCookie(res: CookieWriter, name: string, token: string) {
  res.cookies.set(name, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE });
}

export function clearCookie(res: CookieWriter, name: string) {
  res.cookies.set(name, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

/**
 * Record that `slot` was just used, and drop the cookies of the least recently used slots beyond MAX_SLOTS
 * (tabs closed long ago). `cookieNames` are the request's cookies; `keep` are never dropped.
 */
export function rememberSlot(res: CookieWriter, cookieNames: string[], indexValue: string | null | undefined, slot: string, keep: string[] = []) {
  const index = parseSlotIndex(indexValue);
  const live = new Set<string>([slot]);
  for (const name of cookieNames) {
    const m = SLOTTED_NAME.exec(name);
    if (m) live.add(m[1]);
  }
  for (const s of Array.from(index.keys())) if (!live.has(s)) index.delete(s);
  index.set(slot, nowSec());
  const protect = new Set([slot, ...keep]);
  const oldestFirst = Array.from(live).filter((s) => !protect.has(s)).sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
  let count = live.size;
  for (const victim of oldestFirst) {
    if (count <= MAX_SLOTS) break;
    for (const name of cookieNames) if (SLOTTED_NAME.exec(name)?.[1] === victim) clearCookie(res, name);
    index.delete(victim);
    count--;
  }
  const value = Array.from(index.entries()).map(([s, t]) => `${s}.${t.toString(36)}`).join("~");
  res.cookies.set(SLOT_INDEX_COOKIE, value, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE });
}

/** Order tried when a request does not say which portal it belongs to (e.g. /profile). */
export const PORTAL_FALLBACK_ORDER: Portal[] = ["citizen", "officer", "collector"];

const PORTAL_ROLES: Record<Portal, UserRole> = {
  citizen: "citizen",
  officer: "department_officer",
  collector: "collector"
};

export function portalRole(portal: Portal): UserRole {
  return PORTAL_ROLES[portal];
}

export function roleToPortal(role: string): Portal | null {
  if (role === "citizen") return "citizen";
  if (role === "department_officer") return "officer";
  if (role === "collector") return "collector";
  return null;
}

export function isPortal(value: string | null | undefined): value is Portal {
  return value === "citizen" || value === "officer" || value === "collector";
}

/** The portal a URL path belongs to: its pages and its /api/<portal> routes. */
export function portalFromPath(pathname: string | null | undefined): Portal | null {
  if (!pathname) return null;
  for (const portal of PORTAL_FALLBACK_ORDER) {
    if (
      pathname === `/${portal}` ||
      pathname.startsWith(`/${portal}/`) ||
      pathname.startsWith(`/api/${portal}/`)
    ) {
      return portal;
    }
  }
  return null;
}

/** portalFromPath for a full URL such as a Referer header. */
export function portalFromUrl(url: string | null | undefined): Portal | null {
  if (!url) return null;
  try {
    return portalFromPath(new URL(url).pathname);
  } catch {
    return null;
  }
}
