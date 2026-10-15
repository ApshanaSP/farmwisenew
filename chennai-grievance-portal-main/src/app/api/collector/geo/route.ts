import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { jsonWithEtag } from "@/lib/etag";
import { mapGeo } from "@/lib/collector/geo";

export const dynamic = "force-dynamic";

/** Ward and zone outlines in lat/lon for the satellite map. */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    // the outlines never change while the server runs: a day in the browser, then a cheap 304
    return jsonWithEtag(req, await mapGeo(), { "Cache-Control": "private, max-age=86400" });
  } catch (err) {
    return failed(err, "the map outlines");
  }
}
