// node tests/qa/pass4/axe.mjs [port]  -> docs/qa/pass4/evidence/axe.json
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { PAGES, launch, open, go, tabs } from "./visual-lib.mjs";
const L = await launch(process.argv[2] || 3183);
const out = { when: new Date().toISOString(), byImpact: {}, runs: [] };
const bump = (i) => (out.byImpact[i] = (out.byImpact[i] || 0) + 1);
for (const [name, p, who] of PAGES) for (const lang of ["en", "ta"]) for (const theme of ["light", "dark"]) {
  const { ctx, page, errs } = await open(L, who, lang, theme, { width: 1280, height: 800 });
  const targets = [[name, null]];
  try {
    await go(L, page, p);
    if (name === "collector") for (const k of (await tabs(page)).slice(0, 12)) targets.push([`${name}:${k}`, k]);
    for (const [label, k] of targets) {
      if (k) { await page.locator(`[role=tab], nav.rail button[data-key][data-key="${k}"]`).first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1500); }
      const r = await new AxeBuilder({ page }).analyze();
      const v = r.violations.map((x) => { bump(x.impact || "none"); return { id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help, sample: x.nodes.slice(0, 2).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message || n.all[0]?.message || "").slice(0, 120)) }; });
      out.runs.push({ page: label, lang, theme, url: page.url().replace(L.base, ""), violations: v, console: errs.splice(0) });
    }
  } catch (e) { out.runs.push({ page: name, lang, theme, error: e.message.slice(0, 200) }); }
  await ctx.close();
}
await L.br.close();
fs.writeFileSync("docs/qa/pass4/evidence/axe.json", JSON.stringify(out, null, 1));
const agg = {}; for (const r of out.runs) for (const v of r.violations || []) { const k = `${v.impact}:${v.id}`; agg[k] = agg[k] || { pages: new Set(), n: 0 }; agg[k].n += v.nodes; agg[k].pages.add(r.page + "/" + r.lang + "/" + r.theme); }
console.log(out.byImpact, out.runs.length, "runs");
for (const [k, v] of Object.entries(agg)) console.log(k, v.n, [...v.pages].slice(0, 4).join(", "), v.pages.size);
console.log("errors:", out.runs.filter((r) => r.error || r.console?.length).map((r) => `${r.page}/${r.lang}/${r.theme} ${r.error || r.console[0]}`));
