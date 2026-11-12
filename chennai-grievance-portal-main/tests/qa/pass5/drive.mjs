// QA pass 5 gate: a browser drive of every page by role, plus the petition journey, on a running production server.
//   node tests/qa/pass5/drive.mjs --port 3105
// Writes docs/qa/pass5/results/drive-gate.json and screenshots to docs/qa/pass5/evidence/drive/. Never prints a password, cookie or token.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { base, call, signIn } from "./lib/live.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const P5 = path.resolve(APP, "..", "docs", "qa", "pass5");
const SHOTS = path.join(P5, "evidence", "drive");
fs.mkdirSync(SHOTS, { recursive: true });
const pi = process.argv.indexOf("--port"); const port = pi > 0 ? Number(process.argv[pi + 1]) : 3105;
const B = base(port);

const ROLES = {
  anon: ["/", "/login", "/register", "/forgot-password", "/track"],
  citizenA: ["/citizen", "/citizen/file-complaint", "/citizen/track-complaints", "/profile"],
  officerA: ["/officer", "/profile"],
  manu: ["/officer"],
  collector: ["/collector", "/profile"]
};
const AXE_PAGES = new Set(["/track", "/login", "/forgot-password", "/collector", "/citizen", "/citizen/track-complaints", "/officer"]);
const out = { generated: new Date().toISOString(), port, pages: [], journey: {} };

const browser = await chromium.launch();
async function ctxFor(role, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 780 : 820 }, baseURL: B });
  if (role !== "anon") {
    const cookie = await signIn(port, role);
    await ctx.addCookies(cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: B }; }));
  }
  return ctx;
}

for (const [role, pages] of Object.entries(ROLES)) for (const width of [360, 1280]) {
  const ctx = await ctxFor(role, width);
  for (const p of pages) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    let status = 0, finalUrl = "", axe = null, hScroll = null;
    try {
      const r = await page.goto(p, { waitUntil: "networkidle", timeout: 90_000 });
      status = r?.status() ?? 0;
      finalUrl = new URL(page.url()).pathname;
      await page.waitForTimeout(800);
      hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (AXE_PAGES.has(p) || (role === "manu" && p === "/officer")) {
        const a = await new AxeBuilder({ page }).analyze();
        axe = { critical: a.violations.filter((v) => v.impact === "critical").map((v) => v.id), serious: a.violations.filter((v) => v.impact === "serious").map((v) => v.id) };
      }
      await page.screenshot({ path: path.join(SHOTS, `${role}${p.replace(/\//g, "_") || "_root"}-${width}.png`) });
    } catch (e) { errors.push(`drive: ${String(e.message).slice(0, 200)}`); }
    out.pages.push({ role, page: p, width, status, finalUrl, hScroll, consoleErrors: errors, axe });
    await page.close();
  }
  await ctx.close();
}

// ---- the petition journey: photo in, the check, approval, then the citizen tracks it on a phone-sized screen (SMS is off: dry run) ----
const J = out.journey;
try {
  // the same minimal JPEG the Manu tests upload: the type is read from its first bytes, and no reader is set up in a QA run
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
  const fd = new FormData(); fd.append("pages", new Blob([jpg], { type: "image/jpeg" }), "petition.jpg");
  const up = await call(port, "manu", "POST", "/api/manu/petitions", { body: fd, raw: true });
  J.upload = up.status;
  const id = JSON.parse(up.text).id;
  for (let i = 0; i < 60; i++) { const d = await call(port, "manu", "GET", `/api/manu/petitions/${id}`); J.readStatus = JSON.parse(d.text).status ?? JSON.parse(d.text).petition?.status; if (J.readStatus !== "reading") break; await new Promise((r) => setTimeout(r, 1000)); }
  const fields = { name: "QA Petitioner", mobile: "9000041873", door: "27", street: "Jawahar Street", area: "Perambur", pincode: "600011", ward: 70, date: "12.11.2026", subject: "Sewage overflow",
    problem: "Sewage overflowing on the street for a week", request: "Please clear the block", dept: "CMWSSB", urgent: false, fullText: "QA pass 5 journey petition", attachTo: null };
  const f = await call(port, "manu", "POST", `/api/manu/petitions/${id}`, { body: { action: "file", fields } });
  J.approve = f.status;
  const code = JSON.parse(f.text).approved?.code;
  J.code = code ? "issued" : null;
  J.sms = JSON.parse(f.text).approved?.sms ?? null;
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, baseURL: B, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.goto("/track", { waitUntil: "networkidle" });
  const inputs = page.locator("input");
  await inputs.nth(0).fill(code);
  await inputs.nth(1).fill("1873");
  await page.locator("button[type=submit], form button").first().click();
  await page.waitForTimeout(2500);
  const text = await page.locator("main").innerText();
  J.trackShowsStatus = /Complaint Filed|Received|Collector/i.test(text);
  J.trackShowsPersonal = /QA Petitioner|9000041873|Jawahar/i.test(text);
  J.trackConsoleErrors = errors;
  J.trackHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.screenshot({ path: path.join(SHOTS, "journey-track-360.png"), fullPage: true });
  const wrong = await call(port, null, "POST", "/api/track", { body: { code, last4: "0000" } });
  J.trackWrongLast4 = wrong.status;
  await ctx.close();
} catch (e) { J.error = String(e.message).slice(0, 300); }

await browser.close();
const bad = out.pages.filter((p) => p.status >= 400 || p.status === 0 || p.consoleErrors.length || p.hScroll || (p.axe && (p.axe.critical.length || p.axe.serious.length)));
out.summary = { pages: out.pages.length, withProblems: bad.length };
fs.writeFileSync(path.join(P5, "results", "drive-gate.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out.summary, journey: J }));
for (const p of bad) console.log("PAGE", p.role, p.page, p.width, p.status, p.finalUrl, p.hScroll ? "h-scroll" : "", JSON.stringify(p.axe), p.consoleErrors.slice(0, 2).join(" | "));
