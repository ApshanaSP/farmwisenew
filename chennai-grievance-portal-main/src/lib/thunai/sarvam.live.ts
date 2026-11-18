/**
 * The owner's first paid check of Sarvam (docs/jarvis/SARVAM.md, "The final test"). 40 clips of the v6 set (tests/e2e/fixtures/v6:
 * 12 English, 12 Tamil and 12 Tanglish questions, two Tamil lines and two English commands; synthetic voices reading invented lines,
 * no one's speech) go through the shipped hearUtterance twice, on the English site (the hard way for Tamil):
 *   1. JARVIS_STT_SARVAM=shadow: Whisper decides; Sarvam hears alongside. Its reply is read here off the wire (the console logs none of it).
 *   2. JARVIS_STT_SARVAM=tamil: the race with Sarvam in the forced-Tamil Whisper decode's place.
 * Scored against each clip's own line: word and character error, the language picked, Sarvam against Whisper, and the time to an
 * answer (p50, p90). Each clip is sent as the console sends it (16 kHz mono 16-bit WAV; the Gemini clips are 24 kHz, resampled here).
 * Sarvam: 2 calls a clip, about 316 billed seconds for the 40 (Rs 2.58 before GST). Groq: 3 calls a clip, paced for its limits.
 * Runs only with SARVAM_BENCH=1 and both keys (SARVAM_API_KEY and GROQ_API_KEY, from .env); SARVAM_BENCH_N=3 runs the first 3 clips:
 *   PowerShell: $env:SARVAM_BENCH="1"; npx vitest run --config vitest.live.config.ts src/lib/thunai/sarvam.live.ts
 * Results: data/thunai/sarvam-bench.json (git-ignored; THUNAI_DIR moves it), with each Sarvam reply's raw body (rows[].sarvam.body),
 * and a summary on the console.
 */
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { billedSeconds, SARVAM_MODEL, SARVAM_URL, sarvamLang, shadowSettled } from "./sarvam";
import { hearUtterance, wavSeconds } from "./stt";

const DIR = path.join(process.cwd(), "tests", "e2e", "fixtures", "v6");
const RUPEES_PER_MIN = 0.49;
type Clip = { kind: string; lang: "en" | "ta" | "tanglish"; text: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (t: string) => t.normalize("NFC").replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
function edit<T>(a: T[], b: T[]): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;
function errors(ref: string, hyp: string | null | undefined) {
  if (hyp == null) return { wer: null, cer: null };
  const a = norm(ref), b = norm(hyp), aw = a.split(" ").filter(Boolean), bw = b.split(" ").filter(Boolean);
  return { wer: r3(edit(aw, bw) / Math.max(1, aw.length)), cer: r3(edit([...a], [...b]) / Math.max(1, [...a].length)) };
}
const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? r3(v.reduce((s, x) => s + x, 0) / v.length) : null; };
const pct = (xs: (number | null)[], p: number) => { const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; };
const share = (xs: boolean[]) => (xs.length ? r3(xs.filter(Boolean).length / xs.length) : null);

/** The clip as the console sends it: 16 kHz mono 16-bit PCM WAV (linear resampling from the file's own rate). */
function console16k(file: string): ArrayBuffer {
  const b = fs.readFileSync(file);
  let off = 12, rate = 16000, ch = 1, bits = 16, data: Buffer | null = null;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === "fmt ") { ch = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); bits = b.readUInt16LE(off + 22); }
    if (id === "data") data = b.subarray(off + 8, off + 8 + Math.min(size, b.length - off - 8));
    off += 8 + size + (size % 2);
  }
  if (!data || bits !== 16) throw new Error(`${path.basename(file)}: not 16-bit PCM`);
  const n = Math.floor(data.length / 2 / ch), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += data.readInt16LE((i * ch + c) * 2); x[i] = s / ch; }
  const m = Math.floor((n * 16000) / rate), out = Buffer.alloc(44 + m * 2);
  for (let i = 0; i < m; i++) {
    const t = (i * rate) / 16000, j = Math.floor(t), f = t - j, v = (x[j] ?? 0) * (1 - f) + (x[j + 1] ?? x[j] ?? 0) * f;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), 44 + i * 2);
  }
  out.write("RIFF", 0, "ascii"); out.writeUInt32LE(36 + m * 2, 4); out.write("WAVE", 8, "ascii"); out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(16000, 24); out.writeUInt32LE(32000, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36, "ascii"); out.writeUInt32LE(m * 2, 40);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

const ready = process.env.SARVAM_BENCH === "1" && !!process.env.SARVAM_API_KEY?.trim() && !!process.env.GROQ_API_KEY?.trim();

it.runIf(ready)("Sarvam against today's Whisper race on 40 v6 clips: shadow, then tamil", async () => {
  const clips = JSON.parse(fs.readFileSync(path.join(DIR, "clips.json"), "utf8")) as Record<string, Clip>;
  const all = [...Object.keys(clips).filter((k) => /^q_(en|ta|tg)_/.test(k)), "news_ta_read1", "wake_g_kore_ta", "cmd_annanagar", "cmd_severe"];
  const n = Number(process.env.SARVAM_BENCH_N);
  const ids = Number.isFinite(n) && n > 0 ? all.slice(0, n) : all;

  // Sarvam's reply, read off the wire; every request counted at its billed seconds
  let wire: { status: number; ms: number; body: unknown } | null = null, secs = 0, billed = 0, calls = 0;
  const tap = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) !== SARVAM_URL) return fetch(url, init);
    calls++; billed += billedSeconds(secs);
    const t0 = Date.now(), r = await fetch(url, init);
    wire = { status: r.status, ms: 0, body: await r.clone().json().catch(() => null) };
    wire.ms = Date.now() - t0;
    return r;
  }) as typeof fetch;
  const readWire = () => {
    const w = wire as { status: number; ms: number; body: unknown } | null;
    const b = w?.body as { transcript?: unknown; language_code?: unknown; language_probability?: unknown } | null | undefined;
    const text = typeof b?.transcript === "string" ? b.transcript.trim() : null;
    return { status: w?.status ?? null, ms: w?.ms ?? null, text, lang: text != null ? sarvamLang(text, typeof b?.language_code === "string" ? b.language_code : null) : null, prob: typeof b?.language_probability === "number" ? b.language_probability : null, body: w?.body ?? null };
  };

  const before = process.env.JARVIS_STT_SARVAM, timeoutBefore = process.env.JARVIS_SARVAM_TIMEOUT_MS;
  const rows: Record<string, unknown>[] = [];
  try {
    for (const id of ids) {
      const c = clips[id], buf = console16k(path.join(DIR, `${id}.wav`)), want = c.lang === "en" ? "en" : "ta";
      secs = wavSeconds(buf);
      const group = id.startsWith("q_") ? id.slice(2, 4) : c.lang === "en" ? "en" : "ta";

      // shadow: Sarvam is given 10 s here, so its true time is measured (the turn never waits for it); tamil: the shipped limit
      process.env.JARVIS_STT_SARVAM = "shadow";
      process.env.JARVIS_SARVAM_TIMEOUT_MS = "10000";
      wire = null;
      let t0 = Date.now();
      const w = await hearUtterance(buf, { lane: "engaged", site: "en", fetcher: tap }).catch(() => null);
      const wMs = Date.now() - t0;
      await shadowSettled();
      const s = readWire();
      await sleep(6200);

      process.env.JARVIS_STT_SARVAM = "tamil";
      if (timeoutBefore == null) delete process.env.JARVIS_SARVAM_TIMEOUT_MS; else process.env.JARVIS_SARVAM_TIMEOUT_MS = timeoutBefore;
      wire = null;
      t0 = Date.now();
      const t = await hearUtterance(buf, { lane: "engaged", site: "en", fetcher: tap }).catch(() => null);
      const tMs = Date.now() - t0;
      await sleep(3200);

      rows.push({
        id, group, secs: r3(secs), ref: c.text, want,
        whisper: { text: w?.text ?? null, lang: w?.lang ?? null, model: w?.model ?? null, ms: wMs, ...errors(c.text, w?.text) },
        sarvam: { ...s, ...errors(c.text, s.text) },
        tamil: { text: t?.text ?? null, lang: t?.lang ?? null, model: t?.model ?? null, ms: tMs, sarvamWon: t?.model === SARVAM_MODEL, ...errors(c.text, t?.text) }
      });
    }
  } finally {
    if (before == null) delete process.env.JARVIS_STT_SARVAM; else process.env.JARVIS_STT_SARVAM = before;
    if (timeoutBefore == null) delete process.env.JARVIS_SARVAM_TIMEOUT_MS; else process.env.JARVIS_SARVAM_TIMEOUT_MS = timeoutBefore;
  }

  type Row = { group: string; want: string; whisper: { lang: string | null; ms: number; wer: number | null; text: string | null }; sarvam: { lang: string | null; ms: number | null; wer: number | null; text: string | null }; tamil: { lang: string | null; ms: number; wer: number | null; sarvamWon: boolean } };
  const rs = rows as unknown as Row[];
  const part = (xs: Row[]) => ({
    n: xs.length,
    wer: { whisper: mean(xs.map((x) => x.whisper.wer)), sarvam: mean(xs.map((x) => x.sarvam.wer)), tamilRace: mean(xs.map((x) => x.tamil.wer)) },
    langRight: { whisper: share(xs.map((x) => x.whisper.lang === x.want)), sarvam: share(xs.map((x) => x.sarvam.lang === x.want)), tamilRace: share(xs.map((x) => x.tamil.lang === x.want)) },
    langAgree: share(xs.filter((x) => x.whisper.lang && x.sarvam.lang).map((x) => x.whisper.lang === x.sarvam.lang)),
    sarvamWonInTamilRace: share(xs.map((x) => x.tamil.sarvamWon)),
    sarvamNoReply: xs.filter((x) => x.sarvam.text == null).length
  });
  const summary = {
    at: new Date().toISOString(), site: "en", clips: rs.length, sarvamCalls: calls, sarvamBilledS: billed,
    rupeesBeforeGst: Math.round((billed / 60) * RUPEES_PER_MIN * 100) / 100,
    all: part(rs), en: part(rs.filter((x) => x.group === "en")), ta: part(rs.filter((x) => x.group === "ta")), tanglish: part(rs.filter((x) => x.group === "tg")),
    msP50: { whisperRace: pct(rs.map((x) => x.whisper.ms), 0.5), sarvamCall: pct(rs.map((x) => x.sarvam.ms), 0.5), tamilRace: pct(rs.map((x) => x.tamil.ms), 0.5) },
    msP90: { whisperRace: pct(rs.map((x) => x.whisper.ms), 0.9), sarvamCall: pct(rs.map((x) => x.sarvam.ms), 0.9), tamilRace: pct(rs.map((x) => x.tamil.ms), 0.9) }
  };
  const out = path.join(process.env.THUNAI_DIR || path.join(process.cwd(), "data", "thunai"), "sarvam-bench.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  expect(rows.length).toBe(ids.length);
}, 1_500_000);
