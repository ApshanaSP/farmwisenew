/**
 * Jarvis v5 E3: does the warm connection (keepalive.ts) save time on a Whisper request? Run once, by hand:
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/keepalive.live.ts
 * 12 requests to Groq's whisper-large-v3-turbo transcription endpoint (of the free tier's 2,000 a day): 6 with Node's built-in fetch
 * and 6 with keepalive.ts's undici fetch on its keep-alive Agent, alternating, 10 s apart (longer than the built-in fetch's 4 s idle
 * limit, as a Collector's turns are). Whisper only: never a chat model, never Claude (groqOnly() first).
 * The audio is a synthetic 1-second quiet tone made here in code: no recording of anyone, nothing stored. The key comes from
 * process.env.GROQ_API_KEY (the live config loads .env) and is never printed; neither is anything Whisper writes back. Prints each
 * request's time and status, and p50 and p90 (nearest rank) for each fetch.
 * Run 15 Nov 2026 (undici 8.12.4): built-in p50 374 / p90 457 ms; keep-alive p50 235 / p90 858 ms (its first, cold request); gain
 * at p50 139 ms, so JARVIS_KEEPALIVE defaults on (keepalive.ts). An earlier try stopped after 2 requests: undici's fetch was given
 * the built-in FormData and sent "[object FormData]" (400); keepalive.ts now copies it into undici's own FormData.
 */
import { expect, it } from "vitest";
import { groqOnly } from "./liverecord";
import { warmFetch } from "./keepalive";

groqOnly();

const URL_ = "https://api.groq.com/openai/v1/audio/transcriptions";
const GAP_MS = 10_000;
const ROUNDS = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 1 s of a quiet 440 Hz tone, 16 kHz mono 16-bit PCM, as a WAV */
function tone(): ArrayBuffer {
  const rate = 16_000, n = rate, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(0.05 * 32767 * Math.sin((2 * Math.PI * 440 * i) / rate)), true);
  return b;
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };

it.runIf(!!process.env.GROQ_API_KEY)("E3: Whisper request time, built-in fetch against the keep-alive fetch", async () => {
  const key = process.env.GROQ_API_KEY!;
  const wav = tone();
  const arms: Record<"builtin" | "keepalive", typeof fetch> = { builtin: globalThis.fetch, keepalive: warmFetch };
  const times: Record<"builtin" | "keepalive", number[]> = { builtin: [], keepalive: [] };
  for (let i = 0; i < ROUNDS * 2; i++) {
    const arm = i % 2 === 0 ? "builtin" : "keepalive";
    const f = new FormData();
    f.append("file", new Blob([wav], { type: "audio/wav" }), "tone.wav");
    f.append("model", "whisper-large-v3-turbo");
    f.append("response_format", "json");
    f.append("temperature", "0");
    f.append("language", "en");
    const t0 = performance.now();
    const r = await arms[arm](URL_, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: f, signal: AbortSignal.timeout(15_000) });
    await r.arrayBuffer();
    const ms = Math.round(performance.now() - t0);
    console.log(`request ${i + 1} ${arm} status ${r.status} ${ms} ms`);
    if (r.status === 429) throw new Error("capacity: Groq returned 429; stop and report, do not retry");
    expect(r.ok).toBe(true);
    times[arm].push(ms);
    if (i < ROUNDS * 2 - 1) await sleep(GAP_MS);
  }
  for (const arm of ["builtin", "keepalive"] as const) console.log(`${arm}: n ${times[arm].length}, p50 ${pct(times[arm], 0.5)} ms, p90 ${pct(times[arm], 0.9)} ms, all [${times[arm].join(", ")}]`);
  console.log(`gain at p50: ${pct(times.builtin, 0.5) - pct(times.keepalive, 0.5)} ms; at p90: ${pct(times.builtin, 0.9) - pct(times.keepalive, 0.9)} ms`);
});
