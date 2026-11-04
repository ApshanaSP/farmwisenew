import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { saveResult } from "./helpers";

/**
 * The HUD on the real console shell (/dev/collector: the dry-run store, this PC only), in Edge when it is there. Screens go to
 * docs/jarvis/screens. Typed requests go through the same path as speech; these use only the rules lane, so no model is spent.
 *   SCREENS=1 npx playwright test tests/e2e/hud.spec.ts --project=...
 */
const OUT = path.join(process.cwd(), "..", "docs", "jarvis", "screens");
test.use({ channel: process.env.PW_CHANNEL || undefined, launchOptions: { args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

async function open(page: Page, lang: "en" | "ta", size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.addInitScript((l) => {
    try { localStorage.setItem("thunai-greeted", new Date().toDateString()); localStorage.setItem("diq-lang", l); localStorage.setItem("district-lang", l); localStorage.setItem("lang", l); if (!sessionStorage.getItem("notice-once")) { sessionStorage.setItem("notice-once", "1"); localStorage.removeItem("jarvis-mode-seen"); } } catch { /* */ }
    const c = new AudioContext();
    (window as unknown as Record<string, unknown>).__jarvisTestStream = async () => { const d = c.createMediaStreamDestination(); const o = c.createConstantSource(); o.offset.value = 0.0005; o.connect(d); o.start(); return d.stream; };
  }, lang);
  // the first compile of this page can outlast the browser's chunk timeout in dev: it is simply asked for again
  for (let tries = 0; tries < 4; tries++) {
    await page.goto("/dev/collector", { timeout: 180_000 });
    const up = await page.waitForFunction(() => !!(window as unknown as { __jv?: unknown }).__jv, null, { timeout: 60_000 }).then(() => true).catch(() => false);
    if (up) return;
  }
  throw new Error("the console did not start");
}
async function jarvisOn(page: Page) {
  await page.keyboard.press("Control+Shift+J");
  // the first-use notice: the microphone opens after it is read
  await page.waitForTimeout(500);
  if (await page.locator(".hud-first button").count()) await page.locator(".hud-first button").click();
  await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 60_000 });
}
async function typed(page: Page, text: string) {
  if (!(await page.locator(".hud-compose input").count())) await page.locator(".hud-btn", { hasText: "Type" }).click();
  await page.locator(".hud-compose input").fill(text);
  await page.keyboard.press("Enter");
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

for (const [lang, sizeName, size] of [["en", "1366", { width: 1366, height: 768 }], ["en", "1920", { width: 1920, height: 1080 }], ["ta", "1366", { width: 1366, height: 768 }], ["ta", "1920", { width: 1920, height: 1080 }]] as const) {
  test(`screens ${lang} ${sizeName}`, async ({ page }) => {
    test.setTimeout(480_000);
    await open(page, lang, size);
    if (lang === "ta") { const t = page.getByRole("button", { name: "தமிழ்" }).first(); if (await t.count()) await t.click().catch(() => undefined); await page.waitForTimeout(800); }
    await shot(page, `${sizeName}-${lang}-0-mode-off`);
    await page.keyboard.press("Control+Shift+J");
    await page.waitForTimeout(450);
    await shot(page, `${sizeName}-${lang}-1-first-use`);
    await page.locator(".hud-first button").click();
    await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 60_000 });
    await page.waitForTimeout(1400);
    await shot(page, `${sizeName}-${lang}-2-listening`);
    // the no-screen states: the core at full size, the ribbon, a faint line, the budget note
    await page.evaluate((ta) => { const J = (window as unknown as { __jv: { setCore(x: string): void; setHud(x: unknown): void } }).__jv; J.setHud({ ribbon: ta ? "அடையாறு மற்றும் அண்ணா நகர் ஒப்பிடு" : "Compare Adyar with Anna Nagar this week" }); J.setCore("thinking"); }, lang === "ta");
    await page.waitForTimeout(600);
    await shot(page, `${sizeName}-${lang}-2b-thinking-big`);
    await page.evaluate(() => (window as unknown as { __jv: { setCore(x: string): void } }).__jv.setCore("speaking"));
    await page.waitForTimeout(500);
    await shot(page, `${sizeName}-${lang}-2c-speaking-big`);
    await page.evaluate((ta) => { const J = (window as unknown as { __jv: { setCore(x: string): void; setHud(x: unknown): void } }).__jv; J.setHud({ ribbon: "", faint: ta ? "நேத்து மழை ரொம்ப அதிகம்" : "did you see the rain yesterday" }); J.setCore("listening"); }, lang === "ta");
    await page.waitForTimeout(250);
    await shot(page, `${sizeName}-${lang}-2d-faint`);
    await page.evaluate(() => (window as unknown as { __jv: { setHud(x: unknown): void } }).__jv.setHud({ faint: "" }));
    await typed(page, lang === "ta" ? "கடுமையான சம்பவங்களைக் காட்டு" : "Show the severe cases");
    await page.waitForFunction(() => document.querySelector(".st-root") || document.querySelector(".hud-answer"), null, { timeout: 60_000 });
    await page.waitForTimeout(1600);
    await shot(page, `${sizeName}-${lang}-3-screen`);
    await page.keyboard.press("Escape");
    // the screen closed: the answer stays as a panel, the timeline beside it
    await page.locator(".st-root .st-head button").last().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector(".st-root"), null, { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    await shot(page, `${sizeName}-${lang}-4-panels`);
    // the reticle has a place (its position on screen depends on the map being loaded)
    expect(await page.evaluate(() => (window as unknown as { __jv: { hud(): { focus: { lat: number | null } | null } } }).__jv.hud().focus?.lat ?? null)).not.toBeNull();
    for (const core of ["thinking", "speaking", "holding", "offline"]) {
      await page.evaluate((c) => (window as unknown as { __jv: { setCore(x: string): void } }).__jv.setCore(c), core);
      await page.waitForTimeout(500);
      if (sizeName === "1366") await shot(page, `${sizeName}-${lang}-5-core-${core}`);
    }
  });
}

test("fps over 20 s, speaking and reduced motion", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await open(page, "en", { width: 1366, height: 768 });
  await jarvisOn(page);
  await page.waitForTimeout(1600);
  const measure = () => page.evaluate(() => new Promise<{ fps: number; worst: number; frames: number }>((res) => {
    const times: number[] = [];
    const t0 = performance.now();
    const f = (t: number) => { times.push(t); if (t - t0 < 20_000) requestAnimationFrame(f); else {
      const gaps = times.slice(1).map((x, i) => x - times[i]);
      res({ fps: Math.round((times.length / 20) * 10) / 10, worst: Math.round(Math.max(...gaps)), frames: times.length });
    } };
    requestAnimationFrame(f);
  }));
  // the core's speaking loop, on the console, with the state forced: what is drawn is what speaking draws
  await page.evaluate(() => (window as unknown as { __jv: { setCore(x: string): void } }).__jv.setCore("speaking"));
  const speaking = await measure();
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1366, height: 768 }, permissions: ["microphone"] });
  const p2 = await ctx.newPage();
  await open(p2, "en", { width: 1366, height: 768 });
  await jarvisOn(p2);
  await p2.waitForTimeout(800);
  const reduced = await p2.evaluate(() => new Promise<number>((res) => { let n = 0; const t0 = performance.now(); const f = (t: number) => { n++; if (t - t0 < 20_000) requestAnimationFrame(f); else res(Math.round((n / 20) * 10) / 10); }; requestAnimationFrame(f); }));
  await ctx.close();
  const r = { speaking, reducedMotionFps: reduced, browser: browser.browserType().name(), channel: process.env.PW_CHANNEL ?? "chromium", note: "headless, software rendering unless the channel says otherwise; a 20 s requestAnimationFrame count with the HUD on the console" };
  saveResult("hud-fps", r);
  console.log(JSON.stringify(r));
  expect(speaking.frames).toBeGreaterThan(0);
});
