import { NextResponse } from "next/server";
import { getActivePortalSession } from "@/lib/auth";
import { officerDeptCode } from "@/lib/officer/guard";
import type { JwtPayload } from "@/types";
import { PETITION_DEPT } from "./constants";

export interface ManuStaff { session: JwtPayload }

/** The petition officer's own login. Nobody else may upload, check or approve petitions. */
export async function manuStaff(): Promise<ManuStaff | NextResponse> {
  const officer = await getActivePortalSession("officer");
  if (officer?.role === "department_officer" && (await officerDeptCode(officer.userId)) === PETITION_DEPT) return { session: officer };
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

/** The petition officer or the Collector: both may see the paper behind any complaint. */
export async function seesEveryPetition(): Promise<boolean> {
  if (!((await manuStaff()) instanceof NextResponse)) return true;
  const collector = await getActivePortalSession("collector");
  return collector?.role === "collector";
}

export function manuFailed(err: unknown, what: string) {
  console.error(`manu ${what} failed`, err);
  return NextResponse.json({ error: `Could not ${what}.` }, { status: 500 });
}
