import fs from "fs";
import path from "path";
import { expect, test, type Page } from "@playwright/test";

/**
 * v6, Phase 0 and every later before/after: the REAL path, timed from the true end of speech. A production bundle built with
 * NEXT_PUBLIC_JARVIS_SPEC=1, real Groq Whisper, the real planner ladder (Claude off), the console's real local store, and Edge's own
 * natural voices (Neerja for English, Pallavi for Tamil): the owner's voice path. Recorded synthetic clips (tests/e2e/fixtures/v6:
 * Windows' voices and Gemini's, never a person) are played into the page's microphone stream at a known time, so the end of speech is
 * the clip's own last voiced sample (v6.json endMs), not any detector's opinion.
 *
 * What is timed, from that end (performance.now(), one clock):
 *  - the first sound the page makes (Jarvis's earcon, its PCM voice, or a browser voice's start event), by instrumenting the page's
 *    AudioScheduledSourceNode.start and speechSynthesis.speak in an init script (the app's code is not touched; the output device's
 *    reported latency is recorded beside each start);
 *  - the first word of the answer: the first voice start event at or after the console's "finding" mark (stamped when the answer, not
 *    an acknowledgement, is handed to the voice: Edge's natural voice starts later);
 *  - the end of the answer (the last utterance or PCM buffer to end);
 *  - the screen change (a mutation of the stand-in console's state panel);
 *  - every stage of the v5 trace (zero there is the detector's last voiced sample; here it is re-based on the true end).
 * The closed wake ("Hi Jarvis" with Jarvis off) runs through the browser's own recogniser (wake.ts); the init script hands it the
 * same injected track (SpeechRecognition.start(track)), so the clip reaches it at a known time.
 *
 * Start the server first (scripts/jarvis6/serve-real.sh), then, from chennai-grievance-portal-main:
 *   REAL=1 SPEC_PROD=1 V6_TAG=phase0 npx playwright test tests/e2e/real6.spec.ts
 * V6_PARTS=wake,closed,cmd,en,ta,tg picks the parts; LIVE_GAP_MS (default 20000) spaces the planner turns. Results:
 * eval/v6/latency/<tag>-<part>.json (timings, the clip's name, what Whisper returned for these synthetic clips, model names).
 */
test.skip(!process.env.REAL, "spends real quota: run with REAL=1");

const FX = path.join(process.cwd(), "tests", "e2e", "fixtures", "v6");
// v8: the owner's examples, spoken by Windows' own voices (tests/e2e/fixtures/v8, synthetic, no person)
const FX8 = path.join(process.cwd(), "tests", "e2e", "fixtures", "v8");
type Meta = Record<string, { kind: string; lang: string; text: string; voice: string; source: string; speechMs: number; endMs: number; durMs: number }>;
const META8 = (fs.existsSync(path.join(FX8, "v8.json")) ? JSON.parse(fs.readFileSync(path.join(FX8, "v8.json"), "utf8")) : {}) as Meta;
// v10: the owner's asks of 19 Nov, spoken by Windows' voices and Gemini's (tests/e2e/fixtures/v10, synthetic, no person)
const FX10 = path.join(process.cwd(), "tests", "e2e", "fixtures", "v10");
const META10 = (fs.existsSync(path.join(FX10, "v10.json")) ? JSON.parse(fs.readFileSync(path.join(FX10, "v10.json"), "utf8")) : {}) as Meta;
const META = { ...(JSON.parse(fs.readFileSync(path.join(FX, "v6.json"), "utf8")) as Meta), ...META8, ...META10 };
const b64 = (n: string) => fs.readFileSync(path.join(META10[n] ? FX10 : META8[n] ? FX8 : FX, `${n}.wav`)).toString("base64");
const TAG = process.env.V6_TAG || "run";
const PARTS = new Set((process.env.V6_PARTS || "wake,closed,cmd,en,ta,tg").split(","));
const GAP = Number(process.env.LIVE_GAP_MS || 20_000);
const LIMIT = Number(process.env.V6_LIMIT || 99);
/** V6_FLAGS='{"NEXT_PUBLIC_JARVIS_KWS":"off"}': browser flags for this run (a measuring build reads window.__jvFlags: lib/thunai/flags.ts) */
const FLAGS: Record<string, string> | null = process.env.V6_FLAGS ? JSON.parse(process.env.V6_FLAGS) : null;
const OUT = path.join(process.cwd(), "eval", "v6", "latency");
// Edge lists its online natural voices only when these Playwright defaults are left out (found 17 Nov: 326 voices instead of 5)
const KEEP_VOICES = ["--disable-background-networking", "--disable-component-update", "--disable-component-extensions-with-background-pages", "--disable-default-apps", "--disable-extensions"];
test.use({
  channel: process.env.PW_CHANNEL || "msedge",
  launchOptions: { ignoreDefaultArgs: KEEP_VOICES, args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }
});

const init = (flags: Record<string, string> | null) => {
  const W = window as unknown as Record<string, unknown> & { __v6: { audio: Record<string, unknown>[]; screen: { at: number; text: string }[]; sr: { at: number; ev: string }[] } };
  if (flags) W.__jvFlags = flags;
  try { localStorage.setItem("thunai-greeted", new Date().toDateString()); localStorage.setItem("jarvis-mode-seen", "1"); sessionStorage.setItem("jarvis-briefed", "1"); } catch { /* */ }
  W.__v6 = { audio: [], screen: [], sr: [] };
  const c = new AudioContext({ sampleRate: 48000 });
  W.__v6own = c;
  let dest: MediaStreamAudioDestinationNode | null = null;
  const ensure = () => {
    if (dest) return dest;
    dest = c.createMediaStreamDestination();
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.0008;
    const s = c.createBufferSource();
    s.buffer = n; s.loop = true; s.connect(dest); s.start();
    return dest;
  };
  // a fresh track each time, as getUserMedia gives: the open ears stop their tracks when Jarvis closes (ears.ts stop), and the shared
  // track stopped then fed the closed wake listener nothing (17 Nov v6a closed run: 1 wake of 12, the first, before any close)
  W.__jarvisTestStream = async () => { await c.resume(); return new MediaStream(ensure().stream.getAudioTracks().map((t) => t.clone())); };
  W.__jvPlay = async (data: string, endMs: number) => {
    await c.resume();
    const dst = ensure();
    const buf = await c.decodeAudioData(Uint8Array.from(atob(data), (x) => x.charCodeAt(0)).buffer);
    const s = c.createBufferSource();
    s.buffer = buf; s.connect(dst);
    const when = c.currentTime + 0.05;
    const startAt = performance.now() + (when - c.currentTime) * 1000;
    s.start(when);
    return { startAt, endAt: startAt + endMs };
  };
  // every sound the page itself starts (not this harness's own context). AudioBufferSourceNode has its OWN start() (when, offset,
  // duration), so it is hooked too: hooking the base class alone missed every PCM sound (found 17 Nov; the Phase 0 run saw tones and
  // the browser's voices only, which was all it played: its answers spoke on Edge's natural voices)
  for (const proto of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) hookStart(proto);
  function hookStart(proto: { start: (...a: number[]) => void }) {
  if (!Object.prototype.hasOwnProperty.call(proto, "start")) return;
  const origStart = proto.start;
  proto.start = function (this: AudioScheduledSourceNode, when?: number, ...rest: number[]) {
    try {
      const ctx = this.context as AudioContext;
      if (ctx !== c) {
        const now = performance.now(), ct = ctx.currentTime;
        const at = now + Math.max(0, ((when ?? 0) || ct) - ct) * 1000;
        const lat = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000;
        const kind = this instanceof OscillatorNode ? "tone" : "pcm";
        const buf = (this as AudioBufferSourceNode).buffer;
        W.__v6.audio.push({ kind, at, lat, dur: buf ? buf.duration * 1000 : null, ctx: ctx.state });
        if (kind === "pcm") this.addEventListener("ended", () => W.__v6.audio.push({ kind: "pcmEnd", at: performance.now() }));
      }
    } catch { /* never break the page */ }
    return (origStart as (w?: number, ...r: number[]) => void).call(this, when, ...rest);
  } as typeof origStart;
  }
  const speak = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
    // head: the first words of what is said (Jarvis's own words), to tell the news turn's first line from its brief
    const rec = { queued: performance.now(), chars: (u.text || "").length, head: (u.text || "").slice(0, 40), text: (u.text || "").slice(0, 400), voice: u.voice?.name ?? null, lang: u.lang, volume: u.volume };
    u.addEventListener("start", () => W.__v6.audio.push({ ...rec, kind: "uttStart", at: performance.now() }));
    u.addEventListener("end", () => W.__v6.audio.push({ ...rec, kind: "uttEnd", at: performance.now() }));
    u.addEventListener("error", (e) => W.__v6.audio.push({ ...rec, kind: "uttErr", at: performance.now(), err: (e as SpeechSynthesisErrorEvent).error }));
    return speak(u);
  };
  // the browser's recogniser (the closed wake) hears the injected track, so the clip reaches it at a known time
  const R = (window as unknown as { SpeechRecognition?: { prototype: { start: (t?: MediaStreamTrack) => void } }; webkitSpeechRecognition?: { prototype: { start: (t?: MediaStreamTrack) => void } } });
  const Rc = R.SpeechRecognition ?? R.webkitSpeechRecognition;
  if (Rc) {
    const os = Rc.prototype.start;
    Rc.prototype.start = function (this: EventTarget) {
      const at = () => performance.now();
      for (const ev of ["audiostart", "speechstart", "speechend", "end"]) this.addEventListener(ev, () => W.__v6.sr.push({ at: at(), ev }));
      this.addEventListener("result", (e) => { const r = e as unknown as { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }; for (let i = r.resultIndex; i < r.results.length; i++) W.__v6.sr.push({ at: at(), ev: `${r.results[i].isFinal ? "final" : "interim"}:${r.results[i][0].transcript}` }); });
      this.addEventListener("error", (e) => W.__v6.sr.push({ at: at(), ev: `error:${(e as unknown as { error: string }).error}` }));
      W.__v6.sr.push({ at: at(), ev: "start" });
      try { return os.call(this, ensure().stream.getAudioTracks()[0]); } catch { return os.call(this); }
    };
  }
};

async function open(page: Page) {
  await page.addInitScript(init, FLAGS);
  await page.route("**/api/collector/**", (r) => r.fulfill({ status: 401, json: {} }));
  await page.goto("/dev/thunai");
  await page.waitForFunction(() => !!(window as unknown as { __jv?: unknown }).__jv, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const W = window as unknown as { __v6: { screen: { at: number; text: string }[] } };
    const el = document.querySelector("[data-testid=harness-state]");
    if (el) new MutationObserver(() => W.__v6.screen.push({ at: performance.now(), text: el.textContent ?? "" })).observe(el, { childList: true, subtree: true, characterData: true });
    // a command can also answer with a screen of its own (the Stage, .st-root): its first appearance is a screen change too
    let stage = !!document.querySelector(".st-root");
    new MutationObserver(() => { const now = !!document.querySelector(".st-root"); if (now && !stage) W.__v6.screen.push({ at: performance.now(), text: "stage" }); stage = now; }).observe(document.body, { childList: true, subtree: true });
  });
  // a first call in a fresh server reads the store and builds its world: that is start-up, not a turn's latency
  const warm = { turnId: "warm1", round: 0, text: "show the severe cases", turns: [], stage: null, direct: null, state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } };
  await page.request.post("/api/dev/thunai/agent/round", { data: warm, timeout: 120_000 }).catch(() => undefined);
}
async function modeOn(page: Page) {
  await page.keyboard.press("Control+Shift+J");
  await page.waitForFunction(() => (window as unknown as { __jv: { state(): string } }).__jv.state() !== "off", null, { timeout: 60_000 });
  await page.waitForTimeout(1600);
}
const play = (page: Page, name: string) => page.evaluate(([d, e]) => (window as unknown as { __jvPlay: (a: string, b: number) => Promise<{ startAt: number; endAt: number }> }).__jvPlay(d as string, e as number), [b64(name), META[name].endMs] as const);
const reset = (page: Page) => page.evaluate(() => { const W = window as unknown as { __v6: { audio: unknown[]; screen: unknown[]; sr: unknown[] }; __jv: { marks: unknown[] } }; W.__v6.audio.length = 0; W.__v6.screen.length = 0; W.__v6.sr.length = 0; W.__jv.marks.length = 0; });
const state = (page: Page) => page.evaluate(() => {
  const W = window as unknown as { __v6: { audio: { kind: string; at: number }[]; screen: { at: number; text: string }[]; sr: { at: number; ev: string }[] }; __jv: { marks: { name: string; t: number }[]; state(): string; speaking(): boolean; trace?: { zero: number; at: Record<string, number>; lane: string | null }[]; hud(): { ribbon: string; answer: string; strip: { provider: string | null; tokens: number | null; path: string | null } } } };
  const J = W.__jv;
  return { audio: [...W.__v6.audio], screen: [...W.__v6.screen], sr: [...W.__v6.sr], marks: [...J.marks], st: J.state(), speaking: J.speaking(), trace: (J.trace ?? []).slice(-3), hud: J.hud() };
});
type S = Awaited<ReturnType<typeof state>>;

/** wait until the turn after `end` has run its course: spoken and quiet, or nothing for `quietMs` */
async function settle(page: Page, end: number, maxMs: number, wantAnswer: boolean) {
  const t0 = Date.now();
  let lastActive = Date.now();
  for (;;) {
    await page.waitForTimeout(250);
    const s = await state(page);
    const busy = s.speaking || s.st === "thinking" || s.st === "hearing";
    if (busy) lastActive = Date.now();
    const answered = s.marks.some((m) => m.name === "finding" && m.t > end);
    if (!busy && Date.now() - lastActive > 1200 && (!wantAnswer || answered || Date.now() - t0 > 12_000)) return s;
    if (Date.now() - t0 > maxMs) return s;
  }
}

const rel = (x: number | undefined, end: number) => (x == null || !Number.isFinite(x) ? null : Math.round(x - end));
function measure(s: S, end: number) {
  // a silent utterance (volume 0: the v6 voice warm-up) is no sound
  const after = s.audio.filter((a) => (a.at as number) > end - 50 && (a as { volume?: number }).volume !== 0);
  const sound = after.filter((a) => a.kind === "tone" || a.kind === "pcm" || a.kind === "uttStart").sort((a, b) => (a.at as number) - (b.at as number));
  const speech = after.filter((a) => a.kind === "pcm" || a.kind === "uttStart").sort((a, b) => (a.at as number) - (b.at as number));
  const ends = after.filter((a) => a.kind === "uttEnd" || a.kind === "pcmEnd").map((a) => a.at as number);
  const mark = (n: string) => s.marks.find((m) => m.name === n && m.t > end - 50)?.t;
  const screen = s.screen.find((x) => x.at > end - 50)?.at;
  // the trace of this turn: the latest one whose zero lies near this clip's end
  const tr = [...s.trace].reverse().find((t) => Math.abs(t.zero - end) < 2500) ?? null;
  return {
    firstSound: rel(sound[0]?.at as number | undefined, end), firstSoundKind: (sound[0]?.kind as string | undefined) ?? null, firstSoundLat: sound[0] ? Math.round(Number((sound[0] as { lat?: number }).lat ?? 0)) : null,
    firstSpeech: rel(speech[0]?.at as number | undefined, end), handed: rel(mark("finding"), end), ackMark: rel(mark("ack"), end),
    // the first word of the answer: the first voice start at or after the console's "finding" mark, which is stamped when the answer
    // (not an acknowledgement) is HANDED to the voice; Edge's natural voice starts later (1.3 s on the 17 Nov smoke run)
    finding: rel(speech.find((a) => mark("finding") != null && (a.at as number) >= (mark("finding") as number) - 5)?.at as number | undefined, end),
    answerEnd: ends.length ? rel(Math.max(...ends), end) : null, screen: rel(screen, end),
    // the console's "answer" mark: the answer exists, on the screen, whatever the voice is doing (Thunai.tsx markAnswer)
    answerReady: rel(mark("answer"), end),
    vadEnd: rel(mark("vadEnd"), end), transcribed: rel(mark("transcribed"), end),
    trace: tr ? { lane: tr.lane, zeroVsTrue: Math.round(tr.zero - end), at: Object.fromEntries(Object.entries(tr.at).map(([k, v]) => [k, Math.round(v - end)])) } : null,
    voices: [...new Set(speech.map((a) => (a as { voice?: string }).voice ?? a.kind))],
    heard: s.hud.ribbon, provider: s.hud.strip.provider, tokens: s.hud.strip.tokens, path: s.hud.strip.path,
    // the raw events, timed from the true end (kinds and times only), for diagnosis
    events: [...s.audio.map((a) => `${a.kind}${(a as { volume?: number }).volume === 0 ? "(silent)" : ""}${a.kind === "uttStart" && (a as { head?: string }).head ? `[${String((a as { head?: string }).head).slice(0, 24).replace(/[@\]]/g, " ")}]` : ""}@${Math.round((a.at as number) - end)}`), ...s.marks.map((m) => `${m.name}@${Math.round(m.t - end)}`)]
  };
}
function save(part: string, rows: unknown[], extra: Record<string, unknown> = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${TAG}-${part}.json`), JSON.stringify({ tag: TAG, part, at: new Date().toISOString(), note: "timings in ms from the clip's true last voiced sample; synthetic clips; real providers; Edge natural voices", flags: FLAGS, ...extra, rows }, null, 1));
}

/** V6_WAKES="wake_zira,wake_mark": the wake clips to cycle (default: all eight: "Hi", "Hey", "Hello" and the Tamil one) */
const WAKES = process.env.V6_WAKES ? process.env.V6_WAKES.split(",").filter((k) => META[k]) : Object.keys(META).filter((k) => META[k].kind === "wake");
/** V6_ONLY="q_en_royapuram,q_ta_teynampet": only these clips (a re-run of the place questions, which need no planner quota) */
const ONLY = process.env.V6_ONLY ? new Set(process.env.V6_ONLY.split(",")) : null;
const of = (pre: string) => Object.keys(META).filter((k) => k.startsWith(pre) && (!ONLY || ONLY.has(k)));
const CMDS = ["cmd_trends", "cmd_severe", "cmd_briefing", "cmd_annanagar", "cmd_weekly", "cmd_high", "cmd_env", "cmd_monthly", "cmd_studio", "cmd_overview", "cmd_taluks", "cmd_medium"].filter((k) => META[k] && (!ONLY || ONLY.has(k)));

/** "Hi Jarvis" with Jarvis open and idle (b), then the clip inside the follow-up window */
async function wakeThen(page: Page, wake: string, clip: string | null, gapMs: number, maxMs: number, planner: boolean) {
  await reset(page);
  const w = await play(page, wake);
  await page.waitForTimeout(META[wake].durMs + 200);
  const sw = await settle(page, w.endAt, 8000, false);
  const wakeRow = { clip: wake, kind: "wake-open", ...measure(sw, w.endAt) };
  if (!clip) return { wakeRow, row: null };
  await page.waitForTimeout(600);
  await reset(page);
  const q = await play(page, clip);
  await page.waitForTimeout(META[clip].durMs);
  const s = await settle(page, q.endAt, maxMs, planner);
  const row = { clip, kind: META[clip].kind, lang: META[clip].lang, ...measure(s, q.endAt) };
  console.log(JSON.stringify({ wake: wakeRow.firstSound, clip, firstSound: row.firstSound, finding: row.finding, end: row.answerEnd, screen: row.screen, heard: row.heard, lane: row.trace?.lane }));
  // the next item starts from the dashboard: a screen this one opened is closed (Esc), so the next screen change is its own
  await page.keyboard.press("Escape");
  await page.waitForTimeout(gapMs);
  return { wakeRow, row };
}

test("v6 real latency: open turns", async ({ page }) => {
  test.setTimeout(3_600_000);
  await open(page);
  await modeOn(page);
  const wakeRows: unknown[] = [];
  const parts: [string, string[], boolean][] = [["cmd", CMDS, false], ["en", of("q_en_"), true], ["ta", of("q_ta_"), true], ["tg", of("q_tg_"), true]];
  if (PARTS.has("wake") && ![...PARTS].some((p) => p === "cmd" || p === "en" || p === "ta" || p === "tg")) {
    for (let i = 0; i < Number(process.env.V6_N || 12); i++) { const r = await wakeThen(page, WAKES[i % WAKES.length], null, 0, 0, false); wakeRows.push(r.wakeRow); await page.waitForTimeout(21_000); }
  }
  let k = 0;
  for (const [part, clips, planner] of parts) {
    if (!PARTS.has(part)) continue;
    const rows: unknown[] = [];
    for (const clip of clips.slice(0, LIMIT)) {
      const r = await wakeThen(page, WAKES[k++ % WAKES.length], clip, planner ? GAP : 21_000, 40_000, planner);
      wakeRows.push(r.wakeRow); rows.push(r.row);
      // the follow-up window (20 s) runs out before the next "Hi Jarvis", so every wake is from idle
    }
    save(part, rows);
  }
  if (wakeRows.length) save("wake", wakeRows);
  expect(wakeRows.length).toBeGreaterThan(0);
});

/**
 * v6 Phase 4, the news turn spoken (V6_PARTS=news): a news list typed on screen ("show me the latest news", then "stop" so its headlines
 * are not read), then "Hey Jarvis" and "Read the Nth article." (each a different live article), and three public questions twice. Per
 * row, besides the open-turn fields: the server's first line, the article's brief, the related coverage and the coverage brief in
 * hand (marks), and when the voice started the first line and the brief (from each utterance's first words).
 */
test("v6 real latency: news", async ({ page }) => {
  test.skip(!PARTS.has("news"), "part not asked for");
  test.setTimeout(3_600_000);
  await open(page);
  await modeOn(page);
  const ask = (t: string) => page.evaluate((x) => (window as unknown as { __jv: { ask(t: string): void } }).__jv.ask(x), t);
  const rows: unknown[] = [];
  const clips = of("news_").slice(0, LIMIT);
  let k = 0;
  for (const clip of clips) {
    if (/^news_(read|ta_read)/.test(clip)) {
      // the news list on Jarvis's screen, as a tap on an offered step builds it (the stand-in console has no news panel)
      await page.evaluate(() => (window as unknown as { __jv: { show(r: string, s: Record<string, unknown>): void } }).__jv.show("news", { period: "weekly", fresh: true }));
      for (let t = 0; t < 60; t++) { await page.waitForTimeout(250); if (await page.locator(".st-news li").count()) break; }
      await page.waitForTimeout(600);
      await ask("stop");
      await page.waitForTimeout(1200);
    }
    const r = await wakeThen(page, WAKES[k++ % WAKES.length], clip, 4000, 40_000, true);
    const row = r.row as Record<string, unknown> & { events: string[] };
    // the marks and utterances again, from the row's own raw events (kind@ms from the clip's end)
    const at = (name: string) => { const e = row.events.find((x) => x.startsWith(`${name}@`)); return e ? Number(e.split("@")[1]) : null; };
    // the voice: the first line's start, then the first utterance that is not it (the brief's first sentence)
    const utt = row.events.filter((x) => x.startsWith("uttStart[")).map((x) => ({ head: x.slice(9, x.indexOf("]")), ms: Number(x.split("@").pop()) })).filter((x) => x.ms >= 0);
    const firstLine = utt[0] ?? null, briefVoice = utt.find((x) => firstLine && x.head !== firstLine.head && !/^(Reading|Looking that up)/.test(x.head)) ?? null;
    rows.push({ ...row, wake: r.wakeRow.firstSound, firstLineVoice: firstLine?.ms ?? null, briefVoice: briefVoice?.ms ?? null, newsFirst: at("newsFirst"), newsBrief: at("newsBrief"), newsRelated: at("newsRelated"), newsCoverage: at("newsCoverage"), newsDone: at("newsDone") });
    console.log(JSON.stringify({ clip, heard: row.heard, firstSound: row.firstSound, newsFirst: at("newsFirst"), newsBrief: at("newsBrief"), newsCoverage: at("newsCoverage"), newsDone: at("newsDone") }));
    await page.waitForTimeout(GAP);
  }
  save("news", rows);
  expect(rows.length).toBeGreaterThan(0);
});

test("v6 real latency: closed wake", async ({ page }) => {
  test.skip(!PARTS.has("closed"), "part not asked for");
  test.setTimeout(900_000);
  await open(page);
  const rows: unknown[] = [];
  for (let i = 0; i < 12; i++) {
    const wake = WAKES[i % WAKES.length];
    // the wake listeners run only while Jarvis is off; give them time to start (or restart after the last try: v6's on-device one loads its
    // model in a fresh worker each time Jarvis closes)
    await page.waitForTimeout(Number(process.env.V6_CLOSED_WAIT_MS || 6000));
    await reset(page);
    const w = await play(page, wake);
    await page.waitForTimeout(META[wake].durMs);
    let s = await state(page);
    for (let t = 0; t < 32 && s.st === "off" && !s.audio.some((a) => a.kind === "tone"); t++) { await page.waitForTimeout(250); s = await state(page); }
    const woke = s.st !== "off";
    // the reply sounds as Jarvis opens: read the page again once it has had time to
    if (woke) { await page.waitForTimeout(1500); s = await state(page); }
    rows.push({ clip: wake, kind: "wake-closed", woke, ...measure(s, w.endAt), sr: s.sr.map((x) => ({ at: Math.round(x.at - w.endAt), ev: x.ev })) });
    console.log(JSON.stringify({ wake, woke, firstSound: (rows.at(-1) as { firstSound: number | null }).firstSound, sr: s.sr.map((x) => `${Math.round(x.at - w.endAt)}:${x.ev}`).join(" ") }));
    if (woke) { await page.keyboard.press("Control+Shift+J"); await page.waitForFunction(() => (window as unknown as { __jv: { state(): string } }).__jv.state() === "off", null, { timeout: 10_000 }).catch(() => undefined); }
  }
  save("closed", rows);
  expect(rows.length).toBe(12);
});

/**
 * v8 (V6_PARTS=owner8): the owner's five examples on the real path (docs/jarvis/JARVIS_V8.md), each as the owner would say it, with what Jarvis
 * said (every utterance's words, voice and language), what it showed and what it heard, in one conversation:
 *   1 a story by its topic ("Open the Supreme Court news on Palikan", a headline read out, "the Pallikaranai marsh story", Tanglish)
 *   2 a short news question ("What's the news on the Supreme Court?")
 *   3 a sentence with no topic of its own: no "On it" (nor any filler said twice)
 *   4 English said with the console set to Tamil: answered in English; Tamil: in Tamil
 *   5 said to someone else a moment after Jarvis spoke ("Ramesh, ...", "Alexa, ...", "Call him back..."): nothing said, nothing done
 * Results: eval/v8/real/<tag>-owner8.json (local: the answers may hold a case's title).
 */
test("v8 real: the owner's examples", async ({ page }) => {
  test.skip(!PARTS.has("owner8"), "part not asked for");
  test.setTimeout(3_600_000);
  await open(page);
  await modeOn(page);
  const rows: Record<string, unknown>[] = [];
  const wakes = ["wake_zira", "wake_mark"];
  let k = 0;
  const said = (s: S, end: number) => s.audio.filter((a) => a.kind === "uttStart" && (a.at as number) > end - 50 && (a as { volume?: number }).volume !== 0)
    .map((a) => ({ at: Math.round((a.at as number) - end), text: String((a as { text?: string }).text ?? (a as { head?: string }).head ?? ""), voice: (a as { voice?: string }).voice ?? null, lang: (a as { lang?: string }).lang ?? null }));
  const stageText = () => page.evaluate(() => (document.querySelector(".st-root")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 800));
  const turn = async (label: string, clip: string, o: { wake: boolean; silent?: boolean }) => {
    if (o.wake) {
      await reset(page);
      const w = await play(page, wakes[k++ % wakes.length]);
      await page.waitForTimeout(META[wakes[0]].durMs + 200);
      await settle(page, w.endAt, 8000, false);
      await page.waitForTimeout(600);
    }
    // the turn before is over (spoken and quiet) before a line is said to someone else, so its answer is not taken for this one's
    await page.waitForFunction(() => { const J = (window as unknown as { __jv: { speaking(): boolean; state(): string } }).__jv; return !J.speaking() && J.state() !== "thinking"; }, null, { timeout: 60_000 }).catch(() => undefined);
    await reset(page);
    await page.evaluate(() => { (window as unknown as { __jvIgnored?: string[] }).__jvIgnored = []; });
    const q = await play(page, clip);
    await page.waitForTimeout(META[clip].durMs);
    const s = await settle(page, q.endAt, o.silent ? 20_000 : 45_000, !o.silent);
    const m = measure(s, q.endAt);
    const words = said(s, q.endAt);
    const acted = s.marks.some((x) => (x.name === "finding" || x.name === "answer" || x.name === "ack") && x.t > q.endAt - 50);
    const ignored = await page.evaluate(() => (window as unknown as { __jvIgnored?: string[] }).__jvIgnored ?? []);
    const row = { label, clip, text: META[clip].text, heard: s.hud.ribbon, ignored, said: words, stage: await stageText(), acted, silent: !words.length && !acted,
      firstSound: m.firstSound, finding: m.finding, answerReady: m.answerReady, screen: m.screen, lane: m.trace?.lane ?? null, events: m.events };
    rows.push(row);
    console.log(JSON.stringify({ label, heard: row.heard, ignored, silent: row.silent, said: words.map((x) => `${x.lang}:${x.text.slice(0, 120)}`) }));
    return row;
  };
  // 1 and 5: a story by its topic, then (Jarvis has just spoken) three lines said to others in the room
  await turn("ex1-palikan", "o8_palikan", { wake: true });
  await turn("ex5-ramesh", "o8_ramesh", { wake: false, silent: true });
  await turn("ex5-alexa", "o8_alexa", { wake: false, silent: true });
  await turn("ex5-call", "o8_call", { wake: false, silent: true });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(GAP);
  // 2: a short news question; 1 again: a headline read out, a topic and place, Tanglish
  for (const [label, clip] of [["ex2-sc-ask", "o8_sc_ask"], ["ex1-hpv", "o8_hpv"], ["ex1-marsh", "o8_marsh"], ["ex1-tanglish", "o8_tg_sc"], ["ex3-no-topic", "o8_other"]] as const) {
    await turn(label, clip, { wake: true });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(GAP);
  }
  // 4: the console set to Tamil; English said, then Tamil
  await page.evaluate(() => { localStorage.setItem("diq-lang", "ta"); window.dispatchEvent(new CustomEvent("diq:lang", { detail: "ta" })); });
  await page.waitForTimeout(800);
  for (const [label, clip] of [["ex4-en-severe", "o8_severe"], ["ex4-en-royapuram", "o8_royapuram"], ["ex4-ta-royapuram", "q_ta_royapuram"]] as const) {
    await turn(label, clip, { wake: true });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(GAP);
  }
  const out = path.join(process.cwd(), "eval", "v8", "real");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${TAG}-owner8.json`), JSON.stringify({ tag: TAG, at: new Date().toISOString(), note: "the owner's examples on the real path: synthetic clips (Windows voices), real Whisper, real models, Edge's voices", rows }, null, 1));
  expect(rows.length).toBe(12);
});

/**
 * v10 (V6_PARTS=owner10): the owner's asks of 19 Nov on the real path (docs/jarvis/JARVIS_V10.md Parts 2-3), in one conversation, each as
 * the owner would say it, with what Jarvis heard, said (words, voice, language), showed (the Stage) and did on the console (the stand-in's
 * state panel: a view, a page, "ask the map: ..."):
 *   names by ear ("Tell me about Cyclone Aquan.", Tamil "அக்வான் புயல்"), its own name by ear ("Javes, go to news."), a position by ear over
 *   the news panel ("the fast news"), a line cut off and its rest ("Tell me about the" ... "Puzhal jail drugs story."), the brief, "read it
 *   fully", news to ground truth, side talk kept silent (talk about the screen, a phone call's opener, a Tamil vocative), Ask the Map by voice
 *   (a question, a circle, Tanglish, the tour and its steering) and the dashboard by voice (two harmless controls, Sign out refused).
 * Results: eval/v10/real/<tag>-owner10.json (local: the answers may hold a case's title).
 */
test("v10 real: the owner's asks", async ({ page }) => {
  test.skip(!PARTS.has("owner10"), "part not asked for");
  test.setTimeout(3_600_000);
  await open(page);
  await modeOn(page);
  const rows: Record<string, unknown>[] = [];
  const wakes = ["wake_zira", "wake_mark"];
  let k = 0;
  const said = (s: S, end: number) => s.audio.filter((a) => a.kind === "uttStart" && (a.at as number) > end - 50 && (a as { volume?: number }).volume !== 0)
    .map((a) => ({ at: Math.round((a.at as number) - end), text: String((a as { text?: string }).text ?? (a as { head?: string }).head ?? ""), voice: (a as { voice?: string }).voice ?? null, lang: (a as { lang?: string }).lang ?? null }));
  const stageText = () => page.evaluate(() => (document.querySelector(".st-root")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 800));
  const consoleText = () => page.evaluate(() => (document.querySelector("[data-testid=harness-state]")?.textContent ?? "").replace(/\s+/g, " ").slice(-600));
  const quiet = () => page.waitForFunction(() => { const J = (window as unknown as { __jv: { speaking(): boolean; state(): string } }).__jv; return !J.speaking() && J.state() !== "thinking"; }, null, { timeout: 90_000 }).catch(() => undefined);
  const turn = async (label: string, clip: string, o: { wake: boolean; silent?: boolean; wait?: number }) => {
    if (o.wake) {
      await reset(page);
      const w = await play(page, wakes[k++ % wakes.length]);
      await page.waitForTimeout(META[wakes[0]].durMs + 200);
      await settle(page, w.endAt, 8000, false);
      await page.waitForTimeout(600);
    }
    await quiet();
    await reset(page);
    await page.evaluate(() => { (window as unknown as { __jvIgnored?: string[] }).__jvIgnored = []; });
    const before = await consoleText();
    const q = await play(page, clip);
    await page.waitForTimeout(META[clip].durMs);
    const s = await settle(page, q.endAt, o.wait ?? (o.silent ? 20_000 : 45_000), !o.silent);
    const m = measure(s, q.endAt);
    const words = said(s, q.endAt);
    const acted = s.marks.some((x) => (x.name === "finding" || x.name === "answer" || x.name === "ack") && x.t > q.endAt - 50);
    const ignored = await page.evaluate(() => (window as unknown as { __jvIgnored?: string[] }).__jvIgnored ?? []);
    const after = await consoleText();
    const row = { label, clip, text: META[clip].text, heard: s.hud.ribbon, ignored, said: words, stage: await stageText(), console: after === before ? "" : after, acted,
      silent: !words.length && !acted, firstSound: m.firstSound, finding: m.finding, answerReady: m.answerReady, screen: m.screen, lane: m.trace?.lane ?? null, events: m.events };
    rows.push(row);
    console.log(JSON.stringify({ label, heard: row.heard, ignored, silent: row.silent, said: words.map((x) => `${x.lang}:${x.text.slice(0, 140)}`), console: row.console.slice(-160) }));
    return row;
  };
  const pause = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(GAP); };
  // names by ear, with the weather for a storm; then its own name by ear, a position by ear over the panel it opened, and the brief's follow-ups
  await turn("aquan", "o10_aquan", { wake: true, wait: 60_000 });
  await pause();
  await turn("javes-goto", "o10_goto", { wake: true });
  await turn("fast-news", "o10_fast", { wake: false, wait: 60_000 });
  await turn("ground-truth", "o10_ground", { wake: false });
  // side talk while Jarvis listens on: about the screen, a phone call, a Tamil vocative
  await turn("side-screen", "o10_screen", { wake: false, silent: true });
  await turn("side-phone", "o10_phone", { wake: false, silent: true });
  await turn("side-ta-sir", "o10_ta_sir", { wake: false, silent: true });
  await pause();
  // a line cut off, then its rest a few seconds later (as the owner's "Tell me about the" on 19 Nov)
  await turn("cut-1", "o10_cut1", { wake: true, silent: true });
  await page.waitForTimeout(2500);
  await turn("cut-2", "o10_cut2", { wake: false, wait: 60_000 });
  await turn("read-fully", "o10_full", { wake: false, wait: 30_000 });
  await pause();
  // Tamil: a storm's name in Tamil letters
  await turn("ta-akvan", "o10_ta_akvan", { wake: true, wait: 60_000 });
  await pause();
  // Ask the Map by voice, then the tour and its steering
  for (const [label, clip] of [["map-ask", "o10_map_ask"], ["map-circle", "o10_map_circle"], ["map-tanglish", "o10_map_tg"]] as const) {
    await turn(label, clip, { wake: true });
    await pause();
  }
  await turn("tour", "o10_tour", { wake: true });
  await turn("tour-next", "o10_next", { wake: false });
  await turn("tour-stop", "o10_tour_stop", { wake: false });
  await pause();
  // the dashboard by voice: two harmless controls, and Sign out, which Jarvis never presses
  for (const [label, clip] of [["ctl-alerts", "o10_alerts"], ["ctl-pins", "o10_pins"], ["ctl-signout", "o10_signout"]] as const) {
    await turn(label, clip, { wake: true });
    await pause();
  }
  const out = path.join(process.cwd(), "eval", "v10", "real");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${TAG}-owner10.json`), JSON.stringify({ tag: TAG, at: new Date().toISOString(), note: "the owner's asks on the real path: synthetic clips (Windows and Gemini voices), real speech to text, real models, Edge's voices, the dev console", rows }, null, 1));
  expect(rows.length).toBe(20);
});
