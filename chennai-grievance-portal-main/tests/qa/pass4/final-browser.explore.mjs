import { launchBrowser, stateFor, openPage, goto } from "./final-browser.lib.mjs";
const br = await launchBrowser();
for (const lang of ["en", "ta"]) {
  const o = await openPage(br, await stateFor("officerA"), lang, 1440);
  await goto(o.page, "/officer", 5000);
  console.log(lang, await o.page.evaluate(() => { const els = [...document.querySelectorAll("button, [role=tab]")].filter((e) => /^\d+\s*\n/.test(e.innerText.trim()) && e.innerText.trim().length < 40); return els.map((e) => e.tagName + "." + e.className + "|" + e.innerText.replace(/\s+/g, " ") + "|" + (e.getAttribute("data-key") || "")).join(" ;; "); }));
  await o.ctx.close();
}
await br.close();
