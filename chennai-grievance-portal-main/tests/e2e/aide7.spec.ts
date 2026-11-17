/**
 * v7: the screen shows the details, the voice gives the point. After an answer the aide wrote (stage.ts `voice`), a news list or a brief is
 * NOT read out item by item; a screen with no aide answer (v6's, JARVIS_ANSWER=v6) is read as before. The agent is mocked (helpers.ts), and
 * what is spoken is what reaches the voice route (/api/jarvis/say), one call a spoken line.
 *   npx playwright test tests/e2e/aide7.spec.ts
 */
import { expect, test } from "@playwright/test";
import { chat, modeOn, say, setup } from "./helpers";

const item = (id: string, title: string, source: string) => ({ id, title, source, t: null, place: null, incidentId: null, url: null });
const newsScreen = (voice: boolean) => ({
  v: 1, id: `n-${voice ? "v7" : "v6"}`, recipe: "news", title: "News · this week", takeaway: null, say: { en: "Two stories matter today: the canal overflow and the metro work.", ta: "இரண்டு செய்திகள்." },
  scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: {}, sources: [], asOf: null, notes: [],
  blocks: [{ kind: "NewsReader", id: "news", title: "News · this week", total: 3, items: [item("a", "Kotturpuram streets waterlogged as canal overflows", "The Hindu"), item("b", "Metro work slows traffic on OMR", "DT Next"), item("c", "Corporation clears silt from Buckingham Canal", "The Times of India")] }],
  // the server puts every figure of its checked answer here (aide7/index.ts): "Two stories" says 2, which the browser's number gate then allows
  ...(voice ? { voice: { by: "aide7", model: "mock", figures: [2] } } : {})
});
const answered = (voice: boolean) => ({ result: { ...chat(""), kind: "do", reply: null, stage: newsScreen(voice), say: newsScreen(voice).say.en } });

test.describe("v7: the voice gives the point, the screen the items", () => {
  test("an aide answer: the point is said and no headline is read out", async ({ page }) => {
    const ctx = await setup(page, { agent: () => answered(true) });
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis, summarise the news" });
    await say(page, "cmd_adyar");
    await expect(page.locator(".st-root")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => ctx.sayCalls.join(" | "), { timeout: 45_000, message: "what was spoken" }).toContain("Two stories matter today");
    await page.waitForTimeout(4000);
    const said = ctx.sayCalls.join(" | ");
    expect(said).not.toMatch(/Kotturpuram streets waterlogged|Metro work slows traffic|Buckingham Canal/);
  });
  test("v6's screen (no aide answer): the headlines are read, as before", async ({ page }) => {
    const ctx = await setup(page, { agent: () => answered(false) });
    await modeOn(page);
    ctx.hear.push({ text: "Jarvis, summarise the news" });
    await say(page, "cmd_adyar");
    await expect(page.locator(".st-root")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => ctx.sayCalls.join(" | "), { timeout: 30_000 }).toMatch(/Kotturpuram streets waterlogged/);
  });
});
