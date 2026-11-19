/**
 * Jarvis v8, Sarvam's replies replayed from files (__fixtures__/sarvam): each body is served as it is, under the status cases.json
 * gives it, to the client (sarvam.ts) and to the race (stt.ts with JARVIS_STT_SARVAM=tamil). The bodies are SYNTHETIC for now (see the
 * folder's README): written from Sarvam's documented shapes, not recorded, since no key exists yet. Recorded bodies drop in the same way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { resetLedger } from "./ledger";
import { SARVAM_MODEL, SARVAM_URL, sarvamTranscribe, type SarvamFail } from "./sarvam";
import { hearUtterance, MODEL_EN, MODEL_TA } from "./stt";

const DIR = path.join(__dirname, "__fixtures__", "sarvam");
type Case = { file: string; status: number; expect: { text?: string; lang?: "en" | "ta"; prob?: number | null; fail?: string }; tamil: "sarvam" | "whisper-en" | "whisper-ta" };
const { cases } = JSON.parse(fs.readFileSync(path.join(DIR, "cases.json"), "utf8")) as { cases: Case[] };
const body = (file: string) => fs.readFileSync(path.join(DIR, file), "utf8");

const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const EN_WHISPER = "Show the cases.";
const TA_WHISPER = "இன்னைக்கு புகார்கள் காட்டு";
/** Sarvam replays the file; Groq's forced decodes are both confident (the Tamil one is asked only when Sarvam fails) */
function replay(c: Case) {
  const kinds: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url === SARVAM_URL) { kinds.push("sarvam"); return new Response(body(c.file), { status: c.status, headers: { "content-type": "application/json" } }); }
    const lang = String((init.body as FormData).get("language"));
    kinds.push(lang);
    return new Response(JSON.stringify({ text: lang === "ta" ? TA_WHISPER : EN_WHISPER, duration: 1, segments: [{ avg_logprob: -0.1, no_speech_prob: 0.02, compression_ratio: 1.2 }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, kinds };
}
const fresh = () => { vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-sarvam-fx-"))); resetLedger(); };

beforeEach(() => { fresh(); vi.stubEnv("GROQ_API_KEY", "x"); vi.stubEnv("SARVAM_API_KEY", "test-key-not-real"); });
afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

describe("the fixture set", () => {
  it("is labelled synthetic, every body file has a case, and every case's file exists and is JSON", () => {
    expect(fs.readFileSync(path.join(DIR, "README.md"), "utf8")).toMatch(/SYNTHETIC/);
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "cases.json");
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) expect(cases.some((c) => c.file === f), f).toBe(true);
    for (const c of cases) expect(() => JSON.parse(body(c.file)), c.file).not.toThrow();
  });
  it("covers English, Tamil, codemix Tanglish, silence, another language, and each documented error status", () => {
    const ok = cases.filter((c) => c.status === 200 && !c.expect.fail);
    expect(new Set(ok.map((c) => c.expect.lang))).toEqual(new Set(["en", "ta"]));
    expect(ok.some((c) => /[a-z]/i.test(c.expect.text ?? "") && /[஀-௿]/.test(c.expect.text ?? ""))).toBe(true);
    expect(ok.some((c) => c.expect.text === "")).toBe(true);
    expect(new Set(cases.map((c) => c.status))).toEqual(new Set([200, 400, 401, 402, 403, 429, 500, 503]));
  });
});

describe("replayed to the client", () => {
  for (const c of cases) {
    it(`${c.file} (${c.status}): ${c.expect.fail ? `fails, ${c.expect.fail}` : `${c.expect.lang}`}`, async () => {
      const p = sarvamTranscribe(wav(), { secs: 1, fetcher: replay(c).fetcher, lane: "eval" });
      if (c.expect.fail) {
        const e = await p.then(() => null, (x: SarvamFail) => x);
        expect(e).toMatchObject({ name: "SarvamFail", why: c.expect.fail, status: c.status });
      } else {
        expect(await p).toMatchObject({ text: c.expect.text, lang: c.expect.lang, prob: c.expect.prob, model: SARVAM_MODEL });
      }
    });
  }
});

describe("replayed to the race (JARVIS_STT_SARVAM=tamil, the Tamil site)", () => {
  for (const c of cases) {
    it(`${c.file} (${c.status}): answered by ${c.tamil}`, async () => {
      vi.stubEnv("JARVIS_STT_SARVAM", "tamil");
      const { fetcher, kinds } = replay(c);
      const h = await hearUtterance(wav(), { lane: "engaged", site: "ta", fetcher });
      if (c.tamil === "sarvam") expect(h).toMatchObject({ text: c.expect.text, lang: "ta", model: SARVAM_MODEL });
      if (c.tamil === "whisper-en") expect(h).toMatchObject({ text: EN_WHISPER, lang: "en", model: MODEL_EN() });
      if (c.tamil === "whisper-ta") expect(h).toMatchObject({ text: TA_WHISPER, lang: "ta", model: MODEL_TA() });
      // Whisper's forced-Tamil decode is asked only when Sarvam's reply is no use
      expect(kinds.includes("ta")).toBe(c.tamil === "whisper-ta");
    });
  }
});
