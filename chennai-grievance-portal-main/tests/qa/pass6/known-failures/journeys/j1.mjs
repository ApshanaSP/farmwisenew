// Journey 1: a Collector's morning at 1280 px. `node j1.mjs en` or `node j1.mjs ta` (Tamil: switches the interface first).
import { launch, ctxFor, watch, shot, textOf, save, layout, englishLeft, logMark, logSince, setShotPrefix } from "./jlib.mjs";

const LANG = process.argv[2] === "ta" ? "ta" : "en";
const only = process.argv[3] ?? "all"; // all | dash | jarvis | ask
setShotPrefix(LANG === "ta" ? 40 : 0);
const P = `j1${LANG}`;
const Q = LANG === "ta"
  ? ["காலக்கெடு தாண்டியும் திறந்திருக்கும் வழக்குகள் எத்தனை?", "இன்று வந்த புதிய புகார்கள் எத்தனை?", "அடையாறு மண்டலத்தில் நிலைமை என்ன?",
     "திடக்கழிவு மேலாண்மைத் துறையில் எத்தனை புகார்கள் நிலுவையில் உள்ளன?", "இன்று காலை நான் முதலில் எதைக் கவனிக்க வேண்டும்?"]
  : ["How many cases are overdue?", "How many new complaints came in today?", "How is Adyar zone doing?",
     "How many open complaints does Solid Waste Management have?", "What needs my attention first this morning?"];
const ASK = LANG === "ta"
  ? ["இந்த வாரம் அதிக திறந்த புகார்கள் உள்ள மண்டலம் எது?", "தற்போது திறந்திருக்கும் கடுமையான சம்பவங்கள் எத்தனை?"]
  : ["Which zone has the most open complaints this week?", "How many severe incidents are open right now?"];

const rec = { lang: LANG, steps: [], problems: [] };
const mark = logMark();
const browser = await launch();
const ctx = await ctxFor(browser, "collector", 1280);
const page = await ctx.newPage();
watch(page, rec);
const step = async (name, fn) => {
  rec.step = name; const t0 = Date.now(); const s = { name };
  try { Object.assign(s, (await fn()) ?? {}); } catch (e) { s.error = String(e.message).slice(0, 300); try { s.shot = await shot(page, `${P}-${name}-error`); } catch { /* none */ } }
  s.ms = Date.now() - t0; rec.steps.push(s); save(`${P}.json`, rec); console.log(name, s.ms, s.error ?? "");
  return s;
};
const esc = async () => { for (let i = 0; i < 2; i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(250); } };

await step("load", async () => {
  const t0 = Date.now();
  const r = await page.goto("/collector", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("header.top").waitFor({ timeout: 60_000 });
  const firstPaint = Date.now() - t0;
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const ov = await page.evaluate(async () => { try { const r = await fetch("/api/collector/overview?period=daily"); return { status: r.status, j: r.ok ? await r.json() : null }; } catch (e) { return { err: String(e) }; } });
  save(`${P}-overview.json`, ov);
  return { status: r?.status(), firstPaint, url: page.url(), shot: await shot(page, `${P}-console-first`), band: await textOf(page, "section.band"), layout: await layout(page) };
});

if (LANG === "ta") await step("switch-ta", async () => {
  await page.locator("button.lang-sw").click();
  await page.waitForTimeout(5000);
  return { htmlLang: await page.evaluate(() => document.documentElement.lang), shot: await shot(page, `${P}-switched`), english: await englishLeft(page, "header.top"), band: await textOf(page, "section.band"), bandEnglish: await englishLeft(page, "section.band"), bodyEnglish: await englishLeft(page, "main.body") };
});

if (only === "all" || only === "dash") {
  await step("overview", async () => ({ p1: (await textOf(page, "main.body")).slice(0, 4000), shot: await shot(page, `${P}-overview-full`, { fullPage: true }) }));

  await step("briefing", async () => {
    await page.locator('.ptab[data-key="briefing"]').click();
    await page.waitForTimeout(4000);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    return { text: (await textOf(page, "main.body")).slice(0, 6000), shot: await shot(page, `${P}-briefing`), shotFull: await shot(page, `${P}-briefing-full`, { fullPage: true }), layout: await layout(page), english: LANG === "ta" ? await englishLeft(page, "main.body") : undefined };
  });

  await step("map", async () => {
    await page.locator('.ptab[data-key="overview"]').click();
    await page.waitForTimeout(2500);
    const card = page.locator("article.a-map");
    const r = { shot: await shot(page, `${P}-map`) };
    // a zone on the map: the first zone shape
    const shapes = page.locator("article.a-map path.leaflet-interactive");
    r.shapes = await shapes.count();
    if (r.shapes) { await shapes.nth(Math.min(3, r.shapes - 1)).click({ force: true }); await page.waitForTimeout(2500); r.afterZone = await textOf(page, "section.band"); r.shotZone = await shot(page, `${P}-map-zone`); }
    r.mapText = await textOf(page, "article.a-map");
    return r;
  });

  await step("clear-zone", async () => {
    const clr = page.locator("button.fclear");
    if (await clr.count()) { await clr.click(); await page.waitForTimeout(2500); }
    return { band: (await textOf(page, "section.band")).slice(0, 1500) };
  });

  // lists: every tile in the band's counts row, opened in turn (the first three)
  await step("lists", async () => {
    const tiles = page.locator("section.kpis button, section.kpis [role=button]");
    const n = await tiles.count();
    const snapTiles = page.locator(".hsnap button.stile:not(.static)");
    const ns = await snapTiles.count();
    const picks = [...[0, 2].filter((i) => i < n).map((i) => tiles.nth(i)), ...(ns ? [snapTiles.last()] : [])];
    const out = [];
    for (const [i, t] of picks.entries()) {
      const label = (await t.innerText()).replace(/\s+/g, " ").slice(0, 160);
      await t.click();
      await page.waitForTimeout(3500);
      const modal = await textOf(page, ".modal");
      out.push({ label, modal: modal.slice(0, 2500), shot: await shot(page, `${P}-list-${i}`) });
      if (i < picks.length - 1) await esc();
    }
    return { tiles: n, snapTiles: ns, snapText: await textOf(page, ".hsnap").catch(() => ""), out };
  });

  await step("case", async () => {
    // the first row of the open list
    const row = page.locator(".modal tbody tr").first();
    const had = await row.count();
    if (had) { await row.click(); await page.waitForTimeout(4000); }
    return { had, text: (await textOf(page, ".modal.iv")).slice(0, 5000), shot: await shot(page, `${P}-case`), layout: await layout(page), english: LANG === "ta" ? await englishLeft(page, ".modal.iv") : undefined };
  });
  await esc(); await esc();
}

if (only === "all" || only === "jarvis") {
  await step("jarvis-open", async () => {
    await page.locator("button.jvf").click();
    await page.waitForTimeout(1500);
    const first = page.locator(".hud-first button");
    const firstUse = await first.count();
    const firstText = firstUse ? await textOf(page, ".hud-first") : "";
    if (firstUse) { await first.click(); await page.waitForTimeout(2500); }
    return { firstUse, firstText, hud: await textOf(page, ".hud"), shot: await shot(page, `${P}-jarvis-open`) };
  });
  const sig = async () => `${await textOf(page, "[data-testid=answer]")}|${await textOf(page, ".st-root")}|${await textOf(page, ".hud-live")}|${await textOf(page, ".th-card")}`;
  for (const [k, q] of Q.entries()) {
    await step(`jarvis-q${k + 1}`, async () => {
      if (!(await page.locator(".hud-compose input").count())) {
        const typeBtn = page.locator(".hud-acts button.hud-btn").filter({ hasText: LANG === "ta" ? "தட்டச்சு" : "Type" });
        await typeBtn.first().click();
        await page.waitForTimeout(400);
      }
      const before = await sig();
      const t0 = Date.now();
      await page.locator(".hud-compose input").fill(q);
      await page.keyboard.press("Enter");
      let last = before, stableSince = 0, changedAt = 0;
      while (Date.now() - t0 < 45_000) {
        await page.waitForTimeout(700);
        const s = await sig();
        if (s !== before && !changedAt) changedAt = Date.now();
        if (s !== last) { last = s; stableSince = Date.now(); } else if (changedAt && Date.now() - stableSince > 3000) break;
      }
      return { q, firstChangeMs: changedAt ? changedAt - t0 : null, totalMs: Date.now() - t0, answer: await textOf(page, "[data-testid=answer]"), stage: (await textOf(page, ".st-root")).slice(0, 3000),
        live: await textOf(page, ".hud-live"), card: await textOf(page, ".th-card"), hud: (await textOf(page, ".hud")).slice(0, 1500), core: await page.locator(".hud").getAttribute("data-core").catch(() => null), shot: await shot(page, `${P}-jarvis-q${k + 1}`) };
    });
    // a Stage screen covers the console: close it before the next question (its Escape), the bar stays
    if (await page.locator(".st-root").count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(800); }
  }
  await step("jarvis-close", async () => {
    const c = page.locator(".hud-btn.close");
    if (await c.count()) await c.click();
    await page.waitForTimeout(1200);
    return { hudLeft: await page.locator(".hud").count(), questions: await page.locator(".jvf-q em").innerText().catch(() => "") };
  });
}

if (only === "all" || only === "ask") {
  await step("ask-open", async () => {
    await page.locator("button.ask-fab-v2").click();
    await page.waitForTimeout(2500);
    return { text: (await textOf(page, ".aq-main")).slice(0, 2000), shot: await shot(page, `${P}-ask-open`), english: LANG === "ta" ? await englishLeft(page, ".aq-main") : undefined };
  });
  for (const [k, q] of ASK.entries()) {
    await step(`ask-q${k + 1}`, async () => {
      const t0 = Date.now();
      await page.locator(".aq-f textarea").fill(q);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1200);
      while (Date.now() - t0 < 60_000 && (await page.locator(".aq-typing, .aq-send.stop").count())) await page.waitForTimeout(700);
      await page.waitForTimeout(1500);
      const bots = page.locator(".aq-row.bot");
      const nb = await bots.count();
      return { q, ms: Date.now() - t0, answer: nb ? (await bots.nth(nb - 1).innerText()).slice(0, 3000) : "", errs: await textOf(page, ".aq-err"), shot: await shot(page, `${P}-ask-q${k + 1}`) };
    });
  }
  await step("ask-close", async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(800); return { open: await page.locator(".aq-overlay").count() }; });
}

rec.log = logSince(mark);
save(`${P}.json`, rec);
console.log(JSON.stringify({ steps: rec.steps.map((s) => [s.name, s.ms, s.error ?? ""]), problems: rec.problems.length, logErrors: rec.log.errors.length }));
await browser.close();
