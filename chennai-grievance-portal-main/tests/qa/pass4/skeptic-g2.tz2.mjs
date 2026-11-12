// Skeptic 2: the collector and officer pages read in Chennai, Los Angeles and Auckland, the whole visible text compared word for word.
//   node tests/qa/pass4/skeptic-g2.tz2.mjs [port] -> docs/qa/pass4/evidence/skeptic-g2-tz2.json
import fs from "node:fs";
import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
const port = Number(process.argv[2] || 3216), base = `http://127.0.0.1:${port}`;
const br = await chromium.launch({ args: ["--mute-audio"] });
const acc = accounts(); const states = {};
for (const k of ["officerA", "collector"]) { const a = acc.find((x) => x.key === k); const c = await br.newContext(); const r = await c.request.post(`${base}/api/auth/login`, { data: { email: a.email, password: a.password } }); if (r.status() !== 200) throw new Error("sign in " + k + " " + r.status()); states[k] = await c.storageState(); await c.close(); }
const out = [];
for (const [who, p] of [["collector", "/collector"], ["officerA", "/officer"]]) for (const lang of ["en", "ta"]) {
  const rows = {};
  for (const tz of ["Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"]) {
    const ctx = await br.newContext({ storageState: states[who], timezoneId: tz, viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript((l) => { try { localStorage.setItem("diq-lang", l); } catch {} }, lang);
    const page = await ctx.newPage(); const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
    await page.goto(base + p, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => /Good (morning|afternoon|evening)|காலை|மாலை|மதியம்|இரவு/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const text = await page.locator("body").innerText();
    rows[tz] = { url: page.url().replace(base, ""), len: text.length, words: [...new Set(text.split(/[\s|·/,]+/).filter((w) => /\d|AM|PM|am|pm|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Nov|morning|afternoon|evening|night/i.test(w)))].sort(), errs };
    await ctx.close();
  }
  const ist = rows["Asia/Kolkata"];
  out.push({ who, lang, url: ist.url, onlyInIstOrOther: Object.fromEntries(["America/Los_Angeles", "Pacific/Auckland"].map((tz) => [tz, { url: rows[tz].url, missing: ist.words.filter((w) => !rows[tz].words.includes(w)).slice(0, 8), extra: rows[tz].words.filter((w) => !ist.words.includes(w)).slice(0, 8), errs: rows[tz].errs.length }])) });
}
await br.close();
fs.writeFileSync("docs/qa/pass4/evidence/skeptic-g2-tz2.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
