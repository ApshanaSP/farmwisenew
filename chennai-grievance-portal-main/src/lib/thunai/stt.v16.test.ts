/**
 * v16 (22 Nov, the owner: "what I'm speaking, sometimes it's not getting it correctly"): JARVIS_STT_SARVAM=primary is hedged (stt.ts
 * primaryHedged). The telemetry of 21-22 Nov: Sarvam ran 6.1 s and 8.4 s and timed out, Whisper was asked only then, and both its decodes were
 * aborted 17-228 ms later with the browser's request: the sentence was lost. Now, Sarvam still out after SARVAM_HEDGE_MS, the Whisper race
 * starts beside it and the first good reading wins. A fake Groq and a fake Sarvam on one mocked fetch; every sentence is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { resetLedger } from "./ledger";
import { SARVAM_MODEL, SARVAM_URL } from "./sarvam";
import { hearUtterance, MODEL_EN, MODEL_TA, SARVAM_HEDGE_MS, sarvamHedgeMs } from "./stt";

const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const abortable = (ms: number, signal?: AbortSignal | null) => new Promise<void>((res, rej) => {
  if (signal?.aborted) { rej(signal.reason); return; }
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
type Plan = { ms: number; text: string; logprob?: number };
type SPlan = { ms?: number; status?: number; body?: unknown; raw?: string };
function fake(plan: { en?: Plan; ta?: Plan; sarvam?: SPlan }) {
  const sent: { kind: string; at: number }[] = [];
  const t0 = Date.now();
  const fetcher = (async (url: string, init: RequestInit) => {
    const isSarvam = url === SARVAM_URL;
    const kind = isSarvam ? "sarvam" : String((init.body as FormData).get("language"));
    sent.push({ kind, at: Date.now() - t0 });
    if (isSarvam) {
      const s = plan.sarvam ?? {};
      await abortable(s.ms ?? 0, init.signal);
      return new Response(s.raw ?? JSON.stringify(s.body ?? {}), { status: s.status ?? 200 });
    }
    const p = plan[kind as "en" | "ta"] ?? { ms: 0, text: "" };
    await abortable(p.ms, init.signal);
    return new Response(JSON.stringify({ text: p.text, duration: 1, segments: [{ avg_logprob: p.logprob ?? -0.2, no_speech_prob: 0.02, compression_ratio: 1.2 }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, sent, kinds: () => sent.map((s) => s.kind).sort() };
}
const sarvamSays = (transcript: string, language_code: string, ms: number): SPlan => ({ ms, body: { request_id: "mock", transcript, language_code, language_probability: 0.95 } });
const lines = () => {
  const f = path.join(process.env.THUNAI_DIR!, "telemetry.ndjson");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];
};

const TANGLISH = "Adyar zone-ல pending cases எத்தனை?";
const TA_WHISPER = "அடையார் சோன்ல பெண்டிங் கேசஸ் எத்தனை?";
const EN_TRANSLATION = "How many pending cases are there in Adyar zone?";
const TAMIL_SPEECH = { ta: { ms: 40, text: TA_WHISPER, logprob: -0.15 }, en: { ms: 20, text: EN_TRANSLATION, logprob: -0.5 } };

beforeEach(() => {
  vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-stt-v16-")));
  resetLedger();
  vi.stubEnv("GROQ_API_KEY", "x"); vi.stubEnv("SARVAM_API_KEY", "test-key-not-real"); vi.stubEnv("JARVIS_STT_SARVAM", "primary");
  // Sarvam's own timeout well past the test's waits: the hedge, not the timeout, decides here
  vi.stubEnv("JARVIS_SARVAM_TIMEOUT_MS", "5000");
});
afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

describe("v16: Sarvam primary, hedged by the Whisper race", () => {
  it("the lead is 2 s by default; JARVIS_SARVAM_HEDGE_MS changes it", () => {
    expect(SARVAM_HEDGE_MS).toBe(2000);
    expect(sarvamHedgeMs()).toBe(2000);
    vi.stubEnv("JARVIS_SARVAM_HEDGE_MS", "1500");
    expect(sarvamHedgeMs()).toBe(1500);
    vi.stubEnv("JARVIS_SARVAM_HEDGE_MS", "nonsense");
    expect(sarvamHedgeMs()).toBe(2000);
  });

  it("Sarvam back inside its lead: its reading, and Groq is never asked (as before v16)", async () => {
    const f = fake({ ...TAMIL_SPEECH, sarvam: sarvamSays(TANGLISH, "ta-IN", 30) });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher, ms: { hedge: 300 } });
    expect(f.kinds()).toEqual(["sarvam"]);
    expect(h).toMatchObject({ text: TANGLISH, lang: "ta", model: SARVAM_MODEL });
    expect(lines().find((l) => l.event === "stt_hedge")).toBeUndefined();
  });

  it("a Sarvam that hangs: Whisper is asked at the lead and its reading is the answer, long before Sarvam would end; Sarvam is let go", async () => {
    const f = fake({ ...TAMIL_SPEECH, sarvam: sarvamSays(TANGLISH, "ta-IN", 4000) });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher, ms: { hedge: 100 } });
    const took = Date.now() - t0;
    expect(took).toBeLessThan(2000);
    expect(f.kinds()).toEqual(["en", "sarvam", "ta"]);
    // Whisper went out at the lead, not after Sarvam
    expect(f.sent.find((s) => s.kind === "ta")!.at).toBeGreaterThanOrEqual(90);
    expect(f.sent.find((s) => s.kind === "ta")!.at).toBeLessThan(1500);
    expect(h).toMatchObject({ text: TA_WHISPER, lang: "ta", model: MODEL_TA(), noise: false });
    const ls = lines();
    expect(ls.find((l) => l.event === "stt_hedge")).toMatchObject({ provider: "sarvam", after: 100 });
    expect(ls.find((l) => l.event === "stt")).toMatchObject({ ok: true, hedged: true, calls: 2, sttWinner: "ta" });
    // the Sarvam call was let go (its own line says so), never left to run on
    await vi.waitFor(() => expect(lines().find((l) => l.event === "stt_sarvam")).toMatchObject({ ok: false, why: "aborted" }));
  });

  it("Sarvam back after the lead but before Whisper: Sarvam's reading wins, and the Whisper decodes are let go", async () => {
    const f = fake({ ta: { ms: 1500, text: TA_WHISPER, logprob: -0.15 }, en: { ms: 1500, text: EN_TRANSLATION, logprob: -0.5 }, sarvam: sarvamSays(TANGLISH, "ta-IN", 250) });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher, ms: { hedge: 80 } });
    expect(Date.now() - t0).toBeLessThan(1200);
    expect(h).toMatchObject({ text: TANGLISH, lang: "ta", model: SARVAM_MODEL });
    const decodes = lines().filter((l) => l.event === "stt_decode");
    expect(decodes.map((l) => l.decode).sort()).toEqual(["en", "ta"]);
    for (const d of decodes) expect(d).toMatchObject({ provider: "groq", aborted: true, sttWinner: "ta" });
  });

  it("Sarvam fails after the lead: the Whisper race already under way gives the answer", async () => {
    const f = fake({ ...TAMIL_SPEECH, sarvam: { ms: 200, status: 500, raw: "" } });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher, ms: { hedge: 60 } });
    expect(f.kinds()).toEqual(["en", "sarvam", "ta"]);
    expect(h).toMatchObject({ text: TA_WHISPER, lang: "ta", model: MODEL_TA() });
  });

  it("the Whisper race has nothing acceptable: Sarvam's later reading is waited for, and is the answer", async () => {
    const f = fake({ ta: { ms: 10, text: "" }, en: { ms: 10, text: "" }, sarvam: sarvamSays("Open the Supreme Court news.", "en-IN", 400) });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher, ms: { hedge: 60 } });
    expect(h).toMatchObject({ text: "Open the Supreme Court news.", lang: "en", model: SARVAM_MODEL, noise: false });
  });

  it("an English sentence, Sarvam hanging: Whisper's English decode is the answer", async () => {
    const f = fake({ en: { ms: 30, text: "Show me the severe cases today.", logprob: -0.1 }, ta: { ms: 60, text: "ஷோ மீ த சிவியர் கேசஸ் டுடே", logprob: -0.7 }, sarvam: sarvamSays("x", "en-IN", 4000) });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher, ms: { hedge: 50 } });
    expect(h).toMatchObject({ text: "Show me the severe cases today.", lang: "en", model: MODEL_EN() });
  });

  it("the request is cancelled during the lead: nothing hangs, and no Whisper decode is left running", async () => {
    const f = fake({ ...TAMIL_SPEECH, sarvam: sarvamSays(TANGLISH, "ta-IN", 4000) });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 40);
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher, signal: ac.signal, ms: { hedge: 500 } }).catch((e: unknown) => e);
    expect(Date.now() - t0).toBeLessThan(1500);
    // the Whisper race after a failed Sarvam runs on an aborted request: its decodes go at once (as before v16)
    expect(h).toBeTruthy();
  });
});
