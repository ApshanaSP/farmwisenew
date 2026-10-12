import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { MAX_MEDIA_BYTES, saveMedia, sniffMedia } from "@/lib/complaint-media";

/**
 * A photo or video for a complaint the signed-in citizen is filing. Stored privately (see complaint-media.ts) and
 * returned as a URL that only the citizen, the department and the Collector can open. The type is checked from the
 * file's first bytes: JPG, PNG or MP4, up to 10 MB.
 */
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session || session.role !== "citizen") {
    return NextResponse.json({ error: "Please sign in to attach a photo." }, { status: 401 });
  }
  const rl = checkRateLimit(`complaint-media:${session.userId}`, 20, 60 * 15);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } }
    );
  }

  let file: File | null = null;
  try {
    const v = (await req.formData()).get("media");
    file = v instanceof File ? v : null;
  } catch {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "File must be 10MB or smaller." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = sniffMedia(buffer);
  if (!ext || buffer.length > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "Only JPG, PNG and MP4 files are allowed." }, { status: 400 });
  }

  try {
    return NextResponse.json({ mediaPath: await saveMedia(buffer, ext, session.userId) });
  } catch (err) {
    console.error("complaint media upload failed", err);
    return NextResponse.json({ error: "Could not save the file. Please try again." }, { status: 500 });
  }
}
