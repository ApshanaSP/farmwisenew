/**
 * A filter the request names but the console cannot apply is refused, not dropped (QA pass 4, RC-43, PB-269, PB-270).
 * The parse* helpers in intel.ts turn a value they do not know into "no filter", which showed the whole city for zone 99 with no sign
 * the filter had gone. A route calls refuseBadFilter() right after the session check: an absent or empty value is no filter, a
 * value that is present and unknown is a 400 that says which one.
 */
import { NextResponse } from "next/server";
import {
  GCC_ZONES, LIST_FLAGS, LIST_SCOPES, LIST_STATUSES, PERIODS, PLACE_FILTERS, SEVERITIES, filterValue, readCat, readDept, readFlag, readPeriod, readPlace,
  readScope, readSev, readStatus, readTaluk, readZone
} from "@/lib/collector/intel";
import { TABS } from "@/lib/officer/stages";

/** The GCC has 15 zones (ref_wards.zone_no 1 to 15). */
export const ZONES = GCC_ZONES;

const show = (v: string) => JSON.stringify(v.replace(/[^\p{L}\p{N} _.:/-]/gu, "").slice(0, 24));

/**
 * What is wrong with the zone, period, department, category or taluk in a query string, in a plain sentence; null when all are fine or absent.
 * A value is refused when it is present (filterValue) and the reader every route uses (intel.ts read*, the parse* helpers) cannot read it:
 * the check and the readers are the same code, so a value the check lets through is the value the route answers for (reviewerB-06).
 */
export function filterProblem(p: URLSearchParams): string | null {
  const given = (k: string) => filterValue(p.get(k));
  const zone = given("zone");
  if (zone != null && readZone(zone) == null) return `Zone ${show(zone)} is not one of the ${ZONES} GCC zones (1 to ${ZONES}).`;
  const period = given("period");
  if (period != null && readPeriod(period) == null) return `Period ${show(period)} is not one of ${Object.keys(PERIODS).join(", ")}.`;
  const dept = given("dept");
  if (dept != null && readDept(dept) == null) return `Department ${show(dept)} is not a department code.`;
  const cat = given("cat");
  if (cat != null && readCat(cat) == null) return `Category ${show(cat)} is not a category code.`;
  const taluk = given("taluk");
  if (taluk != null && readTaluk(taluk) == null) return `Taluk ${show(taluk)} is not a taluk code.`;
  // the list filters (hunt2-ops-04): an unknown severity, status, scope, place or flag was dropped and the whole list answered
  const sev = given("sev");
  if (sev != null && readSev(sev) == null) return `Severity ${show(sev)} is not one of ${SEVERITIES.join(", ")}.`;
  const status = given("status");
  if (status != null && readStatus(status) == null) return `Status ${show(status)} is not one of ${LIST_STATUSES.join(", ")}.`;
  const scope = given("scope");
  if (scope != null && readScope(scope) == null) return `Scope ${show(scope)} is not one of ${LIST_SCOPES.join(", ")}.`;
  const place = given("place");
  if (place != null && readPlace(place) == null) return `Place ${show(place)} is not one of ${Object.keys(PLACE_FILTERS).join(", ")}.`;
  const flag = given("flag");
  if (flag != null && readFlag(flag) == null) return `Flag ${show(flag)} is not one of ${LIST_FLAGS.join(", ")}.`;
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
