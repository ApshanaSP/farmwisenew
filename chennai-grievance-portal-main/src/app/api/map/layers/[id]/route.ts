import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { world } from "@/lib/map/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The layers the map's Layers menu can switch on (roads stay on the server: only an answer's own road is sent). */
const TOGGLEABLE = new Set(["schools", "colleges", "hospitals", "fire_stations", "police", "water_bodies", "waterways", "rail_metro", "lakes_store", "gauges"]);

/** One facility or water layer, inside the district box (+3 km), with an ETag so the browser re-uses it. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  if (!TOGGLEABLE.has(params.id)) return NextResponse.json({ error: "No such layer." }, { status: 404 });
  const { world: w } = await world();
  const id = params.id;
  const body = id === "water_bodies"
    ? { id, kind: "polygon", meta: w.meta[id] ?? null, features: w.water.map((f) => ({ id: f.id, name: f.name, name_ta: f.name_ta, kind: f.kind, polys: f.polys, in_district: f.in_district })) }
    : id === "waterways"
      ? { id, kind: "line", meta: w.meta[id] ?? null, features: w.lines.waterways.map((l) => ({ id: l.id, name: l.name, name_ta: l.name_ta, kind: l.kind, lines: l.lines, in_district: l.in_district })) }
      : { id, kind: "point", meta: w.meta[id] ?? null, features: ((w.points as Record<string, { id: string; name: string | null; name_ta: string | null; lat: number; lon: number; kind: string; government?: boolean; in_district: boolean }[]>)[id] ?? [])
        .map((p) => ({ id: p.id, name: p.name, name_ta: p.name_ta, lat: p.lat, lon: p.lon, kind: p.kind, government: !!p.government, in_district: p.in_district })) };
  const json = JSON.stringify(body);
  const etag = `"${crypto.createHash("sha1").update(json).digest("hex").slice(0, 20)}"`;
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  return new NextResponse(json, { headers: { "content-type": "application/json", ETag: etag, "cache-control": "private, max-age=600" } });
}
