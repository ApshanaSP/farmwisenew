import { createRequire } from "node:module";
import path from "node:path";
import { signIn } from "../../lib/live.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const B = "http://127.0.0.1:3106", P = 3106;
const EV = path.resolve("..", "docs", "qa", "pass6", "evidence", "hunt2-desk");
const out = [];
const browser = await chromium.launch();
for (const width of [360, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, baseURL: B, isMobile: width < 500 });
  const cookie = await signIn(P, "citizenB"); await ctx.addCookies(cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: B }; }));
  for (const url of ["/citizen/track-complaints", "/citizen/file-complaint"]) {
    const page = await ctx.newPage();
    const errs = []; page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 150)); }); page.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 150)));
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 }); await page.waitForTimeout(1200);
    const r = { width, url, final: new URL(page.url()).pathname, hScroll: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), errs };
    r.wide = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 2 && getComputedStyle(e).position !== "fixed" && e.getBoundingClientRect().width > 0).slice(0, 5).map((e) => e.tagName + "." + String(e.className).slice(0, 50) + " r=" + Math.round(e.getBoundingClientRect().right)));
    if (url.includes("track")) {
      r.text = (await page.locator("main").innerText().catch(() => page.locator("body").innerText())).slice(0, 600);
      const btn = page.getByText("2026-482UHM").first();
      if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(1500); r.detail = (await page.locator("body").innerText()).slice(0, 1200); }
    }
    await page.screenshot({ path: path.join(EV, `citizen${url.replace(/\//g, "_")}-${width}.png`), fullPage: true });
    out.push(r); await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
