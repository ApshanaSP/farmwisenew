// QA pass 6 lead probe: which elements fail colour contrast on the citizen pages at 360 px (P5-038). Prints selectors and colours only.
import { createRequire } from "node:module";
import { base, signIn } from "../../lib/live.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const port = 3106, B = base(port);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, baseURL: B });
const cookie = await signIn(port, "citizenA");
await ctx.addCookies(cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: B }; }));
for (const p of ["/citizen", "/citizen/track-complaints"]) {
  const page = await ctx.newPage();
  await page.goto(p, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  for (const v of r.violations) for (const n of v.nodes) console.log(p, "|", n.target.join(" "), "|", (n.any[0]?.data ? JSON.stringify({ fg: n.any[0].data.fgColor, bg: n.any[0].data.bgColor, ratio: n.any[0].data.contrastRatio, size: n.any[0].data.fontSize }) : ""), "|", n.html.slice(0, 120));
  await page.close();
}
await browser.close();
