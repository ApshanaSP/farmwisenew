import { NextRequest, NextResponse } from "next/server";
import { failed, fresh, officerSession } from "@/lib/officer/guard";
import { newPhotoDir, removePhotoDir, savePhotos, sniff, type PhotoExt } from "@/lib/officer/photos";
import { OFFICER } from "@/lib/officer/departments";
import { markDone, readTasks } from "@/lib/rehearsal/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A department officer's before-rain tasks (their own department only, whatever the request says). */
export async function GET(req: NextRequest) {
  const ctx = await officerSession(req.nextUrl.searchParams);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const tasks = await readTasks({ dept: ctx.dept.code });
    // the newest rehearsal first; finished rehearsals fall away after a week
    const weekAgo = new Date(Date.now() + 330 * 60_000 - 7 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
    const open = tasks.filter((t) => t.status !== "done" || (t.doneAt ?? "") >= weekAgo);
    return fresh({ dept: ctx.dept.code, tasks: open.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due ?? "9").localeCompare(b.due ?? "9") || a.id - b.id) });
  } catch (e) {
    return failed(e, "the before-rain tasks");
  }
}

/** Mark one task done: multipart form with `id`, optional `photo`, optional `lat` / `lon` (where the photo was taken). */
export async function POST(req: NextRequest) {
  const ctx = await officerSession(req.nextUrl.searchParams, { write: true });
  if (ctx instanceof NextResponse) return ctx;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Send the task as a form." }, { status: 400 });
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "No such task." }, { status: 400 });
  const lat = Number(form.get("lat")), lon = Number(form.get("lon"));
  const at = Number.isFinite(lat) && Number.isFinite(lon) && lat > 12 && lat < 14 && lon > 79 && lon < 81 && form.get("lat") !== null ? { lat, lon } : null;
  const file = form.get("photo");
  let photo: string | null = null, dir: string | null = null;
  try {
    if (file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0) {
      const f = file as File;
      if (f.size > OFFICER.maxPhotoBytes) return NextResponse.json({ error: `The photo must be ${OFFICER.maxPhotoBytes / 1024 / 1024} MB or smaller.` }, { status: 400 });
      const buf = Buffer.from(await f.arrayBuffer());
      const ext = sniff(buf) as PhotoExt | null;
      if (!ext) return NextResponse.json({ error: "The photo must be a JPG, PNG or WebP image." }, { status: 400 });
      dir = newPhotoDir();
      const [name] = await savePhotos(dir, [{ buf, ext }]);
      photo = `${dir}/${name}`;
    }
    const r = await markDone(id, ctx.dept.code, ctx.session.email, photo, at);
    if (r.status !== 200 && dir) await removePhotoDir(dir).catch(() => undefined);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    if (dir) await removePhotoDir(dir).catch(() => undefined);
    return failed(e, "the task");
  }
}
