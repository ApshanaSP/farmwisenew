// RC-46 guard. node tests/qa/pass4/layout.mjs [port]  -> docs/qa/pass4/evidence/layout.json, exit 1 on any finding.
// For every page, language and width: the page must not scroll sideways, and (at phone width) a floating control must not cover a bottom-bar tab.
import fs from "node:fs";
import { PAGES, launch, open, go } from "./visual-lib.mjs";
const L = await launch(Number(process.argv[2] || 3203));
const WIDTHS = [[360, 780], [768, 1024], [1280, 800], [1920, 1080]];
const out = [];
for (const [name, p, who] of PAGES) for (const lang of ["en", "ta"]) for (const [w, h] of WIDTHS) {
  const { ctx, page } = await open(L, who, lang, "light", { width: w, height: h });
  try {
    await go(L, page, p);
    const r = await page.evaluate(() => {
      const de = document.documentElement, W = window.innerWidth;
      const wide = [...document.querySelectorAll("body *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > W + 1 && getComputedStyle(e).position !== "fixed"; })
        .slice(0, 4).map((e) => e.tagName.toLowerCase() + "." + String(e.className?.baseVal ?? e.className).slice(0, 30));
      // a floating (fixed) control that sits on top of a link or button in the bottom bar
      const fixed = [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).position === "fixed" && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 200);
      const bars = [...document.querySelectorAll("nav a, nav button, [role=tab]")].filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > window.innerHeight - 90 && b.width > 0; });
      const covers = [];
      for (const f of fixed) for (const t of bars) {
        if (f.contains(t) || t.contains(f)) continue;
        const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 4 && oy > 4) covers.push((f.className?.baseVal ?? f.className).toString().slice(0, 24) + " over " + (t.innerText || t.getAttribute("aria-label") || "").trim().slice(0, 20));
      }
      return { scrollW: de.scrollWidth, W, wide, covers };
    });
    out.push({ page: name, lang, w, ...r, sideways: r.scrollW > r.W });
  } catch (e) { out.push({ page: name, lang, w, error: String(e).slice(0, 120) }); }
  await ctx.close();
}
await L.br.close();
fs.mkdirSync("docs/qa/pass4/evidence", { recursive: true });
fs.writeFileSync("docs/qa/pass4/evidence/layout.json", JSON.stringify(out, null, 1));
const bad = out.filter((r) => r.sideways || r.covers?.length || r.error);
for (const r of bad) console.log(r.page, r.lang, r.w, r.error ?? `scrollW ${r.scrollW}/${r.W}`, r.sideways ? r.wide.join(" | ") : "", r.covers?.join(" | ") ?? "");
console.log(bad.length, "of", out.length, "runs have a layout problem");
process.exit(bad.length ? 1 : 0);
