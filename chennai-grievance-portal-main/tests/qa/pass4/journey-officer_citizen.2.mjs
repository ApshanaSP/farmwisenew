// officer day: sign in once with the form, save the browser state, time the console load
import { open, shot, text, base } from "./journey-officer_citizen.lib.mjs";
import fs from "node:fs";
const t0 = Date.now();
const { br, ctx, page, errs } = await open("officerA", { width: 1366, height: 800 });
console.log("signed in after ms", Date.now() - t0, page.url());
for (let i = 0; i < 12 && !page.url().includes("/officer"); i++) await page.waitForTimeout(5000);
console.log("at", page.url(), "after ms", Date.now() - t0);
await ctx.storageState({ path: "../.qa-officer-state.json" });
await shot(page, "officer-01-home");
console.log(await text(page, 3500));
console.log("ERRS", JSON.stringify(errs));
await br.close();
