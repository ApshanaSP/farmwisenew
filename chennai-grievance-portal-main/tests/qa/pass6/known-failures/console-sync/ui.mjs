// QA pass 6, console-sync: the Collector console in a headless browser, English then Tamil: the KPI tiles' labels and
// numbers, the severity card, the snapshot, and the API requests the page makes. Read-only.
//   node tests/qa/pass6/probes/console-sync/ui.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { base, signIn } from "../../lib/live.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const PORT = 3106, B = base(PORT);
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..", "docs", "qa", "pass6", "evidence", "console-sync");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: B, timezoneId: process.env.TZID || "Asia/Kolkata" });
const cookie = await signIn(PORT, "collector");
await ctx.addCookies(cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: B }; }));
const page = await ctx.newPage();
const reqs = [];
page.on("request", (r) => { if (r.url().includes("/api/")) reqs.push(`${r.method()} ${r.url().replace(B, "")}`); });

const grab = async () => page.evaluate(() => {
  const txt = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.replace(/\s+/g, " ").trim());
  return { kpis: txt(".kpis > *"), snap: txt(".hsnap .snap > *"), att: txt(".att-one, .att-sw button, .att-tabs button").slice(0, 8), unloc: txt(".unloc"), title: document.title };
});

await page.goto("/collector", { waitUntil: "networkidle", timeout: 90_000 });
await page.waitForTimeout(2000);
const en = await grab();
await page.screenshot({ path: path.join(OUT, `ui-en-${process.env.TZID ? "tz" : "ist"}.png`) });
await page.evaluate(() => { localStorage.setItem("diq-lang", "ta"); });
await page.reload({ waitUntil: "networkidle", timeout: 90_000 });
await page.waitForTimeout(3000);
const ta = await grab();
await page.screenshot({ path: path.join(OUT, `ui-ta-${process.env.TZID ? "tz" : "ist"}.png`) });
await page.evaluate(() => { localStorage.setItem("diq-lang", "en"); });
console.log(JSON.stringify({ tz: process.env.TZID || "Asia/Kolkata", en, ta, requests: [...new Set(reqs)] }, null, 1));
await browser.close();
