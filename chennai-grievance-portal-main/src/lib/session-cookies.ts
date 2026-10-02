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
