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
    // g-repair (skeptic 2's process note): every view of the officer console too, scanned once its rows are drawn (a scan at 1.5 s sees an empty table), and the case drawer at phone width below
    if (name === "officer") { await page.locator("[data-key]").first().waitFor({ timeout: 60000 }).catch(() => {}); for (const k of await page.locator("[data-key]").evaluateAll((e) => [...new Set(e.map((x) => x.getAttribute("data-key")).filter(Boolean))])) targets.push([`${name}:${k}`, k]); }
    for (const [label, k] of targets) {
      if (k) { await page.locator(name === "officer" ? `[data-key="${k}"]` : `[role=tab], nav.rail button[data-key][data-key="${k}"]`).first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1500); }
      if (name === "officer" && k && k !== "overview") await page.locator("table tbody tr, .oi-s").first().waitFor({ timeout: 15000 }).then(() => page.waitForTimeout(2500)).catch(() => {});
      const r = await new AxeBuilder({ page }).analyze();
      const v = r.violations.map((x) => { bump(x.impact || "none"); return { id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help, sample: x.nodes.slice(0, 2).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message || n.all[0]?.message || "").slice(0, 120)) }; });
      out.runs.push({ page: label, lang, theme, url: page.url().replace(L.base, ""), violations: v, console: errs.splice(0) });
    }
  } catch (e) { out.runs.push({ page: name, lang, theme, error: e.message.slice(0, 200) }); }
  await ctx.close();
}
// the officer's case drawer at phone width: its scrolling body must be reachable by keyboard (SK2-16)
for (const lang of ["en", "ta"]) for (const theme of ["light", "dark"]) {
  const { ctx, page, errs } = await open(L, "officerA", lang, theme, { width: 360, height: 740 });
  try {
    await go(L, page, "/officer");
    await page.locator("[data-key=work]").first().click({ timeout: 8000 });
    await page.locator("table tbody tr, [data-row], li[role=button]").first().waitFor({ timeout: 15000 });
    await page.locator("table tbody tr, [data-row], li[role=button]").first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    const r = await new AxeBuilder({ page }).analyze();
    const v = r.violations.map((x) => { bump(x.impact || "none"); return { id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help, sample: x.nodes.slice(0, 2).map((n) => n.target.join(" ")) }; });
    out.runs.push({ page: "officer:drawer@360", lang, theme, url: page.url().replace(L.base, ""), violations: v, console: errs.splice(0) });
  } catch (e) { out.runs.push({ page: "officer:drawer@360", lang, theme, error: e.message.slice(0, 200) }); }
  await ctx.close();
}
// the page for an address that does not exist (SK2-15)
for (const theme of ["light", "dark"]) {
  const { ctx, page, errs } = await open(L, null, "en", theme, { width: 1280, height: 800 });
  try {
    await go(L, page, "/this-page-does-not-exist-xyz");
    const r = await new AxeBuilder({ page }).analyze();
    const v = r.violations.map((x) => { bump(x.impact || "none"); return { id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help, sample: x.nodes.slice(0, 2).map((n) => n.target.join(" ")) }; });
    out.runs.push({ page: "404", lang: "en", theme, url: page.url().replace(L.base, ""), violations: v, console: errs.splice(0) });
  } catch (e) { out.runs.push({ page: "404", lang: "en", theme, error: e.message.slice(0, 200) }); }
  await ctx.close();
}
await L.br.close();
fs.writeFileSync("docs/qa/pass4/evidence/axe.json", JSON.stringify(out, null, 1));
const agg = {}; for (const r of out.runs) for (const v of r.violations || []) { const k = `${v.impact}:${v.id}`; agg[k] = agg[k] || { pages: new Set(), n: 0 }; agg[k].n += v.nodes; agg[k].pages.add(r.page + "/" + r.lang + "/" + r.theme); }
console.log(out.byImpact, out.runs.length, "runs");
for (const [k, v] of Object.entries(agg)) console.log(k, v.n, [...v.pages].slice(0, 4).join(", "), v.pages.size);
console.log("errors:", out.runs.filter((r) => r.error || r.console?.length).map((r) => `${r.page}/${r.lang}/${r.theme} ${r.error || r.console[0]}`));
// the gate: zero critical and zero serious (PB-320..323)
const bad = out.runs.reduce((n, r) => n + (r.violations || []).filter((v) => v.impact === "critical" || v.impact === "serious").length, 0);
console.log("critical+serious rule hits:", bad);
if (bad) process.exitCode = 1;
