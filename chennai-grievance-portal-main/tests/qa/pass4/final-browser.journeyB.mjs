// Final browser drive, journey B: a department officer works a case from "waiting for approval" to closed, then the Collector's and the citizen's screens are read.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.journeyB.mjs [en|ta] [1440|360] [officerA|officerB|officerC]
// Writes journeyB-<lang>-<vp>-<officer>.json and B-<lang>-<vp>-<officer>-*.png. The officer's password (Confirm it's you) is read from the gitignored test-account file, never printed.
import fs from "node:fs";
import path from "node:path";
import { accounts } from "../seed-local-users.mjs";
import { EV, launchBrowser, stateFor, openPage, goto, sideways } from "./final-browser.lib.mjs";

const lang = process.argv[2] || "en", vp = Number(process.argv[3] || 1440), who = process.argv[4] || "officerA";
const tag = `${lang}-${vp}-${who}`;
const log = { lang, vp, who, steps: [], started: new Date().toISOString() };
const step = (name, data) => { log.steps.push({ name, ...data }); console.log("STEP", name, JSON.stringify(data).slice(0, 420)); };
const save = () => fs.writeFileSync(path.join(EV, `journeyB-${tag}.json`), JSON.stringify(log, null, 1));
const flat = (s) => (s || "").replace(/\n+/g, " | ");
const photo = path.join(EV, "citizen-photo-fixture.jpg");
const br = await launchBrowser();
const { ctx, page, w } = await openPage(br, await stateFor(who), lang, vp);
const shot = (n) => page.screenshot({ path: path.join(EV, `B-${tag}-${n}.png`) });
const counts = async () => { const t = await page.locator("body").innerText(); return { toApprove: t.match(/(\d+)\s*\n?\s*(To approve|அனுமதிக்க)/)?.[1] ?? null, inAction: t.match(/(\d+)\s*\n?\s*(In action|நடவடிக்கையில்)/)?.[1] ?? null }; };
try {
  await goto(page, "/officer", 6000);
  await shot("01-home");
  step("home", { counts: await counts(), text: flat(await page.locator("body").innerText()).slice(0, 500), sideways: await sideways(page) });
  // 1. approve the first waiting case
  const approve = page.locator("button", { hasText: /^Approve$|^Approve\b|அனுமதி/ }).first();
  const n0 = await approve.count();
  step("approve-buttons", { n: n0 });
  if (n0) {
    const rowTitle = await approve.evaluate((b) => { let n = b; for (let i = 0; i < 5 && n; i++) { n = n.parentElement; const t = n?.innerText?.split("\n").filter(Boolean)[0]; if (t && t.length > 12) return n.innerText.replace(/\n+/g, " | ").slice(0, 160); } return ""; });
    log.approved = rowTitle;
    await approve.click();
    await page.waitForTimeout(4000);
    await shot("02-after-approve");
    step("approved", { row: rowTitle, counts: await counts(), toast: flat(await page.locator("[role=status], [role=alert]").allInnerTexts().then((a) => a.join(" "))).slice(0, 200), console: w.console, http: w.http });
  }
  // 2. the In action list: complete and close the top case
  await page.locator("[role=tab], button", { hasText: /In action|நடவடிக்கையில்/ }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await shot("03-in-action");
  const complete = page.locator("button", { hasText: /Complete & close|Complete and close|முடித்து/ }).first();
  const hasComplete = await complete.count();
  step("in-action", { hasComplete, counts: await counts(), buttons: await page.locator("button").evaluateAll((e) => e.map((x) => x.innerText.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 30)) });
  if (hasComplete) {
    const rowText = await complete.evaluate((b) => { let n = b; for (let i = 0; i < 5 && n; i++) { n = n.parentElement; if (n?.innerText?.length > 40) return n.innerText.replace(/\n+/g, " | ").slice(0, 200); } return ""; });
    log.closed = rowText;
    await complete.click();
    await page.waitForTimeout(2000);
    await shot("04-report");
    step("report-open", { text: flat(await page.locator("[role=dialog]").first().innerText().catch(() => "")).slice(0, 500) });
    await page.locator("textarea").first().fill(lang === "ta" ? "குப்பை அகற்றப்பட்டு, பகுதி சுத்தம் செய்யப்பட்டது; கண்காணிப்பு வைக்கப்பட்டுள்ளது." : "Overflowing waste cleared, the area swept and the bin emptied; a daily check is set for the next week.");
    await page.locator('input[type="file"]').first().setInputFiles(photo).catch((e) => step("photo-skip", { e: e.message.slice(0, 80) }));
    await page.waitForTimeout(1500);
    await shot("05-report-filled");
    await page.locator("button", { hasText: /Close as done|முடிந்ததாக/ }).first().click();
    await page.waitForTimeout(2000);
    await shot("06-confirm");
    step("confirm-asked", { text: flat(await page.locator("[role=dialog]").last().innerText().catch(() => "")).slice(0, 300) });
    await page.locator('input[type="password"]').first().fill(accounts().find((x) => x.key === who).password);
    await page.locator("button", { hasText: /^Confirm$|உறுதி/ }).first().click();
    // the close uploads the photo and writes the report: wait for the dialog to go (up to a minute on a busy machine), then look
    await page.locator("[role=dialog]").first().waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await shot("07-closed");
    step("closed", { counts: await counts(), toast: flat(await page.locator("[role=status], [role=alert]").allInnerTexts().then((a) => a.join(" "))).slice(0, 240), text: flat(await page.locator("[role=dialog]").last().innerText().catch(() => "")).slice(0, 300), console: w.console, http: w.http });
  }
  // 3. the same officer on a fresh load: do the counts hold?
  await goto(page, "/officer", 6000);
  step("reload-after", { counts: await counts() });
  await shot("08-reload");
  save();
  // 4. the Collector's screens: the closed case is found by its number and says who closed it; the Collector's own count of closures checked by departments
  const rep = log.steps.find((x) => x.name === "report-open")?.text?.match(/INC-\d{8}-[A-Z0-9]{6}/)?.[0] ?? null;
  log.incidentId = rep;
  if (rep) {
    const col = await openPage(br, await stateFor("collector"), lang, vp);
    await goto(col.page, "/collector", 3500);
    await col.page.keyboard.press("/");
    await col.page.waitForTimeout(1200);
    await col.page.keyboard.type(rep, { delay: 20 });
    await col.page.waitForTimeout(3500);
    await col.page.screenshot({ path: path.join(EV, `B-${tag}-09-collector-search.png`) });
    const hit = col.page.locator("[role=dialog] [role=option], [role=dialog] li, [role=dialog] button", { hasText: rep.slice(-6) }).first();
    const found = await hit.count();
    step("collector-search", { id: rep, found, text: flat(await col.page.locator("[role=dialog]").first().innerText().catch(() => "")).slice(0, 400) });
    if (found) { await hit.click().catch(() => {}); await col.page.waitForTimeout(6000); await col.page.screenshot({ path: path.join(EV, `B-${tag}-10-collector-incident.png`) }); step("collector-incident", { text: flat(await col.page.locator("body").innerText()).slice(0, 700) }); }
    log.collectorWatchers = col.w;
  }
  save();
} catch (e) { step("ERROR", { message: e.message.split("\n")[0] }); await shot("99-error").catch(() => {}); }
log.watchers = w;
save();
await br.close();
