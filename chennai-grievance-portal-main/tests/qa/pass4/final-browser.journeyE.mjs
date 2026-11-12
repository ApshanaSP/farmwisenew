// Final browser drive, journey E (Collector): Rain tabs, Ask District IQ with no model key, Jarvis typed questions in English, Tamil and Tanglish.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.journeyE.mjs [rain|ask|jarvis|all] [1440|360]
// Writes journeyE-<part>-<vp>.json and E-<part>-<vp>-*.png under docs/qa/pass4/evidence/final-browser/.
import fs from "node:fs";
import path from "node:path";
import { EV, launchBrowser, stateFor, openPage, goto, sideways } from "./final-browser.lib.mjs";

const part = process.argv[2] || "all", vp = Number(process.argv[3] || 1440);
const log = { part, vp, started: new Date().toISOString(), steps: [] };
const step = (name, data) => { log.steps.push({ name, ...data }); console.log("STEP", name, JSON.stringify(data).slice(0, 420)); };
const flat = (s) => (s || "").replace(/\n+/g, " | ");
const br = await launchBrowser();
const save = () => fs.writeFileSync(path.join(EV, `journeyE-${part}-${vp}.json`), JSON.stringify(log, null, 1));
const state = await stateFor("collector");

async function fresh(lang) {
  const o = await openPage(br, state, lang, vp);
  await goto(o.page, "/collector", 3500);
  return o;
}

// ---- Rain tabs, English and Tamil
async function rain() {
  for (const lang of ["en", "ta"]) {
    const { ctx, page, w } = await fresh(lang);
    const shot = (n) => page.screenshot({ path: path.join(EV, `E-rain-${lang}-${vp}-${n}.png`) });
    try {
      await page.locator("button", { hasText: /^Rain$|^மழை/ }).first().click();
      await page.waitForTimeout(4000);
      const tabs = await page.locator("[role=tablist] [role=tab]").evaluateAll((e) => e.map((x) => ({ label: x.innerText.replace(/\s+/g, " ").trim(), sel: x.getAttribute("aria-selected") })));
      const panelTabs = tabs.filter((t) => /^(Flooding|Traffic|Power|Metro|வெள்ளம்|போக்குவரத்து|மின்சாரம்|மெட்ரோ)/.test(t.label));
      step(`rain-open-${lang}`, { tabs: panelTabs, sideways: await sideways(page) });
      let i = 0;
      for (const t of panelTabs) {
        i++;
        const label = t.label.split(" ")[0];
        const rainTabs = page.locator("[role=tab]", { hasText: label }).filter({ hasNot: page.locator("xpath=self::*[contains(@class,'rail')]") });
        await rainTabs.last().click({ timeout: 5000 }).catch((e) => step(`rain-click-fail-${lang}`, { label, e: e.message.slice(0, 80) }));
        await page.waitForTimeout(5000);
        await shot(`${i}-${label.replace(/[^\w]/g, "")}`);
        const body = flat(await page.locator("body").innerText());
        const panel = body.split(/Rain ·|மழை ·/)[1] || body;
        step(`rain-tab-${lang}-${label}`, { text: panel.slice(0, 520), loading: /Reading|படிக்கிறது|Loading/.test(panel.slice(0, 700)), sideways: await sideways(page) });
      }
    } catch (e) { step(`rain-ERROR-${lang}`, { message: e.message.split("\n")[0] }); await shot("99-error").catch(() => {}); }
    step(`rain-watchers-${lang}`, { console: w.console, http: w.http, failed: w.failed.filter((f) => !/arcgisonline|ERR_ABORTED/.test(f)) });
    await ctx.close();
  }
}

// ---- Ask District IQ, no model key
async function ask() {
  const QS = [
    ["en", "Which zone needs attention now?"],
    ["en", "Why did the Chembarambakkam lake level rise this week?"],
    ["ta", "எந்த மண்டலத்திற்கு இப்போது கவனம் தேவை?"],
    ["ta", "இந்த வாரம் அடையாறில் ஏன் வெள்ளம் வந்தது?"],
    ["tanglish", "Entha zone ku ippo attention venum?"],
    ["tanglish", "Adyar la flood ku enna reason nu sollunga"],
  ];
  for (const [lang, q] of QS) {
    const { ctx, page, w } = await fresh(lang === "ta" ? "ta" : "en");
    const shot = (n) => page.screenshot({ path: path.join(EV, `E-ask-${lang}-${vp}-${n}.png`) });
    try {
      // the shortcut works in both languages (the button's Tamil name is not known to this script); the page must have hydrated first
      for (let i = 0; i < 8 && !(await page.locator("[role=dialog]").count()); i++) { await page.keyboard.press("Control+k"); await page.waitForTimeout(2500); }
      const dlg = page.locator("[role=dialog]").first();
      const before = flat(await dlg.innerText());
      const inp = dlg.locator("textarea, input[type=text], input:not([type]), [contenteditable=true], [role=textbox]").first();
      await inp.fill(q);
      await inp.press("Enter");
      let ans = "";
      for (let i = 0; i < 24; i++) { await page.waitForTimeout(1500); ans = flat(await dlg.innerText()); if (!/Thinking|Reading|சிந்தி|\.\.\.$/.test(ans.slice(-160)) && ans.length > before.length + 40) break; }
      await page.waitForTimeout(1500);
      ans = flat(await dlg.innerText());
      await shot(q.length > 0 ? `${QS.findIndex((x) => x[1] === q) + 1}`: "x");
      const tail = ans.slice(before.length > 0 ? Math.max(0, ans.indexOf(q.slice(0, 20))) : 0);
      step(`ask-${lang}`, { q, answer: tail.slice(0, 700), sideways: await sideways(page), console: w.console, http: w.http.filter((h) => !/_rsc/.test(h)) });
    } catch (e) { step(`ask-ERROR-${lang}`, { q, message: e.message.split("\n")[0] }); await shot(`err-${lang}`).catch(() => {}); }
    await ctx.close();
  }
}

// ---- Jarvis typed
async function jarvis() {
  const QS = [
    ["en", "how many severe incidents this week"],
    ["en", "show the overdue complaints for solid waste"],
    ["ta", "இந்த வாரம் எத்தனை தீவிர சம்பவங்கள் உள்ளன"],
    ["ta", "அடையாறு பகுதியில் மழை நிலவரம் என்ன"],
    ["tanglish", "indha vaaram evvalavu severe incidents irukku"],
    ["tanglish", "Adyar la maze nilavaram enna"],
  ];
  for (const [lang, q] of QS) {
    const { ctx, page, w } = await fresh(lang === "ta" ? "ta" : "en");
    const shot = (n) => page.screenshot({ path: path.join(EV, `E-jarvis-${lang}-${vp}-${n}.png`) });
    try {
      const answers = [];
      page.on("response", async (r) => { if (r.url().endsWith("/agent/round")) { try { const j = await r.json(); answers.push({ http: r.status(), lane: j.lane, kind: j.result?.kind ?? null, note: j.result?.note ?? null, recipe: j.result?.stage?.recipe ?? null, title: j.result?.stage?.title ?? null, say: j.result?.stage?.say?.en ?? j.result?.reply ?? null }); } catch { /* aborted */ } } });
      for (let i = 0; i < 20 && !(await page.locator(".hud-bar").count()); i++) {
        await page.waitForTimeout(1000);
        if (await page.locator(".hud-first button").count()) { await page.locator(".hud-first button").click(); continue; }
        await page.keyboard.press("Control+Shift+J"); await page.waitForTimeout(800);
      }
      await page.waitForSelector(".hud-bar", { timeout: 30000 });
      if (!(await page.locator(".hud-compose input").count())) await page.locator(".hud-btn", { hasText: /Type|தட்டச்சு/ }).first().click();
      await page.locator(".hud-compose input").fill(q);
      await page.keyboard.press("Enter");
      for (let i = 0; i < 40 && !answers.length; i++) await page.waitForTimeout(500);
      await page.waitForTimeout(4000);
      const said = await page.evaluate(() => document.querySelector(".hud-live")?.textContent?.trim().slice(0, 400) ?? "");
      const cards = await page.evaluate(() => [...document.querySelectorAll(".hud-cards *, .stage *")].map((x) => x.childElementCount === 0 ? x.textContent?.trim() : "").filter(Boolean).slice(0, 14).join(" | ").slice(0, 420));
      await shot(`${QS.findIndex((x) => x[1] === q) + 1}`);
      step(`jarvis-${lang}`, { q, round: answers.at(-1) ?? "(no round sent: answered by the page's own rules)", said, cards, sideways: await sideways(page), console: w.console, http: w.http });
    } catch (e) { step(`jarvis-ERROR-${lang}`, { q, message: e.message.split("\n")[0] }); await shot(`err-${lang}`).catch(() => {}); }
    await ctx.close();
  }
}
if (part === "rain" || part === "all") await rain();
save();
if (part === "ask" || part === "all") await ask();
save();
if (part === "jarvis" || part === "all") await jarvis();
save();
await br.close();
