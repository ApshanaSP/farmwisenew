// Final browser drive (12 Nov 2026), shared helpers: one sign-in per role through the API, cookie kept with a long life (the --frozen --ticking server stamps staff cookies
// to expire on 6 Nov by its own clock, which the real browser clock counts as past), then every page opened from that saved state.
// Passwords are read from the gitignored file and never printed. Browsers are always launched with --mute-audio.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
import { APP_ROOT } from "./lib/env.mjs";

export const PORT = process.env.PORT || 3232;
// the app's own redirects point at http://localhost:PORT (the launcher starts next with -H 127.0.0.1), so the browser uses localhost too, or the cookie would not follow the redirect
export const BASE = `http://localhost:${PORT}`;
export const EV = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "final-browser");
export const STATE_DIR = process.env.STATE_DIR || path.join(APP_ROOT, "data", "aws-cache", "qa", "srv", "final-browser");
fs.mkdirSync(EV, { recursive: true }); fs.mkdirSync(STATE_DIR, { recursive: true });
export const ROLES = ["collector", "officerA", "officerB", "officerC", "citizenA", "citizenB", null];
export const VIEWPORTS = { 1440: { width: 1440, height: 900 }, 360: { width: 360, height: 740 } };
export const launchBrowser = () => chromium.launch({ args: ["--mute-audio"] });

/** Signs in each role once through the API and saves a storage state whose cookie lives a day. Re-uses a saved state file. */
const memo = new Map();
export async function stateFor(key, { fresh = false } = {}) {
  if (key && memo.has(key) && !fresh) return memo.get(key);
  const st = await stateFor0(key, { fresh });
  if (key) memo.set(key, st);
  return st;
}
async function stateFor0(key, { fresh = false } = {}) {
  if (!key) return undefined;
  const f = path.join(STATE_DIR, `${key}.state.json`);
  if (!fresh && !process.env.FRESH_STATE && fs.existsSync(f)) { const s = JSON.parse(fs.readFileSync(f, "utf8")); if (s.cookies?.length && s.cookies.every((c) => c.domain === new URL(BASE).hostname)) return s; }
  const a = accounts().find((x) => x.key === key);
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  if (r.status !== 200) throw new Error(`sign in ${key} ${r.status}`);
  const cookies = (r.headers.getSetCookie?.() ?? []).map((sc) => { const [nv] = sc.split(";"); const i = nv.indexOf("="); return { name: nv.slice(0, i), value: nv.slice(i + 1), url: BASE, expires: Math.floor(Date.now() / 1000) + 86400 }; });
  const br = await launchBrowser(); const ctx = await br.newContext(); await ctx.addCookies(cookies);
  const st = await ctx.storageState(); await br.close();
  fs.writeFileSync(f, JSON.stringify(st));
  return st;
}

/** A page with its watchers: console errors, page errors, HTTP >= 400, failed requests. */
export async function openPage(br, state, lang, vp, { theme = "light", extra = {} } = {}) {
  const ctx = await br.newContext({ viewport: VIEWPORTS[vp] || vp, storageState: state, ...extra });
  await ctx.addInitScript(([l, t]) => { try { localStorage.setItem("diq-lang", l); localStorage.setItem("diq-theme", t); localStorage.setItem("thunai-greeted", new Date().toDateString()); } catch { /* none */ } }, [lang, theme]);
  const page = await ctx.newPage();
  const w = { console: [], http: [], failed: [] };
  page.on("console", (m) => { if (m.type() === "error") w.console.push(m.text().slice(0, 220)); });
  page.on("pageerror", (e) => w.console.push("PAGEERROR " + String(e).slice(0, 220)));
  page.on("response", (r) => { if (r.status() >= 400) w.http.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "").slice(0, 110)}`); });
  page.on("requestfailed", (r) => { const u = r.url(); if (u.startsWith(BASE) || u.startsWith("http")) w.failed.push(`${r.failure()?.errorText} ${u.replace(BASE, "").slice(0, 110)}`); });
  return { ctx, page, w };
}
export async function goto(page, p, wait = 1800) { const r = await page.goto(BASE + p, { waitUntil: "load", timeout: 60000 }).catch((e) => ({ err: e.message })); await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(wait); return r; }
export const sideways = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, body: document.body.scrollWidth > document.documentElement.clientWidth + 1 }));
export const slug = (s) => s.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
export const now = () => new Date().toISOString();
