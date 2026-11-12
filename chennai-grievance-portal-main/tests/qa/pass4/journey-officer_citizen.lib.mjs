import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
export const base = "http://localhost:3182", EV = "../docs/qa/pass4/evidence/journeys/";
export async function open(key, viewport) {
  const br = await chromium.launch({ args: ["--mute-audio"] });
  const ctx = await br.newContext({ viewport });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e));
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`); });
  const a = accounts().find((x) => x.key === key);
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"]', a.email);
  await page.fill('input[type="password"]', a.password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => ["/officer", "/citizen", "/collector"].some((p) => u.pathname.startsWith(p)), { timeout: 90000 }).catch(() => {}); await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(2000);
  return { br, ctx, page, errs };
}
export const shot = (page, n) => page.screenshot({ path: EV + n + ".png" });
export const text = async (page, n = 3000) => (await page.locator("body").innerText()).slice(0, n);

// With --frozen the server stamps a staff cookie to expire 12 h after 2026-11-06 12:00 IST, which the real browser clock
// (2026-11-07) already counts as past, so a staff sign-in through the form never sticks (see journey notes). So: sign in by
// API, then give the browser that same cookie with a day of life. Citizen cookies last 7 days and are not affected.
export async function openWithCookie(key, viewport, extraCtx = {}) {
  const a = accounts().find((x) => x.key === key);
  const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  const sc = (r.headers.getSetCookie?.() ?? [])[0];
  if (!sc) throw new Error("login " + r.status);
  const [nv] = sc.split(";"); const i = nv.indexOf("=");
  const br = await chromium.launch({ args: ["--mute-audio"] });
  const ctx = await br.newContext({ viewport, ...extraCtx });
  await ctx.addCookies([{ name: nv.slice(0, i), value: nv.slice(i + 1), url: base, expires: Math.floor(Date.now() / 1000) + 86400 }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e));
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`); });
  return { br, ctx, page, errs };
}

// Re-use a saved browser state (the login route allows 8 sign-ins per account per 15 minutes).
export async function openWithState(file, viewport, extraCtx = {}) {
  const br = await chromium.launch({ args: ["--mute-audio"] });
  const ctx = await br.newContext({ viewport, storageState: file, ...extraCtx });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e));
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`); });
  return { br, ctx, page, errs };
}
