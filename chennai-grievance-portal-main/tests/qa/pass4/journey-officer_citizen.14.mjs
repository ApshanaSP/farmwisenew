// officer: is the new case in the To approve queue / See all list?
import { openWithState, shot, text, base } from "./journey-officer_citizen.lib.mjs";
const { br, ctx, page, errs } = await openWithState("../.qa-officer-state.json", { width: 1366, height: 800 });
await page.goto(base + "/officer", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.locator('text=See all').first().click();
await page.waitForTimeout(3500);
await shot(page, "officer-03-see-all");
const t = await text(page, 6000);
console.log(t.slice(0, 2500));
console.log("HAS Gandhi:", /Gandhi Nagar 2nd Cross/i.test(await page.locator("body").innerText()), "HAS 993UJN:", /993UJN/.test(await page.locator("body").innerText()));
console.log("ERRS", JSON.stringify(errs));
await br.close();
