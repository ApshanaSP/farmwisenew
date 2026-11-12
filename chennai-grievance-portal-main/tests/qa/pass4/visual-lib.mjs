// Shared by axe.mjs, keys.mjs and screens.mjs: signed-in contexts per role, language and theme.
import { chromium } from "playwright";
import { SignJWT } from "jose";
import { accounts } from "../seed-local-users.mjs";
export const PAGES = [
  ["citizen", "/citizen", "citizenA"], ["citizen-file", "/citizen/file-complaint", "citizenA"], ["citizen-track", "/citizen/track-complaints", "citizenA"],
  ["officer", "/officer", "officerA"], ["collector", "/collector", "collector"],
  ["login", "/login", null], ["register", "/register", null], ["forgot", "/forgot-password", null], ["profile", "/profile", "citizenA"],
];
/**
 * A server on the frozen clock (server.mjs --frozen) dates the 12 h sign-in token from 6 Nov 2026, and the middleware checks it with the real clock, so once the
 * real date is past the evening of 6 Nov every page redirects to /login (the API routes still answer). A run that wants its browsers signed in after that starts
 * its server with `--env JWT_SECRET=<a made-up key>` and sets QA_JWT_SECRET to the same key: the session is then signed again with a 30 day life and the same claims.
 * Without QA_JWT_SECRET nothing changes. The clock stays frozen, only the token lives longer. audit-ui_honesty.test.ts does the same for its own server.
 */
async function longLife(state) {
  const secret = process.env.QA_JWT_SECRET;
  if (!secret) return state;
  for (const c of state.cookies) {
    if (!/^dcd_session_/.test(c.name)) continue;
    const { exp: _e, iat: _i, ...claims } = JSON.parse(Buffer.from(c.value.split(".")[1], "base64url").toString("utf8"));
    c.value = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(new TextEncoder().encode(secret));
    c.expires = Math.floor(Date.now() / 1000) + 30 * 86400;
  }
  return state;
}
export async function launch(port) {
  const base = `http://127.0.0.1:${port}`; const br = await chromium.launch({ args: ["--mute-audio"] });
  const acc = accounts(); const states = { null: undefined };
  for (const key of ["citizenA", "officerA", "collector"]) {
    const a = acc.find((x) => x.key === key); const c = await br.newContext();
    const r = await c.request.post(`${base}/api/auth/login`, { data: { email: a.email, password: a.password } });
    if (r.status() !== 200) throw new Error(`sign in ${key} ${r.status()}`);
    states[key] = await longLife(await c.storageState()); await c.close();
  }
  return { br, base, states };
}
export async function open(L, who, lang, theme, vp) {
  const ctx = await L.br.newContext({ viewport: vp, storageState: L.states[who] });
  await ctx.addInitScript(([l, t]) => { try { localStorage.setItem("diq-lang", l); localStorage.setItem("diq-theme", t); } catch {} }, [lang, theme]);
  const page = await ctx.newPage(); const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
  return { ctx, page, errs };
}
export async function go(L, page, p) { await page.goto(L.base + p, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {}); await page.waitForTimeout(1500); }
export async function tabs(page) { return page.locator("[role=tab], nav.rail button[data-key]").evaluateAll((e) => e.map((x) => (x.getAttribute("data-key") || x.innerText || "").trim()).filter(Boolean)); }
