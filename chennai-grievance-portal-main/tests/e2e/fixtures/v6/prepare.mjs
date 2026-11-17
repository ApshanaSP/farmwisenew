/**
 * v6 latency clips: raw/<name>.wav (Windows voices, Gemini) -> <name>.wav, mono 16-bit at the source's rate, its own silence trimmed,
 * a known 600 ms lead-in of quiet noise and a 500 ms quiet tail. v6.json records, from the samples, where speech starts (speechMs)
 * and where its LAST voiced 10 ms window ends (endMs): the "end of speech" every v6 latency is timed from, independent of any
 * detector.
 *   node tests/e2e/fixtures/v6/prepare.mjs
 */
import fs from "fs";
import path from "path";

const here = path.join("tests", "e2e", "fixtures", "v6");
const clips = JSON.parse(fs.readFileSync(path.join(here, "clips.json"), "utf8"));
const LEAD_MS = 600, TAIL_MS = 500;

function read(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF") throw new Error(`${file}: not RIFF`);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { ch: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22), tag: b.readUInt16LE(off + 8) };
    if (id === "data") data = b.subarray(off + 8, off + 8 + Math.min(size, b.length - off - 8));
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error(`${file}: unsupported (${JSON.stringify(fmt)})`);
  const n = Math.floor(data.length / 2 / fmt.ch), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); x[i] = s / fmt.ch; }
  return { rate: fmt.rate, x };
}
function write(file, rate, x) {
  const pcm = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i]))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}
// a seeded generator, so the noise is the same every time the clips are made
let seed = 20261117;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const noise = (n) => Float64Array.from({ length: n }, () => (rnd() * 2 - 1) * 12);

const meta = {};
for (const [name, c] of Object.entries(clips)) {
  const src = path.join(here, "raw", `${name}.wav`);
  if (!fs.existsSync(src)) { console.log(`${name}: no raw clip yet`); continue; }
  const { rate, x } = read(src);
  const win = Math.round(rate / 100), frames = Math.floor(x.length / win);
  const rms = Array.from({ length: frames }, (_, f) => { let s = 0; for (let i = f * win; i < (f + 1) * win; i++) s += x[i] * x[i]; return Math.sqrt(s / win); });
  const peak = Math.max(...rms), thr = Math.max(peak * 0.06, 250);
  const first = rms.findIndex((r) => r > thr), last = frames - 1 - [...rms].reverse().findIndex((r) => r > thr);
  const from = Math.max(0, (first - 2) * win), to = Math.min(x.length, (last + 4) * win);
  const body = x.subarray(from, to);
  const lead = Math.round(LEAD_MS * rate / 1000), tail = Math.round(TAIL_MS * rate / 1000);
  const y = new Float64Array(lead + body.length + tail);
  y.set(noise(lead), 0); y.set(body, lead); y.set(noise(tail), lead + body.length);
  write(path.join(here, `${name}.wav`), rate, y);
  const speechMs = Math.round((lead + (first * win - from)) * 1000 / rate);
  const endMs = Math.round((lead + ((last + 1) * win - from)) * 1000 / rate);
  meta[name] = { ...c, style: undefined, rate, speechMs, endMs, durMs: Math.round(y.length * 1000 / rate) };
}
fs.writeFileSync(path.join(here, "v6.json"), JSON.stringify(meta, null, 1));
console.log(Object.entries(meta).map(([n, m]) => `${n} ${m.rate} speech ${m.speechMs}-${m.endMs} of ${m.durMs}`).join("\n"));
