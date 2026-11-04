import { NextRequest, NextResponse } from "next/server";
import type { Lane } from "@/lib/thunai/ledger";
import { hearUtterance, MAX_AUDIO_BYTES, sttAvailable } from "@/lib/thunai/stt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev test console's ears: the same speech to text, no sign-in. 404 in production. */
export async function POST(req: NextRequest) {
  // a measuring build (NEXT_PUBLIC_JARVIS_SPEC=1 at build time) keeps these; a normal production build does not
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  if (!sttAvailable()) return NextResponse.json({ error: "no-stt" }, { status: 503 });
  const buf = await req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Bad audio." }, { status: 400 });
  const lane = (req.nextUrl.searchParams.get("lane") ?? "engaged") as Lane;
  try { return NextResponse.json(await hearUtterance(buf, { lane, site: req.nextUrl.searchParams.get("lang") === "ta" ? "ta" : "en", signal: req.signal })); }
  catch { return NextResponse.json({ error: "stt-failed" }, { status: 502 }); }
}
