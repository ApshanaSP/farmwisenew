import { expect, test } from "@playwright/test";
import { chat, durOf, modeOn, say, setup, speakingNow, steps, until, type Ctx } from "./helpers";

const LONG = "The drains near the bridge are blocked and the main roads are under water. The department has the list on screen beside the map. Most of it can wait for the morning crew, though the bridge cannot.";

async function speakingAnswer(page: Parameters<typeof setup>[0], ctx: Ctx) {
  ctx.hear.push({ text: "Jarvis, what is going on near the bridge" });
  await say(page, "cmd_adyar");
  await page.waitForFunction(() => (window as unknown as { __jv: { speaking(): boolean } }).__jv.speaking(), null, { timeout: 20_000 });
  await page.waitForTimeout(durOf("cmd_adyar") + 300);
}

test.describe("holding", () => {
  test('"wait": silent, nothing on screen changes, the word gets no answer', async ({ page }) => {
    const ctx = await setup(page, { agent: () => ({ result: chat(LONG) }) });
    await modeOn(page);
    await speakingAnswer(page, ctx);
    const agentBefore = ctx.agentCalls.length;
    const stateBefore = await page.getByTestId("state").textContent();
    ctx.hear.push({ text: "wait" });
    await say(page, "wait");
    await until(page, "holding", 8000);
    expect(await speakingNow(page)).toBe(false);
    expect(ctx.agentCalls.length).toBe(agentBefore);
    expect(await page.getByTestId("state").textContent()).toBe(stateBefore);
    // the extra listening time ends back at listening
    await until(page, "listening", 6000);
  });

  test('"continue" resumes the answer from its chunk', async ({ page }) => {
    const ctx = await setup(page, { agent: () => ({ result: chat(LONG) }) });
    await modeOn(page);
    await speakingAnswer(page, ctx);
    ctx.hear.push({ text: "wait" });
    await say(page, "wait");
    await until(page, "holding", 8000);
    await page.waitForTimeout(durOf("wait"));
    ctx.hear.push({ text: "continue" });
    await say(page, "wait");
    await page.waitForFunction(() => (window as unknown as { __jv: { speaking(): boolean } }).__jv.speaking(), null, { timeout: 10_000 });
    expect(ctx.agentCalls.filter((c) => /continue/.test(c.text)).length).toBe(0);
  });

  test('"wait, show Anna Nagar" is hold plus command: handled as a command', async ({ page }) => {
    const ctx = await setup(page, { agent: (t) => /Anna Nagar/.test(t) ? { result: steps([{ a: "view", view: { zone: 8 } }]) } : { result: chat(LONG) } });
    await modeOn(page);
    await speakingAnswer(page, ctx);
    ctx.hear.push({ text: "wait, show Anna Nagar" });
    await say(page, "cmd_zone");
    await expect(page.getByTestId("state")).toContainText('"zone": 8', { timeout: 15_000 });
    expect(ctx.agentCalls.some((c) => c.text === "show Anna Nagar")).toBe(true);
  });

  test("speech that cut Jarvis off but was not for it: the answer goes on", async ({ page }) => {
    const ctx = await setup(page, { agent: () => ({ result: chat(LONG) }) });
    await modeOn(page);
    await speakingAnswer(page, ctx);
    const says = ctx.sayCalls.length;
    ctx.hear.push({ text: "did you see the file he sent yesterday" });
    await say(page, "b3");
    await page.waitForTimeout(durOf("b3") + 1500);
    expect(await speakingNow(page)).toBe(true);
    expect(ctx.sayCalls.length).toBeGreaterThanOrEqual(says);
  });

  test("Jarvis, go to sleep: off", async ({ page }) => {
    const ctx = await setup(page);
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis, go to sleep." });
    await say(page, "cmd_trends");
    await page.waitForFunction(() => !(window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 15_000 });
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});
