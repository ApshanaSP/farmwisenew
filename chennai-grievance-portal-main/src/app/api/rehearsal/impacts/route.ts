import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { RehearsalUnavailable } from "@/lib/rehearsal/engine";
import { impacts, LENSES, type Lens } from "@/lib/rehearsal/impacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Rain's Traffic, Power and Metro tabs (lib/rehearsal/impacts.ts): ?lens=traffic|power|metro. Read-only, the Collector only. */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const lens = req.nextUrl.searchParams.get("lens") as Lens;
  if (!LENSES.includes(lens)) return NextResponse.json({ error: "Ask for traffic, power or metro." }, { status: 400 });
  try {
    return NextResponse.json(await impacts(lens), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: e.status });
    return failed(e, `the rain's ${lens}`);
  }
}
