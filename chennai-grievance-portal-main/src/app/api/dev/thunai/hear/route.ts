import { localOnly } from "@/lib/thunai/devguard";
import { NextRequest, NextResponse } from "next/server";
import type { Lane } from "@/lib/thunai/ledger";
import { hearUtterance, MAX_AUDIO_BYTES, readHear, sttAvailable } from "@/lib/thunai/stt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LANES: Lane[] = ["ambient", "engaged", "named"];

/** The dev test console's ears: the same speech to text (WAV or multipart with the Stage's names), no sign-in. 404 in production. */
export async function POST(req: NextRequest) {
  // a measuring build (NEXT_PUBLIC_JARVIS_SPEC=1 at build time) keeps these; a normal production build does not
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  if (!localOnly(req.headers)) return new NextResponse(null, { status: 404 });
  if (!sttAvailable()) return NextResponse.json({ error: "no-stt" }, { status: 503 });
  const body = await readHear(req);
  if (!body || !body.buf.byteLength || body.buf.byteLength > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Bad audio." }, { status: 400 });
  const q = req.nextUrl.searchParams.get("lane") as Lane | null;
  const lane: Lane = q && LANES.includes(q) ? q : "engaged";
  try { return NextResponse.json(await hearUtterance(body.buf, { lane, site: req.nextUrl.searchParams.get("lang") === "ta" ? "ta" : "en", signal: req.signal, vocab: body.vocab })); }
  catch { return NextResponse.json({ error: "stt-failed" }, { status: 502 }); }
}
