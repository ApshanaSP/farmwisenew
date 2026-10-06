/**
 * The embedding model for Ask District IQ's meaning search, on its own thread (started by src/lib/assistant/embed.ts).
 * Tokenising and running multilingual-e5 takes the CPU for seconds at a time; on the web server's main thread that
 * held every other request (a 75 ms list took up to 15 s). Here it runs beside the server, which only posts texts and
 * receives vectors.
 *
 * In:  { id, texts }                 Out: { id, data: Float32Array (transferred), n, dim } or { id, error }
 * Start: { ready: true } once the model is loaded, or { fail } if it cannot be.
 */
import { parentPort, workerData } from "node:worker_threads";

try {
  const tf = await import(workerData.entry);
  tf.env.cacheDir = workerData.cacheDir;
  const t0 = Date.now();
  const fe = await tf.pipeline("feature-extraction", workerData.model, {
    dtype: "q8", session_options: { intraOpNumThreads: workerData.threads, interOpNumThreads: 1 }
  });
  parentPort.postMessage({ ready: true, ms: Date.now() - t0 });
  // one request at a time, in order
  let chain = Promise.resolve();
  parentPort.on("message", ({ id, texts }) => {
    chain = chain.then(async () => {
      try {
        const out = await fe(texts, { pooling: "mean", normalize: true });
        const data = Float32Array.from(out.data);
        parentPort.postMessage({ id, data, n: out.dims[0], dim: out.dims[1] }, [data.buffer]);
      } catch (e) {
        parentPort.postMessage({ id, error: String(e?.message ?? e) });
      }
    });
  });
} catch (e) {
  parentPort.postMessage({ fail: String(e?.message ?? e) });
}
