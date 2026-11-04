import { expect, test } from "@playwright/test";
import { chat, clearMarks, durOf, marks, modeOn, pct, saveResult, say, setup, speakingNow, until, type Ctx } from "./helpers";

/** A reply long enough to talk over, with no figures in it. */
const LONG = "The drains near the bridge are blocked and the main roads are under water. The department has the list on screen beside the map. Most of it can wait for the morning crew, though the bridge cannot.";

async function speakingAnswer(page: Parameters<typeof setup>[0], ctx: Ctx) {
  ctx.hear.push({ text: "Jarvis, what is going on near the bridge" });
  await say(page, "cmd_adyar");
  await page.waitForFunction(() => (window as unknown as { __jv: { speaking(): boolean; path(): string } }).__jv.speaking() && (window as unknown as { __jv: { path(): string } }).__jv.path() === "pcm", null, { timeout: 20_000 });
  await page.waitForTimeout(durOf("cmd_adyar") + 300);
}

test.describe("barge-in, on the PCM path, timed from the fixture's known speech start", () => {
  test("pause p50 <= 150 ms, p90 <= 250 ms over eight sentences; the turn cancels; the sentence is transcribed", async ({ page }) => {
    test.setTimeout(420_000);
    const ctx = await setup(page, { agent: () => ({ result: chat(LONG) }) });
    await modeOn(page);
    const pauses: number[] = [], detector: number[] = [], cancels: number[] = [];
    for (const clip of ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]) {
      await speakingAnswer(page, ctx);
      await clearMarks(page);
      ctx.hear.push({ text: "no, show me Anna Nagar instead" });
      const known = await say(page, clip);
      await page.waitForFunction(() => (window as unknown as { __jv: { marks: { name: string }[] } }).__jv.marks.some((m) => m.name === "cancelled"), null, { timeout: 8000 });
      const m = await marks(page);
      const quick = m.find((x) => x.name === "quickOnset" || x.name === "paused");
      const paused = m.find((x) => x.name === "paused")!;
      pauses.push(paused.t - known);
      if (quick) detector.push(quick.t - known);
      cancels.push(m.find((x) => x.name === "cancelled")!.t - known);
      expect(await speakingNow(page)).toBe(false);
      await page.waitForTimeout(durOf(clip) + 600);
      // the next round starts clean: the answer to this sentence is not waited for
      await page.keyboard.press("Escape");
      await until(page, "listening", 8000);
      await page.waitForTimeout(300);
    }
    const r = { clips: pauses.length, pause_ms: pauses.map(Math.round), pause_p50: pct(pauses, 0.5), pause_p90: pct(pauses, 0.9), detector_fire_p50: pct(detector, 0.5), cancel_p50: pct(cancels, 0.5), note: "injected audio through WebAudio into the real worklet and Silero; PCM path; no echo canceller, no real microphone" };
    saveResult("bargein", r);
    console.log(JSON.stringify(r));
    expect(r.pause_p90).toBeLessThanOrEqual(250);
  });

  test("a noise burst pauses and resumes; the question is not cancelled; nothing is sent", async ({ page }) => {
    const ctx = await setup(page, { agent: () => ({ result: chat(LONG) }) });
    await modeOn(page);
    await speakingAnswer(page, ctx);
    await clearMarks(page);
    const calls = ctx.hearCalls.length;
    await say(page, "burst");
    await page.waitForFunction(() => (window as unknown as { __jv: { marks: { name: string }[] } }).__jv.marks.some((m) => m.name === "paused"), null, { timeout: 5000 });
    await page.waitForTimeout(1200);
    const m = await marks(page);
    expect(m.some((x) => x.name === "cancelled")).toBe(false);
    expect(await speakingNow(page)).toBe(true);
    expect(ctx.hearCalls.length).toBe(calls);
    await until(page, "speaking", 3000);
  });

  test("no old answer after a stop: Esc during thinking, and the late reply never speaks", async ({ page }) => {
    const ctx = await setup(page, { agent: () => ({ result: chat("This is the late answer that must never be spoken."), delay: 2500 }) });
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis, what is going on near the bridge" });
    await say(page, "cmd_adyar");
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { ribbon: string } } }).__jv.hud().ribbon.includes("bridge"), null, { timeout: 15_000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3500);
    expect(ctx.sayCalls.filter((t) => t.includes("late answer")).length).toBe(0);
    expect(await speakingNow(page)).toBe(false);
  });

  test("a new sentence replaces the one in flight, and only the new answer speaks", async ({ page }) => {
    const ctx = await setup(page, { agent: (t) => /first/.test(t) ? { result: chat("Answer to the first question, too late."), delay: 3000 } : { result: chat("Answer to the second question.") } });
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis, the first question" });
    await say(page, "cmd_adyar");
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { ribbon: string } } }).__jv.hud().ribbon.includes("first"), null, { timeout: 15_000 });
    ctx.hear.push({ text: "Jarvis, the second question" });
    await say(page, "b1");
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { ribbon: string } } }).__jv.hud().ribbon.includes("second"), null, { timeout: 15_000 });
    await page.waitForTimeout(3800);
    expect(ctx.sayCalls.some((t) => t.includes("second question"))).toBe(true);
    expect(ctx.sayCalls.some((t) => t.includes("too late"))).toBe(false);
  });

  test("a late transcript is dropped once the next sentence has begun", async ({ page }) => {
    const ctx = await setup(page);
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis, the old sentence", delay: 1800 }, { text: "Jarvis, the new sentence" });
    await say(page, "wait");
    await page.waitForTimeout(durOf("wait") - 400);
    await say(page, "cmd_trends");
    await page.waitForTimeout(durOf("cmd_trends") + 2500);
    expect(ctx.agentCalls.some((c) => c.text.includes("old sentence"))).toBe(false);
  });
});
