// Skeptic 2: the keyboard and phone paths of the "Confirm it's you" box (PB-316 fix) and the alert details (PB-301 fix).
//   node tests/qa/pass4/skeptic-g2.keys.mjs [port] -> docs/qa/pass4/evidence/skeptic-g2-keys.json
import fs from "node:fs";
import { launch, open, go } from "./visual-lib.mjs";
const L = await launch(Number(process.argv[2] || 3216));
const out = [];
const where = () => { const e = document.activeElement; const inBox = !!e?.closest?.(".cfm"); return { tag: e?.tagName?.toLowerCase(), id: e?.id || "", name: (e?.getAttribute?.("aria-label") || e?.innerText || "").trim().slice(0, 30), inBox }; };
for (const [lang, vp] of [["en", { width: 1280, height: 800 }], ["ta", { width: 1280, height: 800 }], ["en", { width: 360, height: 700 }], ["ta", { width: 360, height: 700 }]]) {
  const { ctx, page, errs } = await open(L, "collector", lang, "dark", vp);
  await go(L, page, "/collector");
  // focus something real first, so a return of focus can be seen
  await page.keyboard.press("Tab"); const opener = await page.evaluate(() => { const e = document.activeElement; if (e) e.setAttribute("data-sk2-opener", "1"); return { tag: e?.tagName, name: (e?.innerText || e?.getAttribute("aria-label") || "").slice(0, 30) }; });
  const pending = page.evaluate(async () => (await fetch("/api/collector/export?period=daily")).status);
  const box = await page.locator('.cfm input[type="password"]').first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  const r = { lang, width: vp.width, box, opener, errs: errs.slice(0, 3) };
  if (box) {
    r.rect = await page.evaluate(() => { const b = document.querySelector(".cfm").getBoundingClientRect(); const c = [...document.querySelectorAll(".cfm button")].map((x) => { const q = x.getBoundingClientRect(); return { t: x.innerText.trim().slice(0, 14), inView: q.top >= 0 && q.bottom <= innerHeight && q.left >= 0 && q.right <= innerWidth }; }); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), vh: innerHeight, vw: innerWidth, buttons: c }; });
    r.text = (await page.locator(".cfm").innerText()).slice(0, 160).replace(/\n/g, " | ");
    r.focusAtOpen = await page.evaluate(where);
    const seq = []; for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); seq.push(await page.evaluate(where)); }
    r.tabEscaped = seq.filter((s) => !s.inBox).map((s) => `${s.tag}:${s.name}`).slice(0, 4);
    const back = []; for (let i = 0; i < 3; i++) { await page.keyboard.press("Shift+Tab"); back.push(await page.evaluate(where)); }
    r.shiftTabEscaped = back.filter((s) => !s.inBox).length;
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
    r.boxGone = (await page.locator(".cfm").count()) === 0;
    r.focusAfterClose = await page.evaluate(() => { const e = document.activeElement; return { tag: e?.tagName, isOpener: !!e?.getAttribute?.("data-sk2-opener") }; });
    r.callerStatus = await pending;
  }
  out.push(r); await ctx.close();
}
await L.br.close();
fs.mkdirSync("docs/qa/pass4/evidence", { recursive: true });
fs.writeFileSync("docs/qa/pass4/evidence/skeptic-g2-keys.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
