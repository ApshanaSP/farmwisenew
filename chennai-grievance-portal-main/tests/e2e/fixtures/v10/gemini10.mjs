/**
 * v6 latency clips, Tamil, Tanglish and two English wakes: Gemini's speech models on the free tier (synthetic voices, not people). Only the text is sent: a style instruction before it is read aloud by these models (tried 17 Nov).
 * Reads clips.json ("source": "gemini"), writes raw/<name>.wav. Keys come from .env and are never printed. Each request is recorded
 * in the quota ledger (data/thunai/ledger.sqlite, lane "eval") and the models are paced under their 3-a-minute allowance.
 *   node tests/e2e/fixtures/v10/gemini10.mjs          (from chennai-grievance-portal-main)
 */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

process.loadEnvFile(".env");
const here = path.join("tests", "e2e", "fixtures", "v10");
const clips = JSON.parse(fs.readFileSync(path.join(here, "clips10.json"), "utf8"));
// GEMINI_TTS_MODELS overrides (17 Nov: both 3.8 models answered 429 "exceeded your current quota" after about 20 requests each in the day)
const MODELS = (process.env.GEMINI_TTS_MODELS || "gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts").split(",");
const db = new DatabaseSync(path.join("data", "thunai", "ledger.sqlite"));
const spentDay = (m) => db.prepare("SELECT COALESCE(SUM(requests),0) r FROM spend WHERE org='gemini' AND model=? AND at>=?").get(m, Date.now() - 86_400_000).r;
const record = (m) => db.prepare("INSERT INTO spend VALUES (?,?,?,?,?,?,?)").run(Date.now(), "gemini", m, 1, 0, 0, "eval");

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const todo = Object.entries(clips).filter(([n, c]) => c.source === "gemini" && !fs.existsSync(path.join(here, "raw", `${n}.wav`)));
console.log(`${todo.length} clips to make; spent today: ${MODELS.map((m) => `${m} ${spentDay(m)}`).join(", ")}`);
const lastAt = Object.fromEntries(MODELS.map((m) => [m, 0]));
let k = 0;
for (const [name, c] of todo) {
  for (let tries = 0; tries < 4; tries++) {
    const m = MODELS[k++ % MODELS.length];
    if (spentDay(m) >= 95) { console.log(`${m} near its day's allowance, skipped`); continue; }
    const wait = lastAt[m] + 21_000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt[m] = Date.now();
    record(m);
    const t0 = Date.now();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({ contents: [{ parts: [{ text: c.text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } } } })
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (!r.ok) { console.log(`${name} ${m} -> ${r.status} ${(await r.text()).slice(0, 100).replace(/\s+/g, " ")}`); continue; }
    const j = await r.json();
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!part?.data) { console.log(`${name} ${m} -> no audio`); continue; }
    const raw = Buffer.from(part.data, "base64");
    const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? "")?.[1] ?? 24000);
    fs.writeFileSync(path.join(here, "raw", `${name}.wav`), raw.subarray(0, 4).toString() === "RIFF" ? raw : wav(raw, rate));
    console.log(`${name} ${m} ${c.voice} ${raw.length} bytes in ${Date.now() - t0} ms`);
    break;
  }
}
