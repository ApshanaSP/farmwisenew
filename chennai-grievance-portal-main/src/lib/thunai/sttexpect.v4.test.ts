/**
 * Review (Phase 7, Voice 2): on the English site the first good decode won, so a fluent forced-English decode of Tamil speech (Whisper
 * translating it) ended the race 250 ms later, before the Tamil decode was back, and the translation guard (stt.ts translated) never ran.
 * Now the browser may say which language the last heard line was in (`lastLang`), and an English decode that wins early on an engaged or
 * named turn gives the Tamil decode TRANSLATE_GRACE_MS (700 ms) more, so the guard can weigh the two.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { resetLedger } from "./ledger";
import { hearUtterance, readHear } from "./stt";

const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const abortable = (ms: number, signal?: AbortSignal | null) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
type Plan = { ms: number; text: string; logprob?: number } | "hang";
/** a fake Groq: each forced decode answers after its own delay, and stops when it is aborted */
function fake(plan: Partial<Record<"ta" | "en", Plan>>) {
  const aborted: string[] = [];
  const fetcher = (async (_u: string, init: RequestInit) => {
    const kind = String((init.body as FormData).get("language"));
    const p = plan[kind as "ta"] ?? { ms: 0, text: "" };
    try { await abortable(p === "hang" ? 600_000 : p.ms, init.signal); } catch (e) { aborted.push(kind); throw e; }
    if (p === "hang") throw new Error("unreachable");
    return new Response(JSON.stringify({ text: p.text, duration: 1, segments: [{ avg_logprob: p.logprob ?? -0.2, no_speech_prob: 0.02, compression_ratio: 1.2 }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, aborted };
}
/** Whisper forced to English translating Tamil speech, and the Tamil decode of the same speech */
const TRANSLATION = { en: { ms: 30, text: "Show the complaints in Adyar.", logprob: -0.1 } } as const;
const TAMIL = (ms: number) => ({ ms, text: "அடையாறு புகார்களைக் காட்டுங்கள்", logprob: -0.3 });

beforeEach(() => { vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-sttexp-"))); vi.stubEnv("GROQ_API_KEY", "x"); vi.stubEnv("GEMINI_API_KEY", ""); resetLedger(); });
afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

describe("an English decode that wins early waits for the translation guard", () => {
  it("English site, engaged: the Tamil decode back 450 ms after a fluent translation still wins (it was cut at 250 ms)", async () => {
    const { fetcher } = fake({ ...TRANSLATION, ta: TAMIL(450) });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher });
    expect(h).toMatchObject({ text: "அடையாறு புகார்களைக் காட்டுங்கள்", lang: "ta", noise: false });
  });
  it("the same on a named turn", async () => {
    const { fetcher } = fake({ ...TRANSLATION, ta: TAMIL(450) });
    expect(await hearUtterance(wav(), { lane: "named", site: "en", fetcher })).toMatchObject({ lang: "ta" });
  });
  it("a Tamil decode that never comes is still let go: English is heard well short of Whisper's 5 s", async () => {
    const { fetcher, aborted } = fake({ en: { ms: 30, text: "show the severe cases", logprob: -0.15 }, ta: "hang" });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher });
    // about 730 ms; the margin is for a loaded machine running the whole suite
    expect(Date.now() - t0).toBeLessThan(2500);
    expect(h).toMatchObject({ text: "show the severe cases", lang: "en" });
    expect(aborted).toContain("ta");
  });
  it("plain English speech with a Tamil decode that follows the same sounds stays English", async () => {
    const { fetcher } = fake({ en: { ms: 30, text: "show me the severe cases", logprob: -0.1 }, ta: { ms: 450, text: "ஷோ மீ த சிவியர் கேசஸ்", logprob: -0.3 } });
    expect(await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher })).toMatchObject({ text: "show me the severe cases", lang: "en" });
  });
});

describe("the browser says the last heard line's language (lastLang)", () => {
  it("last line Tamil, English site: the race waits for the Tamil decode, even a slow one", async () => {
    const { fetcher } = fake({ ...TRANSLATION, ta: TAMIL(1200) });
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher, lastLang: "ta" } as Parameters<typeof hearUtterance>[1]);
    expect(h).toMatchObject({ text: "அடையாறு புகார்களைக் காட்டுங்கள்", lang: "ta" });
  });
  it("the ambient lane keeps its one decode in the site's language", async () => {
    const { fetcher } = fake({ en: { ms: 20, text: "the meeting is at four", logprob: -0.2 }, ta: TAMIL(20) });
    const h = await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher, lastLang: "ta" } as Parameters<typeof hearUtterance>[1]);
    expect(h.lang).toBe("en");
  });
  it("readHear takes lastLang from the multipart body or the query, and nothing else", async () => {
    const f = new FormData();
    f.append("audio", new Blob([wav()], { type: "audio/wav" }), "speech.wav");
    f.append("lastLang", "ta");
    const multi = await readHear(new Request("http://localhost/api/jarvis/hear?lane=engaged&lang=en", { method: "POST", body: f }));
    expect(multi).toMatchObject({ lastLang: "ta" });
    const raw = await readHear(new Request("http://localhost/api/jarvis/hear?lane=engaged&lang=en&lastLang=ta", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: new Blob([wav()]) }));
    expect(raw).toMatchObject({ lastLang: "ta" });
    const none = await readHear(new Request("http://localhost/api/jarvis/hear?lastLang=fr", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: new Blob([wav()]) }));
    expect(none?.lastLang ?? null).toBeNull();
  });
});
