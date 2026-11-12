// Final browser drive, part 3: the screens that only exist once something is opened (dialogs, panels, wizard steps), scanned the same way as the pages:
// axe critical and serious, console errors, failed requests, sideways scroll. English and Tamil, 1440 and 360.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.overlays.mjs [collector|officer|citizen]
// Writes docs/qa/pass4/evidence/final-browser/overlays-<who>.json
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { EV, launchBrowser, stateFor, openPage, goto, sideways, slug } from "./final-browser.lib.mjs";

const who = process.argv[2] || "collector";
const rows = [];
const br = await launchBrowser();
const flat = (s) => (s || "").replace(/\n+/g, " | ");
async function scan(page) {
  let r = await new AxeBuilder({ page }).analyze();
  if (r.violations.some((x) => x.impact === "critical" || x.impact === "serious")) { await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000); r = await new AxeBuilder({ page }).analyze(); }
  const by = {};
  const v = r.violations.map((x) => { by[x.impact || "none"] = (by[x.impact || "none"] || 0) + x.nodes.length; return { id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes.slice(0, 2).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message || n.all[0]?.message || "").slice(0, 100)) }; });
  return { by, v };
}
async function record(o, label, lang, vp, note = {}) {
  const { page, w } = o;
  const mark = o.mark ?? { console: 0, http: 0, failed: 0 };
  const ax = await scan(page).catch((e) => ({ by: {}, v: [], err: e.message.slice(0, 80) }));
  const sw = await sideways(page);
  const row = { page: label, role: who, lang, vp, console: w.console.slice(mark.console), http: w.http.slice(mark.http), failed: w.failed.slice(mark.failed).filter((x) => !/ERR_ABORTED|arcgisonline/.test(x)), sideways: sw.over || sw.body ? sw : false, axe: ax.by, axeRules: ax.v, axeErr: ax.err, ...note };
  const bad = row.console.length || row.failed.length || row.sideways || (ax.by.critical || 0) + (ax.by.serious || 0) || row.skipped;
  if (bad) { const f = `ovl-fail-${slug(`${who}_${label}_${lang}_${vp}`)}.png`; await page.screenshot({ path: path.join(EV, f) }).catch(() => {}); row.shot = f; }
  o.mark = { console: w.console.length, http: w.http.length, failed: w.failed.length };
  rows.push(row);
  console.log(`${label}|${lang}|${vp}`, JSON.stringify(ax.by), row.console.length, row.failed.length, !!row.sideways, row.skipped ? "SKIPPED " + row.skipped : "");
}
const skip = (o, label, lang, vp, why) => { rows.push({ page: label, role: who, lang, vp, skipped: why, axe: {}, axeRules: [], console: [], http: [], failed: [] }); console.log(`${label}|${lang}|${vp} SKIPPED ${why}`); };
const hydrate = async (page) => { await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(2500); };
const closeAll = async (page) => { for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); } };
const tryClick = async (page, loc, ms = 6000) => loc.first().click({ timeout: ms }).then(() => true).catch(() => false);

async function collector(lang, vp) {
  const state = await stateFor("collector");
  const o = await openPage(br, state, lang, vp);
  const { page } = o;
  await goto(page, "/collector", 3500);
  o.mark = { console: o.w.console.length, http: o.w.http.length, failed: o.w.failed.length };
  const L = (n) => `collector overlay: ${n}`;
  // Rain panel and its four tabs
  if (await tryClick(page, page.locator("button", { hasText: /^Rain$|^மழை/ }))) {
    await page.waitForTimeout(5000);
    for (const t of ["Flooding", "Traffic", "Power", "Metro"]) {
      await tryClick(page, page.locator("[role=tab]", { hasText: t }).last());
      await page.waitForTimeout(4500);
      await record(o, L(`Rain / ${t}`), lang, vp);
    }
    await closeAll(page);
  } else skip(o, L("Rain"), lang, vp, "Rain button not found");
  await goto(page, "/collector", 3000); o.mark = { console: o.w.console.length, http: o.w.http.length, failed: o.w.failed.length };
  // Ask the map
  if (await tryClick(page, page.locator("button", { hasText: /Ask the map|வரைபடத்திடம்|வரைபட/ }))) { await page.waitForTimeout(2500); await record(o, L("Ask the map"), lang, vp); await closeAll(page); } else skip(o, L("Ask the map"), lang, vp, "button not found");
  // Ask District IQ (shortcut works in both languages)
  for (let i = 0; i < 6 && !(await page.locator("[role=dialog]").count()); i++) { await page.keyboard.press("Control+k"); await page.waitForTimeout(2500); }
  if (await page.locator("[role=dialog]").count()) { await page.waitForTimeout(1500); await record(o, L("Ask District IQ (empty)"), lang, vp); await closeAll(page); } else skip(o, L("Ask District IQ"), lang, vp, "Ctrl+K did not open it");
  // Jarvis bar, typed
  for (let i = 0; i < 6 && !(await page.locator(".hud-bar").count()); i++) { if (await page.locator(".hud-first button").count()) await page.locator(".hud-first button").click().catch(() => {}); else await page.keyboard.press("Control+Shift+J"); await page.waitForTimeout(1500); }
  if (await page.locator(".hud-bar").count()) {
    await page.waitForTimeout(1200); await record(o, L("Jarvis bar"), lang, vp);
    if (!(await page.locator(".hud-compose input").count())) await tryClick(page, page.locator(".hud-btn", { hasText: /Type|தட்டச்சு/ }));
    await page.locator(".hud-compose input").fill(lang === "ta" ? "இந்த வாரம் எத்தனை தீவிர சம்பவங்கள் உள்ளன" : "how many severe incidents this week").catch(() => {});
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    await record(o, L("Jarvis answer on the stage"), lang, vp);
    await closeAll(page);
  } else skip(o, L("Jarvis bar"), lang, vp, "the bar did not open");
  await goto(page, "/collector", 3000); o.mark = { console: o.w.console.length, http: o.w.http.length, failed: o.w.failed.length };
  // bell, menu, search palette
  if (await tryClick(page, page.locator("button[aria-label^=Alerts], button[aria-label*='எச்சரிக்கை']"))) { await page.waitForTimeout(1500); await record(o, L("Alerts (bell)"), lang, vp); await closeAll(page); } else skip(o, L("Alerts"), lang, vp, "bell not found");
  if (await tryClick(page, page.locator("button[aria-label*='Export, workspaces' i], button:has-text('Menu'), button:has-text('மெனு')"))) { await page.waitForTimeout(1200); await record(o, L("Menu"), lang, vp); await closeAll(page); } else skip(o, L("Menu"), lang, vp, "menu not found");
  if (await tryClick(page, page.locator("button[aria-label^='Search and commands'], button[aria-label^='தேடல்']"))) { await page.waitForTimeout(1200); await record(o, L("Search and commands"), lang, vp); await closeAll(page); } else skip(o, L("Search"), lang, vp, "search not found");
  // a severe incident open (weekly list), then the Take action panel
  await tryClick(page, page.locator("button", { hasText: /^Weekly$|^வார/ }));
  await page.locator("button.att-act").first().waitFor({ timeout: 20000 }).catch(() => {});
  if (await page.locator("button.att-act").count()) {
    await page.locator("button.att-act").first().click().catch(() => {});
    await page.waitForTimeout(7000);
    await record(o, L("Incident detail + Take action"), lang, vp);
    await closeAll(page);
  } else skip(o, L("Incident detail"), lang, vp, "no severe row on screen");
  // the Collector's other sub-tabs on the overview
  await goto(page, "/collector", 3000); o.mark = { console: o.w.console.length, http: o.w.http.length, failed: o.w.failed.length };
  for (const [name, re] of [["Taluks map", /^Taluks$|^வட்டங்கள்/], ["My tasks", /^My tasks|^பணிகள்/], ["News tab", /^Next door|^அண்டை/]]) {
    if (await tryClick(page, page.locator("[role=tab], button", { hasText: re }))) { await page.waitForTimeout(2500); await record(o, L(name), lang, vp); } else skip(o, L(name), lang, vp, "not found");
  }
  await o.ctx.close();
}

async function officer(lang, vp, key) {
  const o = await openPage(br, await stateFor(key), lang, vp);
  const { page } = o;
  await goto(page, "/officer", 3000);
  await page.locator("[data-key]").first().waitFor({ timeout: 30000 }).catch(() => {});
  await hydrate(page);
  o.mark = { console: o.w.console.length, http: o.w.http.length, failed: o.w.failed.length };
  const L = (n) => `officer overlay: ${n}`;
  // the case drawer (a row of the work list)
  await tryClick(page, page.locator("[data-key=work]"));
  await page.locator("table tbody tr, [data-row], li[role=button]").first().waitFor({ timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (await tryClick(page, page.locator("table tbody tr, [data-row], li[role=button]"))) { await page.waitForTimeout(3500); await record(o, L("case drawer"), lang, vp, { officer: key }); await closeAll(page); } else skip(o, L("case drawer"), lang, vp, "no row");
  // the completion report dialog from In action
  await tryClick(page, page.locator("[role=tab], button", { hasText: /In action|நடவடிக்கையில்/ }));
  await page.waitForTimeout(3500);
  if (await tryClick(page, page.locator("button", { hasText: /Complete & close|Complete and close|முடித்து/ }))) { await page.waitForTimeout(2500); await record(o, L("completion report dialog"), lang, vp, { officer: key }); await closeAll(page); } else skip(o, L("completion report"), lang, vp, "no In-action row with a Complete button");
  // search palette, bell, menu
  for (const [name, sel] of [["search and commands", "button[aria-label^='Search and commands'], button[aria-label^='தேடல்']"], ["alerts", "button[aria-label^=Notifications], button[aria-label^='அறிவிப்பு']"]]) {
    if (await tryClick(page, page.locator(sel))) { await page.waitForTimeout(1500); await record(o, L(name), lang, vp, { officer: key }); await closeAll(page); } else skip(o, L(name), lang, vp, "not found");
  }
  await o.ctx.close();
}

async function citizen(lang, vp, key) {
  const o = await openPage(br, await stateFor(key), lang, vp);
  const { page } = o;
  await goto(page, "/citizen/file-complaint", 3000);
  o.mark = { console: o.w.console.length, http: o.w.http.length, failed: o.w.failed.length };
  const L = (n) => `citizen wizard: ${n}`;
  await record(o, L("step 1 details"), lang, vp, { citizen: key });
  const male = page.locator("button", { hasText: /^Male$|^ஆண்/ });
  if (await male.count()) { await male.first().click().catch(() => {}); const addr = page.locator("input:not([readonly]):not([disabled])").first(); if (!(await addr.inputValue().catch(() => ""))) await addr.fill("12 Test Street, Adyar, Chennai 600020").catch(() => {}); }
  if (!(await tryClick(page, page.locator("button", { hasText: /Next: Location|அடுத்து: இடம்/ })))) { skip(o, L("step 2"), lang, vp, "Next: Location not found"); await o.ctx.close(); return; }
  await page.waitForTimeout(3000);
  await record(o, L("step 2 location"), lang, vp, { citizen: key });
  const map = page.locator(".leaflet-container").first();
  if (await map.count()) { await map.scrollIntoViewIfNeeded().catch(() => {}); const bb = await map.boundingBox(); if (bb) { await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5); await page.waitForTimeout(3000); } }
  await page.locator('input[placeholder*="Gandhi"], input[placeholder*="காந்தி"]').first().fill("Gandhi Nagar 2nd Cross").catch(() => {});
  await record(o, L("step 2 location with a pin"), lang, vp, { citizen: key });
  if (!(await tryClick(page, page.locator("button", { hasText: /Next: Type|அடுத்து: வகை/ })))) { skip(o, L("step 3"), lang, vp, "Next: Type not found"); await o.ctx.close(); return; }
  await page.waitForTimeout(2000);
  await record(o, L("step 3 type"), lang, vp, { citizen: key });
  await tryClick(page, page.locator("button", { hasText: /Garbage|குப்பை/ }));
  await page.waitForTimeout(1500);
  await record(o, L("step 3 sub types"), lang, vp, { citizen: key });
  await tryClick(page, page.locator("button", { hasText: /Overflowing of Garbage Bin|குப்பைத் தொட்டி/ }));
  if (await tryClick(page, page.locator("button", { hasText: /Next: Details|அடுத்து: விவரங்கள்/ }))) {
    await page.waitForTimeout(2500);
    await page.locator("textarea").first().fill("The garbage bin has been overflowing for five days and waste is spilling on the road.").catch(() => {});
    await page.locator('input[type="file"]').first().setInputFiles(path.join(EV, "citizen-photo-fixture.jpg")).catch(() => {});
    await page.waitForTimeout(2000);
    await record(o, L("step 4 details with photo"), lang, vp, { citizen: key });
  } else skip(o, L("step 4"), lang, vp, "Next: Details not found");
  // (not submitted here: journey C files the complaint)
  await o.ctx.close();
}

for (const lang of ["en", "ta"]) for (const vp of [1440, 360]) {
  try {
    if (who === "collector") await collector(lang, vp);
    else if (who === "officer") for (const key of ["officerA", "officerB", "officerC"]) await officer(lang, vp, key);
    else if (who === "citizen") for (const key of ["citizenA", "citizenB"]) await citizen(lang, vp, key);
  } catch (e) { rows.push({ page: `${who} overlays`, role: who, lang, vp, skipped: "script error: " + e.message.split("\n")[0].slice(0, 120), axe: {}, axeRules: [], console: [], http: [], failed: [] }); console.log("ERROR", lang, vp, e.message.split("\n")[0]); }
  fs.writeFileSync(path.join(EV, `overlays-${who}.json`), JSON.stringify({ when: new Date().toISOString(), rows }, null, 1));
}
await br.close();
const bad = rows.filter((r) => r.console?.length || r.failed?.length || r.sideways || (r.axe?.critical || 0) + (r.axe?.serious || 0));
console.log("overlay rows", rows.length, "skipped", rows.filter((r) => r.skipped).length, "with problems", bad.length);
