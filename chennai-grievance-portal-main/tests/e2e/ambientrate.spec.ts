import { expect, test } from "@playwright/test";
import { durOf, modeOn, saveResult, say, setup } from "./helpers";

/**
 * Ambient requests an hour, measured over a 10-minute run with people talking the whole time and nothing addressed to Jarvis: the
 * worst case for the listening budget. The transcriber is mocked (so this spends nothing), the detector and the budget are real.
 *   LONG=1 npx playwright test tests/e2e/ambientrate.spec.ts
 */
test.skip(!process.env.LONG, "takes 10 minutes: run with LONG=1");

test("ambient requests an hour, side talk throughout", async ({ page }) => {
  test.setTimeout(720_000);
  const ctx = await setup(page);
  await modeOn(page);
  await page.locator(".hud-first button").click().catch(() => undefined);
  const t0 = Date.now();
  const clips = ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "cmd_adyar", "cmd_trends", "cmd_zone"];
  let i = 0, spoken = 0;
  while (Date.now() - t0 < 600_000) {
    ctx.hear.push({ text: "the file is on your table" });
    const clip = clips[i++ % clips.length];
    await say(page, clip);
    await page.waitForTimeout(durOf(clip) + 300);
    spoken++;
  }
  const mins = (Date.now() - t0) / 60_000;
  const ambient = ctx.hearCalls.filter((c) => c.lane === "ambient").length, other = ctx.hearCalls.length - ambient;
  const r = { minutes: Math.round(mins * 10) / 10, sentencesSpoken: spoken, ambientRequests: ambient, otherRequests: other, ambientPerHour: Math.round((ambient / mins) * 60), planner: ctx.agentCalls.length, note: "detector and budget real, transcriber mocked; people talking throughout, nothing addressed to Jarvis" };
  saveResult("ambient-rate", r);
  console.log(JSON.stringify(r));
  expect(ctx.agentCalls.length).toBe(0);
  expect(ambient / mins).toBeLessThanOrEqual(8.5);
});
