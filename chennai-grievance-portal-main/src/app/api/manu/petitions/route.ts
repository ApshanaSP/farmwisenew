import { NextRequest, NextResponse } from "next/server";
import { MANU_LIMITS } from "@/lib/manu/constants";
import { UploadError, savePages } from "@/lib/manu/files";
import { manuFailed, manuStaff } from "@/lib/manu/guard";
import { createPetition, deskList } from "@/lib/manu/petitions";

export const dynamic = "force-dynamic";

/** What the desk shows: waiting to be read or checked, and the last week's filed petitions. */
export async function GET() {
  const s = await manuStaff();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ items: await deskList() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) { return manuFailed(err, "load the petitions"); }
}

/** One petition's photos (one or more pages): saved, then read in the background. */
export async function POST(req: NextRequest) {
  const s = await manuStaff();
  if (s instanceof NextResponse) return s;
  if (Number(req.headers.get("content-length")) > MANU_LIMITS.maxRequestBytes) return NextResponse.json({ error: "Those files are too large to send at once." }, { status: 413 });
  try {
    const form = await req.formData();
    const files = form.getAll("pages").filter((f): f is File => typeof f !== "string");
    if (!files.length) return NextResponse.json({ error: "Choose at least one photo of the petition." }, { status: 400 });
    const pages = await savePages(await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()))));
    const id = await createPetition({ pages, uploadedBy: s.session.userId, uploadedEmail: s.session.email });
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: 400 });
    return manuFailed(err, "save the petition");
  }
}
