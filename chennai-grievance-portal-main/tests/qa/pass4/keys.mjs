// Keyboard walk. node tests/qa/pass4/keys.mjs [port] -> docs/qa/pass4/evidence/keys.json
import fs from "node:fs";
import { launch, open, go } from "./visual-lib.mjs";
const L = await launch(process.argv[2] || 3184);
const desc = () => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
  return { tag: e.tagName.toLowerCase(), name: (e.getAttribute("aria-label") || e.innerText || e.getAttribute("placeholder") || e.id || "").trim().slice(0, 40), ring, vis: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight, role: e.getAttribute("role"), inDialog: !!e.closest("[role=dialog]") }; };
const out = [];
async function walk(page, label, n) {
  const seq = [];
  for (let i = 0; i < n; i++) { await page.keyboard.press("Tab"); seq.push(await page.evaluate(desc)); }
  const seen = new Set(), names = seq.filter(Boolean).map((s) => s.tag + ":" + s.name);
  const noRing = seq.filter((s) => s && !s.ring).map((s) => s.tag + ":" + s.name);
  const offscreen = seq.filter((s) => s && !s.vis).map((s) => s.tag + ":" + s.name);
  const bodyLoss = seq.filter((s) => !s).length;
  return { label, stops: seq.length, distinct: new Set(names).size, noRing: [...new Set(noRing)].slice(0, 10), offscreen: [...new Set(offscreen)].slice(0, 10), bodyLoss, first: names.slice(0, 6) };
}
for (const [name, p, who] of [["citizen", "/citizen", "citizenA"], ["file", "/citizen/file-complaint", "citizenA"], ["track", "/citizen/track-complaints", "citizenA"], ["officer", "/officer", "officerA"], ["login", "/login", null], ["register", "/register", null], ["collector", "/collector", "collector"]]) {
  const { ctx, page, errs } = await open(L, who, "en", "light", { width: 1280, height: 800 });
  await go(L, page, p); const r = await walk(page, name, 40); r.errs = errs; out.push(r);
  if (name === "collector") {
    // Jarvis / Ask District IQ: open with Ctrl+K, tab inside, trap, Escape, focus return
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("Control+k"); await page.waitForTimeout(1500);
    const dlg = await page.locator("[role=dialog][aria-labelledby=aq-title]").count();
    const jr = { label: "jarvis dialog", opened: dlg, activeAtOpen: await page.evaluate(desc) };
    const seq = []; for (let i = 0; i < 30; i++) { await page.keyboard.press("Tab"); seq.push(await page.evaluate(desc)); }
    jr.escapedDialog = seq.filter((s) => s && !s.inDialog).map((s) => s.tag + ":" + s.name).slice(0, 5);
    jr.noRing = [...new Set(seq.filter((s) => s && !s.ring).map((s) => s.tag + ":" + s.name))].slice(0, 8);
    // Jarvis tab (Asked of Jarvis)
    const jt = page.locator("[role=tab]", { hasText: /Jarvis/ }).first();
    if (await jt.count()) { await jt.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(1200); const s2 = []; for (let i = 0; i < 15; i++) { await page.keyboard.press("Tab"); s2.push(await page.evaluate(desc)); } jr.jarvisTabEscaped = s2.filter((s) => s && !s.inDialog).length; jr.jarvisTabStops = [...new Set(s2.filter(Boolean).map((s) => s.tag + ":" + s.name))].slice(0, 10); }
    await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    jr.closedByEscape = (await page.locator("[role=dialog][aria-labelledby=aq-title]").count()) === 0;
    jr.activeAfterClose = await page.evaluate(desc); jr.errs = errs; out.push(jr);
    // command palette
    await page.keyboard.press("Control+Shift+k").catch(() => {});
  }
  await ctx.close();
}
await L.br.close();
fs.writeFileSync("docs/qa/pass4/evidence/keys.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
