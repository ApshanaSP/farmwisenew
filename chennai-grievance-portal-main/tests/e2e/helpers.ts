/**
 * What the specs share. The microphone is a WebAudio stream the test controls (window.__jarvisTestStream, dev only): a fixture
 * plays into it at a scheduled time, so its known speech start is a number in performance.now()'s clock, and barge-in is timed
 * from there, never from the detector's own event. Providers are mocked with page.route; Silero, the worklet, the turn machine
 * and the mouth are real.
 */
import fs from "fs";
import path from "path";
import type { Page, Route } from "@playwright/test";

export const FX = path.join(process.cwd(), "tests", "e2e", "fixtures");
const meta = JSON.parse(fs.readFileSync(path.join(FX, "fixtures.json"), "utf8")) as Record<string, { speechMs: number; durMs: number }>;
export const b64 = (name: string) => fs.readFileSync(path.join(FX, `${name}.wav`)).toString("base64");

export interface Heard { text: string; lang?: "en" | "ta"; delay?: number; budget?: "low" }
export interface Ctx {
  /** what the next /hear calls return, in order */
  hear: Heard[];
  hearCalls: { lane: string; bytes: number; at: number }[];
  /** how the agent answers a posted sentence */
  agent: (text: string) => { result: Record<string, unknown>; delay?: number };
  agentCalls: { text: string; aborted?: boolean }[];
  sayCalls: string[];
  /** the /say mock's delay */
  sayDelay: number;
}

export const chat = (reply: string, lang: "en" | "ta" = "en") => ({ kind: "chat", lang, reply, steps: [], stage: null, stageOp: null, say: null, options: [], rounds: 1, calls: [], model: "mock", ms: 5, note: null });
export const steps = (s: unknown[], reply: string | null = null) => ({ kind: "do", lang: "en", reply, steps: s, stage: null, stageOp: null, say: null, options: [], rounds: 1, calls: [], model: "mock", ms: 5, note: null });

const init = () => {
  const W = window as unknown as Record<string, unknown>;
  // the morning greeting would talk over the first test
  try { localStorage.setItem("thunai-greeted", new Date().toDateString()); } catch { /* opaque origin */ }
  const A = window.AudioContext;
  const c = new A({ sampleRate: 48000 });
  let dest: MediaStreamAudioDestinationNode | null = null;
  W.__jarvisTestStream = async () => {
    await c.resume();
    dest = c.createMediaStreamDestination();
    // a quiet room: a floor for the detector to learn, around -65 dB
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.0008;
    const src = c.createBufferSource();
    src.buffer = n; src.loop = true;
    src.connect(dest); src.start();
    return dest.stream;
  };
  W.__jvPlay = async (data: string, speechMs: number, gain = 1) => {
    const bin = Uint8Array.from(atob(data), (x) => x.charCodeAt(0));
    const buf = await c.decodeAudioData(bin.buffer);
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain(); g.gain.value = gain;
    s.connect(g).connect(dest!);
    const when = c.currentTime + 0.05;
    const known = performance.now() + ((when - c.currentTime) * 1000) + speechMs;
    s.start(when);
    return known;
  };
};

export async function setup(page: Page, o: Partial<Ctx> = {}): Promise<Ctx> {
  const ctx: Ctx = { hear: [], hearCalls: [], agent: () => ({ result: chat("Done.") }), agentCalls: [], sayCalls: [], sayDelay: 40, ...o };
  await page.addInitScript(init);
  await page.route("**/api/dev/thunai/hear**", async (r: Route) => {
    const u = new URL(r.request().url());
    ctx.hearCalls.push({ lane: u.searchParams.get("lane") ?? "", bytes: r.request().postDataBuffer()?.length ?? 0, at: Date.now() });
    const h = ctx.hear.shift() ?? { text: "" };
    if (h.delay) await new Promise((x) => setTimeout(x, h.delay));
    await r.fulfill({ json: { text: h.text, lang: h.lang ?? "en", noise: !h.text, ms: 5, lane: u.searchParams.get("lane"), conf: { speech: 1, logprob: -0.2 }, model: "mock", budget: h.budget } }).catch(() => undefined);
  });
  await page.route("**/api/dev/thunai/agent", async (r: Route) => {
    const body = r.request().postDataJSON() as { text: string };
    const rec: { text: string; aborted?: boolean } = { text: body.text };
    ctx.agentCalls.push(rec);
    const a = ctx.agent(body.text);
    if (a.delay) await new Promise((x) => setTimeout(x, a.delay));
    await r.fulfill({ json: { result: a.result } }).catch(() => { rec.aborted = true; });
  });
  await page.route("**/api/dev/thunai/agent/round", async (r: Route) => {
    const body = r.request().postDataJSON() as { text: string };
    const rec: { text: string; aborted?: boolean } = { text: body.text };
    ctx.agentCalls.push(rec);
    const a = ctx.agent(body.text);
    if (a.delay) await new Promise((x) => setTimeout(x, a.delay));
    await r.fulfill({ json: { result: a.result, done: true } }).catch(() => { rec.aborted = true; });
  });
  await page.route("**/api/jarvis/say", async (r: Route) => {
    ctx.sayCalls.push(String((r.request().postDataJSON() as { text: string }).text));
    if (ctx.sayDelay) await new Promise((x) => setTimeout(x, ctx.sayDelay));
    await r.fulfill({ body: fs.readFileSync(path.join(FX, "answer.wav")), contentType: "audio/wav" }).catch(() => undefined);
  });
  await page.route("**/api/collector/**", (r: Route) => r.fulfill({ status: 401, json: {} }));
  await page.route("**/api/i18n**", (r: Route) => r.fulfill({ json: {} }));
  await page.goto("/dev/thunai");
  await page.waitForFunction(() => !!(window as unknown as { __jv?: unknown }).__jv, null, { timeout: 180_000 });
  return ctx;
}

/** Jarvis mode on, by the keyboard; waits for the microphone and the model, and gives the detector a second to learn the room. */
export async function modeOn(page: Page) {
  await page.keyboard.press("Control+Shift+J");
  await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean; state(): string } }).__jv.state() !== "off", null, { timeout: 60_000 });
  await page.waitForTimeout(1600);
}

/** Play a fixture into the microphone. Returns when its speech starts, in performance.now()'s clock. */
export async function say(page: Page, name: string, gain = 1): Promise<number> {
  return page.evaluate(([d, s, g]) => (window as unknown as { __jvPlay: (a: string, b: number, c: number) => Promise<number> }).__jvPlay(d as string, s as number, g as number), [b64(name), meta[name].speechMs, gain] as const);
}
export const durOf = (name: string) => meta[name].durMs;

export const jv = <T>(page: Page, fn: string) => page.evaluate((f) => { const J = (window as unknown as { __jv: Record<string, () => unknown> }).__jv; return J[f](); }, fn) as Promise<T>;
export const marks = (page: Page) => page.evaluate(() => (window as unknown as { __jv: { marks: { name: string; t: number }[] } }).__jv.marks);
export const clearMarks = (page: Page) => page.evaluate(() => { (window as unknown as { __jv: { marks: unknown[] } }).__jv.marks.length = 0; });
export const until = (page: Page, state: string, ms = 15_000) => page.waitForFunction((s) => (window as unknown as { __jv: { state(): string } }).__jv.state() === s, state, { timeout: ms });
export const speakingNow = (page: Page) => jv<boolean>(page, "speaking");

export function pct(xs: number[], p: number) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; }
export function saveResult(name: string, data: unknown) {
  const dir = path.join(process.cwd(), "eval", "holdout", "results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 1));
}
