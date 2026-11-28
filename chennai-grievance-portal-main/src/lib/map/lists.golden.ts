/**
 * Ask the Map lists the places themselves (owner, 28 Nov 2026: "if I ask to list the names of the schools or colleges, it's not listing").
 * On the frozen store, asked as the console asks (askMap, rules only, no AI): each list question's answer names every place it counts, in
 * order, and the set equals a brute-force pick from the layer file written here (plain loops, haversine; no shared code but haversineM).
 * Also: the layers hold only checked places (no coaching centre among the colleges, no pre-school among the schools), and the fire
 * stations' answer names the official stations OpenStreetMap does not map, without drawing them.
 */
import fs from "fs";
import path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import { haversineM } from "./geom";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});

const COLLECTOR = { email: "golden@test", role: "collector" as const, lockDept: null };
const CTX = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
let askMap: typeof import("./ask").askMap;
const ask = (text: string) => askMap({ text, plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });

type F = { id: string; name: string | null; kind: string; ward: number | null; in_district: boolean; lat: number; lon: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const layer = (id: string): F[] => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "layers", `${id}.geojson`), "utf8")).features.map((f: any) => ({
  id: f.properties.id, name: f.properties.name ?? null, kind: f.properties.kind, ward: f.properties.ward ?? null, in_district: !!f.properties.in_district,
  lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
const zoneWards = (zone: number): Set<number> => new Set(JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "boundaries", "gcc-wards.geojson"), "utf8")).features
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .filter((f: any) => Number(f.properties.zone_number) === zone).map((f: any) => Number(f.properties.ward_no)));
const sorted = (xs: string[]) => [...xs].sort();

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  askMap = (await import("./ask")).askMap;
}, 300_000);

describe.skipIf(!haveStore())("Ask the Map lists the places by name", () => {
  it("'list the names of schools in Valasaravakkam': every school of Valasaravakkam zone, named, by name, and the count is the list's", async () => {
    const r = await ask("list the names of schools in Valasaravakkam");
    expect(r.kind).toBe("answer");
    const inside = r.plan!.steps.find((s) => s.op === "inside");
    expect(inside?.op === "inside" && inside.area).toEqual({ kind: "zone", id: 11 });
    const wards = zoneWards(11);
    const want = layer("schools").filter((f) => f.ward != null && wards.has(f.ward)).map((f) => f.id);
    expect(want.length).toBeGreaterThan(0);
    expect(r.extra.places?.total).toBe(want.length);
    expect(r.answer!.count).toBe(want.length);
    expect(sorted(r.context.points.map((p) => p.id))).toEqual(sorted(want));
    expect(r.extra.places?.order).toBe("name");
    const names = r.context.points.filter((p) => p.name).map((p) => p.name!.toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    // each row has its place on the map and its ward
    for (const p of r.context.points) { expect(p.ward != null && wards.has(p.ward)).toBe(true); expect(Number.isFinite(p.lat) && Number.isFinite(p.lon)).toBe(true); }
  });

  it("'names of colleges in Adyar zone': every college of zone 13, with no coaching centre or campus building among them", async () => {
    const r = await ask("names of colleges in Adyar zone");
    expect(r.kind).toBe("answer");
    const wards = zoneWards(13);
    const want = layer("colleges").filter((f) => f.ward != null && wards.has(f.ward)).map((f) => f.id);
    expect(sorted(r.context.points.map((p) => p.id))).toEqual(sorted(want));
    expect(r.extra.places?.total).toBe(want.length);
    for (const p of r.context.points) expect(p.name ?? "").not.toMatch(/coaching|tnpsc|\bias\b|neet|exam|department of|lecture hall|\bblock\b|hostel|research centre|NIIT/i);
    expect(r.extra.places?.matched).toBeGreaterThan(0);
    expect(r.context.points.filter((p) => p.official).length).toBe(r.extra.places?.matched);
  });

  it("'list hospitals near Egmore': hospitals and health centres (no clinics) within the radius, nearest first, each with its distance", async () => {
    const r = await ask("list hospitals near Egmore");
    expect(r.kind).toBe("answer");
    const inside = r.plan!.steps.find((s) => s.op === "inside");
    expect(inside?.op).toBe("inside");
    const area = inside!.op === "inside" ? inside!.area : null;
    expect(area?.kind).toBe("point");
    const circle = r.context.areas.find((a) => a.circle)?.circle;
    expect(circle).toBeTruthy();
    const want = layer("hospitals").filter((f) => (f.kind === "hospital" || f.kind === "health_centre") && haversineM({ lat: circle!.lat, lon: circle!.lon }, f) <= circle!.r).map((f) => f.id);
    expect(want.length).toBeGreaterThan(0);
    expect(sorted(r.context.points.map((p) => p.id))).toEqual(sorted(want));
    expect(r.extra.places?.order).toBe("nearest");
    const d = r.context.points.map((p) => p.dist!);
    expect(d.every((x) => x != null && x <= circle!.r)).toBe(true);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(r.context.points.some((p) => p.kind === "clinic")).toBe(false);
  });

  it("'show all fire stations': every station on the map, and the official ones with no map point named apart, never drawn", async () => {
    const r = await ask("show all fire stations");
    expect(r.kind).toBe("answer");
    const all = layer("fire_stations");
    expect(sorted(r.context.points.map((p) => p.id))).toEqual(sorted(all.map((f) => f.id)));
    expect(r.extra.places?.total).toBe(all.length);
    expect(r.extra.places?.inside).toBe(all.filter((f) => f.in_district).length);
    // the headline says how many are in the district and how many just outside (the layers hold a 3 km band around it)
    const inside = all.filter((f) => f.in_district).length;
    if (inside < all.length) expect(r.answer!.headline).toBe(`${all.length} fire stations: ${inside} in Chennai district and ${all.length - inside} just outside it.`);
    const un = r.extra.places?.unmapped ?? [];
    expect(un.length).toBeGreaterThan(0);
    // a station on the map is not also named as one with no map point
    const mapped = new Set(r.context.points.map((p) => (p.name ?? "").toLowerCase()));
    for (const x of un) expect(mapped.has(x.toLowerCase())).toBe(false);
    expect(r.extra.places?.sources.some((s) => /tnfrs\.tn\.gov\.in/.test(s.url ?? ""))).toBe(true);
  });

  it("asked in Tamil, the same list comes, named", async () => {
    const r = await ask("வளசரவாக்கத்தில் உள்ள பள்ளிகளின் பெயர்கள்");
    expect(r.kind).toBe("answer");
    expect(r.extra.places?.layer).toBe("schools");
    expect(r.context.points.length).toBe(r.extra.places?.total);
    expect(r.context.points.length).toBeGreaterThan(0);
  });

  it("a list of cases is not a list of places: 'open complaints near schools in Adyar' keeps its cases", async () => {
    const r = await ask("open complaints near schools in Adyar");
    expect(r.kind).toBe("answer");
    expect(r.extra.places).toBeUndefined();
  });
});

describe("the checked layers hold only the kind of place they say", () => {
  it("schools: no pre-school, coaching centre or college; colleges: no coaching, training or research centre, no campus building", () => {
    for (const f of layer("schools")) {
      const n = f.name ?? "";
      expect(n).not.toMatch(/play ?school|pre ?-?school|kidzee|coaching|tuition/i);
      // a college mapped as a school left the layer; "... School and Junior College" is a school
      if (/\bcollege\b/i.test(n)) expect(n).toMatch(/\b(schools?|junior college|vidh?yalaya)\b/i);
    }
    for (const f of layer("colleges")) expect(f.name ?? "").not.toMatch(/coaching|tnpsc|neet|\bias\b|industrial training|lecture hall|^department of|hostel|hangar|mathematical sciences|leather research/i);
  });
  it("hospitals: no pharmacy, laboratory, scan centre or veterinary clinic that names no treatment; every place has a kind", () => {
    for (const f of layer("hospitals")) {
      expect(["hospital", "clinic", "health_centre"]).toContain(f.kind);
      if (!/hospital|clinic|nursing home|health (centre|center)|medical (centre|center|mission|college)|surgical/i.test(f.name ?? "")) expect(f.name ?? "").not.toMatch(/\b(pharmacy|labs?|laboratory|scans?|diagnostics?)\b/i);
      expect(f.name ?? "").not.toMatch(/veterinary|\bpet\b/i);
    }
  });
  it("rail and metro: no bus stand, and no metro station still being built", () => {
    const rail = layer("rail_metro");
    expect(rail.some((f) => f.kind === "bus")).toBe(false);
    expect(rail.some((f) => /Sholinganallur Metro|Boat Club Metro|Madhavaram Milk Colony/.test(f.name ?? ""))).toBe(false);
    // Chennai Central, the long-distance terminal, stays beside the suburban one
    expect(rail.some((f) => /Ramachandran Central/.test(f.name ?? "") && f.kind === "rail")).toBe(true);
  });
});
