// Final browser drive, part 1: every page as every role, English and Tamil, 1440 and 360 wide. For each: where it landed, console errors, failed requests,
// sideways scroll, axe (critical, serious, all), Tamil text present when asked for. Resumes from docs/qa/pass4/evidence/final-browser/pages.json.
//   node tests/qa/pass4/server.mjs start --port 3232 --ticking          (real clock: a --frozen staff cookie looks expired to the middleware)
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.pages.mjs [ONLY_ROLE]
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { BASE, EV, ROLES, launchBrowser, stateFor, openPage, goto, sideways, slug, now } from "./final-browser.lib.mjs";

const OUT = path.join(EV, "pages.json");
const done = fs.existsSync(OUT) && !process.env.FRESH ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { started: now(), rows: [] };
// REDO=<page name> drops that page's rows (and its tab rows) so they run again
if (process.env.REDO) done.rows = done.rows.filter((r) => !(r.page === process.env.REDO || r.page.startsWith(process.env.REDO + ":")) || (process.env.ONLY_ROLE_REDO && r.role !== process.env.ONLY_ROLE_REDO));
const have = new Set(done.rows.map((r) => r.key));
const only = process.argv[2] || null;
const OFFICERS = ["officerA", "officerB", "officerC"];
const isCit = (r) => r === "citizenA" || r === "citizenB";
// where each page may be seen: "ok" = the page itself, "login" = sent to sign-in, "citizen" = a signed-in citizen is sent home, "404" = not in production
const PAGES = [
  ["/login", "login", () => "ok"],
  ["/register", "register", (r) => (isCit(r) ? "citizen" : "ok")],
  ["/forgot-password", "forgot", (r) => (isCit(r) ? "citizen" : "ok")],
  ["/", "root", (r) => (r ? "home" : "login")],
  ["/citizen", "citizen", (r) => (isCit(r) ? "ok" : "login")],
  ["/citizen/file-complaint", "citizen-file", (r) => (isCit(r) ? "ok" : "login")],
  ["/citizen/track-complaints", "citizen-track", (r) => (isCit(r) ? "ok" : "login")],
  ["/officer", "officer", (r) => (OFFICERS.includes(r) ? "ok" : "login")],
  ["/collector", "collector", (r) => (r === "collector" ? "ok" : "login")],
  ["/profile", "profile", (r) => (r ? "ok" : "login")],
  ["/dev/ui", "dev-ui", () => "404"], ["/dev/collector", "dev-collector", () => "404"], ["/dev/officer", "dev-officer", () => "404"],
  ["/dev/assistant", "dev-assistant", () => "404"], ["/dev/rehearsal", "dev-rehearsal", () => "404"], ["/dev/thunai", "dev-thunai", () => "404"],
  ["/this-page-does-not-exist-xyz", "404", () => "404"],
];
const TAMIL = /[஀-௿]/g;

async function scan(page) {
  let r = await new AxeBuilder({ page }).analyze();
  if (r.violations.some((x) => x.impact === "critical" || x.impact === "serious")) { await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000); r = await new AxeBuilder({ page }).analyze(); }
  const by = {};
  const v = r.violations.map((x) => { by[x.impact || "none"] = (by[x.impact || "none"] || 0) + x.nodes.length; return { id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes.slice(0, 2).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message || n.all[0]?.message || "").slice(0, 100)) }; });
  return { by, v };
}
async function clickKey(page, k, officer) {
  // the period buttons (daily, weekly, ...) live on the Collector's Overview: go there first, so a click never lands on a tab that has none
  if (/^(daily|weekly|monthly|quarterly)$/.test(k) && !officer) { const o = page.locator('[data-key="overview"]').first(); if (await o.isVisible().catch(() => false)) { await o.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1500); } }
  const loc = page.locator(`[data-key="${k}"]`).first();
  if (!(await loc.isVisible().catch(() => false))) { await page.locator("button", { hasText: /^Menu$|மெனு/ }).first().click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(500); }
  await loc.click({ timeout: 5000 });
  await page.waitForTimeout(1800);
  if (officer && k !== "overview") await page.locator("table tbody tr, .oi-s").first().waitFor({ timeout: 12000 }).then(() => page.waitForTimeout(1500)).catch(() => {});
}

const br = await launchBrowser();
const jobs = [];
for (const role of ROLES) {
  if (only && only !== String(role)) continue;
  for (const [p, name, exp] of PAGES) for (const lang of ["en", "ta"]) for (const vp of [1440, 360]) jobs.push({ role, p, name, expect: exp(role), lang, vp });
}
let n = 0;
async function runJob(j) {
  const key = `${j.role}|${j.name}|${j.lang}|${j.vp}`;
  if (have.has(key)) return;
  const st = await stateFor(j.role);
  const { ctx, page, w } = await openPage(br, st, j.lang, j.vp);
  const rows = [];
  try {
    const resp = await goto(page, j.p, 2200);
    const url = new URL(page.url()).pathname + new URL(page.url()).search;
    const status = resp?.status?.() ?? null;
    let landed = "ok";
    if (status === 404) landed = "404";
    else if (/^\/login/.test(url) && !j.p.startsWith("/login")) landed = "login";
    else if (j.p === "/") landed = "home";
    else if (url === "/citizen" && j.p !== "/citizen") landed = "citizen";
    const targets = [{ label: j.name, k: null }];
    if (landed === "ok" && j.name === "collector") for (const k of await page.locator("[data-key]").evaluateAll((e) => [...new Set(e.map((x) => x.getAttribute("data-key")).filter(Boolean))])) if (k !== "overview") targets.push({ label: `collector:${k}`, k });
    if (landed === "ok" && j.name === "officer") {
      await page.locator("[data-key]").first().waitFor({ timeout: 30000 }).catch(() => {});
      for (const k of await page.locator("[data-key]").evaluateAll((e) => [...new Set(e.map((x) => x.getAttribute("data-key")).filter(Boolean))])) if (k !== "overview") targets.push({ label: `officer:${k}`, k });
    }
    for (const t of targets) {
      const mark = { console: w.console.length, http: w.http.length, failed: w.failed.length };
      let clickErr = null;
      if (t.k) { try { await clickKey(page, t.k, j.name === "officer"); } catch (e) { clickErr = e.message.split("\n")[0].slice(0, 120); } }
      const sw = await sideways(page);
      const text = await page.locator("body").innerText().catch(() => "");
      const ta = (text.match(TAMIL) || []).length, latin = (text.match(/[A-Za-z]/g) || []).length;
      const ax = await scan(page).catch((e) => ({ by: {}, v: [], err: e.message.slice(0, 100) }));
      const row = {
        key: t.k ? `${j.role}|${t.label}|${j.lang}|${j.vp}` : key, role: j.role, page: t.label, lang: j.lang, vp: j.vp, expect: j.expect, landed, url, status, clickErr,
        console: w.console.slice(mark.console), http: w.http.slice(mark.http), failed: w.failed.slice(mark.failed).filter((x) => !/ERR_ABORTED/.test(x)), aborted: w.failed.slice(mark.failed).filter((x) => /ERR_ABORTED/.test(x)).length,
        sideways: sw.over || sw.body ? sw : false, tamilChars: ta, latinChars: latin, htmlLang: await page.evaluate(() => document.documentElement.lang).catch(() => ""),
        axe: ax.by, axeRules: ax.v, axeErr: ax.err,
      };
      const bad = row.clickErr || row.console.length || row.failed.length || row.sideways || (ax.by.critical || 0) + (ax.by.serious || 0) || row.landed !== row.expect || (j.lang === "ta" && landed === "ok" && ta === 0 && text.length > 40);
      if (bad) { const f = `fail-${slug(row.key)}.png`; await page.screenshot({ path: path.join(EV, f) }).catch(() => {}); row.shot = f; }
      rows.push(row);
    }
  } catch (e) { rows.push({ key, role: j.role, page: j.name, lang: j.lang, vp: j.vp, expect: j.expect, error: e.message.slice(0, 200) }); }
  await ctx.close();
  for (const r of rows) { done.rows.push(r); have.add(r.key); }
  if (++n % 5 === 0) fs.writeFileSync(OUT, JSON.stringify(done));
}
const queue = [...jobs];
await Promise.all([0, 1].map(async () => { while (queue.length) await runJob(queue.shift()); }));
done.finished = now();
fs.writeFileSync(OUT, JSON.stringify(done));
await br.close();
const bad = done.rows.filter((r) => r.error || r.clickErr || r.console?.length || r.failed?.length || r.sideways || (r.axe?.critical || 0) + (r.axe?.serious || 0) || r.landed !== r.expect);
console.log("rows", done.rows.length, "problem rows", bad.length);
for (const r of bad.slice(0, 40)) console.log(r.key, r.error || r.clickErr || `landed ${r.landed}/${r.expect} console ${r.console?.length} failed ${r.failed?.length} sw ${!!r.sideways} axe ${JSON.stringify(r.axe)}`);
