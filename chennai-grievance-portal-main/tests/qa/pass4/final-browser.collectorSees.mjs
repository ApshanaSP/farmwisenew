// Final browser drive, journey B (second half): the Collector looks for a case the department officer has just closed, by its number, in the search palette and through Jarvis.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.collectorSees.mjs INC-20261102-8EC358 [en|ta]
import fs from "node:fs";
import path from "node:path";
import { EV, launchBrowser, stateFor, openPage, goto } from "./final-browser.lib.mjs";

const id = process.argv[2], lang = process.argv[3] || "en";
const log = { id, lang, steps: [] };
const step = (name, data) => { log.steps.push({ name, ...data }); console.log("STEP", name, JSON.stringify(data).slice(0, 500)); };
const flat = (s) => (s || "").replace(/\n+/g, " | ");
const br = await launchBrowser();
const { ctx, page, w } = await openPage(br, await stateFor("collector"), lang, 1440);
try {
  await goto(page, "/collector", 3500);
  await page.keyboard.press("/");
  await page.waitForTimeout(1200);
  await page.keyboard.type(id, { delay: 20 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(EV, `B-collector-${lang}-search.png`) });
  const dlg = flat(await page.locator("[role=dialog]").first().innerText().catch(() => ""));
  step("search", { dlg: dlg.slice(0, 500) });
  const hit = page.locator("[role=dialog] [role=option], [role=dialog] li, [role=dialog] button", { hasText: /ago|முன்/ }).first();
  if (await hit.count()) {
    await hit.click();
    await page.waitForTimeout(7000);
    await page.screenshot({ path: path.join(EV, `B-collector-${lang}-incident.png`) });
    step("incident", { text: flat(await page.locator("body").innerText()).slice(0, 900) });
  }
  // Jarvis, typed: the same case by number
  await goto(page, "/collector", 3000);
  for (let i = 0; i < 6 && !(await page.locator(".hud-bar").count()); i++) { if (await page.locator(".hud-first button").count()) await page.locator(".hud-first button").click().catch(() => {}); else await page.keyboard.press("Control+Shift+J"); await page.waitForTimeout(1500); }
  if (!(await page.locator(".hud-compose input").count())) await page.locator(".hud-btn", { hasText: /Type|தட்டச்சு/ }).first().click().catch(() => {});
  await page.locator(".hud-compose input").fill(`open incident ${id}`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(10000);
  await page.screenshot({ path: path.join(EV, `B-collector-${lang}-jarvis.png`) });
  step("jarvis", { said: await page.evaluate(() => document.querySelector(".hud-live")?.textContent?.trim().slice(0, 400) ?? ""), console: w.console, http: w.http });
} catch (e) { step("ERROR", { message: e.message.split("\n")[0] }); }
fs.writeFileSync(path.join(EV, `journeyB-collector-${lang}.json`), JSON.stringify({ ...log, w }, null, 1));
await br.close();
