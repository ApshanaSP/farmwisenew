import fs from "fs";
import path from "path";
import { expect, test, type Page } from "@playwright/test";

/**
 * v6, Phase 6 and the DEMO reel: one headless run of the real path (real Whisper and planner ladder with Claude off, Edge's own voices,
 * synthetic clips played into the page's microphone), filmed, with screenshots at the same moments on the v5 bundle ("before") and the v6
 * one ("after"), so the owner sees that the look is the same and only timing and motion moved:
 *   1. Jarvis open and listening; 2. "Hey Jarvis" (the wake reply); 3. "Show the severe cases." (the screen); 4. a place's state (the
 *   briefing being spoken); 5. a Tamil question; 6. a barge-in ("Wait.") over Jarvis's voice; 7-8. the news list, then "Read the first
 *   article." (the news deep read: the brief spoken, the sources as links on the Stage; v5 has no such turn).
 * Start the server for the bundle (scripts/jarvis6/serve-real.sh), then:
 *   REAL=1 SPEC_PROD=1 V6_SHOT=after npx playwright test tests/e2e/reel6.spec.ts
 * Out: docs/jarvis/screens/v6/<before|after>-<n>-<moment>.png and, for "after", docs/jarvis/screens/v6/reel.webm.
 */
test.skip(!process.env.REAL, "spends real quota (a few Whisper requests): run with REAL=1");

const FX = path.join(process.cwd(), "tests", "e2e", "fixtures");
const META = JSON.parse(fs.readFileSync(path.join(FX, "v6", "v6.json"), "utf8")) as Record<string, { endMs: number; durMs: number }>;
const OLD = JSON.parse(fs.readFileSync(path.join(FX, "fixtures.json"), "utf8")) as Record<string, { speechMs: number; durMs: number }>;
const SHOT = process.env.V6_SHOT || "after";
const OUT = path.resolve(process.cwd(), "..", "docs", "jarvis", "screens", "v6");
const KEEP_VOICES = ["--disable-background-networking", "--disable-component-update", "--disable-component-extensions-with-background-pages", "--disable-default-apps", "--disable-extensions"];
test.use({
  channel: process.env.PW_CHANNEL || "msedge",
  viewport: { width: 1280, height: 760 },
  video: SHOT === "after" ? { mode: "on", size: { width: 1280, height: 760 } } : "off",
  launchOptions: { ignoreDefaultArgs: KEEP_VOICES, args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }
});

const init = () => {
  const W = window as unknown as Record<string, unknown>;
  try { localStorage.setItem("thunai-greeted", new Date().toDateString()); localStorage.setItem("jarvis-mode-seen", "1"); sessionStorage.setItem("jarvis-briefed", "1"); } catch { /* */ }
  const c = new AudioContext({ sampleRate: 48000 });
  let dest: MediaStreamAudioDestinationNode | null = null;
  const ensure = () => {
    if (dest) return dest;
    dest = c.createMediaStreamDestination();
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.0008;
    const s = c.createBufferSource(); s.buffer = n; s.loop = true; s.connect(dest); s.start();
    return dest;
  };
  W.__jarvisTestStream = async () => { await c.resume(); return ensure().stream; };
  W.__jvPlay = async (data: string) => {
    await c.resume();
    const buf = await c.decodeAudioData(Uint8Array.from(atob(data), (x) => x.charCodeAt(0)).buffer);
    const s = c.createBufferSource(); s.buffer = buf; s.connect(ensure()); s.start(c.currentTime + 0.05);
  };
};
const play = (page: Page, file: string) => page.evaluate((d) => (window as unknown as { __jvPlay: (a: string) => Promise<void> }).__jvPlay(d), fs.readFileSync(file).toString("base64"));
const v6 = (n: string) => path.join(FX, "v6", `${n}.wav`);
const speaking = (page: Page) => page.evaluate(() => (window as unknown as { __jv: { speaking(): boolean } }).__jv.speaking());
async function shot(page: Page, n: number, moment: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${SHOT}-${n}-${moment}.png`) });
}
async function untilSpeaking(page: Page, ms: number) {
  for (let t = 0; t < ms; t += 100) { if (await speaking(page)) return true; await page.waitForTimeout(100); }
  return false;
}

test("v6 reel", async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.addInitScript(init);
  await page.route("**/api/collector/**", (r) => r.fulfill({ status: 401, json: {} }));
  await page.goto("/dev/thunai");
  await page.waitForFunction(() => !!(window as unknown as { __jv?: unknown }).__jv, null, { timeout: 180_000 });
  await page.keyboard.press("Control+Shift+J");
  await page.waitForFunction(() => (window as unknown as { __jv: { state(): string } }).__jv.state() !== "off", null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  await shot(page, 1, "open-listening");
  // 2. "Hey Jarvis": the wake reply (v6) or the tone after Whisper (v5)
  await play(page, v6("wake_zira"));
  await page.waitForTimeout(META.wake_zira.endMs + 350);
  await shot(page, 2, "wake");
  await page.waitForTimeout(1500);
  // 3. a command: the screen changes
  await play(page, v6("cmd_severe"));
  await page.waitForTimeout(META.cmd_severe.endMs + 1500);
  await shot(page, 3, "command");
  await page.waitForTimeout(6000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  // 4. a place's state: the briefing, caught while it is spoken
  await play(page, v6("wake_mark"));
  await page.waitForTimeout(META.wake_mark.endMs + 1200);
  await play(page, v6("q_en_royapuram"));
  await page.waitForTimeout(META.q_en_royapuram.endMs);
  if (await untilSpeaking(page, 12_000)) await page.waitForTimeout(1500);
  await shot(page, 4, "briefing-speaking");
  // 6. a barge-in over the voice ("Wait.")
  if (await speaking(page)) {
    await play(page, path.join(FX, "wait.wav"));
    await page.waitForTimeout(OLD.wait.speechMs + 900);
    await shot(page, 6, "barge-in");
  }
  await page.waitForTimeout(6000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  // 5. a Tamil question
  await play(page, v6("wake_g_puck"));
  await page.waitForTimeout(META.wake_g_puck.endMs + 1200);
  await play(page, v6("q_ta_teynampet"));
  await page.waitForTimeout(META.q_ta_teynampet.endMs);
  if (await untilSpeaking(page, 12_000)) await page.waitForTimeout(1500);
  await shot(page, 5, "tamil-speaking");
  await page.waitForTimeout(8000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  // 7. a news deep read with sources (v6 Phase 4): the news list typed on screen, then "Read the first article." said
  const ask = (t: string) => page.evaluate((x) => (window as unknown as { __jv: { ask?(t: string): void } }).__jv.ask?.(x), t);
  await ask("show me the latest news");
  for (let t = 0; t < 40; t++) { await page.waitForTimeout(250); if (await page.locator(".st-news li").count()) break; }
  await page.waitForTimeout(1500);
  await shot(page, 7, "news-list");
  await ask("stop");
  await page.waitForTimeout(1200);
  await play(page, v6("wake_zira"));
  await page.waitForTimeout(META.wake_zira.endMs + 1200);
  await play(page, v6("news_read1"));
  await page.waitForTimeout(META.news_read1.endMs);
  if (await untilSpeaking(page, 12_000)) await page.waitForTimeout(4000);
  await shot(page, 8, "news-read-sources");
  await page.waitForTimeout(12_000);
  await page.close();
  const v = page.video();
  if (v) { fs.mkdirSync(OUT, { recursive: true }); await v.saveAs(path.join(OUT, "reel.webm")); }
  expect(fs.existsSync(path.join(OUT, `${SHOT}-1-open-listening.png`))).toBe(true);
  void info;
});
