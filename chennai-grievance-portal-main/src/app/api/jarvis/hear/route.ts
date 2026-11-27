/**
 * Jarvis's ears on the server: one spoken utterance (a WAV the console cut out with its voice detector) becomes text, with
 * the language it was spoken in (lib/thunai/stt.ts). ?lane=ambient is one decode in the site's language under the ledger's
 * cap of 8 a minute; engaged and named turns get the parallel forced decodes. The body is the WAV itself, or multipart with
 * `audio` and `vocab` (the open Stage's names, at most 30, cleaned again in stt.ts) and `lastLang` (en|ta: the language of the last
 * line heard; with the bare WAV it goes as ?lastLang=). The audio is not kept, and an ambient transcript is not logged.
 *
 * v5 (C4): ?engaged=1 is the console's mark that Jarvis was woken or engaged when the sentence was said. With
 * NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE=1 audio without it is refused (403, "not-engaged") before its body is read. Default off: as before.
 * The transcriber's JSON goes back unchanged (its `timing`, offsets for the browser's per-stage trace, included).
 */
import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Lane } from "@/lib/thunai/ledger";
import { hearUtterance, MAX_AUDIO_BYTES, readHear, sttAvailable } from "@/lib/thunai/stt";
import { serverClock } from "@/lib/thunai/stagetime";
import { sarvamKeyed, sarvamMode } from "@/lib/thunai/sarvam";
import { serverWorld } from "@/lib/thunai/world";
import { dayKeytermsNow } from "@/lib/thunai/v10/lexserver";
import { busy, markActive } from "@/lib/thunai/keepwarm";

export const dynamic = "force-dynamic";

const LANES: Lane[] = ["ambient", "engaged", "named"];

export async function POST(req: NextRequest) {
  // the v5 trace: offsets from the request's receipt, so the session check, the rate limit and the body read are inside them
  const clock = serverClock();
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (process.env.NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE === "1" && req.nextUrl.searchParams.get("engaged") !== "1") return NextResponse.json({ error: "not-engaged" }, { status: 403 });
  if (!sttAvailable()) return NextResponse.json({ error: "no-stt" }, { status: 503 });
  if (!checkRateLimit(`jarvis-hear:${s.email}`, 60, 60).allowed) return NextResponse.json({ error: "Too many utterances in a minute." }, { status: 429 });
  const body = await readHear(req);
  if (!body || !body.buf.byteLength || body.buf.byteLength > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Bad audio." }, { status: 400 });
  const site = req.nextUrl.searchParams.get("lang") === "ta" ? "ta" : "en";
  const q = req.nextUrl.searchParams.get("lane") as Lane | null;
  const lane: Lane = q && LANES.includes(q) ? q : "engaged";
  // v15: the keep-warm's heavy steps wait while a sentence is heard (keepwarm.ts busy). 27 Nov: room talk too, and it counts as Jarvis in
  // use (its insights step waits a minute after): a heavy step started while an ambient sentence was heard held the hosted copy's one
  // core, and the next sentence, which may be the one said to Jarvis, waited behind it (the report of 27 Nov, C4)
  markActive("jarvis");
  const done = busy();
  try {
    // v10: Sarvam hears with the day's names (the storms and names in the news, then the Stage's names and the zones), never waiting on the store
    // v10: the day's news names as Sarvam's keyterms only when asked for (JARVIS_SARVAM_DAY_KEYTERMS=1). Measured on 19 Nov (71 synthetic clips,
    // paired): word error 0.127 with v9's fixed list, 0.156 with the day's, and a storm's name written into an unrelated question; names said by
    // ear are matched after hearing (v10/entity10.ts) instead
    const keyterms = process.env.JARVIS_SARVAM_DAY_KEYTERMS === "1" && lane !== "ambient" && sarvamKeyed() && sarvamMode() !== "off"
      ? dayKeytermsNow(await serverWorld(), { extra: body.vocab ?? [] }) : null;
    return NextResponse.json(await hearUtterance(body.buf, { lane, site, signal: req.signal, vocab: body.vocab, lastLang: body.lastLang, clarify: body.clarify, speechMs: body.speechMs, clock, keyterms }));
  } catch (e) {
    if (req.signal.aborted) return NextResponse.json({ error: "aborted" }, { status: 499 });
    console.warn("[jarvis] hear failed:", (e as Error).message);
    return NextResponse.json({ error: "stt-failed" }, { status: 502 });
  } finally { done(); }
}
