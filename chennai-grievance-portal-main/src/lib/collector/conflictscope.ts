/**
 * Which of the period's "Reports differ" stories belong to the console's filters. An article carries no zone, department, category or
 * taluk; the incident a story is linked to does. A story linked to an incident follows every filter by that incident; a story with no
 * incident on record can belong to no zone or department, so it is shown apart, as district-wide.
 */
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import "@/lib/collector/derive";

export interface ConflictFilters { zone: number | null; dept: string | null; cat: string | null; taluk: string | null }
/** story ids: linked to an incident inside the filters; with no incident on record (district-wide); `out` counts those of other areas */
export interface ConflictScope { inside: string[]; wide: string[]; out: number }

export const anyFilter = (f: ConflictFilters) => !!(f.zone || f.dept || f.cat || f.taluk);

/** The split itself, from the incidents that matched the filters. */
export function splitByIncident(stories: { id: string; incident: string | null }[], matched: ReadonlySet<string>): ConflictScope {
  const inside: string[] = [], wide: string[] = [];
  let out = 0;
  for (const s of stories) {
    if (!s.incident) wide.push(s.id);
    else if (matched.has(s.incident)) inside.push(s.id);
    else out++;
  }
  return { inside, wide, out };
}

/** The filters' SQL over `incidents i` (the same columns as the incident list). */
export function incidentWhere(f: ConflictFilters): { sql: string; params: unknown[] } {
  const sql: string[] = [], params: unknown[] = [];
  if (f.zone) (sql.push("i.zone_no = ?"), params.push(f.zone));
  if (f.dept) (sql.push("i.lead_dept = ?"), params.push(f.dept));
  if (f.cat) (sql.push("i.category_code = ?"), params.push(f.cat));
  if (f.taluk) (sql.push("i.taluk_code = ?"), params.push(f.taluk));
  return { sql: sql.join(" AND ") || "1 = 1", params };
}

export async function conflictScope(stories: { id: string; incident: string | null }[], f: ConflictFilters): Promise<ConflictScope> {
  const ids = [...new Set(stories.map((s) => s.incident).filter((x): x is string => !!x))];
  if (!ids.length) return splitByIncident(stories, new Set());
  const w = incidentWhere(f);
  const [rows] = await intelPool.query<RowDataPacket[]>(`SELECT i.incident_id AS id FROM incidents i WHERE i.incident_id IN (?) AND ${w.sql}`, [ids, ...w.params]);
  return splitByIncident(stories, new Set(rows.map((r) => String(r.id))));
}
