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

  test("the tab out of sight closes the microphone, and it says so on return", async ({ page }) => {
    await setup(page);
    await modeOn(page);
    const hidden = (v: boolean) => page.evaluate((x) => { Object.defineProperty(document, "hidden", { configurable: true, get: () => x }); document.dispatchEvent(new Event("visibilitychange")); }, v);
    await hidden(true);
    await page.waitForFunction(() => !(window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 5000 });
    await hidden(false);
    await page.waitForFunction(() => (window as unknown as { __jv: { hud(): { notice: string | null } } }).__jv.hud().notice?.includes("hidden"), null, { timeout: 5000 });
    await page.waitForFunction(() => (window as unknown as { __jv: { micLive(): boolean } }).__jv.micLive(), null, { timeout: 15_000 });
  });

  test("a denied microphone says so clearly, and the mode goes off", async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as Record<string, unknown>).__denyMic = true; });
    await setup(page);
    await page.evaluate(() => { (window as unknown as { __jarvisTestStream: () => Promise<MediaStream> }).__jarvisTestStream = async () => { throw new Error("blocked"); }; });
    await page.keyboard.press("Control+Shift+J");
    await expect(page.locator(".jsw-denied")).toContainText("Microphone blocked", { timeout: 15_000 });
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  test("with the voice model unreachable, the energy gate still hears", async ({ page }) => {
    await page.route("**/thunai-ort/**", (r) => r.fulfill({ status: 404, body: "" }));
    const ctx = await setup(page);
    await modeOn(page);
    expect(await page.evaluate(() => (window as unknown as { __jv: { hud(): { strip: { detector: string } } } }).__jv.hud().strip.detector)).toBe("energy");
    ctx.hear.push({ text: "the file is on the table" });
    await say(page, "cmd_adyar");
    await expect.poll(() => ctx.hearCalls.length, { timeout: 15_000 }).toBe(1);
  });

  test("level B on an open screen: a pin waits for its yes, and nothing is kept before it", async ({ page }) => {
    const doc = { v: 1, id: "s1", recipe: "cases", title: "Severe today", takeaway: null, say: { en: "Here they are.", ta: "இதோ." }, scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: {}, sources: [], asOf: null, notes: [], blocks: [{ kind: "Note", id: "n", text: "Nothing else." }] };
    const ctx = await setup(page, { agent: () => ({ result: { ...chat(""), kind: "do", reply: null, stage: doc, say: "Here they are." } }) });
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis, show me something" });
    await say(page, "cmd_adyar");
    await expect(page.locator(".st-root")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(durOf("cmd_adyar"));
    ctx.hear.push({ text: "Jarvis, pin this" });
    await say(page, "cmd_trends");
    await expect(page.getByRole("dialog", { name: "Pin this screen?" })).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem("thunai-pins"))).toBeFalsy();
    await page.waitForTimeout(durOf("cmd_trends"));
    ctx.hear.push({ text: "yes" });
    await say(page, "wait");
    await page.waitForFunction(() => (localStorage.getItem("thunai-pins") ?? "").includes("Severe today"), null, { timeout: 15_000 });
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

  test("the low budget ends after its minute, even with people still talking", async ({ page }) => {
    test.setTimeout(180_000);
    const ctx = await setup(page);
    await modeOn(page);
    const t0 = Date.now();
    // talk straight through: the first eight go, then a minute of none, then more
    while (Date.now() - t0 < 100_000) {
      ctx.hear.push({ text: "the file is on your table" });
      await say(page, "cmd_trends");
      await page.waitForTimeout(durOf("cmd_trends") + 300);
    }
    expect(ctx.hearCalls.filter((c) => c.lane === "ambient").length).toBeGreaterThan(8);
    expect(ctx.hearCalls.filter((c) => c.lane === "ambient" && c.at - t0 < 60_000).length).toBeLessThanOrEqual(8);
  });
});
