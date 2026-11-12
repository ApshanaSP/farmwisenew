// Final browser drive, journey A: the Collector's morning brief, find a severe case, decide on it (approve the drafted instruction), then see the decision on every surface.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.journeyA.mjs [en|ta]
// Writes docs/qa/pass4/evidence/final-browser/journeyA-<lang>.json and A-<lang>-*.png. English first, then Tamil on a second incident.
import fs from "node:fs";
import path from "node:path";
import { EV, launchBrowser, stateFor, openPage, goto, sideways } from "./final-browser.lib.mjs";

const lang = process.argv[2] || "en";
const vp = Number(process.argv[3] || 1440);
const DEPTS = (process.env.DEPTS ?? "").split(","); // "" = all departments (no severe case belongs to the three departments that have a test officer this week)
const log = { lang, vp, steps: [], started: new Date().toISOString() };
const step = (name, data) => { log.steps.push({ name, ...data }); console.log("STEP", name, JSON.stringify(data).slice(0, 300)); };
const shot = (page, n) => page.screenshot({ path: path.join(EV, `A-${lang}-${vp}-${n}.png`) });
const txt = async (page, n = 1500) => (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, n);

const br = await launchBrowser();
const { ctx, page, w } = await openPage(br, await stateFor("collector"), lang, vp);
try {
  // 1. the morning brief: Overview as it opens (daily), the Briefing tab, then the week
  await goto(page, "/collector", 3500);
  await shot(page, "01-home");
  step("home", { text: await txt(page, 700), sideways: await sideways(page) });
  await page.locator("[data-key=briefing]").first().click().catch(async () => { await page.locator("button", { hasText: /Menu|மெனு/ }).first().click(); await page.locator("[data-key=briefing]").first().click(); });
  await page.waitForTimeout(4000);
  await shot(page, "02-briefing");
  step("briefing", { text: await txt(page, 900) });
  await page.locator("[data-key=overview]").first().click().catch(() => {});
  await page.waitForTimeout(1500);
  // 2. find a severe case: the week, a department that has a test officer
  let picked = null;
  const PER = { Weekly: /^Weekly$|^வாராந்திர|^வார/, Monthly: /^Monthly$|^மாதாந்திர|^மாத/, Quarterly: /^Quarterly$|^காலாண்டு|^கால்/ };
  for (const per of (process.env.PERIODS || "Weekly,Monthly,Quarterly").split(",")) {
    await page.locator("button", { hasText: PER[per] }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    await page.locator("button.att-act").first().waitFor({ timeout: 15000 }).catch(() => {});
    for (const d of DEPTS) {
      await page.locator("select").nth(2).selectOption(d).catch(() => {});
      await page.waitForTimeout(2500);
      const n = await page.locator("button.att-act:not([aria-label^=\"Action taken\"])").count();
      if (n) { picked = { period: per, dept: d, rows: n }; break; }
    }
    if (picked) break;
  }
  await shot(page, "03-severe-list");
  step("find-severe", { picked, text: await txt(page, 600) });
  if (!picked) throw new Error("no severe case with a test officer this week");
  const label = await page.locator("button.att-act:not([aria-label^=\"Action taken\"])").first().getAttribute("aria-label");
  log.incidentLabel = label;
  // 3. open it
  await page.locator("button.att-act:not([aria-label^=\"Action taken\"])").first().click();
  await page.waitForTimeout(7000);
  await shot(page, "04-detail-and-draft");
  const draft = await page.locator("textarea").first().inputValue().catch(() => "");
  step("detail", { label, draftHead: draft.slice(0, 160), text: await txt(page, 500) });
  log.title = (await page.locator("h1,h2,h3").first().innerText().catch(() => "")).slice(0, 120);
  // 4. decide: approve and send
  await page.getByRole("button", { name: /Approve|அனுமதி/ }).first().click();
  await page.waitForTimeout(4000);
  await shot(page, "05-after-approve");
  step("approved", { text: await txt(page, 800), console: w.console.slice(), http: w.http.slice() });
  // the send asks for the account password again ("Confirm it's you"); the test collector's own password, read from the gitignored file
  const { accounts } = await import("../seed-local-users.mjs");
  await page.locator('input[type="password"]').first().fill(accounts().find((x) => x.key === "collector").password);
  await shot(page, "05b-confirm");
  await page.locator("button", { hasText: /^Confirm$|உறுதி/ }).first().click();
  await page.waitForTimeout(6000);
  await shot(page, "06-sent");
  step("sent", { text: await txt(page, 900), console: w.console.slice(), http: w.http.slice() });
  // surfaces: the incident again, the list, My tasks, the bell, Briefing, Jarvis
  const incTitle = (label || "").replace(/^Take action on /, "");
  log.incTitle = incTitle;
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator("[data-key=overview]").first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const listText = await page.locator("body").innerText();
  const needMatch = listText.match(/(\d+)\s+need you/);
  step("list-after", { needYou: needMatch?.[1] ?? null, stillListed: listText.includes(incTitle), row: (listText.split("\n").find((l, i, a) => a[i - 1]?.includes(incTitle.slice(0, 20))) || "").slice(0, 160) });
  await shot(page, "07-list-after");
  const rowState = () => page.evaluate((t) => { const b = [...document.querySelectorAll("button.att-act")].find((x) => (x.getAttribute("aria-label") || "").endsWith(t)); return b ? { aria: b.getAttribute("aria-label").slice(0, 40), text: b.innerText.trim() } : "(not on screen)"; }, incTitle);
  step("row-same-session-3s", { row: await rowState() });
  await page.waitForTimeout(15000);
  step("row-same-session-18s", { row: await rowState() });
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3000);
  await page.locator("button", { hasText: PER.Weekly }).first().click().catch(() => {}); await page.waitForTimeout(3500);
  step("row-after-reload", { row: await rowState() });
  await shot(page, "07b-list-after-reload");
  await page.getByRole("tab", { name: /My tasks|எனது/ }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  const tasks = await page.locator("body").innerText();
  step("my-tasks", { has: tasks.includes(incTitle), text: (tasks.split(/My tasks/)[1] || "").replace(/\n+/g, " | ").slice(0, 400) });
  await shot(page, "08-my-tasks");
  await page.locator("button[aria-label^=Alerts]").first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const bell = await page.locator("[role=dialog], [role=menu], .notif, [class*=otif]").first().innerText().catch(() => "");
  step("bell", { has: bell.includes(incTitle.slice(0, 25)), text: bell.replace(/\n+/g, " | ").slice(0, 400) });
  await shot(page, "09-bell");
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("[data-key=briefing]").first().click().catch(() => {});
  await page.waitForTimeout(4000);
  const brief = await page.locator("body").innerText();
  step("briefing-after", { mentions: brief.includes(incTitle.slice(0, 25)), text: brief.replace(/\n+/g, " | ").slice(600, 1100) });
  await shot(page, "10-briefing-after");
  fs.writeFileSync(path.join(EV, `journeyA-${lang}-${vp}.json`), JSON.stringify({ ...log, w }, null, 1));
} catch (e) {
  step("ERROR", { message: e.message.split("\n")[0] });
  await shot(page, "99-error").catch(() => {});
}
fs.writeFileSync(path.join(EV, `journeyA-${lang}-${vp}.json`), JSON.stringify({ ...log, w }, null, 1));
await ctx.close(); await br.close();
