/**
 * A filter the request names but the console cannot apply is refused, not dropped (QA pass 4, RC-43, PB-269, PB-270).
 * The parse* helpers in intel.ts turn a value they do not know into "no filter", which showed the whole city for zone 99 with no sign
 * the filter had gone. A route calls refuseBadFilter() right after the session check: an absent or empty value is no filter, a
 * value that is present and unknown is a 400 that says which one.
 */
import { NextResponse } from "next/server";
import { PERIODS } from "@/lib/collector/intel";
import { TABS } from "@/lib/officer/stages";

/** The GCC has 15 zones (ref_wards.zone_no 1 to 15). */
export const ZONES = 15;

const show = (v: string) => JSON.stringify(v.replace(/[^\p{L}\p{N} _.:/-]/gu, "").slice(0, 24));

/** What is wrong with the zone, period, department, category or taluk in a query string, in a plain sentence; null when all are fine or absent. */
export function filterProblem(p: URLSearchParams): string | null {
  const given = (k: string) => { const v = p.get(k); return v == null || v.trim() === "" ? null : v.trim(); };
  const zone = given("zone");
  if (zone != null && !(/^\d{1,2}$/.test(zone) && Number(zone) >= 1 && Number(zone) <= ZONES)) return `Zone ${show(zone)} is not one of the ${ZONES} GCC zones (1 to ${ZONES}).`;
  const period = given("period");
  if (period != null && !Object.prototype.hasOwnProperty.call(PERIODS, period)) return `Period ${show(period)} is not one of ${Object.keys(PERIODS).join(", ")}.`;
  const dept = given("dept");
  if (dept != null && !/^[A-Z0-9-]{2,20}$/.test(dept)) return `Department ${show(dept)} is not a department code.`;
  const cat = given("cat");
  if (cat != null && !/^[A-Z_]{3,40}$/.test(cat)) return `Category ${show(cat)} is not a category code.`;
  const taluk = given("taluk");
  if (taluk != null && !/^TLK-[A-Z]{3}$/.test(taluk)) return `Taluk ${show(taluk)} is not a taluk code.`;
  return null;
}

/** The 400 to return for a filter that cannot be applied, or null. */
export function refuseBadFilter(p: URLSearchParams): NextResponse | null {
  const why = filterProblem(p);
  return why ? NextResponse.json({ error: why }, { status: 400 }) : null;
}

/** The officer's grievance list: a tab that is not one of the stages (or all) is a 400, not the New tab. */
export function refuseBadTab(p: URLSearchParams): NextResponse | null {
  const tab = p.get("tab");
  if (tab == null || tab.trim() === "" || tab === "all" || (TABS as string[]).includes(tab)) return null;
  return NextResponse.json({ error: `Tab ${show(tab)} is not one of ${[...TABS, "all"].join(", ")}.` }, { status: 400 });
}
