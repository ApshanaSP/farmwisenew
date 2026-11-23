import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { createDashboard, listSummaries, summaryOf } from "@/lib/studio/dashboards";
import { note } from "@/lib/studio/http";
import { Name, answerError } from "./schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The Collector's named dashboards, newest first: each one's name, tile count and the datasets it draws on. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ dashboards: await listSummaries() });
  } catch (err) {
    return answerError(err, "your dashboards");
  }
}

// a name, a dataset, or both (the older page's { id, on } is refused rather than read as an empty new dashboard)
const Body = z.object({ name: Name.optional().nullable(), datasetId: z.string().max(40).optional().nullable() })
  .refine((b) => !!(b.name?.trim() || b.datasetId));

/** A new dashboard ({ name }), or one filled with a dataset's summary, numbers, findings and charts ({ name, datasetId }). */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "Give the dashboard a name (up to 80 characters)." }, { status: 400 });
  try {
    const d = await createDashboard(b.data.name, b.data.datasetId ?? null);
    await note(s.email, "studio:dashboard-create", d.id, { name: d.name, from: b.data.datasetId ?? null, tiles: d.tiles.length });
    return NextResponse.json({ dashboard: summaryOf(d) });
  } catch (err) {
    return answerError(err, "the dashboard");
  }
}
