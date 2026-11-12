// journey-judge walk 4: the brief's own natural-language requests in Ask the map. node tests/qa/pass4/journey-judge.walk4.mjs
import { chromium } from "playwright";
import fs from "node:fs";
const base = "http://localhost:3180", D = "../docs/qa/pass4/evidence/journeys/judge/";
const { accounts } = await import("../seed-local-users.mjs");
const acc = accounts().find((x) => x.key === "collector");
const br = await chromium.launch({ args: ["--mute-audio"] });
const page = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.locator("input[type=email]").first().fill(acc.email);
await page.locator("input[type=password]").first().fill(acc.password);
await page.getByRole("button", { name: /^Sign in$/ }).click();
await page.waitForURL(/\/collector/, { timeout: 60000 });
await page.waitForTimeout(8000);
const Q = [
  "Prepare today's Collector briefing: group duplicate reports, identify the important incidents, explain why they need attention and create a department-wise action list",
  "Give me the weekly summary of road accidents, flooding and public-infrastructure complaints in the district",
  "List the taluks with the highest number of unresolved incidents during the last month",
  "Create a quarterly trend of incident categories and prepare a department-wise follow-up report",
  "Show every source and application record used to create this briefing",
  "Save this workspace as Collector's Daily Briefing and reopen last week's version",
  "Show incidents reported in more than one newspaper with no citizen complaint",
];
await page.keyboard.press("Control+k");
await page.waitForTimeout(2500);
const out = [];
let i = 0;
for (const q of Q) {
  i++;
  try {
    const box = page.locator('input[placeholder^="Ask about"], textarea[placeholder^="Ask about"]').last();
    await box.fill(q); await box.press("Enter");
    await page.waitForTimeout(20000);
    await page.screenshot({ path: D + `12-ask-${i}.png` });
    const t = await page.locator("body").innerText();
    const k = t.indexOf("Answering for"); out.push({ q, text: t.slice(k, k + 3500) });
    console.log("==", i, q.slice(0, 50), "\n", t.slice(t.indexOf("Answering for")).replace(/\n+/g, " | ").slice(0, 700));
    await page.locator('button[aria-label*="New" i], button[title*="New" i]').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1000);
  } catch (e) { console.log("FAIL", i, e.message.split("\n")[0]); }
}
{ const t = await page.locator("body").innerText(); fs.writeFileSync(D + "12-ask-full.txt", t.slice(t.indexOf("Answering for"))); }
fs.writeFileSync(D + "12-ask.json", JSON.stringify(out, null, 1));
fs.writeFileSync(D + "errs4.json", JSON.stringify(errs, null, 1));
await br.close();
