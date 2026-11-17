/**
 * Jarvis v6, speech to text on the server: a call ("Hi Jarvis", the name alone) ends the race as soon as one good decode says it, in
 * either language, instead of waiting out the Tamil decode's translation grace (TRANSLATE_GRACE_MS) that a request needs. A request
 * still waits for it. JARVIS_STT_NAME_FAST=0 restores v5. Sentences are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { resetLedger } from "./ledger";
import { hearUtterance, isCall } from "./stt";

const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const abortable = (ms: number, signal?: AbortSignal | null) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
function fake(plan: Record<"ta" | "en", { ms: number; text: string; logprob?: number }>) {
  return (async (_u: string, init: RequestInit) => {
    const p = plan[String((init.body as FormData).get("language")) as "ta" | "en"];
    await abortable(p.ms, init.signal);
    return new Response(JSON.stringify({ text: p.text, duration: 1, segments: [{ avg_logprob: p.logprob ?? -0.15, no_speech_prob: 0.02, compression_ratio: 1.2 }] }), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => { vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-stt6-"))); vi.stubEnv("GROQ_API_KEY", "x"); resetLedger(); });
afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

describe("v6: a call ends the race at once", () => {
  it("isCall: the name alone, with a greeting, in either script; not a request, not the name talked about", () => {
    for (const t of ["Hi Jarvis.", "Hey Jarvis", "Jarvis?", "Hello, Jarvis!", "ஹாய் ஜார்விஸ்.", "ok jarvis"]) expect(isCall(t)).toBe(true);
    for (const t of ["Hi Jarvis, show the severe cases", "Jarvis, go to trends", "I told Jarvis about it", "show the severe cases", ""]) expect(isCall(t)).toBe(false);
  });
  it("English 'Hi Jarvis' back at 30 ms, Tamil still running: answered well before the 700 ms translation grace", async () => {
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: fake({ en: { ms: 30, text: "Hi Jarvis." }, ta: { ms: 1500, text: "ஹாய் ஜார்விஸ்." } }) });
    expect(h).toMatchObject({ text: "Hi Jarvis.", lang: "en" });
    expect(Date.now() - t0).toBeLessThan(400);
  });
  it("a Tamil call back first ends it too", async () => {
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: fake({ en: { ms: 1500, text: "Hi Jarvis." }, ta: { ms: 30, text: "ஹாய் ஜார்விஸ்." } }) });
    expect(h.lang).toBe("ta");
    expect(Date.now() - t0).toBeLessThan(400);
  });
  it("a request still waits for the Tamil decode (the translation check needs it)", async () => {
    const t0 = Date.now();
    await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: fake({ en: { ms: 30, text: "Show the severe cases in Adyar." }, ta: { ms: 500, text: "அடையாறுல தீவிரமான கேஸ்களைக் காட்டு" } }) });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(480);
  });
  it("JARVIS_STT_NAME_FAST=0: the call waits out the grace as in v5", async () => {
    vi.stubEnv("JARVIS_STT_NAME_FAST", "0");
    const t0 = Date.now();
    await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: fake({ en: { ms: 30, text: "Hi Jarvis." }, ta: { ms: 600, text: "ஹாய் ஜார்விஸ்." } }) });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(580);
  });
});

describe("v6 (defect): English speech must not lose to its own Tamil translation", () => {
  // Measured on the Phase 0 real run (17 Nov, eval/v6/latency/phase0-*.json with the server's stt_decode telemetry): of the 22 English
  // commands and questions that reached the two-decode race, 10 were heard as Tamil: the forced-Tamil decode came back as a Tamil
  // TRANSLATION, ok and confident (-0.22 to -0.48), while the forced-English decode was right and MORE confident on all 10 (better by
  // 0.01-0.29), and translated() refused it (it cannot tell which decode is the translation). On the 12 Tamil questions the Tamil decode was
  // always the more confident (by 0.08-1.07); on the Tanglish ones it was as sure or surer (equal once), so the rule leaves them as they were.
  const dec = (lang: "en" | "ta", text: string, logprob: number) =>
    ({ lang, model: lang === "ta" ? "whisper-large-v3" : "whisper-large-v3-turbo", text, segments: [{ avg_logprob: logprob, no_speech_prob: 0.02, compression_ratio: 1.3 }] });
  it("an English sentence (English decode the more confident) keeps its English words", async () => {
    const { choose } = await import("./stt");
    expect(choose([dec("ta", "சிறந்த வாராந்திர காட்சிக்கு மாறவும்.", -0.42), dec("en", "Switch to the weekly view.", -0.16)], "en")?.lang).toBe("en");
    expect(choose([dec("ta", "இன்று அடையாறில் மோசமானது என்ன?", -0.32), dec("en", "What's worst in Adyar today?", -0.24)], "en")?.lang).toBe("en");
  });
  it("a Tamil sentence (Tamil decode the more confident) still refuses the English translation", async () => {
    const { choose } = await import("./stt");
    expect(choose([dec("ta", "அடையாறுல இன்னைக்கு எது ரொம்ப மோசமா இருக்கு?", -0.08), dec("en", "What is the worst in Adyar today?", -0.16)], "en")?.lang).toBe("ta");
    expect(choose([dec("ta", "வேளச்சேரில எத்தனை தீவிரமான புகார்கள் திறந்திருக்கு?", -0.11), dec("en", "How many serious complaints are open in Velachery?", -0.95)], "en")?.lang).toBe("ta");
  });
});
