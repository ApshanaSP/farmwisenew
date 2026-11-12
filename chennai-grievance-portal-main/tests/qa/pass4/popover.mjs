// PB-301 real-browser guard. node tests/qa/pass4/popover.mjs [port] -> docs/qa/pass4/evidence/popover.json, exit 1 on a finding.
// The Collector's alert details (the Cyclone chip) must close on Escape (focus back on the chip), on a press anywhere else, and so never
// stand on top of the next thing the person opens (the Take action dialog). English and Tamil.
import fs from "node:fs";
import { launch, open, go } from "./visual-lib.mjs";
const L = await launch(Number(process.argv[2] || 3212));
const out = [];
for (const lang of ["en", "ta"]) {
  const { ctx, page } = await open(L, "collector", lang, "light", { width: 1440, height: 900 });
  await go(L, page, "/collector"); await page.waitForTimeout(4000);
  const chip = page.locator("button.alc").first();
  const r = { lang, chip: await chip.count() };
  if (r.chip) {
    const pop = () => page.locator(".alc-pop").count();
    await chip.click(); await page.waitForTimeout(500); r.opened = await pop();
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    r.closedByEscape = (await pop()) === 0; r.focusBackOnChip = await page.evaluate(() => document.activeElement?.classList.contains("alc"));
    await chip.click(); await page.waitForTimeout(500);
    await page.mouse.click(700, 20); await page.waitForTimeout(400); // the top bar, outside the details
    r.closedByOutsidePress = (await pop()) === 0;
    // the details open, then the person opens another thing: the details are gone, they never stand over it
    await chip.click(); await page.waitForTimeout(500);
    const act = page.locator("button", { hasText: /^\s*(Act|செயல்படு)/ }).first();
    if (await act.count()) { await act.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1500); r.popOverDialog = await pop(); r.dialogOpen = await page.locator('[role=dialog]:not(.alc-pop)').count(); }
  }
  out.push(r); await ctx.close();
}
await L.br.close();
const bad = out.filter((r) => !r.chip || r.opened !== 1 || !r.closedByEscape || !r.focusBackOnChip || !r.closedByOutsidePress || r.popOverDialog);
fs.mkdirSync("docs/qa/pass4/evidence", { recursive: true });
fs.writeFileSync("docs/qa/pass4/evidence/popover.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1)); console.log(bad.length ? `${bad.length} problem(s)` : "the alert details close on Escape and on an outside press");
process.exit(bad.length ? 1 : 0);
