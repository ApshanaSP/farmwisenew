// Skeptic 2: axe, sideways scroll and keyboard on screens the fixers did not list (the 404 page, "/", every officer tab, the Ask District IQ dialog,
// the "Confirm it's you" box, the officer detail), in English and Tamil, light and dark, at 1280 and 360 px.
//   node tests/qa/pass4/skeptic-g2.axe.mjs [port] -> docs/qa/pass4/evidence/skeptic-g2-axe.json
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { launch, open, go, tabs } from "./visual-lib.mjs";
import { accounts } from "../seed-local-users.mjs";
const L = await launch(Number(process.argv[2] || 3216));
const out = { when: new Date().toISOString(), runs: [], notes: [] };
const wide = () => document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1;
async function scan(page, label, lang, theme, vp) {
  const r = await new AxeBuilder({ page }).analyze();
  const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes.slice(0, 2).map((n) => n.target.join(" ").slice(0, 120)) }));
  out.runs.push({ label, lang, theme, vp, sideways: await page.evaluate(wide), violations: v });
}
const VPS = [{ width: 1280, height: 800 }, { width: 360, height: 740 }];
const PAGES = [["root", "/", null], ["404", "/this-page-does-not-exist-xyz", null], ["officer", "/officer", "officerA"], ["officerB", "/officer", "officerB"], ["officerC", "/officer", "officerC"], ["collector", "/collector", "collector"]];
for (const [name, p, who] of PAGES) for (const lang of ["en", "ta"]) for (const theme of ["light", "dark"]) for (const vp of VPS) {
  if (who && !L.states[who]) { const a = accounts().find((x) => x.key === who); const c = await L.br.newContext(); const r = await c.request.post(`${L.base}/api/auth/login`, { data: { email: a.email, password: a.password } }); if (r.status() === 200) L.states[who] = await c.storageState(); await c.close(); }
  const { ctx, page } = await open(L, who, lang, theme, vp);
  try {
    await go(L, page, p);
    await scan(page, name, lang, theme, vp.width);
    if (name.startsWith("officer")) {
      for (const k of (await tabs(page)).slice(0, 8)) {
        await page.locator(`[role=tab]`).filter({ hasText: k }).first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1200);
        await scan(page, `${name}:${k}`.slice(0, 40), lang, theme, vp.width);
      }
      // the first row opens the detail
      const row = page.locator("table tbody tr, [data-row], .row, li[role=button]").first();
      if (await row.count()) { await row.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1500); await scan(page, `${name}:detail`, lang, theme, vp.width); }
    }
    if (name === "collector") {
      await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
      await page.keyboard.press("Control+k"); await page.waitForTimeout(1500);
      await scan(page, "collector:ask-dialog", lang, theme, vp.width);
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
      // the Confirm box
      const pending = page.evaluate(async () => (await fetch("/api/collector/export?period=daily")).status);
      const box = await page.locator('[role=dialog] input[type="password"]').first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      if (box) { await scan(page, "collector:confirm-box", lang, theme, vp.width); await page.keyboard.press("Escape"); }
      else out.notes.push(`no confirm box ${lang}/${theme}/${vp.width}`);
      await pending.catch(() => {});
    }
  } catch (e) { out.runs.push({ label: name, lang, theme, vp: vp.width, error: e.message.slice(0, 160) }); }
  await ctx.close();
}
await L.br.close();
fs.mkdirSync("docs/qa/pass4/evidence", { recursive: true });
fs.writeFileSync("docs/qa/pass4/evidence/skeptic-g2-axe.json", JSON.stringify(out, null, 1));
const bad = out.runs.filter((r) => (r.violations || []).some((v) => v.impact === "critical" || v.impact === "serious"));
const side = out.runs.filter((r) => r.sideways);
const any = {}; for (const r of out.runs) for (const v of r.violations || []) any[`${v.impact}:${v.id}`] = (any[`${v.impact}:${v.id}`] || 0) + v.nodes;
console.log(out.runs.length, "runs;", "critical/serious runs:", bad.length, "sideways runs:", side.length, "errors:", out.runs.filter((r) => r.error).length);
console.log(any);
for (const r of bad.slice(0, 10)) console.log("BAD", r.label, r.lang, r.theme, r.vp, JSON.stringify(r.violations.filter((v) => v.impact === "critical" || v.impact === "serious")));
for (const r of side.slice(0, 10)) console.log("SIDEWAYS", r.label, r.lang, r.theme, r.vp);
console.log(out.notes.slice(0, 5));
