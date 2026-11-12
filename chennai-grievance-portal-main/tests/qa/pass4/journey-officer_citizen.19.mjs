// officer: tap the first Approve with the mouse like a person, see what appears
import { openWithState, shot, base } from "./journey-officer_citizen.lib.mjs";
const { br, ctx, page, errs } = await openWithState("../.qa-officer-state.json", { width: 1366, height: 800 });
await page.goto(base + "/officer", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const log = [];
page.on("request", (r) => { if (r.method() !== "GET") log.push(r.method() + " " + r.url().replace(base, "")); });
await page.mouse.click(950, 521);
await page.waitForTimeout(1500);
await shot(page, "officer-04b-after-click-immediate");
console.log("dialogs:", await page.locator('[role=dialog],[aria-modal=true]').allInnerTexts());
await page.waitForTimeout(3000);
console.log("NETWORK", JSON.stringify(log));
await shot(page, "officer-04c-after-click-4s");
console.log("ERRS", JSON.stringify(errs));
await br.close();
