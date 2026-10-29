import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { pastRains, RehearsalUnavailable } from "@/lib/rehearsal/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Past heavy rains for the Collector's map: each rain with its flooding reports, each report tied to the flood street
 * it stood on. Read-only; recomputed once an hour with the flood memory.
 */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(await pastRains(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    return failed(e, "the past rains");
  }
}
