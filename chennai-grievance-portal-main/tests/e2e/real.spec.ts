import { expect, test } from "@playwright/test";
import { clearMarks, durOf, marks, modeOn, pct, saveResult, say } from "./helpers";
import { b64 } from "./helpers";

/**
 * The one real local run: Silero, Whisper, the planner and the voice all real, the audio injected. Spends about 20 Whisper requests
 * and two or three model calls. Reported apart from the mocked numbers.   REAL=1 PW_CHANNEL=msedge npx playwright test tests/e2e/real.spec.ts
 */
test.skip(!process.env.REAL, "spends real quota: run with REAL=1");
test.use({ channel: process.env.PW_CHANNEL || undefined });
void b64;

const init = () => {
  const W = window as unknown as Record<string, unknown>;
  try { localStorage.setItem("thunai-greeted", new Date().toDateString()); localStorage.setItem("jarvis-mode-seen", "1"); } catch { /* */ }
  const c = new AudioContext({ sampleRate: 48000 });
  let dest: MediaStreamAudioDestinationNode | null = null;
  W.__jarvisTestStream = async () => {
    await c.resume();
    dest = c.createMediaStreamDestination();
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.0008;
    const s = c.createBufferSource();
    s.buffer = n; s.loop = true; s.connect(dest); s.start();
    return dest.stream;
  };
  W.__jvPlay = async (data: string, speechMs: number) => {
    const buf = await c.decodeAudioData(Uint8Array.from(atob(data), (x) => x.charCodeAt(0)).buffer);
    const s = c.createBufferSource();
    s.buffer = buf; s.connect(dest!);
    const when = c.currentTime + 0.05;
    const known = performance.now() + (when - c.currentTime) * 1000 + speechMs;
    s.start(when);
    return known;
  };
};

test("real providers, end to end", async ({ page }) => {
  test.setTimeout(280_000);
  await page.addInitScript(init);
  await page.route("**/api/collector/**", (r) => r.fulfill({ status: 401, json: {} }));
  const heard: unknown[] = [];
  page.on("response", async (r) => { if (r.url().includes("/hear")) { const j = await r.json().catch(() => null); heard.push({ lane: new URL(r.url()).searchParams.get("lane"), status: r.status(), ...(j ?? {}) }); } });
  await page.goto("/dev/thunai");
  await page.waitForFunction(() => !!(window as unknown as { __jv?: unknown }).__jv, null, { timeout: 180_000 });
  await modeOn(page);
  await page.locator(".hud-first button").click().catch(() => undefined);
  const out: Record<string, unknown>[] = [];
  // the rules lane: a plain move, a screen; the planner lane: a sentence the rules leave to it
  for (const [clip, lane] of [["cmd_trends", "rules"], ["cmd_adyar", "rules"], ["b6", "rules"], ["b3", "rules"], ["open_ended", "planner"], ["open_ended2", "planner"]] as const) {
    await clearMarks(page);
    await page.waitForTimeout(600);
    await say(page, clip);
    await page.waitForTimeout(durOf(clip));
    await page.waitForFunction(() => { const J = (window as unknown as { __jv: { marks: { name: string }[] } }).__jv; return J.marks.some((m) => m.name === "answer" || m.name === "firstAudio"); }, null, { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    const m = await marks(page);
    const at = (n: string) => m.find((x) => x.name === n)?.t ?? NaN;
    const end = at("vadEnd") - 300;
    const hud = await page.evaluate(() => (window as unknown as { __jv: { hud(): { ribbon: string; strip: { provider: string | null; tokens: number | null; path: string | null } } } }).__jv.hud());
    out.push({ clip, lane, heard: hud.ribbon, ack: Math.round(at("ack") - end), answer: Math.round(at("answer") - end), firstAudio: Math.round(at("firstAudio") - end), provider: hud.strip.provider, tokens: hud.strip.tokens, path: hud.strip.path });
    console.log(JSON.stringify(out[out.length - 1]));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  const col = (lane: string, k: string) => out.filter((x) => x.lane === lane).map((x) => x[k] as number).filter((x) => Number.isFinite(x));
  const r = { runs: out, rules: { ack_p50: pct(col("rules", "ack"), 0.5), firstAudio_p50: pct(col("rules", "firstAudio"), 0.5), answer_p50: pct(col("rules", "answer"), 0.5) }, planner: { ack_p50: pct(col("planner", "ack"), 0.5), firstAudio_p50: pct(col("planner", "firstAudio"), 0.5), answer_p50: pct(col("planner", "answer"), 0.5) },
    note: "real Whisper, real planner, real voice ladder, injected audio, next dev server: a production server would be a little faster" };
  saveResult("latency-real", { ...r, heard });
  console.log(JSON.stringify(r.rules), JSON.stringify(r.planner));
  expect(out.length).toBe(6);
});
