/**
 * The district's reference masters, read once from the intelligence store and cached: wards (zone, taluk, centre,
 * low-lying index), zones, taluks, incident categories and departments. The Studio places rows and links data with
 * these, so an added file speaks the same geography as the rest of the console.
 */
import type { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";

export interface WardRef { ward: number; zone: number; zoneName: string; taluk: string | null; lat: number; lon: number; lowlying: number | null; floodReports: number }
export interface ZoneRef { zone: number; name: string; lat: number; lon: number }
export interface TalukRef { code: string; name: string; nameTa: string | null; lat: number | null; lon: number | null }
export interface CategoryRef { code: string; label: string; family: string; lead: string }
export interface DeptRef { code: string; name: string; org: string }

export interface Refs {
  wards: Map<number, WardRef>;
  zones: Map<number, ZoneRef>;
  taluks: Map<string, TalukRef>;
  categories: CategoryRef[];
  depts: DeptRef[];
  /** family code -> a readable name ("FLOOD" -> "Flooding & water") */
  families: Map<string, string>;
}

const FAMILY_LABEL: Record<string, string> = {
  FLOOD: "Flooding & waterlogging", DRAINAGE: "Drainage, sewage & water supply", ROADS_TRAFFIC: "Roads & traffic", STRUCTURES_LAND: "Encroachment & unsafe structures",
  WASTE_SANITATION: "Garbage & sanitation", ELECTRICAL: "Street lights & electrical", PUBLIC_SAFETY: "Public safety & fire", HEALTH: "Health & disease",
  ENVIRONMENT: "Air pollution", GREEN: "Trees & parks", CRIME: "Crime", PUBLIC_ORDER: "Public order", WORKS: "Public works & facilities", ADMIN: "Civic services"
};

declare global {
  // eslint-disable-next-line no-var
  var __studioRefs: { at: number; refs: Refs } | undefined;
}

export async function refs(): Promise<Refs> {
  const c = global.__studioRefs;
  if (c && Date.now() - c.at < 6 * 3600_000) return c.refs;
  const q = async (sql: string) => (await intelPool.query<RowDataPacket[]>(sql))[0];
  const [wards, taluks, cats, depts] = await Promise.all([
    q(`SELECT ward_no, zone_no, zone_name, taluk_code, centroid_lat, centroid_lon, low_lying_index, flood_reports FROM ref_wards`),
    q(`SELECT taluk_code, name, name_ta, lat, lon FROM ref_taluks WHERE in_district = 1`),
    q(`SELECT category_code, label, family, lead_dept FROM ref_categories`),
    q(`SELECT code, name, org FROM ref_departments`)
  ]);
  const w = new Map<number, WardRef>();
  for (const r of wards) w.set(Number(r.ward_no), {
    ward: Number(r.ward_no), zone: Number(r.zone_no), zoneName: String(r.zone_name), taluk: r.taluk_code ?? null,
    lat: Number(r.centroid_lat), lon: Number(r.centroid_lon), lowlying: r.low_lying_index == null ? null : Number(r.low_lying_index), floodReports: Number(r.flood_reports ?? 0)
  });
  const z = new Map<number, ZoneRef>();
  const acc = new Map<number, { name: string; lat: number; lon: number; n: number }>();
  for (const x of w.values()) {
    const a = acc.get(x.zone) ?? { name: x.zoneName, lat: 0, lon: 0, n: 0 };
    a.lat += x.lat; a.lon += x.lon; a.n++;
    acc.set(x.zone, a);
  }
  for (const [no, a] of acc) z.set(no, { zone: no, name: a.name, lat: a.lat / a.n, lon: a.lon / a.n });
  const t = new Map<string, TalukRef>();
  for (const r of taluks) t.set(String(r.taluk_code), { code: String(r.taluk_code), name: String(r.name), nameTa: r.name_ta ?? null,
    lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon) });
  const categories = cats.filter((r) => r.category_code !== "OTHER")
    .map((r) => ({ code: String(r.category_code), label: String(r.label), family: String(r.family), lead: String(r.lead_dept) }));
  const families = new Map<string, string>();
  for (const cat of categories) if (!families.has(cat.family)) families.set(cat.family, FAMILY_LABEL[cat.family] ?? cat.label);
  const out: Refs = {
    wards: w, zones: z, taluks: t, categories, families,
    depts: depts.map((r) => ({ code: String(r.code), name: String(r.name), org: String(r.org ?? "") }))
  };
  global.__studioRefs = { at: Date.now(), refs: out };
  return out;
}

export const zoneName = (r: Refs, z: number | null | undefined) => (z == null ? null : r.zones.get(z)?.name ?? `Zone ${z}`);
export const talukName = (r: Refs, t: string | null | undefined) => (t == null ? null : r.taluks.get(t)?.name ?? t);
