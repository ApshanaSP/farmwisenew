// Journey 3: a paper petition at the Manu Desk as `manu` (upload a photo, reading, check, approve), then the citizen tracks it on /track
// on a 360 px phone. `node j3.mjs`. The petition is a picture of a typed petition drawn in the browser (no outside file).
import { launch, ctxFor, watch, shot, textOf, save, layout, logMark, logSince, setShotPrefix } from "./jlib.mjs";

setShotPrefix(160);
const P = "j3";
const rec = { steps: [], problems: [] };
const mark = logMark();
const browser = await launch();
let page;
const step = async (name, fn) => {
  rec.step = name; const t0 = Date.now(); const s = { name };
  try { Object.assign(s, (await fn()) ?? {}); } catch (e) { s.error = String(e.message).slice(0, 300); try { s.shot = await shot(page, `${P}-${name}-error`); } catch { /* none */ } }
  s.ms = Date.now() - t0; rec.steps.push(s); save(`${P}.json`, rec); console.log(name, s.ms, s.error ?? "");
  return s;
};

// the petition photo: a typed petition, drawn and photographed in a blank page
const draw = await browser.newPage({ viewport: { width: 700, height: 900 } });
await draw.setContent(`<body style="font:18px/1.5 Georgia,serif;padding:40px;background:#fbf8ef;color:#222">
<p style="text-align:right">Date: 12.11.2026</p><p>To<br>The District Collector,<br>Chennai.</p>
<p>From<br>R. Meena,<br>27, Jawahar Street, Perambur, Chennai 600011.<br>Mobile: 9000041874</p>
<p><b>Subject: Sewage overflowing on Jawahar Street</b></p>
<p>Respected Sir/Madam,</p><p>For the past one week sewage has been overflowing from the manhole in front of door no. 27, Jawahar Street, Perambur (Ward 70).
The street smells and children cannot walk to school. I request you to clear the block and repair the manhole at the earliest.</p>
<p>Thanking you,<br>Yours faithfully,<br>R. Meena</p></body>`);
const petitionPng = await draw.screenshot({ fullPage: false });
await draw.close();

const mctx = await ctxFor(browser, "manu", 1280);
page = await mctx.newPage();
watch(page, rec);
await step("desk-load", async () => {
  const t0 = Date.now();
  const r = await page.goto("/officer", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator(".mn").waitFor({ timeout: 60_000 });
  const ms = Date.now() - t0;
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  return { status: r?.status(), ms, text: (await textOf(page, "body")).slice(0, 2500), shot: await shot(page, `${P}-desk-home`), layout: await layout(page) };
});

let readMs = null;
await step("upload", async () => {
  const t0 = Date.now();
  await page.locator('.mn-up input[type="file"][multiple]').setInputFiles({ name: "petition.png", mimeType: "image/png", buffer: petitionPng });
  await page.waitForTimeout(1500);
  const during = { text: (await textOf(page, ".mn-work")).slice(0, 1500), shot: await shot(page, `${P}-reading`) };
  // until the check form (or a stop) shows: at most 3 minutes
  let state = "";
  while (Date.now() - t0 < 180_000) {
    if (await page.locator("form.mn-form").count()) { state = "form"; break; }
    if (await page.locator(".mn-err").count()) { state = "error"; break; }
    await page.waitForTimeout(1500);
  }
  readMs = Date.now() - t0;
  return { during, state, readMs, list: (await textOf(page, ".mn-lists")).slice(0, 1500), err: await textOf(page, ".mn-err"), head: await textOf(page, ".mn-formhead"), shot: await shot(page, `${P}-check-form`), shotFull: await shot(page, `${P}-check-form-full`, { fullPage: true }) };
});

const field = (label) => page.locator("label.mn-f").filter({ has: page.locator("span", { hasText: new RegExp(`^${label.replace(/[.()]/g, "\\$&")}`) }) }).locator("input, textarea, select").first();
await step("check", async () => {
  const before = {};
  for (const l of ["Name", "Mobile", "Date on the petition", "Door no.", "Street", "Area", "Pincode", "Ward", "Department", "Subject (as written)", "The problem, in one line (English)", "What they ask for (English)", "The petition's full text"])
    before[l] = await field(l).inputValue().catch(() => "?");
  const fill = { Name: "R. Meena", Mobile: "9000041874", "Date on the petition": "12.11.2026", "Door no.": "27", Street: "Jawahar Street", Area: "Perambur", Pincode: "600011", Ward: "70",
    "Subject (as written)": "Sewage overflowing on Jawahar Street", "The problem, in one line (English)": "Sewage overflowing from the manhole on Jawahar Street for a week",
    "What they ask for (English)": "Clear the block and repair the manhole", "The petition's full text": "QA pass 6 journeys petition: sewage overflowing on Jawahar Street, Perambur, for a week." };
  for (const [l, v] of Object.entries(fill)) if (!before[l] || before[l] === "?") await field(l).fill(v);
  const dept = field("Department");
  const opts = await dept.locator("option").allInnerTexts();
  if (!(await dept.inputValue())) { const o = opts.find((x) => /CMWSSB|Metro.?Water|sewer/i.test(x)) ?? opts[1]; await dept.selectOption({ label: o }); }
  await page.waitForTimeout(1500);
  const after = {};
  for (const l of Object.keys(before)) after[l] = await field(l).inputValue().catch(() => "?");
  return { before, after, deptOptions: opts.slice(0, 30), came: await textOf(page, ".mn-came"), sms: await textOf(page, "form.mn-form .mn-sms"), shot: await shot(page, `${P}-check-filled`, { fullPage: true }), layout: await layout(page) };
});

let code = null;
await step("approve", async () => {
  await page.locator("form.mn-form button[type=submit]").click();
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000 && !(await page.locator(".mn-ok, .mn-done").count()) && !(await page.locator("form.mn-form .mn-err").count())) await page.waitForTimeout(700);
  const ok = await textOf(page, ".mn-ok, .mn-done");
  code = await page.locator(".mn-ok strong, .mn-done strong").first().innerText().catch(() => null);
  return { ms: Date.now() - t0, ok: ok.replace(code ?? "zz", "<code>"), err: await textOf(page, "form.mn-form .mn-err"), list: (await textOf(page, ".mn-lists")).replace(code ?? "zz", "<code>").slice(0, 1500), shot: await shot(page, `${P}-approved`) };
});
await mctx.close();

// ---- the citizen on a phone: /track ---------------------------------------------------------------------------------
const pctx = await browser.newContext({ viewport: { width: 360, height: 780 }, baseURL: "http://127.0.0.1:3106", isMobile: true, hasTouch: true });
page = await pctx.newPage();
watch(page, rec);
await step("track-open", async () => {
  const t0 = Date.now();
  await page.goto("/track", { waitUntil: "networkidle", timeout: 60_000 });
  return { ms: Date.now() - t0, text: await textOf(page, "main"), shot: await shot(page, `${P}-track-empty`), layout: await layout(page) };
});
await step("track-wrong", async () => {
  const inputs = page.locator("main input");
  await inputs.nth(0).fill(code ?? "");
  await inputs.nth(1).fill("0000");
  await page.locator("main button").first().click();
  await page.waitForTimeout(2500);
  return { text: (await textOf(page, "main")).replace(code ?? "zz", "<code>"), shot: await shot(page, `${P}-track-wrong`) };
});
await step("track-right", async () => {
  const inputs = page.locator("main input");
  await inputs.nth(1).fill("1874");
  await page.locator("main button").first().click();
  await page.waitForTimeout(3000);
  const text = await textOf(page, "main");
  return { text: text.replace(code ?? "zz", "<code>"), personal: /Meena|9000041874|Jawahar|27,/i.test(text), shot: await shot(page, `${P}-track-result`, { fullPage: true }), layout: await layout(page) };
});
await pctx.close();

rec.code = code ? "issued" : null;
rec.log = logSince(mark);
save(`${P}.json`, rec);
save(`${P}-code.txt`, code ?? "");
console.log(JSON.stringify({ steps: rec.steps.map((s) => [s.name, s.ms, s.error ?? ""]), problems: rec.problems.length, logErrors: rec.log.errors.length, readMs }));
await browser.close();
