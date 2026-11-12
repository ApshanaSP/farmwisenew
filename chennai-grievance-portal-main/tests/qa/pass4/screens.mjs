// node tests/qa/pass4/screens.mjs [port] -> docs/qa/pass4/evidence/screens/<page>-<lang>-<w>.png + screens.json (horizontal overflow, tiny tap targets, console errors)
import fs from "node:fs";
import { PAGES, launch, open, go } from "./visual-lib.mjs";
const L = await launch(process.argv[2] || 3184); const dir = "docs/qa/pass4/evidence/screens"; fs.mkdirSync(dir, { recursive: true });
const res = [];
const probe = () => { const W = document.documentElement.clientWidth; const wide = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 2) && getComputedStyle(e).position !== "fixed"; }).slice(0, 4).map((e) => e.tagName.toLowerCase() + "." + String(e.className).slice(0, 30));
  const clipped = [...document.querySelectorAll("button, a, h1, h2, h3, label, td, th")].filter((e) => e.scrollWidth > e.clientWidth + 2 && ["hidden", "clip"].includes(getComputedStyle(e).overflowX) && getComputedStyle(e).textOverflow !== "ellipsis").slice(0, 4).map((e) => (e.innerText || "").trim().slice(0, 30));
  const small = [...document.querySelectorAll("button, a[href], input, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(e).visibility !== "hidden"; }).length;
  return { scrollW: document.documentElement.scrollWidth, W, wide, clipped, smallTargets: small }; };
for (const lang of ["ta", "en"]) for (const w of [360, 768, 1280, 1920]) for (const [name, p, who] of PAGES) {
  const { ctx, page, errs } = await open(L, who, lang, "light", { width: w, height: w < 500 ? 780 : 900 });
  try { await go(L, page, p); await page.screenshot({ path: `${dir}/${name}-${lang}-${w}.png`, fullPage: true }); const pr = await page.evaluate(probe); res.push({ name, lang, w, url: page.url().replace(L.base, ""), ...pr, overflowX: pr.scrollW > pr.W + 2, console: errs.slice(0, 3) }); }
  catch (e) { res.push({ name, lang, w, error: e.message.slice(0, 150) }); }
  await ctx.close();
}
await L.br.close(); fs.writeFileSync("docs/qa/pass4/evidence/screens.json", JSON.stringify(res, null, 1));
for (const r of res) if (r.overflowX || r.error || r.clipped?.length || r.console?.length) console.log(r.name, r.lang, r.w, r.error || (r.overflowX ? `overflow ${r.scrollW}>${r.W} ${r.wide}` : ""), r.clipped?.length ? "clipped:" + r.clipped.join("|") : "", r.console?.[0]?.slice(0, 60) || "");
console.log(res.length, "shots");
