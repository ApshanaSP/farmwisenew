// officer: In action tab, press Complete & close on the case approved a moment ago
import { accounts } from "../seed-local-users.mjs";
import { openWithState, shot, base } from "./journey-officer_citizen.lib.mjs";
const { br, ctx, page, errs } = await openWithState("../.qa-officer-state.json", { width: 1366, height: 800 });
await page.goto(base + "/officer", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const log = [];
page.on("request", (r) => { if (r.method() !== "GET") log.push(r.method() + " " + r.url().replace(base, "") + " " + (r.postData() || "").slice(0, 200)); });
await page.mouse.click(760, 466); // In action tab
await page.waitForTimeout(1500);
await page.mouse.click(950, 521); await page.waitForTimeout(1500);
await page.locator("textarea").first().fill("Burning waste put out, area cleared and a fire watch posted at the dumping ground.");
await page.locator('input[type="file"]').first().setInputFiles("../docs/qa/pass4/evidence/journeys/citizen-photo-fixture.jpg");
await page.waitForTimeout(1500);
await shot(page, "officer-07-report-filled");
await page.locator('button:has-text("Close as done")').click();
await page.waitForTimeout(2500);
import("../seed-local-users.mjs").then(()=>{});

await shot(page, "officer-07b-confirm-its-you");
await page.locator('input[type="password"]').fill(accounts().find((x) => x.key === "officerA").password);
await page.locator('button:has-text("Confirm")').first().click();
await page.waitForTimeout(4000);
await shot(page, "officer-08-closed");
console.log("dialogs:", JSON.stringify(await page.locator('[role=dialog],[aria-modal=true]').allInnerTexts()));
console.log("toasts:", JSON.stringify(await page.locator('[role=status],[role=alert]').allInnerTexts()));
const t = await page.locator("body").innerText();
console.log("counts: waiting", t.match(/WAITING FOR YOUR APPROVAL\s+(\d+)/)?.[1], "In action", t.match(/(\d+)\s+In action/)?.[1], "resolved", t.match(/RESOLVED THIS MONTH\s+(\d+)/)?.[1]);
console.log("NETWORK", JSON.stringify(log));
console.log("ERRS", JSON.stringify(errs));
await br.close();
