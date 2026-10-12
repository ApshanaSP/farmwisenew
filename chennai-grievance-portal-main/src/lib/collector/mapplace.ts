/**
 * Which incidents the Collector's map may draw as exact pins, and the "no exact place" filters that account for the
 * rest. Pure (no database), so the rule is unit-tested and shared by the overview, the incident list and the trends.
 */

/**
 * Coarsest location (metres) still drawn as a map pin. The pipeline stores 30–50 m for departmental points, 300–1,500 m
 * for a street or locality named in the news, 4,000 m for a wider area and 15,000 m for "somewhere in Chennai" (the
 * district centroid, 13.0827, 80.2707): pinning those would draw a false hotspot. A point with no precision recorded is
 * a source's own point (every loader sets one; the grievance loader leaves it empty only when there is no point).
 */
export const PIN_PRECISION_M = 2000;

/** SQL over `incidents i`: located precisely enough for a pin. */
export const PINNABLE = `(i.lat IS NOT NULL AND COALESCE(i.loc_precision_m, 0) <= ${PIN_PRECISION_M})`;

/** The same rule as PINNABLE, for one row. */
export function isPinnable(lat: unknown, precisionM: unknown): boolean {
  if (lat == null || lat === "") return false;
  return precisionM == null || precisionM === "" || Number(precisionM) <= PIN_PRECISION_M;
}

/** No exact place, for the incident list's `place` filter: not pinned, no zone, or no in-district taluk. */
export const PLACE_FILTERS = {
  unlocated: `NOT ${PINNABLE}`,
  nozone: `i.zone_no IS NULL`,
  notaluk: `(i.taluk_code IS NULL OR i.taluk_code NOT IN (SELECT taluk_code FROM ref_taluks WHERE in_district = 1))`
} as const;
export type PlaceFilter = keyof typeof PLACE_FILTERS;

export function parsePlace(v: unknown): PlaceFilter | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PLACE_FILTERS, v) ? (v as PlaceFilter) : null;
}
