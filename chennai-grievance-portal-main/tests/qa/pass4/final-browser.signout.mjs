// Final browser drive, journey S (second part): signing out through the account menu as every role, English 1440 and Tamil 360 (the first script's menu selector missed the staff menus).
// After sign-out: the page goes to sign-in, the cookie is gone, and the OLD cookie is replayed against the API (a stateless token may still work: reported as a fact, not judged).
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.signout.mjs
import fs from "node:fs";
import path from "node:path";
import { BASE, EV, launchBrowser, stateFor, openPage, goto } from "./final-browser.lib.mjs";

const log = { started: new Date().toISOString(), steps: [] };
const br = await launchBrowser();
const HOME = { collector: "/collector", officerA: "/officer", officerC: "/officer", citizenA: "/citizen" };
const API = { collector: "/api/collector/overview", officerA: "/api/officer/grievances?per=1", officerC: "/api/officer/grievances?per=1", citizenA: "/api/complaints" };
for (const [lang, vp] of [["en", 1440], ["ta", 360]]) for (const key of Object.keys(HOME).filter((k) => !process.env.ONLY || process.env.ONLY === k)) {
  const st = await stateFor(key);
  const old = st.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const { ctx, page } = await openPage(br, st, lang, vp);
  const row = { lang, vp, key };
  try {
    await goto(page, HOME[key], 3500);
    const trig = key.startsWith("citizen") ? page.locator("button[aria-haspopup=menu]").first() : page.locator("button:has(.avatar)").first();
    await trig.click({ timeout: 8000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(EV, `S-out-${lang}-${vp}-${key}-menu.png`) });
    const item = page.locator('.pop-i:has-text("Sign out"), .pop-i:has-text("வெளியேறு"), [role=menuitem]:has-text("Sign out"), [role=menuitem]:has-text("வெளியேறு")').first();
    row.itemText = (await item.innerText({ timeout: 4000 }).catch(() => "")).replace(/\s+/g, " ").slice(0, 60);
    await item.click({ timeout: 5000 });
    await page.waitForURL((u) => /^\/login/.test(u.pathname) || u.pathname === "/", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    row.after = new URL(page.url()).pathname;
    await page.goto(BASE + HOME[key], { waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(1500);
    row.reopen = new URL(page.url()).pathname + new URL(page.url()).search;
    row.cookiesLeft = (await ctx.cookies()).filter((c) => /dcd_session/.test(c.name) && c.value).length;
    const r = await fetch(BASE + API[key], { headers: { cookie: old } });
    row.oldCookieReplay = r.status;
    await page.screenshot({ path: path.join(EV, `S-out-${lang}-${vp}-${key}-after.png`) });
  } catch (e) { row.error = e.message.split("\n")[0].slice(0, 160); await page.screenshot({ path: path.join(EV, `S-out-${lang}-${vp}-${key}-error.png`) }).catch(() => {}); }
  console.log(JSON.stringify(row)); log.steps.push(row);
  await ctx.close();
  stateFor(key, { fresh: true }).catch(() => {});
}
fs.writeFileSync(path.join(EV, process.env.ONLY ? `journeyS-signout-${process.env.ONLY}.json` : "journeyS-signout.json"), JSON.stringify(log, null, 1));
await br.close();
