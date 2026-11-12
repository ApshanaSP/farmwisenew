// Collector storm day: cyclone banner, Rain, Act on the severe item, Briefing. node tests/qa/pass4/journey-collector-storm.browser.mjs [port]
import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
import fs from "node:fs";
const port = process.argv[2] || 3181, base = `http://127.0.0.1:${port}`;
const dir = "../docs/qa/pass4/evidence/journeys/collector";
const br = await chromium.launch({ args: ["--mute-audio"] });
const col = accounts().find((a) => a.key === "collector");
const boot = await br.newContext();
const lr = await boot.request.post(`${base}/api/auth/login`, { data: { email: col.email, password: col.password } });
if (lr.status() !== 200) throw new Error("sign in " + lr.status());
const state = await boot.storageState(); await boot.close();
const out = [];
for (const lang of ["en", "ta"]) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
  await ctx.addInitScript((l) => { try { localStorage.setItem("diq-lang", l); } catch {} }, lang);
  const page = await ctx.newPage(); const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
  await page.goto(base + "/collector", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  const step = async (name, fn) => {
    const t0 = Date.now(); let note = "ok";
    try { await fn(); await page.waitForTimeout(2500); } catch (e) { note = "FAIL " + e.message.slice(0, 120); }
    await page.screenshot({ path: `${dir}/storm-${lang}-${name}.png` });
    fs.writeFileSync(`${dir}/storm-${lang}-${name}.txt`, await page.locator("body").innerText());
    out.push({ lang, name, ms: Date.now() - t0, note });
  };
  await step("1-home", async () => {});
  await step("2-banner", async () => { await page.locator("button", { hasText: /cyclone|சூறாவளி|murasu/i }).first().click({ timeout: 5000 }); });
  await step("3-rain", async () => { await page.keyboard.press("Escape"); await page.locator("button", { hasText: /^\s*(Rain|மழை)/ }).first().click({ timeout: 5000 }); });
  await step("4-act", async () => { await page.locator("button", { hasText: /^\s*(Act|செயல்படு)/ }).first().click({ timeout: 5000 }); });
  await step("5-briefing", async () => { await page.keyboard.press("Escape"); await page.locator("a, button", { hasText: /Briefing|சுருக்கம்/ }).first().click({ timeout: 5000 }); });
  out.push({ lang, errs });
  await ctx.close();
}
fs.writeFileSync(`${dir}/storm-run.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await br.close();
