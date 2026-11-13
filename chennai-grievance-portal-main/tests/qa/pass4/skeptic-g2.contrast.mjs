// Skeptic 2: axe color-contrast on the officer console of each department, tab by tab, with the colours axe measured.
//   node tests/qa/pass4/skeptic-g2.contrast.mjs [port] -> docs/qa/pass4/evidence/skeptic-g2-contrast.json
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
const port = Number(process.argv[2] || 3216), base = `http://127.0.0.1:${port}`;
const br = await chromium.launch({ args: ["--mute-audio"] });
const out = [];
for (const who of ["officerA", "officerB", "officerC"]) {
  const a = accounts().find((x) => x.key === who);
  const c0 = await br.newContext(); const lr = await c0.request.post(`${base}/api/auth/login`, { data: { email: a.email, password: a.password } });
  if (lr.status() !== 200) { out.push({ who, error: "sign in " + lr.status() }); await c0.close(); continue; }
  const st = await c0.storageState(); await c0.close();
  for (const theme of ["light", "dark"]) for (const w of [1280, 360]) {
    const ctx = await br.newContext({ storageState: st, viewport: { width: w, height: 800 } });
    await ctx.addInitScript(([t]) => { try { localStorage.setItem("diq-lang", "en"); localStorage.setItem("diq-theme", t); } catch {} }, [theme]);
    const page = await ctx.newPage();
    await page.goto(base + "/officer", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const heads = await page.locator("[role=tab], nav.rail button[data-key]").evaluateAll((e) => e.map((x) => (x.getAttribute("data-key") || x.innerText || "").trim().split("\n")[0]).filter(Boolean));
    for (const k of ["(first view)", ...heads.slice(0, 12)]) {
      if (k !== "(first view)") { await page.locator("[role=tab], nav.rail button[data-key]").filter({ hasText: k }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1000); }
      const r = await new AxeBuilder({ page }).withRules(["color-contrast", "scrollable-region-focusable"]).analyze();
      for (const v of r.violations) out.push({ who, theme, w, view: k, rule: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => ({ t: n.target.join(" ").slice(0, 70), why: (n.any[0]?.message || n.any[0]?.data ? JSON.stringify(n.any[0]?.data || {}).slice(0, 150) : "") })) });
    }
    await ctx.close();
  }
}
await br.close();
fs.writeFileSync("docs/qa/pass4/evidence/skeptic-g2-contrast.json", JSON.stringify(out, null, 1));
const sum = {}; for (const r of out) { const k = `${r.who}|${r.theme}|${r.w}|${r.rule}`; sum[k] = (sum[k] || 0) + r.nodes; }
console.log(JSON.stringify(sum, null, 0).replace(/,/g, ",\n"));
console.log(JSON.stringify(out.filter((r) => r.rule === "color-contrast").slice(0, 4), null, 0).slice(0, 1800));
