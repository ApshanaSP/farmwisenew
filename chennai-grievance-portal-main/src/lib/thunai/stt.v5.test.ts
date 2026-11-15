/**
 * Jarvis v5 (JARVIS_V5_BUILD_2 section 8), speech to text on the server. Every sentence here is invented for the test.
 *   B1: the Gemini third racer is gone; the two forced-language Whisper decodes stay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { resetLedger } from "./ledger";
import { hearUtterance } from "./stt";

const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const abortable = (ms: number, signal?: AbortSignal | null) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
type Plan = { ms: number; text: string; logprob?: number; noSpeech?: number };
/** A fake Groq (and a fake Gemini, so a request to it would be seen): each forced decode answers after its own delay. */
function fake(plan: Partial<Record<"ta" | "en" | "gemini", Plan>>) {
  const urls: string[] = [];
  const fetcher = (async (u: string, init: RequestInit) => {
    urls.push(u);
    const gem = u.includes("generativelanguage");
    const kind = gem ? "gemini" : String((init.body as FormData).get("language"));
    const p = plan[kind as "ta"] ?? { ms: 0, text: "" };
    await abortable(p.ms, init.signal);
    if (gem) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: p.text }] } }] }), { status: 200 });
    return new Response(JSON.stringify({ text: p.text, duration: 1, segments: [{ avg_logprob: p.logprob ?? -0.2, no_speech_prob: p.noSpeech ?? 0.02, compression_ratio: 1.2 }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, urls };
}

beforeEach(() => { vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-stt5-"))); vi.stubEnv("GROQ_API_KEY", "x"); resetLedger(); });
afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

describe("B1: the Gemini third racer is gone", () => {
  it("no Gemini transcribe request on an engaged or named turn, even with GEMINI_API_KEY set, whether Whisper is sure or unsure", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    const unsure = fake({ en: { ms: 20, text: "pump status near the canal", logprob: -1.3 }, ta: { ms: 20, text: "கால்வாய் பம்ப் நிலை", logprob: -1.3 }, gemini: { ms: 20, text: "pump status near the canal" } });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: unsure.fetcher });
    expect(unsure.urls.some((u) => u.includes("generativelanguage"))).toBe(false);
    expect(unsure.urls.length).toBe(2);
    // Whisper's own decode is used when it is unsure; nothing is waited for beyond the two forced decodes
    expect(h).toMatchObject({ text: "pump status near the canal", lang: "en", noise: false });
    const sure = fake({ en: { ms: 20, text: "open the rainfall page", logprob: -0.1 }, ta: { ms: 20, text: "ஓபன் த ரெயின்ஃபால் பேஜ்", logprob: -0.3 } });
    await hearUtterance(wav(), { lane: "named", site: "en", fetcher: sure.fetcher });
    expect(sure.urls.some((u) => u.includes("generativelanguage"))).toBe(false);
  });
  it("an unsure ambient sentence with the name in it is read once more by Whisper only", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    const { fetcher, urls } = fake({ en: { ms: 10, text: "Jarvis, pump status near the canal", logprob: -0.9 }, ta: { ms: 10, text: "ஜார்விஸ், கால்வாய் பம்ப் நிலை", logprob: -0.3 } });
    const h = await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher });
    expect(urls.length).toBe(2);
    expect(urls.every((u) => u.includes("api.groq.com"))).toBe(true);
    expect(h).toMatchObject({ lang: "ta", noise: false });
  });
});
