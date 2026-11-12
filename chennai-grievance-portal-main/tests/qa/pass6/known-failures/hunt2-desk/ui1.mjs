import { createRequire } from "node:module";
import path from "node:path";
import { signIn } from "../../lib/live.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const B = "http://127.0.0.1:3106", P = 3106;
const EV = path.resolve("..", "docs", "qa", "pass6", "evidence", "hunt2-desk");
const out = {};
const browser = await chromium.launch();
async function ctxFor(role, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 780 : 820 }, baseURL: B, isMobile: width < 500 });
  if (role) { const cookie = await signIn(P, role); await ctx.addCookies(cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: B }; })); }
  return ctx;
}
// 1. the petitioner on a phone: Tamil digits typed into the last-4 box, then ASCII
{
  const ctx = await ctxFor(null, 360); const page = await ctx.newPage();
  const errs = []; page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 150)); });
  await page.goto("/track?code=2026-766XJA", { waitUntil: "networkidle" });
  const inputs = page.locator("input");
  out.codePrefilled = await inputs.nth(0).inputValue();
  await inputs.nth(1).pressSequentially("௩௫௫௬");
  out.tamilLast4Value = await inputs.nth(1).inputValue();
  await inputs.nth(1).fill(""); await inputs.nth(1).pressSequentially("3556");
  await page.locator("form button").first().click(); await page.waitForTimeout(2000);
  out.trackText = (await page.locator("main").innerText()).slice(0, 700);
  out.hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  out.errs = errs;
  await page.screenshot({ path: path.join(EV, "track-360.png"), fullPage: true });
  await ctx.close();
}
// 2. the desk on a phone
{
  const ctx = await ctxFor("manu", 360); const page = await ctx.newPage();
  const errs = []; page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 150)); }); page.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 150)));
  await page.goto("/officer", { waitUntil: "networkidle", timeout: 90000 }); await page.waitForTimeout(1500);
  out.deskUrl = new URL(page.url()).pathname;
  out.deskHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  out.deskWide = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 2 && getComputedStyle(e).position !== "fixed").slice(0, 6).map((e) => e.tagName + "." + String(e.className).slice(0, 40) + " r=" + Math.round(e.getBoundingClientRect().right)));
  out.deskText = (await page.locator("body").innerText()).slice(0, 900);
  out.deskErrs = errs;
  await page.screenshot({ path: path.join(EV, "desk-360.png"), fullPage: false });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
