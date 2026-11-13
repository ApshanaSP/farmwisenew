// Skeptic 2: the same page in a browser in Chennai and in two other time zones. A date or clock printed in the browser's zone differs (or the page logs a
// hydration error 418/423/425). node tests/qa/pass4/skeptic-g2.tz.mjs [port] -> docs/qa/pass4/evidence/skeptic-g2-tz.json
import fs from "node:fs";
import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
const port = Number(process.argv[2] || 3216), base = `http://127.0.0.1:${port}`;
const br = await chromium.launch({ args: ["--mute-audio"] });
const acc = accounts(); const states = {};
for (const k of ["citizenA", "officerA", "collector"]) { const a = acc.find((x) => x.key === k); const c = await br.newContext(); await c.request.post(`${base}/api/auth/login`, { data: { email: a.email, password: a.password } }); states[k] = await c.storageState(); await c.close(); }
const PAGES = [["citizenA", "/citizen"], ["citizenA", "/citizen/track-complaints"], ["officerA", "/officer"], ["collector", "/collector"]];
const out = [];
for (const [who, p] of PAGES) {
  const rows = {};
  for (const tz of ["Asia/Kolkata", "Pacific/Auckland", "America/Los_Angeles"]) {
    const ctx = await br.newContext({ storageState: states[who], timezoneId: tz, viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("diq-lang", "en"); } catch {} });
    const page = await ctx.newPage(); const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); }); page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
    await page.goto(base + p, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2500);
    const text = await page.locator("body").innerText();
    // date-like and clock-like strings
    const stamps = [...new Set(text.match(/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(,? \d{4})?(,? \d{1,2}:\d{2} ?[ap]m)?|\b\d{1,2}:\d{2} ?[ap]m\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/gi) || [])].sort();
    const greet = (text.match(/Good (morning|afternoon|evening)/i) || [])[0] || null;
    rows[tz] = { stamps, greet, errs };
    await ctx.close();
  }
  const base0 = JSON.stringify(rows["Asia/Kolkata"].stamps);
  out.push({ who, p, differs: Object.entries(rows).filter(([tz, r]) => tz !== "Asia/Kolkata" && JSON.stringify(r.stamps) !== base0).map(([tz, r]) => ({ tz, onlyHere: r.stamps.filter((s) => !rows["Asia/Kolkata"].stamps.includes(s)).slice(0, 6) })), greets: Object.fromEntries(Object.entries(rows).map(([tz, r]) => [tz, r.greet])), errs: Object.fromEntries(Object.entries(rows).map(([tz, r]) => [tz, r.errs.slice(0, 3)])), ist: rows["Asia/Kolkata"].stamps.slice(0, 8) });
}
await br.close();
fs.mkdirSync("docs/qa/pass4/evidence", { recursive: true }); fs.writeFileSync("docs/qa/pass4/evidence/skeptic-g2-tz.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
