import { expect, test } from "@playwright/test";
import { jv, modeOn, say, setup, durOf } from "./helpers";

test.describe("the detector", () => {
  test("loads Silero, hears a sentence, posts one 16 kHz WAV of about the right length", async ({ page }) => {
    const ctx = await setup(page);
    await modeOn(page);
    expect(await page.evaluate(() => (window as unknown as { __jv: { hud(): { strip: { detector: string } } } }).__jv.hud().strip.detector)).toBe("silero");
    ctx.hear.push({ text: "the file is on the table" });
    await say(page, "cmd_adyar");
    await page.waitForTimeout(durOf("cmd_adyar") + 1200);
    expect(ctx.hearCalls.length).toBe(1);
    // 16 kHz, 16-bit: 32 bytes a millisecond; a sentence of about 2.5 s, with pre-roll and end of utterance
    expect(ctx.hearCalls[0].bytes).toBeGreaterThan(40_000);
    expect(ctx.hearCalls[0].bytes).toBeLessThan(180_000);
  });

  test("near-silence is not speech", async ({ page }) => {
    const ctx = await setup(page);
    await modeOn(page);
    await page.waitForTimeout(3000);
    expect(ctx.hearCalls.length).toBe(0);
    expect(await jv(page, "state")).toBe("listening");
  });
});
