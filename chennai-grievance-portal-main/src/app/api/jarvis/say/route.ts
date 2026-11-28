/**
 * Jarvis's voice on the server, the second rung of the voice ladder (mouth.ts; Edge's natural voices speak first and never
 * come here). ONE request per answer: the client sends the whole answer's text (up to 2,400 characters, sentences as code
 * rendered them), not a request per chunk, because Gemini's speech models are under the ledger's cap of 3 a minute and a
 * request per chunk spent it after about three answers. A model that refuses (429) rests and the next speaks. What was said
 * once is kept (memory, 48 MB at most), so a repeated answer costs nothing. When no model can speak, 503: the console then
 * uses the browser's own voice for the whole answer, or shows the words.
 *
 * The answer comes back as one WAV (generateContent, what has run so far). With JARVIS_TTS_STREAM=1 and `stream: true` it is
 * streamed instead as headerless 16-bit PCM (audio/l16; rate=24000), played as it arrives: that request shape is UNVERIFIED
 * (lib/thunai/ttsstream.ts), so it is off by default and a refused stream falls back to the WAV path.
 *
 * The Azure branch runs only behind AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (ta-IN Pallavi, en-IN Neerja); no such key exists
 * yet, so that branch has never run: Not verified (it type-checks). TTS_PROVIDER: auto (the default, and what the older value
 * "browser" now means), azure or gemini.
 *
 * v5 F1, defence in depth: the mouth puts every number in words before it asks for a voice (lib/thunai/numberwords.ts aloud), so
 * text that still holds a number sign of any script (47, ௪௭, ௰) is refused here with 400 "digit" before any model is asked; one
 * "tts" telemetry row says so, with counts only.
 */
import { readJsonCapped, tooLargeResponse } from "@/lib/body-cap";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { JARVIS_VOICES } from "@/lib/jarvis/voices";
import { ledger } from "@/lib/thunai/ledger";
import { holdsDigit } from "@/lib/thunai/numberwords";
import { telemetry } from "@/lib/thunai/telemetry";
import { SseAudio, STREAM_RATE, streamBody } from "@/lib/thunai/ttsstream";

export const dynamic = "force-dynamic";

const MODELS = (process.env.JARVIS_TTS_MODELS || "gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts").split(",").map((x) => x.trim()).filter(Boolean);
const provider = () => { const p = (process.env.TTS_PROVIDER ?? "auto").trim().toLowerCase(); return p === "azure" || p === "gemini" || p === "sarvam" ? p : "auto"; };
/** Sarvam speaks first when its key is set (28 Nov, the owner: "use the Sarvam speaking model so Jarvis replies in Chrome too, not only Edge") */
const sarvamOn = () => !!process.env.SARVAM_API_KEY && provider() !== "gemini" && provider() !== "azure";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const SARVAM_TTS_MODEL = process.env.JARVIS_SARVAM_TTS_MODEL || "bulbul:v3";
const SARVAM_SPEAKER = process.env.JARVIS_SARVAM_SPEAKER || "priya";

/** an answer in pieces of about 400 characters, cut at sentence ends (a whole long answer took 48 s in one request; pieces go in parallel) */
function pieces(text: string, max = 400): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sen of text.split(/(?<=[.!?।])\s+/)) {
    if (cur && (cur + " " + sen).length > max) { out.push(cur); cur = ""; }
    if (sen.length > max) { for (let k = 0; k < sen.length; k += max) out.push(sen.slice(k, k + max)); continue; }
    cur = cur ? `${cur} ${sen}` : sen;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((x) => x.trim());
}
/** the PCM samples of a WAV (its "data" chunk) and its rate */
function pcmOf(w: Buffer): { pcm: Buffer; rate: number } {
  const rate = w.readUInt32LE(24);
  let at = 12;
  while (at + 8 <= w.length) {
    const id = w.subarray(at, at + 4).toString(), n = w.readUInt32LE(at + 4);
    if (id === "data") return { pcm: w.subarray(at + 8, Math.min(w.length, at + 8 + n)), rate };
    at += 8 + n + (n % 2);
  }
  return { pcm: w.subarray(44), rate };
}
/** Sarvam (Bulbul): the answer's pieces, at most four at a time, joined into one WAV */
async function sarvam(text: string, lang: "en" | "ta"): Promise<Buffer> {
  const one = async (t: string): Promise<Buffer> => {
    const r = await fetch(SARVAM_TTS_URL, {
      method: "POST", signal: AbortSignal.timeout(20_000),
      headers: { "api-subscription-key": process.env.SARVAM_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, target_language_code: lang === "ta" ? "ta-IN" : "en-IN", model: SARVAM_TTS_MODEL, speaker: SARVAM_SPEAKER })
    });
    if (r.status === 429) throw new Error("busy");
    if (!r.ok) throw new Error(`sarvam ${r.status} ${(await r.text().catch(() => "")).slice(0, 100)}`);
    const j = (await r.json()) as { audios?: string[] };
    if (!j.audios?.length) throw new Error("no audio");
    return Buffer.concat(j.audios.map((a) => Buffer.from(a, "base64")).map((b) => pcmOf(b).pcm));
  };
  const parts = pieces(text);
  const got: Buffer[] = new Array(parts.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, parts.length) }, async () => {
    while (next < parts.length) { const k = next++; got[k] = await one(parts[k]); }
  }));
  // the rate of Bulbul's WAVs (22,050 Hz); a short pause between the pieces
  const gap = Buffer.alloc(Math.round(22_050 * 0.12) * 2);
  return wav(Buffer.concat(got.flatMap((g, k) => (k ? [gap, g] : [g]))), 22_050);
}
const streamOn = () => process.env.JARVIS_TTS_STREAM === "1";
const Body = z.object({ text: z.string().trim().min(1).max(2400), lang: z.enum(["en", "ta"]), voice: z.enum(JARVIS_VOICES).optional(), stream: z.boolean().optional() });

/** how many texts holding a digit were refused since the server started (F1) */
let digitRefusals = 0;

/** what was said, as WAV, by voice, language and text: at most 48 MB (a whole answer is about 0.7 MB for 15 s) */
const cache = new Map<string, Buffer>();
const CACHE_BYTES = 48 * 1024 * 1024;
let cacheBytes = 0;
function keep(key: string, audio: Buffer) {
  if (cache.has(key)) return;
  cache.set(key, audio);
  cacheBytes += audio.length;
  while ((cacheBytes > CACHE_BYTES || cache.size > 300) && cache.size > 1) {
    const k = cache.keys().next().value as string;
    cacheBytes -= cache.get(k)?.length ?? 0;
    cache.delete(k);
  }
}

/** 16-bit PCM (what Gemini sends as audio/L16) wrapped as a WAV the browser can play */
function wav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Azure: one SSML request, a 24 kHz WAV back */
async function azure(text: string, lang: "en" | "ta"): Promise<Buffer> {
  const region = process.env.AZURE_SPEECH_REGION!, v = lang === "ta" ? process.env.JARVIS_AZURE_TA || "ta-IN-PallaviNeural" : process.env.JARVIS_AZURE_EN || "en-IN-NeerjaNeural"; // Not verified: no key has existed
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST", signal: AbortSignal.timeout(20_000),
    headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", "User-Agent": "district-iq" },
    body: `<speak version="1.0" xml:lang="${lang === "ta" ? "ta-IN" : "en-IN"}"><voice name="${v}">${esc(text)}</voice></speak>`
  });
  if (r.status === 429) throw new Error("busy");
  if (!r.ok) throw new Error(`azure ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** a 429 rests the model: a daily cap until it resets (its retry delay), a per-minute one for a minute */
async function cool(model: string, r: Response) {
  const body = await r.text().catch(() => "");
  const secs = Number(/"retryDelay":\s*"(\d+)s"/.exec(body)?.[1] ?? 60);
  ledger().cool("gemini", model, Math.max(60, secs) * 1000);
}

/** One answer, one request, one WAV back (generateContent: the path that has run so far). */
async function speak(model: string, text: string, voice: string): Promise<Buffer> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    // a whole answer takes longer to synthesise than one chunk did (15 s was the per-chunk limit)
    method: "POST", signal: AbortSignal.timeout(25_000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } })
  });
  if (r.status === 429) { await cool(model, r); throw new Error("busy"); }
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] } }[] };
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part?.data) throw new Error("no audio");
  const raw = Buffer.from(part.data, "base64");
  const mime = part.mimeType ?? "";
  if (/wav/i.test(mime) || raw.subarray(0, 4).toString() === "RIFF") return raw;
  return wav(raw, Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000));
}

/** UNVERIFIED (see ttsstream.ts): the streamed request, refused here (throws) before any audio when the model will not stream */
async function openStream(model: string, text: string, voice: string): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse", {
    method: "POST", signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify(streamBody(model, text, voice))
  });
  if (r.status === 429) { await cool(model, r); throw new Error("busy"); }
  if (!r.ok || !r.body) throw new Error(`${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`);
  return r.body.getReader();
}

/** The upstream events as raw PCM bytes for the browser; the whole of it is kept as a WAV once it ends cleanly. */
function pcmOut(up: ReadableStreamDefaultReader<Uint8Array>, done: (pcm: Buffer | null, why: string | null) => void): ReadableStream<Uint8Array> {
  const dec = new TextDecoder();
  const sse = new SseAudio();
  const got: Uint8Array[] = [];
  let over = false;
  const finish = (ok: boolean, why: string | null) => { if (over) return; over = true; done(ok && got.length ? Buffer.concat(got) : null, why); };
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        for (;;) {
          const { value, done: end } = await up.read();
          const parts = end ? sse.end() : sse.push(dec.decode(value, { stream: true }));
          for (const p of parts) { got.push(p); ctrl.enqueue(p); }
          if (sse.error) { finish(false, sse.error); ctrl.close(); void up.cancel().catch(() => undefined); return; }
          if (end) { finish(true, null); ctrl.close(); return; }
          if (parts.length) return;
        }
      } catch (e) {
        finish(false, (e as Error).name);
        try { ctrl.close(); } catch { /* closed */ }
      }
    },
    cancel() { finish(false, "cancelled"); void up.cancel().catch(() => undefined); }
  });
}

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const az = provider() !== "gemini" && provider() !== "sarvam" && !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
  if (!process.env.GEMINI_API_KEY && !az && !sarvamOn()) return NextResponse.json({ error: "no-tts" }, { status: 503 });
  if (!checkRateLimit(`jarvis-say:${s.email}`, 60, 60).allowed) return NextResponse.json({ error: "busy" }, { status: 429 });
  const capped = await readJsonCapped(req);
  if (capped.tooLarge) return tooLargeResponse();
  const b = Body.safeParse(capped.body);
  if (!b.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { text, lang } = b.data;
  // F1: no digit reaches a voice; the count of refusals is logged, never the text
  if (holdsDigit(text)) {
    telemetry("tts", { ok: false, path: "refused", why: "digit", chars: text.length, lang, count: ++digitRefusals });
    return NextResponse.json({ error: "digit" }, { status: 400 });
  }
  const voice = b.data.voice ?? "Despina";
  const key = `${sarvamOn() ? `sarvam:${SARVAM_SPEAKER}` : voice}|${lang}|${text}`;
  const t0 = Date.now();
  // one "tts" row per request, timings, codes and counts only: never the text
  const note = (ok: boolean, prov: "gemini" | "azure" | "sarvam" | "cache", path: string, model: string | null, why?: string, bytes?: number) =>
    telemetry("tts", { provider: prov, model: model ?? undefined, ms: Date.now() - t0, chars: text.length, ok, path, lang, cached: prov === "cache", why, bytes });
  /** a 429: where the answer went instead (the next Gemini model with room, or the browser's own voice on the client) */
  const refused = (prov: "gemini" | "azure", model: string, after: number) => {
    const next = MODELS.slice(after).find((x) => ledger().room("gemini", x).ok);
    telemetry("fallback_429", { provider: prov, model, status: 429, fallback: next ? `gemini/${next}` : "browser" });
  };
  let audio = cache.get(key);
  if (audio) note(true, "cache", "cache", null, undefined, audio.length);
  if (!audio && sarvamOn()) {
    try { audio = await sarvam(text, lang); note(true, "sarvam", "unary", SARVAM_TTS_MODEL, undefined, audio.length); } catch (e) {
      const why = (e as Error).message;
      note(false, "sarvam", "unary", SARVAM_TTS_MODEL, why.split(" ")[0]);
      console.warn("[jarvis] sarvam could not speak:", why.slice(0, 120));
    }
  }
  if (!audio && az) {
    try { audio = await azure(text, lang); note(true, "azure", "unary", "azure"); } catch (e) {
      const why = (e as Error).message;
      note(false, "azure", "unary", "azure", why.split(" ")[0]);
      if (why === "busy") refused("azure", "azure", 0); else console.warn("[jarvis] azure could not speak:", why);
    }
  }
  const gemini = !audio && !!process.env.GEMINI_API_KEY && provider() !== "azure" && provider() !== "sarvam";
  if (gemini && b.data.stream && streamOn()) {
    for (const [i, m] of MODELS.entries()) {
      if (!ledger().room("gemini", m).ok) continue;
      ledger().record("gemini", m, { lane: "tts" });
      let up: ReadableStreamDefaultReader<Uint8Array>;
      try { up = await openStream(m, text, voice); } catch (e) {
        const why = (e as Error).message;
        note(false, "gemini", "stream", m, why.split(" ")[0]);
        if (why === "busy") refused("gemini", m, i + 1); else console.warn(`[jarvis] ${m} could not stream:`, why.slice(0, 40));
        continue;
      }
      const body = pcmOut(up, (pcm, why) => {
        if (pcm) keep(key, wav(pcm, STREAM_RATE));
        note(!!pcm, "gemini", "stream", m, why ?? undefined, pcm?.length);
      });
      return new NextResponse(body, { headers: { "Content-Type": `audio/l16; rate=${STREAM_RATE}`, "Cache-Control": "no-store" } });
    }
  }
  if (gemini) {
    // the models at their cap are not asked at all (each refusal cost the Collector a second or two)
    for (const [i, m] of MODELS.entries()) {
      if (!ledger().room("gemini", m).ok) continue;
      try { ledger().record("gemini", m, { lane: "tts" }); audio = await speak(m, text, voice); note(true, "gemini", "unary", m, undefined, audio.length); break; } catch (e) {
        const why = (e as Error).message;
        note(false, "gemini", "unary", m, why === "busy" ? "busy" : why.split(" ")[0]);
        if (why === "busy") refused("gemini", m, i + 1); else console.warn(`[jarvis] ${m} could not speak:`, why);
      }
    }
  }
  if (!audio) return NextResponse.json({ error: "busy" }, { status: 503 });
  keep(key, audio);
  return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });
}
