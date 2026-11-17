/**
 * v6 Phase 3: ten audio samples of the v6 incident briefing for the owner, in Jarvis's server voice (Gemini TTS, voice Despina, the
 * voice ladder's second rung: src/app/api/jarvis/say/route.ts). Five English and five Tamil, from eval/v6/brief/set.json (the dev
 * briefing set: invented-free, built from the store's records), news-sourced ones first. Only the briefing's own text is sent (no
 * style instruction: these models read one aloud). Each request is recorded in the quota ledger (lane "eval"), paced under the
 * models' 3-a-minute allowance. Keys come from .env and are never printed.
 *   GEMINI_TTS_MODELS=gemini-2.5-flash-preview-tts,gemini-3.1-flash-tts-preview node scripts/jarvis6/brief-samples.mjs
 * Out: docs/jarvis/samples/v6/brief-<nn>-<lang>.wav and docs/jarvis/samples/v6/README.md (each sample's text).
 */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

process.loadEnvFile(".env");
const OUT = path.join("..", "docs", "jarvis", "samples", "v6");
const MODELS = (process.env.GEMINI_TTS_MODELS || "gemini-2.5-flash-preview-tts,gemini-3.1-flash-tts-preview").split(",");
const VOICE = process.env.SAMPLE_VOICE || "Despina";
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

const set = JSON.parse(fs.readFileSync(path.join("eval", "v6", "brief", "set.json"), "utf8"));
// news-sourced first, then the rest; five incidents, each in English and in Tamil
const items = [...set.items.filter((x) => x.news), ...set.items.filter((x) => !x.news)].slice(0, 5);
const todo = items.flatMap((x, i) => ["en", "ta"].map((lang) => ({ n: String(i * 2 + (lang === "en" ? 1 : 2)).padStart(2, "0"), lang, news: !!x.news, sev: x.sev, text: x.v6[lang] })));
fs.mkdirSync(OUT, { recursive: true });
console.log(`${todo.length} samples; spent today: ${MODELS.map((m) => `${m} ${spentDay(m)}`).join(", ")}`);
const lastAt = Object.fromEntries(MODELS.map((m) => [m, 0]));
const done = [];
let k = 0;
for (const s of todo) {
  const file = `brief-${s.n}-${s.lang}.wav`;
  if (fs.existsSync(path.join(OUT, file))) { done.push({ ...s, file }); continue; }
  for (let tries = 0; tries < 4; tries++) {
    const m = MODELS[k++ % MODELS.length];
    if (spentDay(m) >= 95) { console.log(`${m} near its day's allowance, skipped`); continue; }
    const wait = lastAt[m] + 21_000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt[m] = Date.now();
    record(m);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({ contents: [{ parts: [{ text: s.text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } })
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (!r.ok) { console.log(`${file} ${m} -> ${r.status} ${(await r.text()).slice(0, 100).replace(/\s+/g, " ")}`); continue; }
    const j = await r.json();
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!part?.data) { console.log(`${file} ${m} -> no audio`); continue; }
    const raw = Buffer.from(part.data, "base64");
    const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? "")?.[1] ?? 24000);
    // halved to 12 kHz (two samples averaged): speech stays clear and the ten files stay small enough to keep in the repository
    const pcm = raw.subarray(0, 4).toString() === "RIFF" ? raw.subarray(44) : raw;
    const half = Buffer.alloc(Math.floor(pcm.length / 4) * 2);
    for (let i = 0; i < half.length / 2; i++) half.writeInt16LE(Math.round((pcm.readInt16LE(i * 4) + pcm.readInt16LE(i * 4 + 2)) / 2), i * 2);
    fs.writeFileSync(path.join(OUT, file), wav(half, Math.round(rate / 2)));
    console.log(`${file} ${m} ${raw.length} bytes`);
    done.push({ ...s, file, model: m });
    break;
  }
}
const md = [`# v6 incident briefings: ten audio samples`, ``,
  `Jarvis's server voice (Gemini TTS, voice ${VOICE}, the voice ladder's second rung; in Edge the answer is spoken by Edge's natural voices). From \`chennai-grievance-portal-main/eval/v6/brief/set.json\` (the dev briefing set, ${set.summary?.at ?? "?"}): the first five incidents with a news report first, each in English and Tamil. The Tamil lines are model-drafted, not checked by a Tamil speaker. Made by \`scripts/jarvis6/brief-samples.mjs\`.`, ``,
  `| File | Lang | News | Severity | What is said |`, `|---|---|---|---|---|`,
  ...done.map((s) => `| ${s.file} | ${s.lang} | ${s.news ? "yes" : "no"} | ${s.sev ?? ""} | ${s.text.replace(/\|/g, "/")} |`)].join("\n");
fs.writeFileSync(path.join(OUT, "README.md"), `${md}\n`);
console.log(`${done.length}/${todo.length} samples in ${OUT}`);
