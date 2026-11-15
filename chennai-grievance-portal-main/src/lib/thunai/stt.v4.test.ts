import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { resetLedger } from "./ledger";
import { approxTokens, choose, cleanVocab, hearUtterance, PROMPT_TOKENS, scoreDecode, sttPrompt, translated, WHISPER_MS, type Decode } from "./stt";

const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const abortable = (ms: number, signal?: AbortSignal | null) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
type Plan = { ms: number; text: string; logprob?: number } | "hang";
interface Call { kind: string; at: number; signal: AbortSignal | null | undefined; prompt: string; body: string }
/** A fake Groq and Gemini: each decode answers after its own delay, and stops when it is aborted. */
function fake(plan: Partial<Record<"ta" | "en" | "gemini", Plan>>) {
  const calls: Call[] = [];
  const t0 = Date.now();
  const fetcher = (async (u: string, init: RequestInit) => {
    const gem = u.includes("generativelanguage");
    const f = gem ? null : (init.body as FormData);
    const kind = gem ? "gemini" : String(f!.get("language"));
    calls.push({ kind, at: Date.now() - t0, signal: init.signal, prompt: gem ? "" : String(f!.get("prompt") ?? ""), body: gem ? String(init.body) : "" });
    const p = plan[kind as "ta"] ?? { ms: 0, text: "" };
    await abortable(p === "hang" ? 600_000 : p.ms, init.signal);
    if (p === "hang") throw new Error("unreachable");
    if (gem) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: p.text }] } }] }), { status: 200 });
    return new Response(JSON.stringify({ text: p.text, duration: 1, segments: [{ avg_logprob: p.logprob ?? -0.2, no_speech_prob: 0.02, compression_ratio: 1.2 }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}
const dec = (lang: "en" | "ta", text: string, logprob = -0.3): Decode => ({ lang, model: lang === "ta" ? "whisper-large-v3" : "whisper-large-v3-turbo", text, segments: [{ avg_logprob: logprob, no_speech_prob: 0.02, compression_ratio: 1.3 }] });

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv-stt4-")); vi.stubEnv("THUNAI_DIR", dir); vi.stubEnv("GROQ_API_KEY", "x"); vi.stubEnv("GEMINI_API_KEY", ""); resetLedger(); });
afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

describe("first good decode wins", () => {
  it("English site: turbo's confident decode returns at once, large-v3 gets at most 250 ms more and is then let go", async () => {
    const { fetcher, calls } = fake({ en: { ms: 30, text: "show the severe cases", logprob: -0.15 }, ta: { ms: 3000, text: "ஷோ த சிவியர் கேசஸ்", logprob: -0.2 } });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher });
    // well short of the slower decode's 3 s: it did not wait for it (the margin is for a loaded machine running the whole suite)
    expect(Date.now() - t0).toBeLessThan(2500);
    expect(h).toMatchObject({ text: "show the severe cases", lang: "en", noise: false });
    expect(calls.find((c) => c.kind === "ta")?.signal?.aborted).toBe(true);
  });
  it("the other decode, back inside the 250 ms, is still weighed", async () => {
    const { fetcher } = fake({ en: { ms: 30, text: "Adyar status", logprob: -0.3 }, ta: { ms: 150, text: "அடையாறு நிலவரம்", logprob: -0.1 } });
    expect(await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher })).toMatchObject({ text: "அடையாறு நிலவரம்", lang: "ta" });
  });
  it("Tamil site: a confident English decode alone does not end the race; the Tamil one does", async () => {
    const { fetcher } = fake({ en: { ms: 20, text: "Show the complaints in Adyar.", logprob: -0.1 }, ta: { ms: 400, text: "அடையாறு புகார்களைக் காட்டுங்கள்", logprob: -0.2 } });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "ta", fetcher });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(380);
    expect(h).toMatchObject({ text: "அடையாறு புகார்களைக் காட்டுங்கள்", lang: "ta" });
  });
  it("a decode that never answers is given up at 5 s, not 12", async () => {
    expect(WHISPER_MS).toBeLessThanOrEqual(5000);
    const { fetcher } = fake({ en: { ms: 20, text: "show the cases", logprob: -0.6 }, ta: "hang" });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher });
    const ms = Date.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(4500);
    expect(ms).toBeLessThan(6500);
    expect(h).toMatchObject({ text: "show the cases", lang: "en" });
  }, 9000);
  it("each decode is written to telemetry with its model, its time and the winner; never its words", async () => {
    const { fetcher } = fake({ en: { ms: 30, text: "show the severe cases", logprob: -0.15 }, ta: { ms: 2000, text: "ஷோ", logprob: -0.2 } });
    await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher });
    const rows = fs.readFileSync(path.join(dir, "telemetry.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const decodes = rows.filter((r) => r.event === "stt_decode");
    expect(decodes.map((r) => r.decode).sort()).toEqual(["en", "ta"]);
    for (const r of decodes) { expect(typeof r.ms).toBe("number"); expect(String(r.model)).toMatch(/whisper/); expect(r.sttWinner).toBe("en"); }
    expect(decodes.find((r) => r.decode === "ta")?.aborted).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("severe");
  });
});

describe("Gemini, the third racer, runs beside Whisper", () => {
  it("it starts with the Whisper decodes, not after them, and wins when Whisper is unsure", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    const { fetcher, calls } = fake({ en: { ms: 300, text: "adhe arru", logprob: -1.3 }, ta: { ms: 300, text: "அதே ஆறு", logprob: -1.3 }, gemini: { ms: 300, text: "அடையாறு புகார்கள் காட்டு" } });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "engaged", site: "ta", fetcher });
    expect(calls.find((c) => c.kind === "gemini")!.at).toBeLessThan(100);
    expect(Date.now() - t0).toBeLessThan(560);
    expect(h).toMatchObject({ text: "அடையாறு புகார்கள் காட்டு", lang: "ta", noise: false });
  });
  it("it is let go when Whisper is sure", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    const { fetcher, calls } = fake({ en: { ms: 30, text: "show the severe cases", logprob: -0.1 }, ta: { ms: 40, text: "ஷோ த சிவியர் கேசஸ்", logprob: -0.9 }, gemini: { ms: 2500, text: "show the severe cases" } });
    const t0 = Date.now();
    const h = await hearUtterance(wav(), { lane: "named", site: "en", fetcher });
    // well short of the slower decode's 3 s: it did not wait for it (the margin is for a loaded machine running the whole suite)
    expect(Date.now() - t0).toBeLessThan(2500);
    expect(h.text).toBe("show the severe cases");
    const g = calls.find((c) => c.kind === "gemini");
    if (g) expect(g.signal?.aborted).toBe(true);
  });
  it("it hears the same names as Whisper, as an instruction", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    const { fetcher, calls } = fake({ en: { ms: 30, text: "x", logprob: -1.4 }, ta: { ms: 30, text: "எக்ஸ்", logprob: -1.4 }, gemini: { ms: 30, text: "Velachery drains" } });
    await hearUtterance(wav(), { lane: "engaged", site: "en", fetcher, vocab: ["Velachery", "Storm Water Drains"] });
    const body = calls.find((c) => c.kind === "gemini")!.body;
    expect(body).toContain("Velachery");
    expect(body).toMatch(/do not translate/i);
  });
});

describe("one prompt per language", () => {
  it("the Tamil prompt names places in Tamil script, the English one in English", () => {
    const ta = sttPrompt("ta", []), en = sttPrompt("en", []);
    expect(ta).toContain("அடையாறு");
    expect(ta).not.toContain("Adyar");
    expect(en).toContain("Adyar");
    expect(en).not.toMatch(/[஀-௿]/);
  });
  it("the open Stage's names go into the prompt of their own script, a known English name also into the Tamil one", () => {
    const ta = sttPrompt("ta", ["Adyar", "மயிலாப்பூர்", "Puzhal", "Velachery"]), en = sttPrompt("en", ["Adyar", "மயிலாப்பூர்", "Puzhal", "Velachery"]);
    expect(ta).toContain("மயிலாப்பூர்");
    expect(ta).toContain("புழல்");
    expect(en).toContain("Velachery");
    expect(en).not.toContain("மயிலாப்பூர்");
  });
  it("each stays inside Whisper's prompt limit, even with thirty long names", () => {
    const many = Array.from({ length: 30 }, (_, i) => `Kannagi Nagar Extension ${String.fromCharCode(65 + i)}`);
    const tamil = Array.from({ length: 30 }, () => "திருவான்மியூர் கடற்கரை சாலை");
    for (const p of [sttPrompt("en", many), sttPrompt("ta", tamil), sttPrompt("ta", many), sttPrompt("en", [])]) expect(approxTokens(p)).toBeLessThanOrEqual(PROMPT_TOKENS);
    expect(PROMPT_TOKENS).toBeLessThanOrEqual(224);
  });
  it("each forced decode is sent its own language's prompt", async () => {
    const { fetcher, calls } = fake({ en: { ms: 10, text: "show Adyar", logprob: -0.2 }, ta: { ms: 10, text: "அடையாறு காட்டு", logprob: -0.2 } });
    await hearUtterance(wav(), { lane: "engaged", site: "ta", fetcher, vocab: ["Velachery"] });
    expect(calls.find((c) => c.kind === "ta")!.prompt).toContain("அடையாறு");
    expect(calls.find((c) => c.kind === "en")!.prompt).toContain("Velachery");
  });
  it("the names from the browser are cleaned: no digits, no sentences, at most 30, each short", () => {
    const v = cleanVocab(["Adyar 9876543210", "x".repeat(80), "the man who called about the drain near his house", "Ward 173", "Adyar", ...Array.from({ length: 40 }, (_, i) => `Place ${String.fromCharCode(65 + (i % 26))}${i}`)]);
    expect(v.length).toBeLessThanOrEqual(30);
    expect(v.join(" ")).not.toMatch(/\d/);
    expect(v).toContain("Adyar");
    expect(v.filter((x) => x === "Adyar").length).toBe(1);
    expect(v.every((x) => x.length <= 40 && x.split(" ").length <= 4)).toBe(true);
    expect(cleanVocab('["Velachery","Guindy"]')).toEqual(["Velachery", "Guindy"]);
    expect(cleanVocab(42)).toEqual([]);
  });
});

describe("the forced English decode may not translate Tamil speech", () => {
  it("a confident Tamil decode beats a fluent English one of another shape", () => {
    const ta = scoreDecode(dec("ta", "அடையாறு புகார்களைக் காட்டுங்கள்", -0.3)), en = scoreDecode(dec("en", "Show the complaints in Adyar.", -0.1));
    expect(translated(ta, en)).toBe(true);
    expect(choose([dec("ta", "அடையாறு புகார்களைக் காட்டுங்கள்", -0.3), dec("en", "Show the complaints in Adyar.", -0.1)], "en")?.lang).toBe("ta");
    for (const [t, e] of [["அண்ணா நகர்ல தண்ணி பிரச்சனை என்ன", "What is the water problem in Anna Nagar"], ["வேளச்சேரி வெள்ளம் நிலவரம் சொல்லுங்க", "Tell me the Velachery flood situation"],
      ["பெருங்குடில எத்தனை புகார் இருக்கு", "How many complaints are there in Perungudi"], ["ஜார்விஸ் கடுமையான வழக்குகளைக் காட்டு", "Jarvis, show the severe cases"]]) {
      expect(translated(scoreDecode(dec("ta", t, -0.3)), scoreDecode(dec("en", e, -0.2))), e).toBe(true);
    }
  });
  it("English letters that follow the same sounds (Tanglish) are not a translation", () => {
    const ta = scoreDecode(dec("ta", "அடையார்ல கம்ப்ளைண்ட்ஸ் காட்டு", -0.4)), en = scoreDecode(dec("en", "Adyar la complaints kaattu", -0.3));
    expect(translated(ta, en)).toBe(false);
    for (const [t, e] of [["ஷோ மீ த சிவியர் கேசஸ்", "show me the severe cases"], ["அண்ணா நகர்ல தண்ணி பிரச்சனை என்ன", "Anna Nagar la thanni prachanai enna"],
      ["வேளச்சேரி வெள்ளம் நிலவரம் சொல்லுங்க", "Velachery vellam nilavaram sollunga"], ["டிரெண்ட்ஸ் பேஜ் ஓபன் பண்ணு", "trends page open pannu"], ["ஜார்விஸ் சிவியர் கேஸஸ் காட்டு", "Jarvis severe cases kaattu"]]) {
      expect(translated(scoreDecode(dec("ta", t, -0.3)), scoreDecode(dec("en", e, -0.2))), e).toBe(false);
    }
  });
  it("an unsure Tamil decode does not hold back English speech", () => {
    expect(choose([dec("ta", "ஷோ மீ த கேசஸ்", -0.7), dec("en", "show me the cases", -0.2)], "ta")?.lang).toBe("en");
  });
});

describe("a sentence with the name in it, heard on the ambient lane and unsure", () => {
  it("the server reads it once more in the other language only; the browser no longer posts it again", async () => {
    const { fetcher, calls } = fake({ en: { ms: 10, text: "Jarvis, adhe arru pugar kaattu", logprob: -0.9 }, ta: { ms: 10, text: "ஜார்விஸ், அடையாறு புகார் காட்டு", logprob: -0.3 } });
    const h = await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher });
    expect(calls.map((c) => c.kind)).toEqual(["en", "ta"]);
    expect(h).toMatchObject({ text: "ஜார்விஸ், அடையாறு புகார் காட்டு", lang: "ta", noise: false });
  });
  it("a sure one, or one without the name, is not read again", async () => {
    const a = fake({ en: { ms: 10, text: "Jarvis, show the trends page", logprob: -0.2 } });
    await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher: a.fetcher });
    expect(a.calls.length).toBe(1);
    const b = fake({ en: { ms: 10, text: "the file is on the table", logprob: -0.9 } });
    await hearUtterance(wav(), { lane: "ambient", site: "en", fetcher: b.fetcher });
    expect(b.calls.length).toBe(1);
  });
});
