import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { manuFailed, manuStaff } from "@/lib/manu/guard";
import { FileError, deletePage, deletePetition, fileSchema, filePetition, getPetition, petitionDetail, readAgain, wardName } from "@/lib/manu/petitions";
import { findRepeats } from "@/lib/manu/repeat";

export const dynamic = "force-dynamic";

const idOf = (p: { id: string }) => { const n = Number(p.id); return Number.isInteger(n) && n > 0 ? n : null; };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await manuStaff();
  if (s instanceof NextResponse) return s;
  const id = idOf(params);
  if (!id) return NextResponse.json({ error: "Invalid petition." }, { status: 400 });
  try {
    const d = await petitionDetail(id);
    return d ? NextResponse.json(d, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Petition not found." }, { status: 404 });
  } catch (err) { return manuFailed(err, "load the petition"); }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }),
  z.object({ action: z.literal("delete") }),
  z.object({ action: z.literal("delete_page"), page: z.number().int().min(0).max(19) }),
  z.object({ action: z.literal("repeats"), mobile: z.string().max(20), name: z.string().max(120), street: z.string().max(200), ward: z.number().int().nullable(), dept: z.string().max(20), problem: z.string().max(400) }),
  z.object({ action: z.literal("file"), fields: fileSchema })
]);

/** Everything done to one petition: read it again, check it for repeats, delete it or one of its pages, or approve it. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await manuStaff();
  if (s instanceof NextResponse) return s;
  const id = idOf(params);
  if (!id) return NextResponse.json({ error: "Invalid petition." }, { status: 400 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the details." }, { status: 400 });
  const a = parsed.data;
  try {
    if (a.action === "read") return (await readAgain(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This petition cannot be read again." }, { status: 409 });
    if (a.action === "delete") return (await deletePetition(id, s.session.email)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This petition cannot be deleted. Once approved, it is a complaint with the department." }, { status: 409 });
    if (a.action === "delete_page") return (await deletePage(id, a.page, s.session.email)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That page cannot be deleted just now." }, { status: 409 });
    if (a.action === "repeats") {
      // only for a petition on the desk: not a free number lookup with any id (QA pass 5, P5-014)
      const p = await getPetition(id);
      if (!p) return NextResponse.json({ error: "Petition not found." }, { status: 404 });
      // and only while it is being checked: an approved petition needs no repeat check, and the check is a lookup by any mobile typed
      // into the request (QA pass 6, P5-039)
      if (!["needs_check", "read_failed", "reading"].includes(String(p.status))) return NextResponse.json({ error: "This petition is already approved." }, { status: 409 });
      const repeats = await findRepeats({ mobile: a.mobile, name: a.name, street: a.street, ward: a.ward, dept: a.dept, problem: a.problem, excludeId: id });
      return NextResponse.json({ repeats, zone: await wardName(a.ward) });
    }
    return NextResponse.json({ approved: await filePetition(id, a.fields, s.session.email) });
  } catch (err) {
    if (err instanceof FileError) return NextResponse.json({ error: err.message }, { status: 400 });
    return manuFailed(err, "do that");
  }
}
