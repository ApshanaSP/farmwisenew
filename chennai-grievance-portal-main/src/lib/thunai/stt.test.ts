import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { ledger, resetLedger } from "./ledger";
import { choose, hearUtterance, MODEL_EN, MODEL_TA, promptEcho, PROMPT, repeats, scoreDecode, wavSeconds, type Decode } from "./stt";

const dec = (lang: "en" | "ta", text: string, logprob = -0.3, extra: Partial<Decode["segments"][0]> = {}): Decode => ({ lang, model: lang === "ta" ? "whisper-large-v3" : "whisper-large-v3-turbo", text, segments: [{ avg_logprob: logprob, no_speech_prob: 0.02, compression_ratio: 1.3, ...extra }] });

describe("choosing between forced decodes", () => {
  it("takes the more confident decode, leaning a little to the site's language", () => {
    expect(choose([dec("ta", "அடையாறு புகார்கள் காட்டு", -0.25), dec("en", "a dire pugar kaattu", -0.9)], "en")?.lang).toBe("ta");
    expect(choose([dec("ta", "ஷோ மீ த கேசஸ்", -0.7), dec("en", "show me the cases", -0.2)], "ta")?.lang).toBe("en");
    expect(choose([dec("ta", "அடையாறு நிலவரம்", -0.35), dec("en", "Adyar status", -0.3)], "ta")?.lang).toBe("ta");
  });
  it("refuses no-speech, a looping text, high compression, a prompt echo and the wrong script", () => {
    expect(scoreDecode(dec("en", "hello", -0.2, { no_speech_prob: 0.7 })).why).toBe("no-speech");
    expect(scoreDecode(dec("en", "the rain the rain the rain the rain the rain the rain", -0.2)).why).toBe("repeats");
    expect(scoreDecode(dec("en", "some text here", -0.2, { compression_ratio: 2.6 })).why).toBe("compression");
    expect(scoreDecode(dec("en", PROMPT.slice(0, 80), -0.2)).why).toBe("echo");
    expect(scoreDecode(dec("ta", "this is english", -0.2)).why).toBe("script");
    expect(scoreDecode(dec("en", "அடையாறு", -0.2)).why).toBe("script");
    expect(choose([dec("en", "hello", -0.2, { no_speech_prob: 0.9 })], "en")).toBeNull();
  });
  it("Whisper's silent-audio phrases are not the Collector's words; low confidence alone does not refuse Tamil", () => {
    expect(scoreDecode(dec("ta", "அடையாறு நிலவரம் சொல்லு", -1.2)).ok).toBe(true);
    expect(repeats("show me the severe cases in Adyar this week")).toBe(false);
    expect(promptEcho("show me the storm water drain complaints")).toBe(false);
  });
  it("a short run of the prompt's words is a real sentence unless the decode looks like silence", () => {
    expect(scoreDecode(dec("ta", "அண்ணா நகர் வெள்ளம்", -0.3)).ok).toBe(true);
    expect(scoreDecode(dec("en", "Storm water drain", -0.3)).ok).toBe(true);
    expect(scoreDecode(dec("en", "Storm water drain", -0.9)).why).toBe("echo");
    expect(scoreDecode(dec("en", "Storm water drain", -0.3, { no_speech_prob: 0.4 })).why).toBe("echo");
    expect(scoreDecode(dec("en", "storm water drain, waterlogging, dengue", -0.3)).why).toBe("echo");
    expect(scoreDecode({ ...dec("ta", "அண்ணா நகர் வெள்ளம்", -0.75), via: "gemini" }).ok).toBe(true);
  });
  it("reads a clip's length from the WAV header", () => {
    const b = new ArrayBuffer(44 + 32000), v = new DataView(b);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true);
    expect(wavSeconds(b)).toBe(1);
  });
});

describe("hearing an utterance", () => {
  let dir: string;
  const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
  const ok = (text: string, lang: string) => new Response(JSON.stringify({ text, language: lang, duration: 1, segments: [{ avg_logprob: -0.2, no_speech_prob: 0.01, compression_ratio: 1.2 }] }), { status: 200 });
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv-stt-")); vi.stubEnv("THUNAI_DIR", dir); vi.stubEnv("GROQ_API_KEY", "x"); resetLedger(); });
  afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

  it("an engaged turn: two parallel forced decodes, Tamil on large-v3 and English on turbo, each with the prompt", async () => {
    const seen: { model: string; lang: string; prompt: string }[] = [];
    const fetcher = (async (_u: string, init: RequestInit) => {
      const f = init.body as FormData;
      seen.push({ model: String(f.get("model")), lang: String(f.get("language")), prompt: String(f.get("prompt")) });
      return f.get("language") === "ta" ? ok("அடையாறு புகார்கள் காட்டு", "ta") : ok("a dire pugar", "en");
    }) as unknown as typeof fetch;
    const h = await hearUtterance(wav(), { lane: "engaged", site: "ta", fetcher });
    expect(seen.map((x) => `${x.lang}:${x.model}`).sort()).toEqual(["en:whisper-large-v3-turbo", "ta:whisper-large-v3"]);
    expect(seen.every((x) => x.prompt.includes("Adyar"))).toBe(true);
    expect(h).toMatchObject({ text: "அடையாறு புகார்கள் காட்டு", lang: "ta", noise: false });
  });
  it("each model's budget is its own: turbo cooling leaves a named turn on large-v3; large-v3 cooling stops Tamil ambient with no post", async () => {
    const seen: string[] = [];
    const fetcher = (async (_u: string, init: RequestInit) => { const f = init.body as FormData; seen.push(String(f.get("model"))); return ok("அடையாறு புகார்கள் காட்டு", "ta"); }) as unknown as typeof fetch;
    ledger().cool("groq", MODEL_EN(), 30_000);
    try {
      const h = await hearUtterance(wav(), { lane: "named", site: "en", fetcher });
      expect(seen).toEqual([MODEL_TA()]);
      expect(h).toMatchObject({ text: "அடையாறு புகார்கள் காட்டு", noise: false });
      expect(h.budget).toBeUndefined();
    } finally { ledger().cool("groq", MODEL_EN(), -1); }
    seen.length = 0;
    ledger().cool("groq", MODEL_TA(), 30_000);
    try {
      expect((await hearUtterance(wav(), { lane: "ambient", site: "ta", fetcher })).budget).toBe("low");
      expect(seen).toEqual([]);
    } finally { ledger().cool("groq", MODEL_TA(), -1); }
  });
  it("an ambient sentence: one decode in the site's language, and the ninth in a minute is refused by the ledger", async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return ok("the file is on the table", "en"); }) as unknown as typeof fetch;
    const { Ledger, MemoryStore } = await import("./ledger");
    void Ledger; void MemoryStore;
    for (let i = 0; i < 8; i++) await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher });
    expect(calls).toBe(8);
    const h = await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher });
    expect(calls).toBe(8);
    expect(h).toMatchObject({ budget: "low", text: "" });
  });
  it("Whisper unsure of an engaged turn: the third racer is asked, and is not asked for an ambient sentence or a sure one", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    const urls: string[] = [];
    const fetcher = (async (u: string) => {
      urls.push(u);
      if (u.includes("generativelanguage")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ audioTranscription: { text: "அடையாறு புகார்கள் காட்டு" } }] } }] }), { status: 200 });
      return new Response(JSON.stringify({ text: "adhe arru", segments: [{ avg_logprob: -1.3, no_speech_prob: 0.1, compression_ratio: 1.2 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const h = await hearUtterance(wav(), { lane: "engaged", site: "ta", fetcher });
    expect(urls.some((u) => u.includes("gemini-3.5-transcribe"))).toBe(true);
    expect(h).toMatchObject({ text: "அடையாறு புகார்கள் காட்டு", lang: "ta" });
    urls.length = 0;
    await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher });
    expect(urls.some((u) => u.includes("generativelanguage"))).toBe(false);
  });
  it("a 429 is reported as low budget, not as a transcript or a crash", async () => {
    const fetcher = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    const h = await hearUtterance(wav(), { lane: "named", site: "en", fetcher });
    expect(h.budget).toBe("low");
  });
});
