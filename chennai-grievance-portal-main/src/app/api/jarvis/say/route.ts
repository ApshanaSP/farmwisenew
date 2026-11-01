/**
 * Jarvis's voice on the server: a reply becomes speech in a woman's voice, in Tamil or English: Microsoft Azure's neural
 * voices when AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set (ta-IN Pallavi, en-IN Neerja; a free tier of 500,000
 * characters a month), else Gemini's speech models (free tier: 10 a day per model). Three models share the load: each takes a few quick calls a
 * minute on the free tier, so one that refuses (429) rests for a minute and the next speaks. What was said once is kept
 * (memory, 300 lines), so a repeated line costs nothing. When no model can speak, 503: the console then uses the
 * browser's own voice, or shows the words.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { JARVIS_VOICES } from "@/lib/jarvis/voices";

export const dynamic = "force-dynamic";

const MODELS = (process.env.JARVIS_TTS_MODELS || "gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts,gemini-2.5-flash-preview-tts").split(",").map((x) => x.trim()).filter(Boolean);
const Body = z.object({ text: z.string().trim().min(1).max(700), lang: z.enum(["en", "ta"]), voice: z.enum(JARVIS_VOICES).optional() });

const cache = new Map<string, Buffer>();
const resting = new Map<string, number>();

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
  const region = process.env.AZURE_SPEECH_REGION!, v = lang === "ta" ? process.env.JARVIS_AZURE_TA || "ta-IN-PallaviNeural" : process.env.JARVIS_AZURE_EN || "en-IN-NeerjaNeural";
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST", signal: AbortSignal.timeout(12_000),
    headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", "User-Agent": "district-iq" },
    body: `<speak version="1.0" xml:lang="${lang === "ta" ? "ta-IN" : "en-IN"}"><voice name="${v}">${esc(text)}</voice></speak>`
  });
  if (!r.ok) throw new Error(`azure ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function speak(model: string, text: string, voice: string): Promise<Buffer> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } })
  });
  if (r.status === 429) {
    // a daily cap rests the model until it resets (its retry delay), a per-minute one for a minute
    const body = await r.text();
    const secs = Number(/"retryDelay":\s*"(\d+)s"/.exec(body)?.[1] ?? 60);
    resting.set(model, Date.now() + Math.max(60, secs) * 1000);
    throw new Error("busy");
  }
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] } }[] };
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part?.data) throw new Error("no audio");
  const raw = Buffer.from(part.data, "base64");
  const mime = part.mimeType ?? "";
  if (/wav/i.test(mime) || raw.subarray(0, 4).toString() === "RIFF") return raw;
  return wav(raw, Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000));
}

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const az = !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
  if (!process.env.GEMINI_API_KEY && !az) return NextResponse.json({ error: "no-tts" }, { status: 503 });
  if (!checkRateLimit(`jarvis-say:${s.email}`, 60, 60).allowed) return NextResponse.json({ error: "busy" }, { status: 429 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { text, lang } = b.data;
  const voice = b.data.voice ?? "Despina";
  const key = `${voice}|${lang}|${text}`;
  let audio = cache.get(key);
  if (!audio && az) { try { audio = await azure(text, lang); } catch (e) { console.warn("[jarvis] azure could not speak:", (e as Error).message); } }
  if (!audio && process.env.GEMINI_API_KEY) {
    const now = Date.now();
    // the models at their cap are not asked at all (each refusal cost the Collector a second or two)
    const order = MODELS.filter((m) => (resting.get(m) ?? 0) <= now);
    for (const m of order) {
      try { audio = await speak(m, text, voice); break; } catch (e) { if ((e as Error).message !== "busy") console.warn(`[jarvis] ${m} could not speak:`, (e as Error).message); }
    }
  }
  if (!audio) return NextResponse.json({ error: "busy" }, { status: 503 });
  if (!cache.has(key)) { cache.set(key, audio); if (cache.size > 300) cache.delete(cache.keys().next().value as string); }
  return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });
}
