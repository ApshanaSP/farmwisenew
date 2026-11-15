/**
 * Jarvis v5 (JARVIS_V5_BUILD_2 section 8), speech to text on the server. Every sentence here is invented for the test.
 *   B1: the Gemini third racer is gone; the two forced-language Whisper decodes stay.
 *   B2: a transcript is dropped as a prompt echo only when (a) three or more prompt names come back in prompt order, or (b) no
 *       clarifying question is pending, the detector's speech span is very short and the decode fails scoreDecode's own bars
 *       (no_speech_prob >= 0.3 or avg_logprob < -0.6). A one-word answer to a pending question is never dropped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { resetLedger } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { hearUtterance, readHear, scoreDecode, sttPrompt, type Decode } from "./stt";

/** the third argument of scoreDecode (v5): a clarifying question pending, and the detector's speech span in seconds */
type Ctx = { clarify?: boolean; spanS?: number | null };
const score = (d: Decode, ctx?: Ctx) => (scoreDecode as (d: Decode, ctx?: Ctx) => ReturnType<typeof scoreDecode>)(d, ctx);
const dec = (lang: "en" | "ta", text: string, logprob = -0.3, extra: Partial<Decode["segments"][0]> = {}): Decode =>
  ({ lang, model: lang === "ta" ? "whisper-large-v3" : "whisper-large-v3-turbo", text, segments: [{ avg_logprob: logprob, no_speech_prob: 0.02, compression_ratio: 1.3, ...extra }], ...(lang === "ta" ? { prompt: sttPrompt("ta") } : {}) });
type HearArgs = Parameters<typeof hearUtterance>[1] & { clarify?: boolean; speechMs?: number };

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

describe("B2: the prompt-echo guard weighs the decode's own confidence", () => {
  // Sholinganallur (English) and Thiruvottiyur (Tamil, the first zone: the Tamil prompt's token budget runs out before the last
  // zones) are in their decode's prompt and long enough to be weighed as an echo; the decode is unsure (-0.7) and short
  const THIRU_TA = ZONE_TA_NAME[1];
  const TA_RUN = [ZONE_TA_NAME[1], ZONE_TA_NAME[2], ZONE_TA_NAME[3]];
  it("the Tamil names used here are in the Tamil prompt, in this order", () => {
    expect(sttPrompt("ta")).toContain(TA_RUN.join(", "));
    expect(sttPrompt("en")).toContain("Adyar, Perungudi, Sholinganallur");
  });
  it("a one-word place-name answer with a clarifying question pending is kept, unsure and short as it is", () => {
    expect(score(dec("en", "Sholinganallur", -0.7), { clarify: true, spanS: 0.45 })).toMatchObject({ ok: true, why: null });
    expect(score(dec("en", "Sholinganallur.", -0.4, { no_speech_prob: 0.35 }), { clarify: true, spanS: 0.45 }).ok).toBe(true);
    expect(score(dec("ta", THIRU_TA, -0.7), { clarify: true, spanS: 0.45 }).ok).toBe(true);
  });
  it("heard through hearUtterance with the clarify mark, the one-word answer is the transcript", async () => {
    const { fetcher } = fake({ en: { ms: 10, text: "Sholinganallur", logprob: -0.7 }, ta: { ms: 10, text: "", logprob: -0.75 } });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher, clarify: true, speechMs: 450 } as HearArgs);
    expect(h).toMatchObject({ text: "Sholinganallur", lang: "en", noise: false });
    const ta = fake({ en: { ms: 10, text: "", logprob: -0.7 }, ta: { ms: 10, text: THIRU_TA, logprob: -0.75 } });
    const t = await hearUtterance(wav(), { lane: "engaged", site: "ta", fetcher: ta.fetcher, clarify: true, speechMs: 450 } as HearArgs);
    expect(t).toMatchObject({ text: THIRU_TA, lang: "ta", noise: false });
  });
  it("three prompt names in prompt order with a high no_speech_prob are dropped, a question pending or not, short or long", () => {
    for (const ctx of [undefined, { clarify: true, spanS: 3 }, { clarify: false, spanS: 0.4 }, { clarify: true, spanS: 0.4 }]) {
      expect(score(dec("en", "Adyar, Perungudi, Sholinganallur.", -0.2, { no_speech_prob: 0.45 }), ctx).why).toBe("echo");
      expect(score(dec("ta", `${TA_RUN.join(", ")}.`, -0.2, { no_speech_prob: 0.45 }), ctx).why).toBe("echo");
    }
  });
  it("heard through hearUtterance, three prompt names in order with a high no_speech_prob are noise even with a question pending", async () => {
    const { fetcher } = fake({ en: { ms: 10, text: "Adyar, Perungudi, Sholinganallur.", logprob: -0.3, noSpeech: 0.45 }, ta: { ms: 10, text: "", logprob: -0.3 } });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher, clarify: true, speechMs: 2600 } as HearArgs);
    expect(h).toMatchObject({ text: "", noise: true });
  });
  it("no question pending: a short run of the prompt is dropped only when the span is very short and the decode is unsure", () => {
    expect(score(dec("en", "Storm water drain", -0.9), { spanS: 0.5 }).why).toBe("echo");
    expect(score(dec("en", "Storm water drain", -0.3, { no_speech_prob: 0.4 }), { spanS: 0.5 }).why).toBe("echo");
    // the same words said over a long span, or said with confidence, are a sentence
    expect(score(dec("en", "Storm water drain", -0.9), { spanS: 2.4 }).ok).toBe(true);
    expect(score(dec("en", "Storm water drain", -0.3), { spanS: 0.5 }).ok).toBe(true);
  });
  it("a confident sentence holding two prompt names in a row is a sentence, not an echo", () => {
    expect(score(dec("en", "show the storm water drain waterlogging complaints near the canal", -0.2)).ok).toBe(true);
    expect(score(dec("en", "pump status at Chembarambakkam and Puzhal today", -0.25)).ok).toBe(true);
  });
  it("a sentence with three prompt names in order among its own words is a sentence: only a run of the prompt itself is an echo", () => {
    expect(score(dec("en", "Chembarambakkam Puzhal Poondi water levels now", -0.3)).ok).toBe(true);
    expect(score(dec("en", "send the GCC CMWSSB TNEB numbers for the week", -0.3)).ok).toBe(true);
    // three zones in the Tamil prompt's order, asked about together, are a sentence
    const run = [ZONE_TA_NAME[12], ZONE_TA_NAME[13], ZONE_TA_NAME[14]];
    expect(sttPrompt("ta")).toContain(run.join(", "));
    expect(score(dec("ta", `${run.join(" ")} மூணுலயும் வெள்ளம் எப்படி இருக்கு`, -0.4)).ok).toBe(true);
    expect(score(dec("ta", `${run.join(", ")}.`, -0.4)).why).toBe("echo");
    // the run alone, as Whisper writes its prompt back, is still an echo, sure or not
    expect(score(dec("en", "Chembarambakkam, Puzhal, Poondi.", -0.2)).why).toBe("echo");
  });
  it("readHear takes the clarify mark and the speech span from the multipart body or the query; anything else is none", async () => {
    const f = new FormData();
    f.append("audio", new Blob([wav()], { type: "audio/wav" }), "speech.wav");
    f.append("clarify", "1");
    f.append("speechMs", "450");
    const multi = await readHear(new Request("http://localhost/api/jarvis/hear?lane=engaged&lang=en", { method: "POST", body: f }));
    expect(multi).toMatchObject({ clarify: true, speechMs: 450 });
    const raw = await readHear(new Request("http://localhost/api/jarvis/hear?lane=engaged&clarify=1&speechMs=620", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: new Blob([wav()]) }));
    expect(raw).toMatchObject({ clarify: true, speechMs: 620 });
    const none = await readHear(new Request("http://localhost/api/jarvis/hear?clarify=maybe&speechMs=abc", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: new Blob([wav()]) }));
    expect(none).toMatchObject({ clarify: false, speechMs: null });
  });
});

describe("the server's trace of speech to text (section 6.4): timings only", () => {
  type T = { timing?: Record<string, unknown> };
  it("hearUtterance's result carries timing: sttSent when the decodes go out, sttBack when the winner is in hand, sttSent <= sttBack", async () => {
    const { fetcher } = fake({ en: { ms: 60, text: "open the rainfall page", logprob: -0.1 }, ta: { ms: 90, text: "ஓபன் த ரெயின்ஃபால் பேஜ்", logprob: -0.3 } });
    const h = (await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher })) as T;
    const t = h.timing!;
    expect(t).toBeDefined();
    expect(typeof t.sttSent).toBe("number");
    expect(typeof t.sttBack).toBe("number");
    expect(t.sttSent as number).toBeLessThanOrEqual(t.sttBack as number);
    // the winner answered after 60 ms: sttBack is not stamped before it was back
    expect((t.sttBack as number) - (t.sttSent as number)).toBeGreaterThanOrEqual(40);
    // timings only: stage names and numbers, no words
    expect(Object.keys(t).sort()).toEqual(["sttBack", "sttSent"]);
    expect(JSON.stringify(t)).not.toMatch(/rainfall|ரெயின்/);
  });
  it("an ambient sentence read once more: sttBack is stamped when the second read is in hand", async () => {
    const { fetcher } = fake({ en: { ms: 10, text: "Jarvis, pump status near the canal", logprob: -0.9 }, ta: { ms: 80, text: "ஜார்விஸ், கால்வாய் பம்ப் நிலை", logprob: -0.3 } });
    const h = (await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher })) as T;
    expect((h.timing!.sttBack as number) - (h.timing!.sttSent as number)).toBeGreaterThanOrEqual(70);
  });
  it("no request sent (the budget is spent): no sttSent and no sttBack", async () => {
    const { fetcher } = fake({ en: { ms: 0, text: "the file is on the table", logprob: -0.2 } });
    for (let i = 0; i < 8; i++) await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher });
    const h = (await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher })) as T;
    expect(h).toMatchObject({ budget: "low" });
    expect(h.timing?.sttSent).toBeUndefined();
    expect(h.timing?.sttBack).toBeUndefined();
  });
  it("nothing usable came back: sttSent is stamped, sttBack is not", async () => {
    const { fetcher } = fake({ en: { ms: 10, text: "", logprob: -0.2 }, ta: { ms: 10, text: "", logprob: -0.2 } });
    const h = (await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher })) as T;
    expect(h).toMatchObject({ noise: true });
    expect(typeof h.timing?.sttSent).toBe("number");
    expect(h.timing?.sttBack).toBeUndefined();
  });
});
