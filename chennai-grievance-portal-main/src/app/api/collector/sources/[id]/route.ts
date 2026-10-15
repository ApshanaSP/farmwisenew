import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { removeSource, runSource, updateSource } from "@/lib/collector/sources";

export const dynamic = "force-dynamic";

/** A source id as the store numbers them; anything else is refused before it reaches a query. */
const sourceId = (raw: string): number | null => (/^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null);
const invalid = () => NextResponse.json({ error: "Invalid source id." }, { status: 400 });
const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  refreshMinutes: z.number().int().min(15).max(1440).optional()
}).refine((b) => b.enabled !== undefined || b.refreshMinutes !== undefined, { message: "Say what to change." });

/** POST: run the source now. PATCH: pause/resume or change the refresh interval. DELETE: remove an added source. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const id = sourceId(params.id);
  if (id == null) return invalid();
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change." }, { status: 400 });
  try {
    await updateSource(id, parsed.data, s.email);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (/not found/i.test(err?.message)) return NextResponse.json({ error: err.message }, { status: 404 });
    return failed(err, "the source");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const id = sourceId(params.id);
  if (id == null) return invalid();
  try {
    await removeSource(id, s.email);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (/not found/i.test(err?.message)) return NextResponse.json({ error: err.message }, { status: 404 });
    if (/built-in/i.test(err?.message)) return NextResponse.json({ error: err.message }, { status: 400 });
    return failed(err, "the source");
  }
}
