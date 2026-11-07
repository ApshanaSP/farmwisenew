import { NextRequest, NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { flowTile } from "@/lib/rehearsal/traffic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One live traffic-flow tile over the district (TomTom, cached two minutes; the key stays on the server). Staff only. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ z: string; x: string; y: string }> }) {
  const params = await ctx.params;
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const buf = await flowTile(Number(params.z), Number(params.x), Number(params.y.replace(/\.png$/, "")));
  if (!buf) return new NextResponse(null, { status: 204 });
  return new NextResponse(buf, { headers: { "content-type": "image/png", "cache-control": "private, max-age=120" } });
}
