import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { noHotReload, saveResult } from "./helpers";

/**
 * The HUD on the real console shell (/dev/collector: the dry-run store, this PC only), in Edge when it is there. Screens go to
 * docs/jarvis/screens, each size and language in the console's light and dark themes. Typed requests go through the same path as
 * speech; these use only the rules lane, so no model is spent.
 *   PW_CHANNEL=msedge npx playwright test tests/e2e/hud.spec.ts -g screens
 */
const OUT = path.join(process.cwd(), "..", "docs", "jarvis", "screens");
test.use({ channel: process.env.PW_CHANNEL || undefined, launchOptions: { args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

type Theme = "light" | "dark";
async function open(page: Page, lang: "en" | "ta", size: { width: number; height: number }, theme: Theme = "light") {
  await page.setViewportSize(size);
  await noHotReload(page);
  await page.addInitScript(([l, th]) => {
    // the console's own theme switch (CollectorApp.tsx toggleTheme) keeps its choice in diq-theme, and layout.tsx applies it before
    // the first paint: the same as the Collector having pressed "Dark mode". The HUD follows it (hud.css html[data-theme="dark"]).
    // The power-on brief (v4) is said once a session: it is marked as said, so every shot shows the state it is named for.
    try { localStorage.setItem("thunai-greeted", new Date().toDateString()); localStorage.setItem("diq-lang", l); localStorage.setItem("district-lang", l); localStorage.setItem("lang", l); localStorage.setItem("diq-theme", th); sessionStorage.setItem("jarvis-briefed", "1"); if (!sessionStorage.getItem("notice-once")) { sessionStorage.setItem("notice-once", "1"); localStorage.removeItem("jarvis-mode-seen"); } } catch { /* */ }
    const c = new AudioContext();
    (window as unknown as Record<string, unknown>).__jarvisTestStream = async () => { const d = c.createMediaStreamDestination(); const o = c.createConstantSource(); o.offset.value = 0.0005; o.connect(d); o.start(); return d.stream; };
  }, [lang, theme] as const);
  // the first compile of this page can outlast the browser's chunk timeout in dev: it is simply asked for again
  for (let tries = 0; tries < 4; tries++) {
    await page.goto("/dev/collector", { timeout: 180_000 });
    const up = await page.waitForFunction(() => !!(window as unknown as { __jv?: unknown }).__jv, null, { timeout: 60_000 }).then(() => true).catch(() => false);
    if (!up) continue;
    // the map's tiles, so each shot shows the console as it is used (best effort: a slow tile server only delays the shots)
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length >= 4, null, { timeout: 45_000 }).catch(() => undefined);
    return;
  }
  throw new Error("the console did not start");
}
/**
 * The ears are listening: the conductor has left "off". The tracks are live (micLive) as soon as the stream exists, but on the console
 * in a fresh Edge profile the voice model (onnxruntime-web and Silero) takes about 9 s more to load, and the bar truthfully says
 * "Opening the microphone" until then: a shot taken at micLive showed that, not Listening.
 */
const listening = (page: Page) => page.waitForFunction(() => { const J = (window as unknown as { __jv: { micLive(): boolean; state(): string } }).__jv; return J.micLive() && J.state() !== "off"; }, null, { timeout: 90_000 });
async function jarvisOn(page: Page) {
  await page.keyboard.press("Control+Shift+J");
  // the first-use notice: the microphone opens after it is read
  await page.waitForTimeout(500);
  if (await page.locator(".hud-first button").count()) await page.locator(".hud-first button").click();
  await listening(page);
}
async function typed(page: Page, text: string) {
  // the bar's Type button by what it is (the one with aria-expanded), not its words: in Tamil it reads தட்டச்சு
  if (!(await page.locator(".hud-compose input").count())) await page.locator(".hud-acts .hud-btn[aria-expanded]").click();
  await page.locator(".hud-compose input").fill(text);
  await page.keyboard.press("Enter");
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const SIZES = [["en", "1366", { width: 1366, height: 768 }], ["en", "1920", { width: 1920, height: 1080 }], ["ta", "1366", { width: 1366, height: 768 }], ["ta", "1920", { width: 1920, height: 1080 }]] as const;
// each size and language in the light theme (the console's default) and again in its dark theme: files <size>-<lang>-<theme>-<n>-<state>.png
for (const theme of ["light", "dark"] as const) for (const [lang, sizeName, size] of SIZES) {
  test(`screens ${lang} ${sizeName} ${theme}`, async ({ page }) => {
    test.setTimeout(480_000);
    const name = (n: string) => `${sizeName}-${lang}-${theme}-${n}`;
    await open(page, lang, size, theme);
    if (lang === "ta") { const t = page.getByRole("button", { name: "தமிழ்" }).first(); if (await t.count()) await t.click().catch(() => undefined); await page.waitForTimeout(800); }
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
    await shot(page, name("0-mode-off"));
    await page.keyboard.press("Control+Shift+J");
    await page.waitForTimeout(450);
    await shot(page, name("1-first-use"));
    await page.locator(".hud-first button").click();
    await listening(page);
    await page.waitForTimeout(1400);
    await shot(page, name("2-listening"));
    // the no-screen states: the core at full size, the ribbon, a faint line, the budget note
    await page.evaluate((ta) => { const J = (window as unknown as { __jv: { setCore(x: string): void; setHud(x: unknown): void } }).__jv; J.setHud({ ribbon: ta ? "அடையாறு மற்றும் அண்ணா நகர் ஒப்பிடு" : "Compare Adyar with Anna Nagar this week" }); J.setCore("thinking"); }, lang === "ta");
    await page.waitForTimeout(600);
    await shot(page, name("2b-thinking-big"));
    await page.evaluate(() => (window as unknown as { __jv: { setCore(x: string): void } }).__jv.setCore("speaking"));
    await page.waitForTimeout(500);
    await shot(page, name("2c-speaking-big"));
    await page.evaluate((ta) => { const J = (window as unknown as { __jv: { setCore(x: string): void; setHud(x: unknown): void } }).__jv; J.setHud({ ribbon: "", faint: ta ? "நேத்து மழை ரொம்ப அதிகம்" : "did you see the rain yesterday" }); J.setCore("listening"); }, lang === "ta");
    await page.waitForTimeout(250);
    await shot(page, name("2d-faint"));
    await page.evaluate(() => (window as unknown as { __jv: { setHud(x: unknown): void } }).__jv.setHud({ faint: "" }));
    await typed(page, lang === "ta" ? "கடுமையான சம்பவங்களைக் காட்டு" : "Show the severe cases");
    await page.waitForFunction(() => document.querySelector(".st-root") || document.querySelector(".hud-answer"), null, { timeout: 60_000 });
    await page.waitForTimeout(1600);
    await shot(page, name("3-screen"));
    await page.keyboard.press("Escape");
    // the screen closed: the answer stays as a panel, the timeline beside it
    await page.locator(".st-root .st-head button").last().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector(".st-root"), null, { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    await shot(page, name("4-panels"));
    // the reticle has a place (its position on screen depends on the map being loaded)
    expect(await page.evaluate(() => (window as unknown as { __jv: { hud(): { focus: { lat: number | null } | null } } }).__jv.hud().focus?.lat ?? null)).not.toBeNull();
    for (const core of ["thinking", "speaking", "holding", "offline"]) {
      await page.evaluate((c) => (window as unknown as { __jv: { setCore(x: string): void } }).__jv.setCore(c), core);
      await page.waitForTimeout(500);
      if (sizeName === "1366") await shot(page, name(`5-core-${core}`));
    }
  });
}

/** Counts the core's own frames: drawCore (hudcore.ts) clears its canvas once a frame, and the core's loop draws only as often as its state needs. */
const countCore = () => {
  const W = window as unknown as { __coreDraws: number };
  W.__coreDraws = 0;
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, ...a: [number, number, number, number]) {
    if (this.canvas?.classList?.contains("hud-canvas")) W.__coreDraws++;
    return clear.apply(this, a);
  };
};
/** 20 s on the page: the page's own frame rate (a requestAnimationFrame count) and how many frames the core drew in that time. */
const measure = (p: Page) => p.evaluate(() => new Promise<{ pageFps: number; worstGapMs: number; coreFps: number }>((res) => {
  const W = window as unknown as { __coreDraws: number };
  const times: number[] = [];
  const t0 = performance.now(), d0 = W.__coreDraws;
  const f = (t: number) => { times.push(t); if (t - t0 < 20_000) requestAnimationFrame(f); else {
    const gaps = times.slice(1).map((x, i) => x - times[i]);
    res({ pageFps: Math.round((times.length / 20) * 10) / 10, worstGapMs: Math.round(Math.max(...gaps)), coreFps: Math.round(((W.__coreDraws - d0) / 20) * 10) / 10 });
  } };
  requestAnimationFrame(f);
}));

test("fps over 20 s: listening (idle), speaking, and reduced motion", async ({ page, browser }) => {
  // two console pages and three 20 s counts; a cold dev compile of /dev/collector alone can take minutes on a loaded PC (it timed
  // out at 180 s): the same budget as the screens
  test.setTimeout(480_000);
  await page.addInitScript(countCore);
  await open(page, "en", { width: 1366, height: 768 });
  await jarvisOn(page);
  await page.waitForTimeout(1600);
  // Jarvis on in a quiet room, nothing asked: the HUD's idle (the core listens)
  const listening = await measure(page);
  // the core's speaking loop, on the console, with the state forced: what is drawn is what speaking draws
  await page.evaluate(() => (window as unknown as { __jv: { setCore(x: string): void } }).__jv.setCore("speaking"));
  const speaking = await measure(page);
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1366, height: 768 }, permissions: ["microphone"] });
  const p2 = await ctx.newPage();
  await p2.addInitScript(countCore);
  await open(p2, "en", { width: 1366, height: 768 });
  await jarvisOn(p2);
  await p2.waitForTimeout(800);
  const reduced = await measure(p2);
  await ctx.close();
  const r = { listening, speaking, reducedMotion: reduced, browser: browser.browserType().name(), channel: process.env.PW_CHANNEL ?? "chromium", version: browser.version(),
    note: "headless, software rendering unless the channel says otherwise; 20 s each with the HUD on the console (/dev/collector). pageFps: a requestAnimationFrame count (the page's frame rate, not the HUD's); coreFps: frames the core's canvas drew (hudcore.ts drawCore, counted by its clearRect)" };
  saveResult("hud-fps", r);
  console.log(JSON.stringify(r));
  expect(speaking.coreFps).toBeGreaterThan(0);
});
