import { open, shot, text, base } from "./journey-officer_citizen.lib.mjs";
const { br, page, errs } = await open("officerA", { width: 1366, height: 800 });
console.log(page.url());
await shot(page, "officer-01-home");
console.log(await text(page, 3500));
console.log("ERRS", JSON.stringify(errs));
console.log((await page.locator("button, a, [role=tab]").allInnerTexts()).map(s=>s.trim().replace(/\n/g," ")).filter(Boolean).slice(0,70).join(" | "));
await br.close();
