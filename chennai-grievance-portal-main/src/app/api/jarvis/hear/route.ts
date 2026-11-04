/**
 * Jarvis's ears on the server: one spoken utterance (a WAV the console cut out with its voice detector) becomes text, with
 * the language it was spoken in (lib/thunai/stt.ts). ?lane=ambient is one decode in the site's language under the ledger's
 * cap of 8 a minute; engaged and named turns get the parallel forced decodes. The audio is not kept, and an ambient
 * transcript is not logged.
 */
import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Lane } from "@/lib/thunai/ledger";
import { hearUtterance, MAX_AUDIO_BYTES, sttAvailable } from "@/lib/thunai/stt";

export const dynamic = "force-dynamic";

const LANES: Lane[] = ["ambient", "engaged", "named"];

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!sttAvailable()) return NextResponse.json({ error: "no-stt" }, { status: 503 });
  if (!checkRateLimit(`jarvis-hear:${s.email}`, 60, 60).allowed) return NextResponse.json({ error: "Too many utterances in a minute." }, { status: 429 });
  const buf = await req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Bad audio." }, { status: 400 });
  const site = req.nextUrl.searchParams.get("lang") === "ta" ? "ta" : "en";
  const q = req.nextUrl.searchParams.get("lane") as Lane | null;
  const lane: Lane = q && LANES.includes(q) ? q : "engaged";
  try {
    return NextResponse.json(await hearUtterance(buf, { lane, site, signal: req.signal }));
  } catch (e) {
    if (req.signal.aborted) return NextResponse.json({ error: "aborted" }, { status: 499 });
    console.warn("[jarvis] hear failed:", (e as Error).message);
    return NextResponse.json({ error: "stt-failed" }, { status: 502 });
  }
}
