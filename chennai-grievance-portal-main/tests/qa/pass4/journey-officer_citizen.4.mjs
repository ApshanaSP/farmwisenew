// citizen at 360 px: open file-complaint, screenshot each step, dump visible fields
import { openWithCookie, shot, text, base } from "./journey-officer_citizen.lib.mjs";
const { br, ctx, page, errs } = await openWithCookie("citizenA", { width: 360, height: 740 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(base + "/citizen", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await shot(page, "citizen-01-home-360");
console.log("hscroll", await page.evaluate(() => document.documentElement.scrollWidth + ">" + innerWidth));
await page.goto(base + "/citizen/file-complaint", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot(page, "citizen-02-form-360");
console.log("hscroll", await page.evaluate(() => document.documentElement.scrollWidth + ">" + innerWidth));
console.log(await text(page, 2500));
console.log((await page.locator("button, input, textarea, select, a").evaluateAll(els=>els.map(e=>e.tagName+":"+(e.getAttribute("aria-label")||e.name||e.placeholder||e.innerText||"").trim().slice(0,40).replace(/\n/g," "))).catch(()=>[])).join(" | "));
console.log("ERRS", JSON.stringify(errs));
await br.close();
