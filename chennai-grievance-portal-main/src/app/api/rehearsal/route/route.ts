import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActivePortalSession } from "@/lib/auth";
import { failed } from "@/lib/collector/guard";
import { RehearsalUnavailable, routeBetween } from "@/lib/rehearsal/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Pt = z.object({ lat: z.number().min(12.5).max(13.6), lon: z.number().min(79.9).max(80.6) });
const Body = z.object({ from: Pt, to: Pt, state: z.enum(["normal", "rehearsal"]).default("rehearsal"), replay: z.string().regex(/^rain-\d{4}-\d{2}-\d{2}$/).nullable().default(null) });

/** A drive route between two points on normal or rehearsal roads (the Collector or a department officer). */
export async function POST(req: NextRequest) {
  const s = (await getActivePortalSession("collector")) ?? (await getActivePortalSession("officer"));
  if (!s || (s.role !== "collector" && s.role !== "department_officer")) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Give two places in Chennai." }, { status: 400 });
  try {
    const r = await routeBetween(b.data.from, b.data.to, b.data.state, { replay: b.data.replay });
    if (!r) return NextResponse.json({ error: "One of the places is too far from a road." }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    return failed(e, "the route");
  }
}
