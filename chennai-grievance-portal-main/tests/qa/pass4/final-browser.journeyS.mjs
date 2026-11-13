// Final browser drive, journey S: signing in through the form as every role (English at 1440, Tamil at 360), a wrong password, and signing out.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.journeyS.mjs
// Passwords are read from the gitignored file and are never printed or saved. The login route allows 8 sign-ins an address in 15 minutes, so this is one sign-in per role and language.
import fs from "node:fs";
import path from "node:path";
import { accounts } from "../seed-local-users.mjs";
import { EV, BASE, launchBrowser, openPage, goto } from "./final-browser.lib.mjs";

const log = { started: new Date().toISOString(), steps: [] };
const step = (name, data) => { log.steps.push({ name, ...data }); console.log("STEP", name, JSON.stringify(data).slice(0, 360)); };
const flat = (s) => (s || "").replace(/\n+/g, " | ");
const br = await launchBrowser();
const HOME = { collector: "/collector", officerA: "/officer", officerB: "/officer", officerC: "/officer", citizenA: "/citizen", citizenB: "/citizen" };
for (const [lang, vp] of [["en", 1440], ["ta", 360]]) {
  for (const key of Object.keys(HOME)) {
    const a = accounts().find((x) => x.key === key);
    const { ctx, page, w } = await openPage(br, undefined, lang, vp);
    const shot = (n) => page.screenshot({ path: path.join(EV, `S-${lang}-${vp}-${key}-${n}.png`) });
    try {
      await goto(page, "/login", 2500);
      if (key === "citizenB" && lang === "en") {
        // a wrong password first: the message must be plain and not say which half was wrong
        await page.locator('input[type="email"], input[name="email"]').first().fill(a.email);
        await page.locator('input[type="password"]').first().fill("not-the-password-1");
        await page.locator("button", { hasText: /Sign in|உள்நுழை/ }).first().click();
        await page.waitForTimeout(3000);
        await shot("wrong");
        step("wrong-password", { who: key, url: new URL(page.url()).pathname, text: flat(await page.locator("[role=alert], .error, [class*=error]").allInnerTexts().then((x) => x.join(" "))).slice(0, 200) });
      }
      await page.locator('input[type="email"], input[name="email"]').first().fill(a.email);
      await page.locator('input[type="password"]').first().fill(a.password);
      await page.locator("button", { hasText: /Sign in|உள்நுழை/ }).first().click();
      await page.waitForURL((u) => u.pathname.startsWith(HOME[key]), { timeout: 60000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3500);
      await shot("home");
      const url = new URL(page.url()).pathname;
      step(`signin-${lang}-${vp}`, { who: key, landed: url, ok: url.startsWith(HOME[key]), title: flat(await page.locator("h1, h2").first().innerText().catch(() => "")).slice(0, 80), console: w.console, http: w.http.filter((h) => !/^401 POST \/api\/auth\/login/.test(h)), failed: w.failed.filter((f) => !/ERR_ABORTED|arcgisonline/.test(f)) });
      // sign out through the account menu
      const menu = page.locator("button[aria-label*='account menu' i], button[aria-label*='Account menu' i], button[aria-label*='கணக்கு']").first();
      await menu.click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.locator("button, a, [role=menuitem]", { hasText: /Sign out|Log out|வெளியேறு/ }).first().click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const after = new URL(page.url()).pathname;
      await page.goto(BASE + HOME[key], { waitUntil: "load" }).catch(() => {});
      await page.waitForTimeout(1500);
      step(`signout-${lang}-${vp}`, { who: key, after, backToHome: new URL(page.url()).pathname + new URL(page.url()).search });
    } catch (e) { step(`signin-ERROR-${lang}`, { who: key, message: e.message.split("\n")[0] }); await shot("99-error").catch(() => {}); }
    await ctx.close();
  }
}
fs.writeFileSync(path.join(EV, "journeyS.json"), JSON.stringify(log, null, 1));
await br.close();
