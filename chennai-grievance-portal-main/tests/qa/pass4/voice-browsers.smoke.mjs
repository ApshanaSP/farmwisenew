// node tests/qa/pass4/voice-browsers.smoke.mjs [baseUrl]  -- smoke each page on 4 engines; screenshots + console errors -> evidence/browsers.json
import { chromium, firefox, webkit } from "@playwright/test";
import fs from "fs";
import { loginAll } from "./lib/access-lib.mjs";
const cookies = await loginAll(process.argv[2] ?? "http://127.0.0.1:3187", ["citizenA", "officerA", "collector"]);
const parse = (c) => c.split("; ").filter(Boolean).map((kv) => { const i = kv.indexOf("="); return { name: kv.slice(0, i), value: kv.slice(i + 1), url: base }; });
const plan = [["anonymous", "/login"], ["anonymous", "/register"], ["anonymous", "/collector"], ["citizenA", "/citizen"], ["citizenA", "/citizen/track-complaints"], ["citizenA", "/citizen/file-complaint"], ["officerA", "/officer"], ["collector", "/collector"]];
const base = process.argv[2] ?? "http://127.0.0.1:3187";
const engines = [["chromium", chromium, {}], ["msedge", chromium, { channel: "msedge" }], ["firefox", firefox, {}], ["webkit", webkit, {}]];
const out = [];
for (const [name, type, opt] of engines) {
  let b;
  try { b = await type.launch({ ...opt, args: name === "firefox" || name === "webkit" ? [] : ["--mute-audio"] }); }
  catch (e) { out.push({ engine: name, launchError: String(e).split("\n")[0] }); continue; }
  for (const [who, p] of plan) {
    const ctx = await b.newContext({ baseURL: base }); if (cookies[who]) await ctx.addCookies(parse(cookies[who]));
    const page = await ctx.newPage(); const errs = [], bad = [];
    page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
    page.on("pageerror", e => errs.push("pageerror: " + String(e).slice(0, 300)));
    page.on("response", r => { if (r.status() >= 500) bad.push(r.status() + " " + r.url()); });
    let status = null, finalUrl = null, title = null, textLen = 0, err = null;
    try { const r = await page.goto(p, { waitUntil: "networkidle", timeout: 30000 }); status = r?.status(); finalUrl = page.url().replace(base, ""); title = await page.title(); textLen = (await page.innerText("body")).length; }
    catch (e) { err = String(e).split("\n")[0]; }
    const shot = `docs/qa/pass4/evidence/browsers/${name}-${who}${p.replace(/\//g, "_")}.png`;
    await page.screenshot({ path: shot }).catch(() => {});
    out.push({ engine: name, as: who, page: p, status, finalUrl, title, textLen, consoleErrors: errs, serverErrors: bad, navError: err, shot });
    await ctx.close();
  }
  await b.close();
}
fs.writeFileSync("docs/qa/pass4/evidence/browsers.json", JSON.stringify(out, null, 1));
for (const r of out) console.log(r.engine, r.as ?? "", r.page ?? "", r.status ?? "", r.finalUrl ?? "", r.textLen ?? "", (r.consoleErrors?.length ?? 0) + " console", r.navError ?? r.launchError ?? "");
