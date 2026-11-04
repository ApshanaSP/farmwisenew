import { expect, test } from "@playwright/test";
import { chat, durOf, jv, modeOn, say, setup, steps, until } from "./helpers";

test.describe("Jarvis mode: always listening, no mic button", () => {
  test("off and muted stop the microphone's tracks; on opens them; the choice is remembered", async ({ page }) => {
    await setup(page);
    expect(await jv(page, "micLive")).toBe(false);
    await page.keyboard.press("Control+Shift+J");
    await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 60_000 });
    await expect(page.locator(".jsw-mute", { hasText: "Listening" })).toBeVisible();
    await page.keyboard.press("Control+Shift+M");
    await page.waitForFunction(() => !(window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive());
    await expect(page.locator(".jsw-mute", { hasText: "Muted" })).toBeVisible();
    await page.keyboard.press("Control+Shift+M");
    await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 30_000 });
    await page.keyboard.press("Control+Shift+J");
    await page.waitForFunction(() => !(window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive());
    expect(await page.evaluate(() => localStorage.getItem("jarvis-mode"))).toBe("off");
  });

  test("the first time, the notice comes first: the microphone stays closed until it is read", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => localStorage.removeItem("jarvis-mode-seen"));
    await page.keyboard.press("Control+Shift+J");
    await expect(page.locator(".hud-first")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(await jv(page, "micLive")).toBe(false);
    await page.locator(".hud-first button").click();
    await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 60_000 });
    expect(await page.evaluate(() => localStorage.getItem("jarvis-mode-seen"))).toBe("1");
  });

  test("the name alone, then a pause, then the request: it listens on and asks no model for the name", async ({ page }) => {
    const ctx = await setup(page, { agent: () => ({ result: steps([{ a: "view", view: { zone: 13 } }]) }) });
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis." });
    await say(page, "cmd_trends");
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { ribbon: string } } }).__jv.hud().ribbon === "Yes?", null, { timeout: 15_000 });
    expect(ctx.agentCalls.length).toBe(0);
    await page.waitForTimeout(durOf("cmd_trends"));
    ctx.hear.push({ text: "put something together for Adyar" });
    await say(page, "cmd_adyar");
    await expect(page.getByTestId("state")).toContainText('"zone": 13', { timeout: 15_000 });
    expect(ctx.hearCalls[1].lane).toBe("engaged");
  });

  test("Esc forgets a cancelled question: a later ignored sentence does not bring it back", async ({ page }) => {
    const ctx = await setup(page, { agent: () => ({ result: chat("The late answer."), delay: 2000 }) });
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis, what is going on near the bridge" });
    await say(page, "cmd_adyar");
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { ribbon: string } } }).__jv.hud().ribbon.includes("bridge"), null, { timeout: 15_000 });
    await page.keyboard.press("Escape");
    const n = ctx.agentCalls.length;
    await page.waitForTimeout(2500);
    ctx.hear.push({ text: "did he send the file yesterday" });
    await say(page, "b3");
    await page.waitForTimeout(durOf("b3") + 1500);
    expect(ctx.agentCalls.length).toBe(n);
  });

  test("three commands with no click and no name: the console acts", async ({ page }) => {
    const ctx = await setup(page, {
      agent: (t) => /Adyar/.test(t) ? { result: steps([{ a: "view", view: { zone: 13 } }]) } : /Anna Nagar/.test(t) ? { result: steps([{ a: "view", view: { zone: 8 } }]) } : { result: chat("Done.") }
    });
    await modeOn(page);
    ctx.hear.push({ text: "Go to the trends page." });
    await say(page, "cmd_trends");
    await expect(page.getByTestId("state")).toContainText('"page": "trends"', { timeout: 15_000 });
    await page.waitForTimeout(800);
    ctx.hear.push({ text: "Show the severe cases in Adyar." });
    await say(page, "cmd_adyar");
    await expect(page.getByTestId("state")).toContainText('"zone": 13', { timeout: 15_000 });
    await page.waitForTimeout(800);
    ctx.hear.push({ text: "Show Anna Nagar on the map." });
    await say(page, "cmd_zone");
    // "on the map" is a plain move the rules do at once: the console's map is asked; the agent's zone step is the other path
    await expect(page.getByTestId("log")).toContainText(/Anna Nagar|"zone":8/, { timeout: 15_000 });
    expect(ctx.hearCalls.length).toBe(3);
  });

  test("a side conversation is ignored: a faint line, no planner call, nothing changes", async ({ page }) => {
    const ctx = await setup(page);
    await modeOn(page);
    ctx.hear.push({ text: "the Adyar file is on your table" });
    await say(page, "cmd_adyar");
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { faint: string } } }).__jv.hud().faint.includes("Adyar file"), null, { timeout: 15_000 });
    expect(ctx.agentCalls.length).toBe(0);
    await expect(page.getByTestId("state")).toContainText('"zone": null');
    // gone in two seconds
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { faint: string } } }).__jv.hud().faint === "", null, { timeout: 4000 });
    expect(ctx.hearCalls[0].lane).toBe("ambient");
  });

  test("the name works anywhere; a level B request with no name does not run", async ({ page }) => {
    const ctx = await setup(page, { agent: () => ({ result: steps([{ a: "workspace", op: "save", name: "Daily" }]) }) });
    await modeOn(page);
    ctx.hear.push({ text: "show Adyar and save this workspace as Daily" });
    await say(page, "cmd_adyar");
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { answer: string } } }).__jv.hud().answer.includes("Say Jarvis first"), null, { timeout: 15_000 });
    await page.waitForTimeout(600);
    ctx.hear.push({ text: "Jarvis, save this workspace as Daily" });
    await say(page, "cmd_trends");
    await expect(page.getByRole("dialog").filter({ hasText: /Daily/ })).toBeVisible({ timeout: 15_000 });
  });

  test("an ambient sentence under 400 ms never leaves the browser, and the budget stops at 8 a minute", async ({ page }) => {
    const ctx = await setup(page);
    await modeOn(page);
    await say(page, "burst");
    await page.waitForTimeout(durOf("burst") + 500);
    expect(ctx.hearCalls.length).toBe(0);
    for (let i = 0; i < 10; i++) {
      ctx.hear.push({ text: "the file is on your table" });
      await say(page, "cmd_trends");
      await page.waitForTimeout(durOf("cmd_trends") + 300);
    }
    expect(ctx.hearCalls.filter((c) => c.lane === "ambient").length).toBeLessThanOrEqual(8);
    expect(await page.evaluate(() => (window as unknown as { __jv: { hud(): { strip: { budgetLow: boolean } } } }).__jv.hud().strip.budgetLow)).toBe(true);
    await until(page, "listening");
  });
});
