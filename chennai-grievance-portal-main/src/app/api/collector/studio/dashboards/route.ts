import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { note } from "@/lib/studio/http";
import { allDashboards, simpleDash } from "@/lib/studio/simpledash";
import { getDashboards, getMeta, saveDashboards, validId } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

/** The simple dashboards the Collector added from the Studio ("Add to dashboard"), each computed from its latest rows. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ dashboards: await allDashboards() });
  } catch (err) {
    return failed(err, "your dashboards");
  }
}

const Body = z.object({ id: z.string().max(40), on: z.boolean() });

/** Add a dataset as a dashboard of its own ({ id, on: true }), or take it off ({ id, on: false }). */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success || !validId(b.data.id)) return NextResponse.json({ error: "Unknown dataset." }, { status: 400 });
  const meta = getMeta(b.data.id);
  if (!meta) return NextResponse.json({ error: "Unknown dataset." }, { status: 404 });
  try {
    const rest = getDashboards().filter((x) => x.datasetId !== meta.id);
    if (!b.data.on) {
      saveDashboards(rest);
      await note(s.email, "studio:dashboard-remove", meta.id, { name: meta.name });
      return NextResponse.json({ ok: true, ids: rest.map((x) => x.datasetId) });
    }
    const at = new Date().toISOString();
    const list = [{ datasetId: meta.id, at }, ...rest];
    saveDashboards(list);
    await note(s.email, "studio:dashboard-add", meta.id, { name: meta.name });
    return NextResponse.json({ ok: true, ids: list.map((x) => x.datasetId), dashboard: await simpleDash(meta.id, at) });
  } catch (err) {
    return failed(err, "the dashboard");
  }
}
