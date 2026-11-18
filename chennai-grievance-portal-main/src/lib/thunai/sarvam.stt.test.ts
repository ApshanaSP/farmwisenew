/**
 * Jarvis v8, Sarvam in the hearing race (stt.ts hearUtterance with JARVIS_STT_SARVAM): a fake Groq and a fake Sarvam on one mocked
 * fetch, no network, no key (a made-up string). Every sentence is invented for the test.
 *   off (unset, 0, anything else, or no key, or the ambient lane): no Sarvam request, today's race exactly
 *   tamil: Sarvam takes the forced-Tamil Whisper decode's place; Groq's English decode still runs; Whisper's Tamil decode only on failure
 *   primary: Sarvam first; the whole Whisper race only on failure
 *   shadow: Whisper decides; Sarvam's timing and agreement are logged, never its words
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { ledger, resetLedger } from "./ledger";
import { SARVAM_MODEL, SARVAM_ORG, SARVAM_URL, shadowSettled } from "./sarvam";
import { choose, hearUtterance, MODEL_EN, MODEL_TA, SARVAM_LOGPROB, sarvamDecode, scoreDecode, type Heard } from "./stt";

const KEY = "test-key-not-real";
const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const abortable = (ms: number, signal?: AbortSignal | null) => new Promise<void>((res, rej) => {
  if (signal?.aborted) { rej(signal.reason); return; }
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});

type Plan = { ms: number; text: string; logprob?: number };
type SPlan = { ms?: number; status?: number; body?: unknown; raw?: string };
/** One fetch for both: Groq's forced decodes by their `language` field, Sarvam by its URL. Keeps each request's kind and fields. */
function fake(plan: { en?: Plan; ta?: Plan; sarvam?: SPlan }) {
  const sent: { kind: string; fields: Record<string, string> }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const form = init.body as FormData;
    const isSarvam = url === SARVAM_URL;
    const kind = isSarvam ? "sarvam" : String(form.get("language"));
    const fields: Record<string, string> = {};
    form.forEach((v, k) => { if (typeof v === "string") fields[k] = v; });
    sent.push({ kind, fields });
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
const sarvamSays = (transcript: string, language_code: string | null, ms = 30, language_probability: number | null = 0.93): SPlan =>
  ({ ms, body: { request_id: "mock_1", transcript, language_code, language_probability } });

// the sentences: Tamil-English speech, Whisper's forced decodes of it, and Sarvam's codemix reading
const TANGLISH = "Adyar zone-ல pending cases எத்தனை?";
const TA_WHISPER = "அடையார் சோன்ல பெண்டிங் கேசஸ் எத்தனை?";
const EN_TRANSLATION = "How many pending cases are there in Adyar zone?";
const EN = "Open the Supreme Court news.";
/** Tamil speech as today's two forced decodes hear it: the Tamil one far surer than the English one (so today's race picks Tamil) */
const TAMIL_SPEECH = { ta: { ms: 40, text: TA_WHISPER, logprob: -0.15 }, en: { ms: 20, text: EN_TRANSLATION, logprob: -0.5 } };

/** a Heard without its clocks (ms, timing), to compare two runs */
const strip = (h: Heard) => { const { ms: _ms, timing: _t, ...rest } = h; void _ms; void _t; return rest; };
const telemetryLines = () => {
  const f = path.join(process.env.THUNAI_DIR!, "telemetry.ndjson");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];
};
const fresh = () => { vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-sarvam-stt-"))); resetLedger(); };
/** today's answer for a plan: the flag off and no Sarvam key, in a fresh ledger */
async function today(plan: { en?: Plan; ta?: Plan }, o: { site?: "en" | "ta"; lane?: "engaged" | "named" | "ambient" } = {}) {
  const key = process.env.SARVAM_API_KEY, flag = process.env.JARVIS_STT_SARVAM;
  vi.stubEnv("SARVAM_API_KEY", "");
  vi.stubEnv("JARVIS_STT_SARVAM", "");
  fresh();
  const f = fake(plan);
  const h = await hearUtterance(wav(), { lane: o.lane ?? "engaged", site: o.site ?? "en", fetcher: f.fetcher });
  vi.stubEnv("SARVAM_API_KEY", key ?? "");
  vi.stubEnv("JARVIS_STT_SARVAM", flag ?? "");
  fresh();
  return { h, sent: f.sent };
}

beforeEach(() => { fresh(); vi.stubEnv("GROQ_API_KEY", "x"); vi.stubEnv("SARVAM_API_KEY", KEY); });
afterEach(async () => { await shadowSettled(); vi.unstubAllEnvs(); resetLedger(); });

describe("off: no Sarvam request, today's race exactly", () => {
  for (const flag of [undefined, "0", "1", "yes"]) {
    it(`JARVIS_STT_SARVAM=${flag ?? "(unset)"} with a key set: the same requests, fields and answer as with no key at all`, async () => {
      const base = await today(TAMIL_SPEECH);
      if (flag != null) vi.stubEnv("JARVIS_STT_SARVAM", flag);
      const f = fake(TAMIL_SPEECH);
      const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
      expect(f.kinds()).toEqual(["en", "ta"]);
      expect(f.sent).toEqual(base.sent);
      expect(strip(h)).toEqual(strip(base.h));
      expect(h).toMatchObject({ text: TA_WHISPER, lang: "ta", model: MODEL_TA() });
      expect(ledger().spent(SARVAM_ORG, SARVAM_MODEL, 86_400_000).requests).toBe(0);
      expect(JSON.stringify(telemetryLines())).not.toMatch(/sarvam/);
    });
  }
  for (const flag of ["tamil", "primary", "shadow"]) {
    it(`${flag} without SARVAM_API_KEY: skipped, no Sarvam request, today's answer`, async () => {
      const base = await today(TAMIL_SPEECH);
      vi.stubEnv("SARVAM_API_KEY", "");
      vi.stubEnv("JARVIS_STT_SARVAM", flag);
      const f = fake(TAMIL_SPEECH);
      const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
      expect(f.kinds()).toEqual(["en", "ta"]);
      expect(strip(h)).toEqual(strip(base.h));
    });
    it(`${flag} on the ambient lane: Whisper only (room talk never spends Sarvam credit)`, async () => {
      vi.stubEnv("JARVIS_STT_SARVAM", flag);
      const f = fake({ en: { ms: 10, text: "the file is on the table", logprob: -0.2 }, sarvam: sarvamSays(EN, "en-IN") });
      await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher: f.fetcher });
      expect(f.kinds()).toEqual(["en"]);
    });
  }
});

describe("tamil: Sarvam takes the forced-Tamil Whisper decode's place", () => {
  beforeEach(() => { vi.stubEnv("JARVIS_STT_SARVAM", "tamil"); });
  it("Tanglish speech: Groq gets only the English decode; Sarvam's codemix reading wins over Whisper's confident English translation", async () => {
    const f = fake({ en: { ms: 20, text: EN_TRANSLATION, logprob: -0.1 }, sarvam: sarvamSays(TANGLISH, "ta-IN", 60) });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
    expect(f.kinds()).toEqual(["en", "sarvam"]);
    expect(h).toMatchObject({ text: TANGLISH, lang: "ta", noise: false, model: SARVAM_MODEL, conf: { speech: 1, logprob: SARVAM_LOGPROB } });
  });
  it("Tamil speech on the Tamil site: Sarvam's Tamil reading", async () => {
    const said = "அடையாறுல இன்னைக்கு எது ரொம்ப மோசமா இருக்கு?";
    const f = fake({ en: { ms: 20, text: "What is the worst in Adyar today?", logprob: -0.4 }, sarvam: sarvamSays(said, "ta-IN", 30, 0.99) });
    expect(await hearUtterance(wav(), { lane: "named", site: "ta", fetcher: f.fetcher })).toMatchObject({ text: said, lang: "ta", model: SARVAM_MODEL });
  });
  it("English speech: Sarvam says en-IN and Whisper's English decode is good, so Whisper's words are used", async () => {
    const f = fake({ en: { ms: 20, text: "Open the Supreme Court news.", logprob: -0.15 }, sarvam: sarvamSays("open the supreme court news", "en-IN", 40, 0.98) });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
    expect(f.kinds()).toEqual(["en", "sarvam"]);
    expect(h).toMatchObject({ text: "Open the Supreme Court news.", lang: "en", model: MODEL_EN() });
  });
  it("English speech that Whisper's English decode missed: Sarvam's English words", async () => {
    const f = fake({ en: { ms: 20, text: "", logprob: -0.2 }, sarvam: sarvamSays(EN, "en-IN", 40) });
    expect(await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher })).toMatchObject({ text: EN, lang: "en", model: SARVAM_MODEL });
  });
  it("the name alone from Sarvam ends the race at once (v6's call rule holds for Sarvam's decode too)", async () => {
    const f = fake({ en: { ms: 900, text: "Hi Jarvis.", logprob: -0.2 }, sarvam: sarvamSays("ஹாய் ஜார்விஸ்.", "ta-IN", 20) });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "named", site: "ta", fetcher: f.fetcher });
    expect(h).toMatchObject({ text: "ஹாய் ஜார்விஸ்.", lang: "ta" });
    expect(Date.now() - t0).toBeLessThan(700);
  });
  const failures: [string, SPlan][] = [
    ["401", { status: 401, body: { error: { code: "invalid_api_key_error", message: "x" } } }],
    ["429", { status: 429, body: { error: { code: "rate_limit_exceeded_error", message: "x" } } }],
    ["500", { status: 500, body: { error: { code: "internal_server_error", message: "x" } } }],
    ["malformed JSON", { raw: "{\"transcript\": " }],
    ["an empty transcript", { body: { transcript: "", language_code: null, language_probability: null } }],
    ["another script", { body: { transcript: "नमस्ते, आप कैसे हैं?", language_code: "hi-IN", language_probability: 1 } }],
    ["a loop", { body: { transcript: "the the the the the the the", language_code: "en-IN", language_probability: 0.5 } }]
  ];
  for (const [name, reply] of failures) {
    it(`Sarvam fails (${name}): Whisper's forced-Tamil decode runs after all, and the answer is today's`, async () => {
      const base = await today(TAMIL_SPEECH);
      const f = fake({ ...TAMIL_SPEECH, sarvam: reply });
      const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
      expect(f.kinds()).toEqual(["en", "sarvam", "ta"]);
      expect(strip(h)).toEqual(strip(base.h));
      expect(h).toMatchObject({ text: TA_WHISPER, lang: "ta", model: MODEL_TA() });
      // the fallback Tamil decode is Whisper's own request, its prompt and all
      expect(f.sent.find((s) => s.kind === "ta")!.fields).toEqual(base.sent.find((s) => s.kind === "ta")!.fields);
    });
  }
  it("Sarvam times out (JARVIS_SARVAM_TIMEOUT_MS): Whisper's Tamil decode runs, and the answer is today's", async () => {
    vi.stubEnv("JARVIS_SARVAM_TIMEOUT_MS", "80");
    const base = await today(TAMIL_SPEECH, { site: "ta" });
    const f = fake({ ...TAMIL_SPEECH, sarvam: sarvamSays(TANGLISH, "ta-IN", 3000) });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "ta", fetcher: f.fetcher });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(f.kinds()).toEqual(["en", "sarvam", "ta"]);
    expect(strip(h)).toEqual(strip(base.h));
    expect(telemetryLines().find((l) => l.event === "stt_sarvam")).toMatchObject({ ok: false, why: "timeout" });
  });
  it("Sarvam slower than the Tamil decode's wait after a good English one is let go, as a slow Tamil decode is today", async () => {
    const f = fake({ en: { ms: 10, text: EN, logprob: -0.1 }, sarvam: sarvamSays(TANGLISH, "ta-IN", 2000) });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher, ms: { translate: 100 } });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(f.kinds()).toEqual(["en", "sarvam"]);
    expect(h).toMatchObject({ text: EN, lang: "en", model: MODEL_EN() });
    expect(telemetryLines().find((l) => l.event === "stt_decode" && l.provider === "sarvam")).toMatchObject({ aborted: true });
  });
  it("the ledger: Sarvam's billed seconds under sarvam; nothing for Whisper's Tamil model unless it was asked", async () => {
    await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: fake({ en: { ms: 10, text: EN_TRANSLATION, logprob: -0.3 }, sarvam: sarvamSays(TANGLISH, "ta-IN") }).fetcher });
    const day = 86_400_000;
    expect(ledger().spent(SARVAM_ORG, SARVAM_MODEL, day, "engaged")).toMatchObject({ requests: 1, audioS: 1 });
    expect(ledger().spent("groq", MODEL_TA(), day).requests).toBe(0);
    expect(ledger().spent("groq", MODEL_EN(), day)).toMatchObject({ requests: 1, audioS: 10 });
    await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: fake({ ...TAMIL_SPEECH, sarvam: { status: 500, raw: "" } }).fetcher });
    expect(ledger().spent("groq", MODEL_TA(), day)).toMatchObject({ requests: 1, audioS: 10 });
    expect(ledger().spent(SARVAM_ORG, SARVAM_MODEL, day).requests).toBe(2);
  });
  it("telemetry: the race's line for Sarvam's decode names provider sarvam; no words anywhere", async () => {
    await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: fake({ en: { ms: 10, text: EN_TRANSLATION, logprob: -0.3 }, sarvam: sarvamSays(TANGLISH, "ta-IN") }).fetcher });
    const lines = telemetryLines();
    expect(lines.find((l) => l.event === "stt_decode" && l.decode === "ta")).toMatchObject({ provider: "sarvam", model: SARVAM_MODEL, ok: true, sttWinner: "ta" });
    expect(lines.find((l) => l.event === "stt_decode" && l.decode === "en")).toMatchObject({ provider: "groq", model: MODEL_EN() });
    expect(lines.find((l) => l.event === "stt")).toMatchObject({ ok: true, model: SARVAM_MODEL, lang: "ta" });
    expect(JSON.stringify(lines)).not.toMatch(/Adyar|pending|எத்தனை|How many/);
  });
});

describe("primary: Sarvam first, the Whisper race only when it fails", () => {
  beforeEach(() => { vi.stubEnv("JARVIS_STT_SARVAM", "primary"); });
  it("Sarvam's reading is the answer, Tanglish or English; Groq is not asked", async () => {
    const f = fake({ ...TAMIL_SPEECH, sarvam: sarvamSays(TANGLISH, "ta-IN") });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
    expect(f.kinds()).toEqual(["sarvam"]);
    expect(h).toMatchObject({ text: TANGLISH, lang: "ta", model: SARVAM_MODEL, noise: false });
    expect(typeof h.timing?.sttSent).toBe("number");
    expect(typeof h.timing?.sttBack).toBe("number");
    const e = fake({ en: { ms: 10, text: "Open the news.", logprob: -0.1 }, sarvam: sarvamSays(EN, "en-IN") });
    expect(await hearUtterance(wav(), { lane: "named", site: "ta", fetcher: e.fetcher })).toMatchObject({ text: EN, lang: "en", model: SARVAM_MODEL });
    expect(e.kinds()).toEqual(["sarvam"]);
    expect(ledger().spent("groq", MODEL_EN(), 86_400_000).requests).toBe(0);
  });
  for (const [name, reply] of [["500", { status: 500, raw: "" }], ["429", { status: 429, body: { error: { code: "rate_limit_exceeded_error" } } }], ["an empty transcript", sarvamSays("", null)]] as [string, SPlan][]) {
    it(`Sarvam fails (${name}): both Whisper decodes run, and the answer is today's`, async () => {
      const base = await today(TAMIL_SPEECH);
      const f = fake({ ...TAMIL_SPEECH, sarvam: reply });
      const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
      expect(f.kinds()).toEqual(["en", "sarvam", "ta"]);
      expect(strip(h)).toEqual(strip(base.h));
    });
  }
  it("Sarvam times out: the Whisper race runs after it, and the answer is today's", async () => {
    vi.stubEnv("JARVIS_SARVAM_TIMEOUT_MS", "60");
    const base = await today(TAMIL_SPEECH);
    const f = fake({ ...TAMIL_SPEECH, sarvam: sarvamSays(TANGLISH, "ta-IN", 3000) });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
    expect(f.kinds()).toEqual(["en", "sarvam", "ta"]);
    expect(strip(h)).toEqual(strip(base.h));
  });
});

describe("shadow: Whisper decides; Sarvam's timing and agreement only", () => {
  beforeEach(() => { vi.stubEnv("JARVIS_STT_SARVAM", "shadow"); });
  it("the answer is today's, whatever Sarvam says; Sarvam is asked once; stt_shadow has its time, language and agreement, no words", async () => {
    const base = await today(TAMIL_SPEECH);
    const f = fake({ ...TAMIL_SPEECH, sarvam: sarvamSays(TANGLISH, "ta-IN", 120) });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher });
    // Whisper's answer does not wait for Sarvam's
    expect(Date.now() - t0).toBeLessThan(110);
    expect(f.kinds()).toEqual(["en", "sarvam", "ta"]);
    expect(strip(h)).toEqual(strip(base.h));
    await shadowSettled();
    const lines = telemetryLines();
    const row = lines.find((l) => l.event === "stt_shadow")!;
    expect(row).toMatchObject({ provider: "sarvam", model: SARVAM_MODEL, lane: "engaged", ok: true, lang: "ta", sttWinner: "ta", hit: true });
    expect(row.ms as number).toBeGreaterThanOrEqual(100);
    expect(row.conf as number).toBeGreaterThanOrEqual(0);
    expect(row.conf as number).toBeLessThanOrEqual(1);
    expect(Object.keys(row).sort()).toEqual(["at", "conf", "event", "hit", "lane", "lang", "model", "ms", "ok", "provider", "sttWinner"]);
    expect(JSON.stringify(lines)).not.toMatch(/Adyar|pending|எத்தனை|அடையார்|How many/);
  });
  it("Sarvam and Whisper agree on English: hit, and full agreement", async () => {
    const f = fake({ en: { ms: 10, text: EN, logprob: -0.1 }, ta: { ms: 10, text: "ஓபன் த சுப்ரீம் கோர்ட் நியூஸ்", logprob: -0.6 }, sarvam: sarvamSays(EN, "en-IN") });
    expect(await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: f.fetcher })).toMatchObject({ text: EN, lang: "en", model: MODEL_EN() });
    await shadowSettled();
    expect(telemetryLines().find((l) => l.event === "stt_shadow")).toMatchObject({ ok: true, hit: true, conf: 1, lang: "en", sttWinner: "en" });
  });
  it("Sarvam fails: the answer is today's, and stt_shadow says ok:false", async () => {
    const base = await today(TAMIL_SPEECH);
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher: fake({ ...TAMIL_SPEECH, sarvam: { status: 503, raw: "" } }).fetcher });
    expect(strip(h)).toEqual(strip(base.h));
    await shadowSettled();
    expect(telemetryLines().find((l) => l.event === "stt_shadow")).toMatchObject({ ok: false, sttWinner: "ta" });
    expect(telemetryLines().find((l) => l.event === "stt_sarvam")).toMatchObject({ ok: false, why: "server", status: 503 });
  });
});

describe("choose with a Sarvam decode (the race's rule for it)", () => {
  const sv = (text: string, lang: "en" | "ta") => sarvamDecode({ text, lang, prob: 0.9, ms: 10, model: SARVAM_MODEL }, 2);
  const whisperEn = (text: string, logprob = -0.1) => ({ lang: "en" as const, model: "whisper-large-v3-turbo", text, segments: [{ avg_logprob: logprob, no_speech_prob: 0.02, compression_ratio: 1.2 }], via: "whisper" as const });
  it("Sarvam's Tanglish passes the bars that a forced Tamil decode would fail on script", () => {
    expect(scoreDecode(sv(TANGLISH, "ta"))).toMatchObject({ ok: true, why: null, logprob: SARVAM_LOGPROB });
  });
  it("Tamil from Sarvam wins over a surer English decode, on either site", () => {
    for (const site of ["en", "ta"] as const) expect(choose([whisperEn(EN_TRANSLATION, -0.01), sv(TANGLISH, "ta")], site)).toMatchObject({ text: TANGLISH, via: "sarvam" });
  });
  it("English from Sarvam: Whisper's English decode when acceptable, else Sarvam's", () => {
    expect(choose([whisperEn(EN, -0.9), sv("open the supreme court news", "en")], "ta")).toMatchObject({ text: EN, via: "whisper" });
    expect(choose([whisperEn(""), sv(EN, "en")], "en")).toMatchObject({ text: EN, via: "sarvam" });
  });
});
