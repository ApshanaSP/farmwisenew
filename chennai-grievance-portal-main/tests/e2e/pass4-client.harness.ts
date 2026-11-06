/**
 * QA pass 4: what tests/e2e/pass4-client-fixes.spec.ts drives the Collector console with, on the production build.
 *
 * The production bundle has no __jarvisTestStream and no __jv (they are dev only), so everything here stands at the browser's
 * own edges and nothing inside the app is touched:
 *  - the microphone: navigator.mediaDevices.getUserMedia gives a WebAudio stream a fixture plays into. The worklet, Silero and the
 *    turn machine are real.
 *  - Whisper: /api/jarvis/hear is mocked with page.route (its text, or a real failure). No model is called.
 *  - the browser's speech service: window.SpeechRecognition is a stand-in the test makes speak, so "heard only by captions" is real.
 *  - the voice: /api/jarvis/say is mocked with a short silent clip, and what it was asked to say is kept.
 * The server is the launcher's: dry-run, no model key, its own data folder. The agent answers from its code lanes only.
 */
import fs from "fs";
import path from "path";
import type { Browser, BrowserContext, Page, Request, Route } from "@playwright/test";
import { b64 } from "./helpers";

export const BASE = process.env.QA_BASE ?? "http://127.0.0.1:3135";
export const AUDIT_DIR = path.resolve(process.cwd(), "..", "docs", "qa", "pass4", "evidence", "bug-audit");
const ACCOUNTS = path.join(process.cwd(), "data", "aws-cache", "qa", "test-collector.txt");
const STATE = path.join(process.cwd(), "data", "aws-cache", "qa", "run", "pw-3135-collector.json");

/** the test account's details, read in code and never printed */
export function collector(): { email: string; password: string } {
  for (const l of fs.readFileSync(ACCOUNTS, "utf8").split(/\r?\n/)) {
    try { const j = JSON.parse(l); if (j.key === "collector") return { email: j.email, password: j.password }; } catch { /* a comment line */ }
  }
  throw new Error("no collector test account");
}

/** one sign-in for the whole run (the frozen clock never lets a rate-limit window pass) */
export async function signedInState(browser: Browser): Promise<string> {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  // the sign-in a run before this one left, while it still works: sign-ins are rate limited, and a failed test restarts the worker
  if (fs.existsSync(STATE) && Date.now() - fs.statSync(STATE).mtimeMs < 6 * 3600_000) return STATE;
  const ctx = await browser.newContext({ baseURL: BASE });
  const r = await ctx.request.post("/api/auth/login", { data: collector() });
  if (!r.ok()) throw new Error(`sign-in failed: ${r.status()}`);
  await ctx.storageState({ path: STATE });
  await ctx.close();
  return STATE;
}

/** a short silent WAV: the voice's stand-in, so "speaking" ends quickly */
function silentWav(ms = 250, rate = 16000): Buffer {
  const n = Math.round((ms / 1000) * rate), b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

const edges = () => {
  const W = window as unknown as Record<string, unknown>;
  try { localStorage.setItem("thunai-greeted", new Date().toDateString()); localStorage.setItem("jarvis-mode-seen", "1"); } catch { /* opaque origin */ }
  // the microphone
  const AC = window.AudioContext;
  const c = new AC({ sampleRate: 48000 });
  let dest: MediaStreamAudioDestinationNode | null = null;
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
    await c.resume();
    dest = c.createMediaStreamDestination();
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.0008;
    const src = c.createBufferSource();
    src.buffer = n; src.loop = true;
    src.connect(dest); src.start();
    return dest.stream;
  };
  W.__jvPlay = async (data: string) => {
    const bin = Uint8Array.from(atob(data), (x) => x.charCodeAt(0));
    const buf = await c.decodeAudioData(bin.buffer);
    const s = c.createBufferSource();
    s.buffer = buf; s.connect(dest!); s.start(c.currentTime + 0.05);
  };
  // the voice: no browser voice for en or ta, so the server's voice is used, and its route is what the test sees
  try { window.speechSynthesis.getVoices = () => [{ name: "none", lang: "de-DE", voiceURI: "none", default: true, localService: true } as SpeechSynthesisVoice]; } catch { /* no speech */ }
  // the browser's speech service: a stand-in that says what the test tells it to
  const live: Rec[] = [];
  class Rec {
    lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: ((e: unknown) => void) | null = null;
    start() { live.push(this); }
    stop() { const i = live.indexOf(this); if (i >= 0) live.splice(i, 1); }
    abort() { this.stop(); }
  }
  W.SpeechRecognition = Rec; W.webkitSpeechRecognition = Rec;
  /** the conductor's fallback is the recogniser with final results only; the ribbon's is the one with interim results */
  W.__srEmit = (text: string, kind: "fallback" | "ribbon" = "fallback") => {
    const to = live.filter((r) => (kind === "fallback" ? !r.interimResults : r.interimResults));
    for (const r of to) r.onresult?.({ resultIndex: 0, results: Object.assign([Object.assign([{ transcript: text }], { isFinal: true })], {}) });
    return to.length;
  };
  W.__srLive = () => live.map((r) => ({ interim: r.interimResults, lang: r.lang }));
};

export interface Heard { text: string; lang?: "en" | "ta" }
export interface Rig {
  ctx: BrowserContext; page: Page;
  lang?: "en" | "ta";
  /** what the next /api/jarvis/hear calls return, in order; "fail" makes a real failed request */
  hear: (Heard | "fail" | "503")[];
  hearCalls: number;
  /** every line the voice was asked to say */
  said: string[];
  /** every non-GET request to the app, path only */
  posts: { path: string; method: string; body: string | null }[];
  errors: string[];
}

export async function openConsole(browser: Browser, state: string, o: { lang?: "en" | "ta" } = {}): Promise<Rig> {
  const ctx = await browser.newContext({ baseURL: BASE, storageState: state, viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
  // nothing leaves this machine (fonts, map tiles)
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const rig: Rig = { ctx, page, lang: o.lang, hear: [], hearCalls: 0, said: [], posts: [], errors: [] };
  page.on("pageerror", (e) => rig.errors.push(e.message.slice(0, 300)));
  page.on("request", (q: Request) => {
    const u = new URL(q.url());
    if (u.origin === BASE && u.pathname.startsWith("/api/") && q.method() !== "GET") rig.posts.push({ path: u.pathname, method: q.method(), body: q.postDataBuffer() && !/hear/.test(u.pathname) ? q.postData() : null });
  });
  await page.addInitScript(edges);
  if (o.lang) await page.addInitScript((l) => { localStorage.setItem("diq-lang", l); }, o.lang);
  await page.route("**/api/jarvis/hear**", async (r: Route) => {
    rig.hearCalls++;
    const h = rig.hear.shift() ?? { text: "" };
    if (h === "fail") return r.abort("connectionrefused");
    if (h === "503") return r.fulfill({ status: 503, json: { error: "no transcriber" } });
    await r.fulfill({ json: { text: h.text, lang: h.lang ?? (/[஀-௿]/.test(h.text) ? "ta" : "en"), noise: !h.text, ms: 5, conf: { speech: 1, logprob: -0.2 }, model: "mock" } }).catch(() => undefined);
  });
  await page.route("**/api/jarvis/say", async (r: Route) => {
    rig.said.push(String((r.request().postDataJSON() as { text: string }).text));
    await r.fulfill({ body: silentWav(), contentType: "audio/wav" }).catch(() => undefined);
  });
  await page.goto("/collector");
  await page.waitForSelector(".ptabs", { timeout: 120_000 });
  // a cold server: the first page is busy for a while, and a tap in that time hangs
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined);
  return rig;
}

/** Jarvis mode on: the HUD is up and the microphone is open */
export async function jarvisOn(rig: Rig) {
  const { page } = rig;
  // Jarvis mounts after the console has hydrated
  await page.waitForSelector(".thunai", { state: "attached", timeout: 60_000 });
  await page.keyboard.press("Control+Shift+J");
  await page.waitForSelector('[data-testid="hud"]', { timeout: 30_000 });
  await page.waitForFunction(() => { const t = document.querySelector('[data-testid="state"]')?.textContent ?? ""; return !!t && !/Opening|திறக்கிறேன்/.test(t); }, null, { timeout: 60_000 });
  // the detector learns the room
  await page.waitForTimeout(1600);
}

/** Jarvis's own box: what the Collector types */
export async function typed(rig: Rig, text: string) {
  const { page } = rig;
  const box = page.locator(".hud-compose input");
  if (!(await box.isVisible())) await page.locator('.hud-acts button[aria-expanded]').click();
  await box.fill(text);
  await box.press("Enter");
}

/** Say something: a fixture plays into the microphone, the real detector cuts it out, and the mocked Whisper returns this */
export async function spoken(rig: Rig, h: Heard | "fail" | "503", fixture = "cmd_trends") {
  const n = rig.hearCalls;
  rig.hear.push(h);
  await rig.page.evaluate((d) => (window as unknown as { __jvPlay: (a: string) => Promise<void> }).__jvPlay(d), b64(fixture));
  await rig.page.waitForFunction(() => true);
  const t0 = Date.now();
  while (rig.hearCalls === n) {
    if (Date.now() - t0 > 25_000) throw new Error(`the detector sent nothing to Whisper for: ${JSON.stringify(h)}`);
    await rig.page.waitForTimeout(100);
  }
}

/** Heard by the browser's speech service only. Returns how many recognisers it reached (0: the fallback is not running) */
export const captions = (rig: Rig, text: string, kind: "fallback" | "ribbon" = "fallback") =>
  rig.page.evaluate(([t, k]) => (window as unknown as { __srEmit: (a: string, b: string) => number }).__srEmit(t, k), [text, kind] as const);

/** The thread the Collector sees in the chatbot's Jarvis tab (kept in this browser) */
export const thread = (rig: Rig) => rig.page.evaluate(() => {
  try { return (JSON.parse(localStorage.getItem("jarvis-log") ?? "[]") as { who: string; text: string }[]).map((m) => ({ who: m.who, text: m.text })); } catch { return []; }
});
export const answerCard = async (rig: Rig) => { const a = rig.page.locator('[data-testid="answer"] .hud-a'); return (await a.count()) ? (await a.first().innerText()).trim() : ""; };
export const coreState = (rig: Rig) => rig.page.locator('[data-testid="hud"]').getAttribute("data-core");

/** posts to these paths since the mark */
export const postsTo = (rig: Rig, re: RegExp, from = 0) => rig.posts.slice(from).filter((p) => re.test(p.path));

const OBS = path.join(AUDIT_DIR, "client_browser.observed.json");
/** What the browser showed, kept as evidence: template lines and counts only, never a draft's words */
export function observed(id: string, data: Record<string, unknown>) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  let all: Record<string, unknown> = {};
  try { all = JSON.parse(fs.readFileSync(OBS, "utf8")); } catch { /* the first */ }
  all[id] = data;
  fs.writeFileSync(OBS, JSON.stringify(all, null, 1));
}
export const shot = (page: Page, name: string) => page.screenshot({ path: path.join(AUDIT_DIR, `${name}.png`) });
