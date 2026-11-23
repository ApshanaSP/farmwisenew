import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { addDataset, addTiles, summaryOf, validDashId } from "@/lib/studio/dashboards";
import type { NewTile } from "@/lib/studio/dashtypes";
import { note } from "@/lib/studio/http";
import { TilesBody, answerError } from "../../schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ did: string }> };

/**
 * Add tiles ({ tiles }: a number, a chart, a finding or a summary each), or a whole dataset ({ datasetId }: its summary,
 * numbers, findings and charts). New tiles go below what is already there.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { did } = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!validDashId(did)) return NextResponse.json({ error: "Unknown dashboard." }, { status: 404 });
  const b = TilesBody.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "Choose what to add: a chart, a number, a finding, or a whole dataset." }, { status: 400 });
  try {
    const r = "datasetId" in b.data ? await addDataset(did, b.data.datasetId) : await addTiles(did, b.data.tiles as NewTile[]);
    const from = [...new Set(r.dashboard.tiles.filter((t) => r.added.includes(t.id)).map((t) => t.datasetId))];
    await note(s.email, "studio:dashboard-add", did, { name: r.dashboard.name, added: r.added.length, from, whole: "datasetId" in b.data });
    return NextResponse.json({ dashboard: summaryOf(r.dashboard), added: r.added });
  } catch (err) {
    return answerError(err, "the dashboard");
  }
}
