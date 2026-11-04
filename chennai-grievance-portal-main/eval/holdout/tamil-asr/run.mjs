// Runs Tamil clips through a transcriber and scores CER and WER (NFC plus punctuation strip only, never Whisper's
// BasicTextNormalizer on Tamil). Clips come from prepare.py; results go to eval/holdout/results/.
//   node eval/holdout/tamil-asr/run.mjs <clip_dir> <engine[,engine]> [n] [tag]
// engines: gemini-3.5-transcribe, gemini-3.5-flash-lite, whisper-large-v3, whisper-large-v3-turbo, jarvis (the shipped race)
// 429s are counted as capacity failures, not as errors in the score.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const [clipDir, enginesArg, nArg, tagArg] = process.argv.slice(2);
const engines = enginesArg.split(",");
const manifest = JSON.parse(fs.readFileSync(path.join("eval", "holdout", "tamil-asr", "manifest.json"), "utf8"));
const n = Number(nArg || manifest.items.length);
const tag = tagArg || "probe";
// clean and noisy in step, so a small n still has both
const items = [...manifest.items].sort((a, b) => a.sha256.localeCompare(b.sha256)).slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (t) => String(t ?? "").normalize("NFC").replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
function edit(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
const score = (ref, hyp) => { const r = norm(ref), h = norm(hyp); return { cer: edit([...r], [...h]) / Math.max(1, [...r].length), wer: edit(r.split(" "), h.split(" ")) / Math.max(1, r.split(" ").length) }; };

const PROMPT = "Jarvis, Chennai District Collector console. Adyar, Ambattur, Anna Nagar, Velachery, Mylapore, Chembarambakkam, Puzhal, Poondi, GCC, CMWSSB, TNEB, IMD, AQI, storm water drain, waterlogging, dengue. ஜார்விஸ், அடையாறு, அம்பத்தூர், அண்ணா நகர், வெள்ளம், மழை, புகார்.";

async function whisper(model, buf) {
  const f = new FormData();
  f.append("file", new Blob([buf], { type: "audio/wav" }), "speech.wav");
  f.append("model", model); f.append("response_format", "verbose_json"); f.append("temperature", "0"); f.append("language", "ta"); f.append("prompt", PROMPT);
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: f });
  if (r.status === 429) return { capacity: true };
  if (!r.ok) return { error: `${r.status}` };
  return { text: (await r.json()).text };
}
async function gemini(model, buf) {
  const body = { contents: [{ parts: [{ inlineData: { mimeType: "audio/wav", data: buf.toString("base64") } }, { text: "Transcribe this Tamil speech exactly, in Tamil script. Return only the transcript." }] }], generationConfig: { temperature: 0, maxOutputTokens: 600 } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 429) return { capacity: true, detail: (await r.text()).slice(0, 200) };
  if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 160)}` };
  const j = await r.json();
  return { text: j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? p.audioTranscription?.text ?? "").join("") ?? "" };
}

const out = {};
for (const eng of engines) {
  const rows = [];
  const gap = eng === "gemini-3.5-transcribe" ? 13000 : eng.startsWith("gemini") ? 6500 : 3200; // transcribe refused at 10 RPM on the probe; 10 RPM and 20 RPM
  for (const it of items) {
    const buf = fs.readFileSync(path.join(clipDir, it.file));
    const t0 = Date.now();
    const r = eng.startsWith("gemini") ? await gemini(eng, buf) : await whisper(eng, buf);
    const ms = Date.now() - t0;
    rows.push(r.text != null ? { id: it.id, kind: it.kind, ms, ...score(it.text, r.text) } : { id: it.id, kind: it.kind, ms, capacity: !!r.capacity, error: r.error ?? null });
    if (r.error) console.warn(eng, it.id, r.error);
    await sleep(gap);
  }
  const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
  const ok = (k) => rows.filter((x) => x.cer != null && (!k || x.kind === k));
  const ms = rows.map((x) => x.ms).sort((a, b) => a - b);
  out[eng] = { n: rows.length, scored: ok().length, capacity: rows.filter((x) => x.capacity).length, errors: rows.filter((x) => x.error).length, cer: mean(ok().map((x) => x.cer)), wer: mean(ok().map((x) => x.wer)),
    clean: { cer: mean(ok("clean").map((x) => x.cer)), wer: mean(ok("clean").map((x) => x.wer)), n: ok("clean").length }, noisy: { cer: mean(ok("noisy").map((x) => x.cer)), wer: mean(ok("noisy").map((x) => x.wer)), n: ok("noisy").length },
    ms_p50: ms[Math.floor(ms.length / 2)] ?? null, rows };
  console.log(eng, JSON.stringify({ ...out[eng], rows: undefined }));
  fs.mkdirSync(path.join("eval", "holdout", "results"), { recursive: true });
  fs.writeFileSync(path.join("eval", "holdout", "results", `asr-${tag}.json`), JSON.stringify(out, null, 0));
}
