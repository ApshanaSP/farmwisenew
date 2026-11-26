/**
 * The lists Thunai understands, on the server: zones, the departments the console knows (deptList), and the
 * categories, taluks and places of the district reference (data/gcc-reference/intel-reference.json). Read once.
 */
import fs from "fs";
import path from "path";
import { bodyList, deptList } from "@/lib/collector/intel";
import { KNOWN_DEPTS } from "./knowndepts";
import { ZONE_TA_NAME } from "./lexicon";
import type { World } from "./types";

const ZONE_NAMES = ["Thiruvottiyur", "Manali", "Madhavaram", "Tondiarpet", "Royapuram", "Thiru-Vi-Ka Nagar", "Ambattur", "Anna Nagar",
  "Teynampet", "Kodambakkam", "Valasaravakkam", "Alandur", "Adyar", "Perungudi", "Sholinganallur"];

interface Ref {
  categories: { code: string; label: string; lead?: string }[];
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

/** Each category's lead department, from the district reference. */
export function referenceLeads(): Record<string, string> {
  return Object.fromEntries(reference().categories.filter((c) => c.lead).map((c) => [c.code, c.lead as string]));
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

let worldCache: { at: number; w: World } | null = null;
let worldLoading: Promise<World> | null = null;
const readWorld = (): Promise<World> => (worldLoading ??= (async () => {
  try {
    const [depts, bodies] = await Promise.all([deptList().catch(() => null), bodyList().catch(() => null)]);
    // (a read that failed, or came back with nothing, never leaves the world without its departments: "police" would be dropped from the question)
    if (!depts?.length) console.warn("[jarvis world] the departments could not be read; the reference list is used");
    const w = { ...buildWorld(depts?.length ? depts : [...KNOWN_DEPTS]), ...(bodies?.length ? { bodies: bodies.map((b) => ({ code: b.code, name: b.name })) } : {}) };
    if (depts?.length) worldCache = { at: Date.now(), w };
    return w;
  } finally { worldLoading = null; }
})());
/**
 * the departments change only with a new collection: read once a minute, not on every round of every question.
 * v15 (22 Nov): stale while it is read again. A question that came after the minute waited for the department and body lists behind
 * whatever held the store's queue (the owner's 23:16:02 and 23:17:55 questions had no server event for 17-18 s); the last world answers it
 * now and the next is read in the background. Only the very first read (no world yet) is waited for.
 */
export async function serverWorld(): Promise<World> {
  if (worldCache) {
    if (Date.now() - worldCache.at >= 60_000) void readWorld().catch(() => undefined);
    return worldCache.w;
  }
  return readWorld();
}
function buildWorld(depts: { code: string; name: string }[]): World {
  return {
    zones: ZONE_NAMES.map((name, i) => ({ n: i + 1, name, ta: ZONE_TA_NAME[i + 1] ?? null })),
    depts: depts.map((d: { code: string; name: string }) => ({ code: d.code, name: d.name })),
    ...referenceWorld(),
    reservoirs: []
  };
}
