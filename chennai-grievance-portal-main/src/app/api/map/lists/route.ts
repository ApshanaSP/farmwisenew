import { NextRequest, NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { audit } from "@/lib/collector/sources";
import { checkRateLimit } from "@/lib/rate-limit";
import { draftFromFile } from "@/lib/map/listsapi";
import { listLists, UPLOAD_LIMITS } from "@/lib/map/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** "Load your own list": the approved lists, and the asker's own drafts (a draft is never shown to anyone else, nor on the map). */
export async function GET() {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const lists = listLists().filter((l) => l.status === "approved" || l.owner === s.email || s.role === "collector")
    .map((l) => ({ ...l, owner: l.owner === s.email ? "you" : "another officer", mine: l.owner === s.email }));
  return NextResponse.json({ lists, limits: UPLOAD_LIMITS });
}

/** A CSV, Excel or PDF file in (multipart: file, name), a draft out, for the officer to check and approve. */
export async function POST(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`maplist:${s.userId}`, 10, 600);
  if (!gate.allowed) return NextResponse.json({ error: `Too many uploads. Try again in ${gate.retryAfterSeconds} s.` }, { status: 429 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > UPLOAD_LIMITS.bytes + 64 * 1024) return NextResponse.json({ error: `The file is over ${UPLOAD_LIMITS.bytes / 1024 / 1024} MB.` }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose a CSV, Excel or PDF file." }, { status: 400 });
  if (!/\.(csv|xlsx|xls|pdf)$/i.test(file.name)) return NextResponse.json({ error: "Use a CSV, Excel (.xlsx) or PDF file." }, { status: 400 });
  if (file.size > UPLOAD_LIMITS.bytes) return NextResponse.json({ error: `The file is over ${UPLOAD_LIMITS.bytes / 1024 / 1024} MB.` }, { status: 413 });
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const list = await draftFromFile(buf, file.name, String(form?.get("name") ?? ""), s.email);
    await audit(s.email, "ask_map:list_upload", "map_list", list.id, null, { file: list.source.file, kind: list.source.kind, rows: list.rows.length,
      placed: list.rows.filter((r) => r.how !== "none").length });
    return NextResponse.json({ list: { ...list, owner: "you", mine: true } });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    // our own plain-words errors are shown as they are; anything else is logged and said simply
    if (/^(The file|Use a|Choose|There are|Reading a PDF)/.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[map] list upload failed", e);
    return NextResponse.json({ error: "The list could not be read. Check that it is a table with a header row." }, { status: 400 });
  }
}
