/**
 * v6: Jarvis's pre-rendered wake replies ("Yes?", "சொல்லுங்க."), made ONCE with Gemini's speech model in Jarvis's own server voice
 * (Despina, lib/jarvis/voices: the voice the PCM path already speaks with), trimmed of the model's silence, written to
 * public/thunai/wake/<lang>-<n>.wav with manifest.json. The page decodes them when Jarvis opens and plays one from memory the moment
 * the name is recognised (mouth.ts wakeReply), so a wake costs no request and no wait. Several variants: never the same one twice
 * in a row. Keys from .env, never printed; each request recorded in the quota ledger (lane "eval").
 *   GEMINI_TTS_MODELS=gemini-2.5-flash-preview-tts node scripts/jarvis6/wake-replies.mjs
 * The Tamil lines are model-drafted, not checked by a Tamil speaker.
 */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

process.loadEnvFile(".env");
export const REPLIES = {
  en: ["Yes?", "Go ahead.", "I'm listening.", "Yes, Collector?", "Right here."],
  ta: ["சொல்லுங்க.", "சொல்லுங்க, கேக்கறேன்.", "ம், சொல்லுங்க.", "கேக்கறேன், சொல்லுங்க."]
};
const VOICE = "Despina";
const MODELS = (process.env.GEMINI_TTS_MODELS || "gemini-2.5-flash-preview-tts,gemini-3.1-flash-tts-preview").split(",");
const OUT = path.join("public", "thunai", "wake");
const db = new DatabaseSync(path.join("data", "thunai", "ledger.sqlite"));
const record = (m) => db.prepare("INSERT INTO spend VALUES (?,?,?,?,?,?,?)").run(Date.now(), "gemini", m, 1, 0, 0, "eval");

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
/** the model's own leading and trailing silence off (10 ms windows under 2 % of the peak), 15 ms kept each side */
function trim(pcm, rate) {
  const n = pcm.length / 2, win = Math.round(rate / 100), frames = Math.floor(n / win);
  const rms = Array.from({ length: frames }, (_, f) => { let s = 0; for (let i = f * win; i < (f + 1) * win; i++) { const v = pcm.readInt16LE(i * 2); s += v * v; } return Math.sqrt(s / win); });
  const thr = Math.max(...rms) * 0.02;
  const a = Math.max(0, rms.findIndex((r) => r > thr) * win - Math.round(rate * 0.015));
  const b = Math.min(n, (frames - [...rms].reverse().findIndex((r) => r > thr)) * win + Math.round(rate * 0.015));
  return pcm.subarray(a * 2, b * 2);
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = { voice: VOICE, made: new Date().toISOString().slice(0, 10), files: {} };
let k = 0;
for (const [lang, lines] of Object.entries(REPLIES)) {
  manifest.files[lang] = [];
  for (const [i, text] of lines.entries()) {
    const file = `${lang}-${i + 1}.wav`;
    for (let tries = 0; tries < MODELS.length * 2; tries++) {
      const m = MODELS[k++ % MODELS.length];
      record(m);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(60_000), headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } })
      });
      if (!r.ok) { console.log(`${file} ${m} -> ${r.status}`); await new Promise((x) => setTimeout(x, 21_000)); continue; }
      const part = (await r.json()).candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!part?.data) { console.log(`${file} ${m} -> no audio`); continue; }
      const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? "")?.[1] ?? 24000);
      const pcm = trim(Buffer.from(part.data, "base64"), rate);
      fs.writeFileSync(path.join(OUT, file), wav(pcm, rate));
      manifest.files[lang].push({ file, text, ms: Math.round(pcm.length / 2 / rate * 1000), model: m });
      console.log(`${file} ${m} ${Math.round(pcm.length / 2 / rate * 1000)} ms`);
      await new Promise((x) => setTimeout(x, 11_000));
      break;
    }
  }
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
