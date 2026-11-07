// citizen tracks the complaint at 360 px
import { openWithState, shot, text, base } from "./journey-officer_citizen.lib.mjs";
const { br, ctx, page, errs } = await openWithState("../.qa-citizen-state.json", { width: 360, height: 740 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(base + "/citizen/track-complaints", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot(page, "citizen-10-track-360");
console.log(await text(page, 2500));
console.log("hscroll", await page.evaluate(() => document.documentElement.scrollWidth + ">" + innerWidth));
const first = page.locator('text=993UJN').first();
if (await first.count()) { await first.click(); await page.waitForTimeout(2500); await shot(page, "citizen-11-track-detail-360"); console.log("DETAIL:", (await text(page, 3000)).slice(0, 2200)); }
console.log("ERRS", JSON.stringify(errs));
await br.close();
