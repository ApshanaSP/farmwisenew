// officer finds the new case by searching its complaint number
import { openWithState, shot, text, base } from "./journey-officer_citizen.lib.mjs";
const { br, ctx, page, errs } = await openWithState("../.qa-officer-state.json", { width: 1366, height: 800 });
await page.goto(base + "/officer", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
console.log("url", page.url());
await page.locator('button:has-text("Search")').first().click();
await page.waitForTimeout(800);
await page.keyboard.type("2026-993UJN");
await page.waitForTimeout(2500);
await shot(page, "officer-02-search");
console.log((await text(page, 1800)).slice(0, 1800));
console.log("ERRS", JSON.stringify(errs));
await br.close();
