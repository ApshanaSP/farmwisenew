/**
 * Jarvis's ears on the server: one spoken utterance (a WAV the console cut out with its voice detector) becomes text,
 * with the language it was spoken in, by Groq's Whisper (large-v3-turbo, about 0.4 s). Whisper is told the district's
 * place names, so "Ambattur" is not heard as "amateur". Noise is turned away here too: a clip Whisper itself thinks is
 * not speech, a guess it is unsure of, or one of the phrases Whisper is known to invent on silence comes back empty.
 * The audio is not kept.
 */
import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { ZONE_NAMES } from "@/lib/thunai/lexicon";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2_500_000;
const PROMPT = `Jarvis, Chennai District Collector console. ${ZONE_NAMES.join(", ")}, Velachery, Mylapore, Chembarambakkam, Puzhal, Poondi, GCC, CMWSSB, TNEB, IMD, AQI, storm water drain, waterlogging, dengue. ஜார்விஸ், அடையாறு, அம்பத்தூர், அண்ணா நகர், வெள்ளம், மழை, புகார்.`;
/** what Whisper writes on silence or noise (it was trained on subtitles) */
const INVENTED = /^(thank you\.?|thanks( for watching)?\.?|you\.?|bye\.?|okay\.?|ok\.?|hmm+\.?|uh+\.?|so\.?|\.+|subtitles? by.*|amara\.org.*|please subscribe.*|நன்றி\.?|வணக்கம்\.?)$/i;
const LANGS: Record<string, "en" | "ta"> = { english: "en", en: "en", tamil: "ta", ta: "ta" };

interface Seg { no_speech_prob?: number; avg_logprob?: number; text?: string }

async function whisper(audio: Blob, language: string | null, model: string) {
  const f = new FormData();
  f.append("file", audio, "speech.wav");
  f.append("model", model);
  f.append("response_format", "verbose_json");
  f.append("temperature", "0");
  // no vocabulary hint for the name check: on near-silence Whisper can repeat its hint, which would wake Jarvis falsely
  if (model !== "whisper-large-v3-turbo") f.append("prompt", PROMPT);
  if (language) f.append("language", language);
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: f, signal: AbortSignal.timeout(12_000)
  });
  if (!r.ok) throw new Error(`whisper ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json()) as { text?: string; language?: string; segments?: Seg[]; duration?: number };
}

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "no-stt" }, { status: 503 });
  if (!checkRateLimit(`jarvis-hear:${s.email}`, 60, 60).allowed) return NextResponse.json({ error: "Too many utterances in a minute." }, { status: 429 });
  const buf = await req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "Bad audio." }, { status: 400 });
  // the site's language, to decide a clip Whisper could not place (short clips are sometimes heard as Malayalam or Hindi)
  const site = req.nextUrl.searchParams.get("lang") === "ta" ? "ta" : "en";
  // the name check while Jarvis rests uses the fast model (its own allowance); a question uses the most accurate one,
  // which hears Tamil and Tamil-English mixed speech best
  const wake = req.nextUrl.searchParams.get("wake") === "1";
  const model = wake ? "whisper-large-v3-turbo" : process.env.JARVIS_STT_MODEL || "whisper-large-v3";
  const audio = new Blob([buf], { type: "audio/wav" });
  const t0 = Date.now();
  try {
    let j = await whisper(audio, null, model);
    let lang = LANGS[(j.language ?? "").toLowerCase()];
    if (!lang && !wake) { j = await whisper(audio, site, model); lang = site; }
    lang = lang ?? site;
    const text = (j.text ?? "").replace(/\s+/g, " ").trim();
    const segs = j.segments ?? [];
    const speech = segs.length ? segs.reduce((a, x) => a + (1 - (x.no_speech_prob ?? 0)), 0) / segs.length : 1;
    const sure = segs.length ? segs.reduce((a, x) => a + (x.avg_logprob ?? 0), 0) / segs.length : 0;
    // not speech, an unsure guess, or Whisper's own filler: nothing was said to Jarvis
    const noise = !text || text.length < 2 || speech < 0.45 || sure < -1.1 || INVENTED.test(text);
    return NextResponse.json({ text: noise && !wake ? "" : text, lang, noise, ms: Date.now() - t0, conf: { speech: Math.round(speech * 100) / 100, logprob: Math.round(sure * 100) / 100 } });
  } catch (e) {
    console.warn("[jarvis] hear failed:", (e as Error).message);
    return NextResponse.json({ error: "stt-failed" }, { status: 502 });
  }
}
