import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { deleteDashboard, getDashboard, renameDashboard, renderDashboard, setLayout, validDashId } from "@/lib/studio/dashboards";
import { MAX_TILES } from "@/lib/studio/dashtypes";
import { note } from "@/lib/studio/http";
import { LayoutItemSchema, Name, answerError } from "../schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ did: string }> };
const unknown = () => NextResponse.json({ error: "Unknown dashboard." }, { status: 404 });

/** The dashboard with every tile computed from its dataset's latest rows. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { did } = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!validDashId(did)) return unknown();
  try {
    const d = await getDashboard(did);
    if (!d) return unknown();
    return NextResponse.json({ dashboard: await renderDashboard(d) });
  } catch (err) {
    return answerError(err, "the dashboard");
  }
}

// a drag sends every tile's place; twice the cap leaves room for a page that still holds a tile just removed
const Patch = z.union([
  z.object({ name: Name }),
  z.object({ layout: z.array(LayoutItemSchema).max(MAX_TILES * 2) })
]);

/** Rename ({ name }) or save the tiles' places after a drag or resize ({ layout }); the tiles themselves are never replaced. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { did } = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!validDashId(did)) return unknown();
  const b = Patch.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "Send a new name, or the tiles' places." }, { status: 400 });
  try {
    if ("name" in b.data) {
      await renameDashboard(did, b.data.name);
      await note(s.email, "studio:dashboard-rename", did, { name: b.data.name.trim().slice(0, 80) });
    } else {
      // positions only: too frequent and too slight to fill the audit log
      await setLayout(did, b.data.layout);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return answerError(err, "the dashboard");
  }
}

/** Delete the dashboard; the datasets its tiles came from are kept. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { did } = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!validDashId(did)) return unknown();
  try {
    const d = await deleteDashboard(did);
    await note(s.email, "studio:dashboard-delete", did, { name: d.name, tiles: d.tiles.length });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return answerError(err, "the dashboard");
  }
}
