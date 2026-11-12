// Collector journey: a real user's morning, English then Tamil, then a storm day. node tests/qa/pass4/journey-collector.browser.mjs [port]
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
const log = [];
for (const lang of ["en", "ta"]) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
  await ctx.addInitScript((l) => { try { localStorage.setItem("diq-lang", l); } catch {} }, lang);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
  await page.goto(base + "/collector", { waitUntil: "networkidle", timeout: 45000 }).catch((e) => errs.push("NAV " + e.message));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/${lang}-01-home.png` });
  const txt = await page.locator("body").innerText();
  fs.writeFileSync(`${dir}/${lang}-01-home.txt`, txt);
  // click each visible nav-like button/tab in turn
  const labels = await page.locator("nav button, nav a, [role=tab], aside button").evaluateAll((els) => els.map((e) => (e.innerText || e.getAttribute("aria-label") || "").trim()).filter(Boolean).slice(0, 14));
  log.push({ lang, labels, errsHome: [...errs] });
  let i = 2;
  for (const l of [...new Set(labels)].slice(0, 10)) {
    try {
      await page.locator("nav button, nav a, [role=tab], aside button").filter({ hasText: l }).first().click({ timeout: 4000 });
      await page.waitForTimeout(2500);
      const f = `${lang}-${String(i).padStart(2, "0")}-${l.replace(/[^\w஀-௿]+/g, "_").slice(0, 20)}`;
      await page.screenshot({ path: `${dir}/${f}.png` });
      fs.writeFileSync(`${dir}/${f}.txt`, await page.locator("body").innerText());
      i++;
    } catch (e) { log.push({ lang, click: l, fail: e.message.slice(0, 100) }); }
  }
  log.push({ lang, errsAll: [...errs] });
  await ctx.close();
}
fs.writeFileSync(`${dir}/run.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
await br.close();
