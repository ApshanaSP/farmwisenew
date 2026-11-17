/**
 * v6, Phase 1: the on-device wake word, offline. LiveKit WakeWord's `hey_jarvis.onnx` (Apache-2.0, code and weights: its NOTICE) on
 * the v6 clips through onnxruntime-node, the same streaming loop as its JS client (80 ms chunks of 16 kHz float audio, state tensors
 * carried, 25 chunks of silence first). For each clip: the best score, and when the score first crossed each threshold, in ms from the
 * clip's true last voiced sample (v6.json endMs; the chunk's END time, so a detection can be no earlier than the audio it has seen).
 * Non-wake clips (commands, questions) give the false-fire count. Timings of the model itself: ms per 80 ms chunk.
 *   node scripts/jarvis6/kws-offline.mjs <path to hey_jarvis.onnx> [--threads 1]
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const ort = require("onnxruntime-node");
const model = process.argv[2];
const threads = Number(process.argv[process.argv.indexOf("--threads") + 1]) || 1;
const FX = path.join("tests", "e2e", "fixtures", "v6");
const meta = JSON.parse(fs.readFileSync(path.join(FX, "v6.json"), "utf8"));
const FRAME = 1280, THRESH = [0.3, 0.5, 0.7];

function read(file) {
  const b = fs.readFileSync(file);
  let off = 12, rate = 16000, data = null;
  while (off + 8 <= b.length) { const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4); if (id === "fmt ") rate = b.readUInt32LE(off + 12); if (id === "data") data = b.subarray(off + 8, off + 8 + size); off += 8 + size + (size % 2); }
  const x = new Float32Array(data.length / 2);
  for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  if (rate === 16000) return x;
  // linear resampling to 16 kHz (the clips are 16 or 24 kHz synthetic speech)
  const n = Math.floor(x.length * 16000 / rate), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * rate / 16000, k = Math.floor(p), f = p - k; y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f; }
  return y;
}

const sess = await ort.InferenceSession.create(model, { intraOpNumThreads: threads, executionProviders: ["cpu"] });
const stateNames = sess.outputNames.filter((n) => n !== "score");
const zeroState = () => Object.fromEntries(sess.inputNames.filter((n) => n !== "chunk").map((n) => {
  const md = sess.inputMetadata?.find?.((m) => m.name === n);
  const dims = md?.shape ?? [];
  const size = dims.reduce((a, b) => a * b, 1);
  return [n, md?.type === "int64" ? new ort.Tensor("int64", new BigInt64Array(size), dims) : new ort.Tensor("float32", new Float32Array(size), dims)];
}));
let warm = zeroState();
const stepTimes = [];
async function step(state, chunk) {
  const t0 = performance.now();
  const out = await sess.run({ chunk: new ort.Tensor("float32", chunk, [1, FRAME]), ...state });
  stepTimes.push(performance.now() - t0);
  const next = {};
  for (const n of stateNames) next[n.replace(/_out$/, "")] = out[n];
  return { state: next, score: Number(out.score.data[0]) };
}
{ let s = warm; for (let i = 0; i < 25; i++) s = (await step(s, new Float32Array(FRAME))).state; warm = s; }
stepTimes.length = 0;

const rows = [];
for (const [name, m] of Object.entries(meta)) {
  const x = read(path.join(FX, `${name}.wav`));
  // 1 s of quiet after the clip, so a late detection can show
  const audio = new Float32Array(x.length + 16000); audio.set(x);
  let s = warm, best = 0;
  const first = Object.fromEntries(THRESH.map((t) => [t, null]));
  for (let i = 0; i + FRAME <= audio.length; i += FRAME) {
    const r = await step(s, audio.subarray(i, i + FRAME));
    s = r.state; best = Math.max(best, r.score);
    const endMs = (i + FRAME) / 16;
    for (const t of THRESH) if (first[t] == null && r.score >= t) first[t] = Math.round(endMs - m.endMs);
  }
  rows.push({ name, kind: m.kind, lang: m.lang, text: m.text, voice: m.voice, best: Math.round(best * 1000) / 1000, first });
}
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const wakes = rows.filter((r) => r.kind === "wake"), others = rows.filter((r) => r.kind !== "wake");
const summary = { model: path.basename(model), threads, msPerChunk: { n: stepTimes.length, p50: Math.round(pct(stepTimes, 0.5) * 100) / 100, p90: Math.round(pct(stepTimes, 0.9) * 100) / 100 } };
for (const t of THRESH) {
  const hit = wakes.filter((r) => r.first[t] != null);
  summary[`t${t}`] = { wakeHits: `${hit.length}/${wakes.length}`, detectMs: { n: hit.length, p50: pct(hit.map((r) => r.first[t]), 0.5), p90: pct(hit.map((r) => r.first[t]), 0.9) }, falseFires: `${others.filter((r) => r.first[t] != null).length}/${others.length}` };
}
console.log(JSON.stringify(summary, null, 1));
for (const r of wakes) console.log(`${r.name.padEnd(16)} ${r.text.padEnd(16)} best ${r.best} first ${JSON.stringify(r.first)}`);
for (const r of others.filter((r) => r.best >= 0.2)) console.log(`NON-WAKE ${r.name} best ${r.best} first ${JSON.stringify(r.first)}`);
fs.mkdirSync(path.join("eval", "v6", "kws"), { recursive: true });
fs.writeFileSync(path.join("eval", "v6", "kws", `offline-${path.basename(model, ".onnx")}.json`), JSON.stringify({ summary, rows }, null, 1));
