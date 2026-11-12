// Skeptic 2: the officer's queue note (RC-47) in Tamil. The route is answered with a waiting count so the real client code draws the note.
//   node tests/qa/pass4/skeptic-g2.queue2.mjs [port] -> docs/qa/pass4/evidence/skeptic-g2-queue.json
import fs from "node:fs";
import { launch, open, go } from "./visual-lib.mjs";
const L = await launch(Number(process.argv[2] || 3216));
const NOTE = { en: "3 new complaints are filed with your department and will join this list at the next update.", ta: "உங்கள் துறைக்கு 3 புதிய புகார்கள் பதிவாகியுள்ளது; அடுத்த புதுப்பிப்பில் இந்தப் பட்டியலில் சேரும்." };
const out = [];
for (const lang of ["en", "ta"]) for (const vp of [{ width: 1280, height: 800 }, { width: 360, height: 740 }]) {
  const { ctx, page, errs } = await open(L, "officerA", lang, "light", vp);
  await page.route("**/api/officer/grievances**", async (route) => { const r = await route.fetch(); const j = await r.json(); j.awaiting = 3; j.awaitingNote = NOTE; await route.fulfill({ response: r, json: j }); });
  await go(L, page, "/officer");
  await page.locator("[data-key=work]").first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2000);
  const el = page.locator('[data-testid="queue-awaiting"]');
  const shown = await el.count() ? (await el.first().innerText()).trim() : null;
  const box = await el.count() ? await el.first().boundingBox() : null;
  out.push({ lang, width: vp.width, shown, tamilLetters: !!shown && /[஀-௿]/.test(shown), clippedRight: box ? box.x + box.width > vp.width + 1 : null, errs: errs.slice(0, 2) });
  await ctx.close();
}
await L.br.close();
fs.writeFileSync("docs/qa/pass4/evidence/skeptic-g2-queue.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
