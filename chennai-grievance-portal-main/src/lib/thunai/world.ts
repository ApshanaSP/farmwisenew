/**
 * The lists Thunai understands, on the server: zones, the departments the console knows (deptList), and the
 * categories, taluks and places of the district reference (data/gcc-reference/intel-reference.json). Read once.
 */
import fs from "fs";
import path from "path";
import { deptList } from "@/lib/collector/intel";
import { ZONE_TA_NAME } from "./lexicon";
import type { World } from "./types";

const ZONE_NAMES = ["Thiruvottiyur", "Manali", "Madhavaram", "Tondiarpet", "Royapuram", "Thiru-Vi-Ka Nagar", "Ambattur", "Anna Nagar",
  "Teynampet", "Kodambakkam", "Valasaravakkam", "Alandur", "Adyar", "Perungudi", "Sholinganallur"];

interface Ref {
  categories: { code: string; label: string }[];
  taluks: { code: string; name: string; name_ta: string; in_district: boolean }[];
  places: { name: string; zone: number | null; aliases_en?: string[]; aliases_ta?: string[] }[];
}

let ref: Ref | null = null;
function reference(): Ref {
  if (!ref) {
    const r = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "gcc-reference", "intel-reference.json"), "utf8"));
    ref = { categories: r.categories ?? [], taluks: r.taluks ?? [], places: r.places ?? [] };
  }
  return ref;
}

/** The reference part of the world (no database): categories, taluks, places. */
export function referenceWorld(): Pick<World, "cats" | "taluks" | "places"> {
  const r = reference();
  return {
    cats: r.categories.map((c) => ({ code: c.code, label: c.label })),
    taluks: r.taluks.filter((t) => t.in_district).map((t) => ({ code: t.code, name: t.name, ta: t.name_ta })),
    places: r.places.map((p) => ({ name: p.name, aliases: [...(p.aliases_en ?? []), ...(p.aliases_ta ?? [])], zone: p.zone }))
  };
}

export async function serverWorld(): Promise<World> {
  const depts = await deptList().catch(() => []);
  return {
    zones: ZONE_NAMES.map((name, i) => ({ n: i + 1, name, ta: ZONE_TA_NAME[i + 1] ?? null })),
    depts: depts.map((d: { code: string; name: string }) => ({ code: d.code, name: d.name })),
    ...referenceWorld(),
    reservoirs: []
  };
}
