// QA pass 6, hunter `journeys`: shared helpers for the three browser journeys on the production server.
// Never prints a password, cookie or token. Screenshots go to docs/qa/pass6/evidence/journeys/, page text to the scratchpad dir given in JOURNEYS_OUT.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { base, signIn, call } from "../../lib/live.mjs";

const require = createRequire(import.meta.url);
export const { chromium } = require("@playwright/test");
export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
export const SHOTS = path.resolve(APP, "..", "docs", "qa", "pass6", "evidence", "journeys");
export const OUT = process.env.JOURNEYS_OUT || path.join(SHOTS, "..", "..", "..", "..", "..", "tmp-journeys");
export const PORT = 3106;
export const B = base(PORT);
export const LOG = path.join(APP, "data", "aws-cache", "qa", "run", `srv-${PORT}.log`);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
export { call, signIn };

/** byte offset of the server log now */
export const logMark = () => { try { return fs.statSync(LOG).size; } catch { return 0; } };
/** new server-log lines since a mark: error-like lines only, tokens and e-mails masked, cut short */
export function logSince(mark) {
  let txt = "";
  try { const fd = fs.openSync(LOG, "r"); const size = fs.statSync(LOG).size; const buf = Buffer.alloc(Math.max(0, size - mark)); fs.readSync(fd, buf, 0, buf.length, mark); fs.closeSync(fd); txt = buf.toString("utf8"); } catch { return { all: 0, errors: [] }; }
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const errors = lines.filter((l) => /error|exception|fail|unhandled|warn|⨯|TypeError|ReferenceError|\b5\d\d\b/i.test(l))
    .map((l) => l.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>").replace(/\b[A-Za-z0-9_-]{32,}\b/g, "<long>").replace(/\b[6-9]\d{9}\b/g, "<mobile>").slice(0, 260));
  return { all: lines.length, errors };
}

export async function launch() { return chromium.launch(); }

export async function ctxFor(browser, role, width, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 780 : 820 }, baseURL: B, ...extra });
  if (role) {
    const cookie = await signIn(PORT, role);
    await ctx.addCookies(cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: B }; }));
  }
  return ctx;
}

/** console errors, page errors, failed requests and 4xx/5xx responses of a page, each with the step it happened in */
export function watch(page, rec) {
  rec.problems ??= [];
  const step = () => rec.step ?? "?";
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") rec.problems.push({ step: step(), kind: `console.${m.type()}`, text: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => rec.problems.push({ step: step(), kind: "pageerror", text: String(e.message).slice(0, 300) }));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/\/_next\/static\/|favicon|tile|openstreetmap|arcgis|carto/i.test(u)) rec.problems.push({ step: step(), kind: "requestfailed", text: `${r.method()} ${u.replace(B, "")} ${r.failure()?.errorText ?? ""}`.slice(0, 300) }); });
  page.on("response", (r) => { if (r.status() >= 400) rec.problems.push({ step: step(), kind: `http${r.status()}`, text: `${r.request().method()} ${r.url().replace(B, "").slice(0, 200)}` }); });
}

let n = 0;
export async function shot(page, name, opts = {}) {
  const file = path.join(SHOTS, `${String(++n).padStart(2, "0")}-${name}.png`);
  try { await page.screenshot({ path: file, ...opts }); } catch (e) { return `shot failed: ${e.message.slice(0, 80)}`; }
  return path.basename(file);
}
export function setShotPrefix(p) { n = p; }

/** visible text of a selector (first match), or "" */
export async function textOf(page, sel) { try { return (await page.locator(sel).first().innerText({ timeout: 3000 })).slice(0, 6000); } catch { return ""; } }

export function save(name, obj) { fs.writeFileSync(path.join(OUT, name), typeof obj === "string" ? obj : JSON.stringify(obj, null, 1)); }

/** layout checks: horizontal scroll, elements wider than the viewport, untranslated (Latin) text when in Tamil */
export async function layout(page) {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > W + 2 && getComputedStyle(el).position !== "fixed" && !el.closest("[style*='overflow'], .leaflet-container")) {
        wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
        if (wide.length > 6) break;
      }
    }
    return { hScroll: document.documentElement.scrollWidth > W + 1, scrollWidth: document.documentElement.scrollWidth, W, wide };
  });
}

/** In Tamil mode: the visible English phrases still on screen (two or more Latin words), outside translate=no parts */
export async function englishLeft(page, root = "body") {
  return page.evaluate((root) => {
    const out = new Map();
    const tw = document.createTreeWalker(document.querySelector(root) ?? document.body, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const s = t.textContent.replace(/\s+/g, " ").trim();
      if (!/[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(s)) continue;
      const el = t.parentElement;
      if (!el || el.closest("[translate=no], [data-no-i18n], script, style, code, kbd")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      out.set(s.slice(0, 90), (out.get(s.slice(0, 90)) ?? 0) + 1);
    }
    return [...out.keys()].slice(0, 80);
  }, root);
}
