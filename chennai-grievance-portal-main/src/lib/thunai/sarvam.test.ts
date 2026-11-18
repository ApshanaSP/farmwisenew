/**
 * Jarvis v8, the Sarvam client (sarvam.ts) on a mocked fetch: no account, no key, no call to Sarvam. The key here is a made-up
 * string; every sentence is invented for the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { ledger, resetLedger } from "./ledger";
import {
  agreement, billedSeconds, keytermsField, KEYTERM_CHARS, KEYTERMS_MAX, SARVAM_KEYTERMS, SARVAM_MODEL, SARVAM_ORG, SARVAM_URL, SarvamFail,
  sarvamKeyed, sarvamLang, sarvamMode, sarvamTimeoutMs, sarvamTranscribe, type SarvamWhy
} from "./sarvam";

const KEY = "test-key-not-real";
const wav = (secs = 1) => { const b = new ArrayBuffer(44 + 32000 * secs), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const abortable = (ms: number, signal?: AbortSignal | null) => new Promise<void>((res, rej) => {
  if (signal?.aborted) { rej(signal.reason); return; }
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
type Reply = { ms?: number; status?: number; body?: unknown; raw?: string };
/** A fake Sarvam: answers each request with the next reply (the last one repeats); keeps what was sent. */
function fake(...replies: Reply[]) {
  const sent: { url: string; init: RequestInit; form: FormData }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    sent.push({ url, init, form: init.body as FormData });
    const r = replies[Math.min(sent.length - 1, replies.length - 1)] ?? {};
    await abortable(r.ms ?? 0, init.signal);
    return new Response(r.raw ?? JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetcher, sent };
}
const ok = (transcript: string, language_code: string | null, language_probability: number | null = 0.95) =>
  ({ body: { request_id: "mock_1", transcript, language_code, language_probability } });
const err = (status: number, code: string, message = "mock error") => ({ status, body: { error: { request_id: "mock_err", message, code } } });
const telemetryLines = () => {
  const f = path.join(process.env.THUNAI_DIR!, "telemetry.ndjson");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];
};
async function failure(p: Promise<unknown>): Promise<SarvamFail> {
  try { await p; } catch (e) { return e as SarvamFail; }
  throw new Error("expected a SarvamFail");
}

beforeEach(() => { vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-sarvam-"))); vi.stubEnv("SARVAM_API_KEY", KEY); resetLedger(); });
afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

describe("the flag and the knobs", () => {
  it("JARVIS_STT_SARVAM: tamil, primary and shadow are read (any case); unset, 0 and anything else are off", () => {
    for (const [v, m] of [["", "off"], ["0", "off"], ["1", "off"], ["on", "off"], ["tamil", "tamil"], ["Primary", "primary"], [" shadow ", "shadow"]]) {
      vi.stubEnv("JARVIS_STT_SARVAM", v);
      expect(sarvamMode(), v).toBe(m);
    }
  });
  it("the timeout is 2,500 ms unless JARVIS_SARVAM_TIMEOUT_MS gives a positive number", () => {
    expect(sarvamTimeoutMs()).toBe(2500);
    vi.stubEnv("JARVIS_SARVAM_TIMEOUT_MS", "1800");
    expect(sarvamTimeoutMs()).toBe(1800);
    for (const v of ["-5", "0", "soon"]) { vi.stubEnv("JARVIS_SARVAM_TIMEOUT_MS", v); expect(sarvamTimeoutMs()).toBe(2500); }
  });
  it("keyterms: Chennai's zones and localities, inside saaras:v4's limits (50 terms, 64 characters each)", () => {
    const terms = JSON.parse(keytermsField()) as string[];
    expect(terms.length).toBeLessThanOrEqual(KEYTERMS_MAX);
    expect(terms.every((t) => t.length > 0 && t.length <= KEYTERM_CHARS)).toBe(true);
    expect(terms).toEqual(expect.arrayContaining(["Adyar", "Sholinganallur", "Teynampet", "Pallikaranai", "Velachery"]));
    expect(SARVAM_KEYTERMS.length).toBeLessThanOrEqual(KEYTERMS_MAX);
    // a longer list is cut to the limits
    const long = Array.from({ length: 80 }, (_, i) => `Place ${i}`).concat(["x".repeat(65)]);
    const cut = JSON.parse(keytermsField(long)) as string[];
    expect(cut.length).toBe(50);
    expect(cut.some((t) => t.length > 64)).toBe(false);
  });
  it("billing: per second, rounded up, 1 s minimum", () => {
    expect(billedSeconds(3)).toBe(3);
    expect(billedSeconds(3.2)).toBe(4);
    expect(billedSeconds(0.3)).toBe(1);
    expect(billedSeconds(0)).toBe(1);
  });
});

describe("the request", () => {
  it("one multipart POST to the documented endpoint, the key in api-subscription-key, the documented fields, the clip as speech.wav", async () => {
    const { fetcher, sent } = fake(ok("Open the Supreme Court news.", "en-IN", 0.98));
    const clip = wav(2);
    await sarvamTranscribe(clip, { secs: 2, fetcher, lane: "engaged" });
    expect(sent).toHaveLength(1);
    const { url, init, form } = sent[0];
    expect(url).toBe(SARVAM_URL);
    expect(url).toBe("https://api.sarvam.ai/speech-to-text");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "api-subscription-key": KEY });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(form.get("model")).toBe("saaras:v4");
    expect(form.get("mode")).toBe("codemix");
    expect(form.get("language_code")).toBe("unknown");
    expect(JSON.parse(String(form.get("keyterms")))).toEqual(JSON.parse(keytermsField()));
    const file = form.get("file") as File;
    expect(file.name).toBe("speech.wav");
    expect(file.size).toBe(clip.byteLength);
    // nothing else is sent (no prompt, no timestamps, no old keyterm/hotwords fields)
    expect([...new Set([...form.keys()])].sort()).toEqual(["file", "keyterms", "language_code", "mode", "model"]);
  });
  it("JARVIS_SARVAM_KEYTERMS=0 leaves the keyterms out", async () => {
    vi.stubEnv("JARVIS_SARVAM_KEYTERMS", "0");
    const { fetcher, sent } = fake(ok("Open the Supreme Court news.", "en-IN"));
    await sarvamTranscribe(wav(), { secs: 1, fetcher });
    expect(sent[0].form.has("keyterms")).toBe(false);
  });
  it("no SARVAM_API_KEY: skipped, null, no request, nothing in the ledger; never an error", async () => {
    vi.stubEnv("SARVAM_API_KEY", "");
    expect(sarvamKeyed()).toBe(false);
    const { fetcher, sent } = fake(ok("Open the Supreme Court news.", "en-IN"));
    await expect(sarvamTranscribe(wav(), { secs: 1, fetcher })).resolves.toBeNull();
    expect(sent).toHaveLength(0);
    expect(ledger().spent(SARVAM_ORG, SARVAM_MODEL, 86_400_000).requests).toBe(0);
  });
  it("a clip over 30 s is not sent (Sarvam refuses it): null", async () => {
    const { fetcher, sent } = fake(ok("Open the Supreme Court news.", "en-IN"));
    await expect(sarvamTranscribe(wav(), { secs: 31, fetcher })).resolves.toBeNull();
    expect(sent).toHaveLength(0);
    expect(telemetryLines().at(-1)).toMatchObject({ event: "stt_sarvam", ok: false, why: "too-long" });
  });
});

describe("a reading", () => {
  it("English: en-IN is English, with the language probability and the call's time", async () => {
    const { fetcher } = fake({ ...ok("  Open the   Supreme Court news. ", "en-IN", 0.98), ms: 20 });
    const h = await sarvamTranscribe(wav(), { secs: 1, fetcher });
    expect(h).toMatchObject({ text: "Open the Supreme Court news.", lang: "en", prob: 0.98, model: "saaras:v4" });
    expect(h!.ms).toBeGreaterThanOrEqual(15);
  });
  it("Tamil: ta-IN in Tamil script is Tamil", async () => {
    const { fetcher } = fake(ok("அடையாறுல இன்னைக்கு எது ரொம்ப மோசமா இருக்கு?", "ta-IN", 0.97));
    expect(await sarvamTranscribe(wav(), { secs: 1, fetcher })).toMatchObject({ lang: "ta", prob: 0.97 });
  });
  it("codemix Tanglish: Tamil letters make it Tamil whatever the code says (ta-IN, en-IN or none)", async () => {
    for (const code of ["ta-IN", "en-IN", null]) {
      const { fetcher } = fake(ok("Adyar zone-ல pending cases எத்தனை?", code, code ? 0.61 : null));
      expect(await sarvamTranscribe(wav(), { secs: 1, fetcher }), String(code)).toMatchObject({ text: "Adyar zone-ல pending cases எத்தனை?", lang: "ta" });
    }
  });
  it("sarvamLang: the script first, then the code; mostly another script is no use (null)", () => {
    expect(sarvamLang("Show the severe cases.", "en-IN")).toBe("en");
    expect(sarvamLang("Adyar pending cases", "ta-IN")).toBe("ta");
    expect(sarvamLang("Adyar pending cases", null)).toBe("en");
    expect(sarvamLang("Adyar pending cases", "hi-IN")).toBe("en");
    expect(sarvamLang("எத்தனை pending", "en-IN")).toBe("ta");
    expect(sarvamLang("नमस्ते, आप कैसे हैं?", "hi-IN")).toBeNull();
    expect(sarvamLang("9840950950", null)).toBe("en");
  });
  it("another script (Sarvam heard Hindi): a SarvamFail, other-script", async () => {
    const { fetcher } = fake(ok("नमस्ते, आप कैसे हैं?", "hi-IN", 1));
    expect(await failure(sarvamTranscribe(wav(), { secs: 1, fetcher }))).toMatchObject({ why: "other-script", status: 200 });
  });
  it("an empty transcript is a reading with no words (stt.ts falls back on it), logged as empty", async () => {
    const { fetcher } = fake(ok("", null, null));
    expect(await sarvamTranscribe(wav(), { secs: 1, fetcher })).toMatchObject({ text: "", prob: null });
    expect(telemetryLines().at(-1)).toMatchObject({ event: "stt_sarvam", ok: true, why: "empty" });
  });
  it("a language probability outside 0..1 is held to it", async () => {
    const { fetcher } = fake(ok("Open the briefing page.", "en-IN", 1.4));
    expect((await sarvamTranscribe(wav(), { secs: 1, fetcher }))!.prob).toBe(1);
  });
});

describe("failures: each a SarvamFail with its reason; none is retried here (stt.ts falls back to Whisper)", () => {
  const cases: [string, Reply, SarvamWhy, boolean][] = [
    ["401", err(401, "invalid_api_key_error"), "refused", true],
    ["403", err(403, "invalid_api_key_error"), "refused", true],
    ["402", err(402, "insufficient_quota_error"), "quota", true],
    ["429 quota", err(429, "insufficient_quota_error"), "quota", true],
    ["429", err(429, "rate_limit_exceeded_error"), "busy", true],
    ["400", err(400, "invalid_request_error", "Audio duration exceeds the maximum limit of 30 seconds"), "bad-request", false],
    ["500", err(500, "internal_server_error"), "server", false],
    ["503", { status: 503, raw: "Service Unavailable" }, "server", false],
    ["418", { status: 418, raw: "" }, "http", false]
  ];
  for (const [name, reply, why, cools] of cases) {
    it(`${name}: ${why}${cools ? ", and Sarvam cools (the next call is skipped, no request)" : ", no cooling"}`, async () => {
      const { fetcher, sent } = fake(reply, ok("Open the briefing page.", "en-IN"));
      expect(await failure(sarvamTranscribe(wav(), { secs: 1, fetcher }))).toMatchObject({ name: "SarvamFail", why, status: reply.status });
      const next = sarvamTranscribe(wav(), { secs: 1, fetcher });
      if (cools) {
        await expect(next).resolves.toBeNull();
        expect(sent).toHaveLength(1);
        expect(telemetryLines().at(-1)).toMatchObject({ event: "stt_sarvam", ok: false, why: "cooling" });
      } else {
        await expect(next).resolves.toMatchObject({ lang: "en" });
        expect(sent).toHaveLength(2);
      }
    });
  }
  it("a 429 cools for 30 s, a refused key for 10 minutes", async () => {
    const t0 = Date.now();
    await failure(sarvamTranscribe(wav(), { secs: 1, fetcher: fake(err(429, "rate_limit_exceeded_error")).fetcher }));
    const busy = ledger().coolingUntil(SARVAM_ORG, SARVAM_MODEL) - t0;
    expect(busy).toBeGreaterThanOrEqual(29_000);
    expect(busy).toBeLessThan(40_000);
    resetLedger();
    vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-sarvam-")));
    await failure(sarvamTranscribe(wav(), { secs: 1, fetcher: fake(err(401, "invalid_api_key_error")).fetcher }));
    expect(ledger().coolingUntil(SARVAM_ORG, SARVAM_MODEL) - t0).toBeGreaterThanOrEqual(590_000);
  });
  it("timeout: the call gives up at its limit (JARVIS_SARVAM_TIMEOUT_MS) and says timeout", async () => {
    vi.stubEnv("JARVIS_SARVAM_TIMEOUT_MS", "60");
    const t0 = Date.now();
    const e = await failure(sarvamTranscribe(wav(), { secs: 1, fetcher: fake({ ...ok("late", "en-IN"), ms: 2000 }).fetcher }));
    expect(e).toMatchObject({ why: "timeout" });
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("the caller's signal: aborted, not a timeout", async () => {
    const ctl = new AbortController();
    const p = sarvamTranscribe(wav(), { secs: 1, signal: ctl.signal, fetcher: fake({ ...ok("late", "en-IN"), ms: 2000 }).fetcher });
    setTimeout(() => ctl.abort(), 20);
    expect(await failure(p)).toMatchObject({ why: "aborted" });
  });
  it("a network failure: network", async () => {
    const fetcher = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await failure(sarvamTranscribe(wav(), { secs: 1, fetcher }))).toMatchObject({ why: "network" });
  });
  it("malformed: a 200 that is not JSON, or JSON with no transcript string", async () => {
    for (const reply of [{ raw: "<html>gateway</html>" }, { raw: "{\"transcript\": " }, { body: { language_code: "en-IN" } }, { body: { transcript: 42 } }, { raw: "null" }]) {
      expect(await failure(sarvamTranscribe(wav(), { secs: 1, fetcher: fake(reply).fetcher })), JSON.stringify(reply)).toMatchObject({ why: "malformed" });
    }
  });
});

describe("the ledger and the day's cap", () => {
  it("each call is counted under the provider sarvam, model saaras:v4, in billed seconds, on its lane", async () => {
    const { fetcher } = fake(ok("Open the briefing page.", "en-IN"));
    await sarvamTranscribe(wav(), { secs: 2.2, fetcher, lane: "engaged" });
    await sarvamTranscribe(wav(), { secs: 0.4, fetcher, lane: "named" });
    const day = ledger().spent(SARVAM_ORG, SARVAM_MODEL, 86_400_000);
    expect(day).toMatchObject({ requests: 2, audioS: 4 });
    expect(ledger().spent(SARVAM_ORG, SARVAM_MODEL, 86_400_000, "engaged").audioS).toBe(3);
    expect(SARVAM_ORG).toBe("sarvam");
    expect(ledger().report().find((x) => x.org === SARVAM_ORG)).toMatchObject({ model: "saaras:v4" });
    // nothing under Groq
    expect(ledger().spent("groq", "whisper-large-v3", 86_400_000).requests).toBe(0);
  });
  it("a failed call was still sent, so it is counted (a conservative count of spend)", async () => {
    await failure(sarvamTranscribe(wav(), { secs: 1, fetcher: fake(err(500, "internal_server_error")).fetcher }));
    expect(ledger().spent(SARVAM_ORG, SARVAM_MODEL, 86_400_000).audioS).toBe(1);
  });
  it("over JARVIS_SARVAM_DAY_S billed seconds in a day, Sarvam is skipped (null, no request)", async () => {
    vi.stubEnv("JARVIS_SARVAM_DAY_S", "5");
    const { fetcher, sent } = fake(ok("Open the briefing page.", "en-IN"));
    expect(await sarvamTranscribe(wav(), { secs: 3, fetcher })).not.toBeNull();
    expect(await sarvamTranscribe(wav(), { secs: 2, fetcher })).not.toBeNull();
    await expect(sarvamTranscribe(wav(), { secs: 1, fetcher })).resolves.toBeNull();
    expect(sent).toHaveLength(2);
    expect(telemetryLines().at(-1)).toMatchObject({ event: "stt_sarvam", ok: false, why: "day-cap" });
  });
});

describe("what is logged: timings and status, never a word, never the key", () => {
  it("stt_sarvam lines carry ms, ok, why, status, lang and the language probability only", async () => {
    await sarvamTranscribe(wav(), { secs: 1, fetcher: fake(ok("Adyar zone-ல pending cases எத்தனை?", "ta-IN", 0.93)).fetcher, lane: "engaged" });
    await failure(sarvamTranscribe(wav(), { secs: 1, fetcher: fake(err(500, "internal_server_error", "Adyar went wrong")).fetcher }));
    const lines = telemetryLines();
    expect(lines[0]).toMatchObject({ event: "stt_sarvam", provider: "sarvam", model: "saaras:v4", lane: "engaged", ok: true, status: 200, lang: "ta", conf: 0.93 });
    expect(lines[1]).toMatchObject({ event: "stt_sarvam", ok: false, why: "server", status: 500 });
    const all = JSON.stringify(lines);
    expect(all).not.toMatch(/Adyar|pending|எத்தனை|went wrong/);
    expect(all).not.toContain(KEY);
  });
  it("a failure's message holds the reason and the status, not the key", async () => {
    const e = await failure(sarvamTranscribe(wav(), { secs: 1, fetcher: fake(err(401, "invalid_api_key_error")).fetcher }));
    expect(e.message).toBe("sarvam refused 401");
    expect(e.message).not.toContain(KEY);
  });
});

describe("agreement (shadow mode's number)", () => {
  it("word for word, 0..1, case and punctuation aside", () => {
    expect(agreement("Open the Supreme Court news.", "open the supreme court news")).toBe(1);
    expect(agreement("Show the severe cases.", "Show the serious cases.")).toBe(0.75);
    expect(agreement("", "")).toBe(1);
    expect(agreement("Show the severe cases.", "")).toBe(0);
    expect(agreement("Adyar zone-ல pending cases எத்தனை?", "How many pending cases in Adyar zone?")).toBeLessThan(0.5);
  });
});
