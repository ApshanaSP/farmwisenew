import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { removeTile, renameTile, validDashId, validTileId } from "@/lib/studio/dashboards";
import { note } from "@/lib/studio/http";
import { answerError } from "../../../schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ did: string; tid: string }> };

const bad = async (ctx: Ctx) => {
  const { did, tid } = await ctx.params;
  if (!validDashId(did)) return { res: NextResponse.json({ error: "Unknown dashboard." }, { status: 404 }), did, tid };
  if (!validTileId(tid)) return { res: NextResponse.json({ error: "Unknown tile." }, { status: 404 }), did, tid };
  return { res: null, did, tid };
};

const Body = z.object({ title: z.string().max(200).nullable() });

/** A tile's own title ({ title }); an empty one goes back to the chart's or finding's own. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const { res, did, tid } = await bad(ctx);
  if (res) return res;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "Give the tile a title (or leave it empty for its own)." }, { status: 400 });
  try {
    await renameTile(did, tid, b.data.title);
    await note(s.email, "studio:dashboard-tile-rename", did, { tile: tid, title: b.data.title?.trim().slice(0, 120) || null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return answerError(err, "the tile");
  }
}

/** Take the tile off the dashboard (its dataset is kept). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const { res, did, tid } = await bad(ctx);
  if (res) return res;
  try {
    const t = await removeTile(did, tid);
    await note(s.email, "studio:dashboard-tile-remove", did, { tile: tid, kind: t.kind, from: t.datasetId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return answerError(err, "the tile");
  }
}
