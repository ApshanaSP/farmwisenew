import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assistantSession } from "@/lib/assistant/access";
import { audit } from "@/lib/collector/sources";
import { exportAnswer } from "@/lib/map/ask";
import { PlanError } from "@/lib/map/execute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ plan: z.unknown(), question: z.string().max(400).nullable().default(null), format: z.enum(["csv", "geojson"]).default("csv") });

/** Ask the Map's Export: CSV or GeoJSON of exactly the answer's rows, re-run on the server; every export is audited. */
export async function POST(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Nothing to export." }, { status: 400 });
  try {
    const x = await exportAnswer(b.data.plan as never, b.data.question, { email: s.email, role: s.role, lockDept: s.lockDept }, b.data.format);
    await audit(s.email, "ask_map:export", "map_answer", null, null, { format: b.data.format, rows: x.rows, plan: b.data.plan });
    return new NextResponse(x.body, { headers: { "content-type": x.type, "content-disposition": `attachment; filename="${x.name}"`, "x-rows": String(x.rows) } });
  } catch (e) {
    if (e instanceof PlanError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[map] export failed", e);
    return NextResponse.json({ error: "The export could not be made." }, { status: 500 });
  }
}
