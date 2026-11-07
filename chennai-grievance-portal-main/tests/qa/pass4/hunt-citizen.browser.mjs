// hunt-citizen browser pass: citizen pages, console errors, tracking page. node tests/qa/pass4/hunt-citizen.browser.mjs [port]
import { chromium } from "playwright";
import { login } from "./lib/access-lib.mjs";
import fs from "node:fs";
const port = process.argv[2] || 3175, base = `http://127.0.0.1:${port}`;
const br = await chromium.launch({ args: ["--mute-audio"] });
const A = await login(base, "citizenA");
const ctx = await br.newContext({ viewport: { width: 390, height: 800 } });
await ctx.addCookies(A.cookie.split("; ").map((c) => { const [n, ...v] = c.split("="); return { name: n, value: v.join("="), url: base }; }));
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
const out = {};
for (const p of ["/citizen", "/citizen/track-complaints", "/citizen/file-complaint", "/profile", "/register", "/forgot-password", "/login"]) {
  errs.length = 0;
  const ctxUse = ["/register", "/forgot-password", "/login"].includes(p) ? await br.newContext() : ctx;
  const pg = ctxUse === ctx ? page : await ctxUse.newPage();
  if (pg !== page) { pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); }); pg.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); }); }
  await pg.goto(base + p, { waitUntil: "networkidle", timeout: 30000 }).catch((e) => errs.push("NAV " + e.message));
  const txt = (await pg.locator("body").innerText()).slice(0, 700);
  out[p] = { errs: [...errs], txt };
  await pg.screenshot({ path: `../docs/qa/pass4/evidence/hunt-citizen-${p.replace(/\//g, "_")}.png` });
  console.log(p, JSON.stringify(errs), "\n", txt.replace(/\n+/g, " | ").slice(0, 400));
}
fs.writeFileSync("../docs/qa/pass4/evidence/hunt-citizen.browser.json", JSON.stringify(out, null, 1));
await br.close();
