import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { removeSource, runSource, updateSource } from "@/lib/collector/sources";
import { parseStoreId } from "@/lib/store-id";
import { requireConfirm } from "@/lib/security/stepup";

export const dynamic = "force-dynamic";

/** A source id as the store numbers them; anything else is refused before it reaches a query. */
const sourceId = parseStoreId;
const invalid = () => NextResponse.json({ error: "Invalid source id." }, { status: 400 });
const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  refreshMinutes: z.number().int().min(15).max(1440).optional()
}).refine((b) => b.enabled !== undefined || b.refreshMinutes !== undefined, { message: "Say what to change." });

/** POST: run the source now. PATCH: pause/resume or change the refresh interval. DELETE: remove an added source. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const id = sourceId(params.id);
  if (id == null) return invalid();
  try {
    return NextResponse.json(await runSource(id, s.email));
  } catch (err: any) {
    if (/not found/i.test(err?.message)) return NextResponse.json({ error: err.message }, { status: 404 });
    return failed(err, "the source run");
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const id = sourceId(params.id);
  if (id == null) return invalid();
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change." }, { status: 400 });
  // pausing a source or changing how often it is fetched takes data out of the Collector's picture, so it asks "Confirm it's you" as
  // approving a source does (QA4 gate, redteam-final-12); turning one back on needs no confirmation
  if (parsed.data.enabled === false || parsed.data.refreshMinutes !== undefined) {
    const what = parsed.data.enabled === false ? "Pause" : "Change how often";
    const c = await requireConfirm(req, s, "change_source", `${what} data source ${id}`, { id, ...parsed.data });
    if (!c.ok) return c.res;
  }
  try {
    await updateSource(id, parsed.data, s.email);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (/not found/i.test(err?.message)) return NextResponse.json({ error: err.message }, { status: 404 });
    return failed(err, "the source");
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const id = sourceId(params.id);
  if (id == null) return invalid();
  const c = await requireConfirm(req, s, "change_source", `Remove data source ${id}`, { id, remove: true });
  if (!c.ok) return c.res;
  try {
    await removeSource(id, s.email);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (/not found/i.test(err?.message)) return NextResponse.json({ error: err.message }, { status: 404 });
    if (/built-in/i.test(err?.message)) return NextResponse.json({ error: err.message }, { status: 400 });
    return failed(err, "the source");
  }
}
