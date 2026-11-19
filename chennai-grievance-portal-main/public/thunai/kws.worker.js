// Jarvis's on-device wake word (v6), in its own module worker so nothing on the page (Silero, React) can hold it up, and nothing it
// loads can touch the page's own onnxruntime-web instance (v5's install clash). The model is LiveKit WakeWord's `hey_jarvis.onnx`
// (Apache-2.0, code and weights: LICENSE-livekit-wakeword.txt beside it). The streaming loop follows LiveKit's own JS client
// (client/js/src/model.ts, Apache-2.0): 80 ms chunks of 16 kHz float audio, the model's state tensors carried from chunk to chunk,
// 25 chunks of silence first. Audio never leaves this worker; it posts only scores and sample counts.
//
// in:  { type: "init", model, ort, threshold, cooldownMs }   { type: "audio", samples: Float32Array (16 kHz), end: sample count }
//      { type: "reset" }
// out: { type: "ready" } | { type: "error", why } | { type: "wake", score, end, ms } | { type: "score", score, end } (every 25th chunk)
const FRAME = 1280;
let ort = null, sess = null, state = {}, warm = {}, names = [];
let pending = new Float32Array(FRAME), filled = 0, threshold = 0.5, cooldown = 1500, quietUntil = 0, chunks = 0, busy = Promise.resolve();

function zeros() {
  const out = {};
  for (const m of sess.inputMetadata ?? []) {
    if (m.name === "chunk") continue;
    const dims = m.shape;
    const size = dims.reduce((a, b) => a * b, 1);
    out[m.name] = m.type === "int64" ? new ort.Tensor("int64", new BigInt64Array(size), dims) : new ort.Tensor("float32", new Float32Array(size), dims);
  }
  return out;
}
async function step(chunk) {
  const out = await sess.run({ chunk: new ort.Tensor("float32", chunk, [1, FRAME]), ...state });
  const next = {};
  for (const n of names) next[n.replace(/_out$/, "")] = out[n];
  state = next;
  return Number(out.score.data[0]);
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") {
    busy = busy.then(async () => {
      try {
        ort = await import(m.ort + "ort.wasm.min.mjs");
        ort.env.wasm.wasmPaths = m.ort;
        ort.env.wasm.numThreads = 1;
        sess = await ort.InferenceSession.create(m.model, { executionProviders: ["wasm"] });
        names = sess.outputNames.filter((n) => n !== "score");
        threshold = m.threshold ?? 0.5;
        cooldown = m.cooldownMs ?? 1500;
        state = zeros();
        const silence = new Float32Array(FRAME);
        for (let i = 0; i < 25; i++) await step(silence);
        warm = state;
        self.postMessage({ type: "ready" });
      } catch (e) {
        sess = null;
        self.postMessage({ type: "error", why: String((e && e.message) || e).slice(0, 120) });
      }
    });
  } else if (m.type === "reset") {
    busy = busy.then(() => { state = warm; filled = 0; });
  } else if (m.type === "audio" && sess) {
    const x = m.samples, end = m.end;
    busy = busy.then(async () => {
      let pos = 0;
      while (pos < x.length) {
        const n = Math.min(FRAME - filled, x.length - pos);
        pending.set(x.subarray(pos, pos + n), filled);
        filled += n; pos += n;
        if (filled < FRAME) continue;
        const chunk = pending;
        pending = new Float32Array(FRAME); filled = 0;
        const t0 = performance.now();
        const score = await step(chunk);
        const ms = performance.now() - t0;
        // the sample count at this chunk's end: what the model has heard up to
        const at = end - (x.length - pos);
        chunks++;
        if (score >= threshold && at >= quietUntil) {
          quietUntil = at + Math.round(cooldown * 16);
          self.postMessage({ type: "wake", score, end: at, ms });
          // a fresh state after a detection, so the same phrase never fires twice
          state = warm;
        } else if (chunks % 25 === 0) self.postMessage({ type: "score", score, end: at, ms });
      }
    }).catch(() => undefined);
  }
};
