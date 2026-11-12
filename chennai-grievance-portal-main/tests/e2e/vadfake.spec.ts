import path from "path";
import { expect, test } from "@playwright/test";
import { FX } from "./helpers";

// through the fake capture device: the real getUserMedia path, a fixture on disk instead of the injected stream
test.use({ launchOptions: { args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${path.join(FX, "b1.wav")}%noloop`] } });

test("a sentence from the capture device reaches the transcriber", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("jarvis-mode-seen", "1"); localStorage.setItem("thunai-greeted", new Date().toDateString()); } catch { /* */ } });
  const hits: number[] = [];
  await page.route("**/api/dev/thunai/hear**", async (r) => { hits.push(r.request().postDataBuffer()?.length ?? 0); await r.fulfill({ json: { text: "", lang: "en", noise: true, ms: 1, lane: "ambient", conf: { speech: 0, logprob: 0 }, model: null } }); });
  await page.route("**/api/collector/**", (r) => r.fulfill({ status: 401, json: {} }));
  await page.route("**/api/i18n**", (r) => r.fulfill({ json: {} }));
  await page.goto("/dev/thunai");
  await page.waitForFunction(() => !!(window as unknown as { __jv?: unknown }).__jv, null, { timeout: 180_000 });
  await page.keyboard.press("Control+Shift+J");
  await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 60_000 });
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(hits[0]).toBeGreaterThan(20_000);
});
