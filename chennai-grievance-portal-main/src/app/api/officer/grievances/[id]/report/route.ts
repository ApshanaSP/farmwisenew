import { createHash } from "crypto";
import { readFormCapped } from "@/lib/body-cap";
import { NextRequest, NextResponse } from "next/server";
import { requireConfirm } from "@/lib/security/stepup";
import { ID_RE, officerSession } from "@/lib/officer/guard";
import { WorkflowError, grievanceDetail, recordStep } from "@/lib/officer/data";
import { OFFICER } from "@/lib/officer/departments";
import { newPhotoDir, removePhotoDir, savePhotos, sniff, type PhotoExt } from "@/lib/officer/photos";
import { stepRefusal } from "@/lib/officer/stages";

export const dynamic = "force-dynamic";

/**
 * Completion report: remarks plus at least one photo of the finished work (multipart form: `remarks`, `photos`
 * repeated, `step`). A severe grievance is sent to the Collector for verification (`step=send`, "Sent to
 * Collector"); any other is closed by the department itself (`step=close`, "Verified").
 */
export async function POST(req: NextRequest, routeCtx: { params: Promise<{ id: string }> }) {
  const params = await routeCtx.params;
  const ctx = await officerSession(req.nextUrl.searchParams, { write: true });
  if (ctx instanceof NextResponse) return ctx;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: "Invalid grievance id." }, { status: 400 });
  // the case first: another department's case, or one at the wrong stage or severity, is refused before anything is read or any
  // password is asked (officer-day-16). recordStep checks again under its lock.
  const detail = await grievanceDetail(ctx.dept, params.id).catch((err) => { console.error("officer report: case check failed", err); return undefined; });
  if (detail === undefined) return NextResponse.json({ error: "Could not send the report." }, { status: 500 });
  if (!detail) return NextResponse.json({ error: "Grievance not found in your department." }, { status: 404 });

  // every photo at its limit plus the remarks: a larger request is refused before it is read into memory (officer-day-25)
  const { form, tooLarge } = await readFormCapped(req, OFFICER.maxPhotos * OFFICER.maxPhotoBytes + 64 * 1024);
  if (tooLarge) return NextResponse.json({ error: `Attach at most ${OFFICER.maxPhotos} photos of ${OFFICER.maxPhotoBytes / 1024 / 1024} MB or smaller.` }, { status: 413 });
  if (!form) return NextResponse.json({ error: "Send the report as a form with remarks and photos." }, { status: 400 });
  const remarks = String(form.get("remarks") ?? "").trim();
  if (remarks.length < OFFICER.minRemarks) return NextResponse.json({ error: "Write remarks describing the work done." }, { status: 400 });
  if (remarks.length > OFFICER.maxRemarks) return NextResponse.json({ error: `Keep the remarks under ${OFFICER.maxRemarks} characters.` }, { status: 400 });

  const files = form.getAll("photos").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) return NextResponse.json({ error: "Attach at least one photo of the completed work." }, { status: 400 });
  if (files.length > OFFICER.maxPhotos) return NextResponse.json({ error: `Attach at most ${OFFICER.maxPhotos} photos.` }, { status: 400 });
  const photos: { buf: Buffer; ext: PhotoExt }[] = [];
  for (const f of files) {
    if (f.size > OFFICER.maxPhotoBytes) return NextResponse.json({ error: `Each photo must be ${OFFICER.maxPhotoBytes / 1024 / 1024} MB or smaller.` }, { status: 400 });
    const buf = Buffer.from(await f.arrayBuffer());
    const ext = sniff(buf);
    if (!ext) return NextResponse.json({ error: "Photos must be JPG, PNG or WebP images." }, { status: 400 });
    photos.push({ buf, ext });
  }

  const step = form.get("step") === "close" ? "close" : "send";
  const refusal = stepRefusal(step, String(detail.grievance.stage), detail.grievance.sev as string | null);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  // closing a case, or sending it to the Collector, is confirmed for exactly these remarks and photos
  const c = await requireConfirm(req, ctx.session, "officer_report", step === "close" ? `Close case ${params.id} with your report` : `Send case ${params.id} to the Collector for verification`,
    { id: params.id, step, remarks, photos: photos.map((x) => createHash("sha256").update(x.buf).digest("hex")) });
  if (!c.ok) return c.res;
  const dir = newPhotoDir();
  try {
    const names = await savePhotos(dir, photos);
    const r = await recordStep(ctx.dept, params.id, step, { email: ctx.session.email, userId: ctx.session.userId },
      { remarks, photoDir: dir, photos: names });
    return NextResponse.json(r, { status: 201 });
  } catch (err) {
    await removePhotoDir(dir).catch(() => undefined);
    if (err instanceof WorkflowError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("officer report failed", err);
    return NextResponse.json({ error: "Could not send the report." }, { status: 500 });
  }
}
