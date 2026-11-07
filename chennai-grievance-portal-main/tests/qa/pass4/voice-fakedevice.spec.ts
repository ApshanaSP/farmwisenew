// Fake capture device, three clips: SAPI English "Wait.", SAPI English sentence (b1), and a tone/silence pattern standing in for Tamil
// (no Tamil voice is installed: only Microsoft David and Zira, en-US). Records what the browser uploads to /hear; mocked /hear returns text.
// Run: npx playwright test -c tests/qa/pass4/pw.voice.config.ts --grep fakedevice  (VOICE_SPECS=voice-fakedevice)
import path from "path";
import fs from "fs";
import { chromium, expect, test } from "@playwright/test";
import { FX } from "../../e2e/helpers";
const A = path.join(process.cwd(), "tests", "qa", "pass4", "audio");
const clips: [string, string, string][] = [["english-wait", path.join(FX, "wait.wav"), "Wait."], ["english-sentence", path.join(FX, "b1.wav"), "No, show me Anna Nagar instead of that."], ["tamil-standin-tone", path.join(A, "tamil_standin_tone_pattern.wav"), ""], ["noise-burst", path.join(A, "noise_burst.wav"), ""]];
const results: unknown[] = [];
for (const [name, file, text] of clips) {
  test.describe(`fakedevice ${name}`, () => {
    test(`clip ${name}`, async () => {
      const args = ["--mute-audio", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${file}%noloop`];
      const br = await chromium.launch({ args }); const ctx = await br.newContext({ baseURL: "http://127.0.0.1:3186", permissions: ["microphone"] }); const page = await ctx.newPage();
      await page.addInitScript(() => { try { localStorage.setItem("jarvis-mode-seen", "1"); localStorage.setItem("thunai-greeted", new Date().toDateString()); } catch { /* */ } });
      const hits: number[] = []; let agent = 0; const errs: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
      await page.route("**/api/dev/thunai/hear**", async (r) => { hits.push(r.request().postDataBuffer()?.length ?? 0); await r.fulfill({ json: { text, lang: "en", noise: !text, ms: 1, lane: "ambient", conf: { speech: text ? 0.9 : 0, logprob: -0.2 }, model: "mock" } }); });
      await page.route("**/api/dev/thunai/agent**", async (r) => { agent++; await r.fulfill({ json: { kind: "chat", lang: "en", reply: "ok", steps: [], stage: null, stageOp: null, say: null, options: [], rounds: 1, calls: [], model: "mock", ms: 5, note: null } }); });
      await page.route("**/api/dev/thunai/say**", (r) => r.fulfill({ status: 204 }));
      await page.route("**/api/collector/**", (r) => r.fulfill({ status: 401, json: {} }));
      await page.route("**/api/i18n**", (r) => r.fulfill({ json: {} }));
      await page.goto("/dev/thunai");
      await page.waitForFunction(() => !!(window as unknown as { __jv?: unknown }).__jv, null, { timeout: 120_000 });
      await page.keyboard.press("Control+Shift+J");
      await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 60_000 });
      await page.waitForTimeout(9000);
      const hud = await page.evaluate(() => (window as unknown as { __jv: { hud(): unknown } }).__jv.hud());
      const r = { clip: name, uploads: hits.length, bytes: hits, agentCalls: agent, hud, consoleErrors: errs };
      results.push(r); fs.appendFileSync(path.join(process.cwd(), "docs/qa/pass4/evidence/voice-fakedevice.jsonl"), JSON.stringify(r) + "\n");
      await br.close();
      expect(errs.filter((e) => !/401/.test(e))).toEqual([]);
    });
  });
}
