// officer: In action tab, press Complete & close on the case approved a moment ago
import { openWithState, shot, base } from "./journey-officer_citizen.lib.mjs";
const { br, ctx, page, errs } = await openWithState("../.qa-officer-state.json", { width: 1366, height: 800 });
await page.goto(base + "/officer", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const log = [];
page.on("request", (r) => { if (r.method() !== "GET") log.push(r.method() + " " + r.url().replace(base, "") + " " + (r.postData() || "").slice(0, 200)); });
await page.mouse.click(760, 466); // In action tab
await page.waitForTimeout(1500);
await shot(page, "officer-05-in-action");
await page.mouse.click(950, 521); // Complete & close on the top row
await page.waitForTimeout(2000);
await shot(page, "officer-06-complete-clicked");
console.log("dialogs:", JSON.stringify(await page.locator('[role=dialog],[aria-modal=true]').allInnerTexts()));
console.log("body after:", (await page.locator("body").innerText()).split("\n").filter(Boolean).slice(0, 60).join(" | ").slice(0, 1800));
console.log("NETWORK", JSON.stringify(log));
console.log("ERRS", JSON.stringify(errs));
await br.close();
