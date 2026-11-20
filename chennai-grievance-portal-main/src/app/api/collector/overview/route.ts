import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { jsonWithEtag } from "@/lib/etag";
import { asOf, exportMeta, overview, parseCat, parseDept, parsePeriod, parseTaluk, parseZone } from "@/lib/collector/intel";
import { refuseBadFilter } from "@/lib/collector/filters";
import { liveMeta } from "@/lib/live/state";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  try {
    // ?meta=1: a cheap check the console polls to learn that the pipeline published new data.
    // (Source and Data Studio refreshes run on the server's own schedule, lib/scheduler.ts, not from reads.)
    if (p.get("meta")) {
      const [now, meta] = await Promise.all([asOf(), exportMeta()]);
      // live: the live lane's version (lib/live/state.ts), which moves when a live IMD warning or news report arrives
      return NextResponse.json({ now, exportedAt: meta.exported_at ?? null, live: liveMeta() });
    }
    return jsonWithEtag(req, await overview(parsePeriod(p.get("period")), parseZone(p.get("zone")), parseDept(p.get("dept")),
      { cat: parseCat(p.get("cat")), taluk: parseTaluk(p.get("taluk")) }), { "Cache-Control": "private, no-cache" });
  } catch (err) {
    return failed(err, "the overview");
  }
}
