// Final browser drive, journey C: a citizen files a complaint (garbage bin, Solid Waste Management) and the officer of that department is told.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/final-browser.journeyC.mjs [en|ta] [1440|360]
// Writes journeyC-<lang>-<vp>.json (the complaint number, what the officer saw before and after) and C-<lang>-<vp>-*.png.
import fs from "node:fs";
import path from "node:path";
import { EV, launchBrowser, stateFor, openPage, goto, sideways } from "./final-browser.lib.mjs";

const lang = process.argv[2] || "en", vp = Number(process.argv[3] || 1440);
const log = { lang, vp, steps: [], started: new Date().toISOString() };
const step = (name, data) => { log.steps.push({ name, ...data }); console.log("STEP", name, JSON.stringify(data).slice(0, 320)); };
const txt = async (page, n = 1500) => (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, n);
const photo = path.join(EV, "citizen-photo-fixture.jpg");
const br = await launchBrowser();
const save = () => fs.writeFileSync(path.join(EV, `journeyC-${lang}-${vp}.json`), JSON.stringify(log, null, 1));
// a small real photo for the upload step
{ const p = await br.newPage({ viewport: { width: 800, height: 600 } }); await p.setContent('<body style="margin:0;background:linear-gradient(#9cc,#665)"><div style="position:absolute;left:250px;top:200px;width:300px;height:300px;background:#3a5;border-radius:20px"></div><h1 style="color:#fff">Overflowing bin</h1></body>'); await p.screenshot({ path: photo, type: "jpeg", quality: 80 }); await p.close(); }

// 1. what the officer sees before
const off = await openPage(br, await stateFor("officerA"), lang, 1440);
await goto(off.page, "/officer", 5000);
const beforeText = await off.page.locator("body").innerText();
const waitingBefore = Number(beforeText.match(/(\d+)\s*\n?\s*(To approve|அனுமதிக்க)/)?.[1] ?? NaN);
step("officer-before", { waitingBefore, text: await txt(off.page, 500) });
await off.page.screenshot({ path: path.join(EV, `C-${lang}-officer-before.png`) });

// 2. the citizen files
const cit = await openPage(br, await stateFor("citizenA"), lang, vp, vp === 360 ? { extra: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } } : {});
const page = cit.page;
const shot = (n) => page.screenshot({ path: path.join(EV, `C-${lang}-${vp}-${n}.png`) });
const T = lang === "ta" ? null : { next: (s) => `button:has-text("Next: ${s}")` };
try {
  await goto(page, "/citizen/file-complaint", 2500);
  step("form", { text: await txt(page, 500), sideways: await sideways(page) });
  await shot("01-form");
  const buttons = await page.locator("button").evaluateAll((e) => e.map((x) => x.innerText.trim().replace(/\s+/g, " ")).filter(Boolean));
  step("buttons-step1", { buttons: buttons.slice(0, 25) });
  const nextBtn = (re) => page.locator("button", { hasText: re }).first();
  // the first filing asks for gender and address (they are saved to the profile); later filings are prefilled
  if (await page.locator('button:has-text("Male"), button:has-text("ஆண்")').count()) {
    await page.locator('button:has-text("Male"), button:has-text("ஆண்")').first().click();
    const addr = page.locator("input:not([readonly]):not([disabled])").first();
    if (!(await addr.inputValue().catch(() => ""))) await addr.fill("12 Test Street, Adyar, Chennai 600020");
  }
  await nextBtn(/Next: Location|அடுத்து: இடம்|இடம்/).click();
  await page.waitForTimeout(2500);
  const map = page.locator(".leaflet-container").first();
  await map.scrollIntoViewIfNeeded();
  const bb = await map.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  await page.waitForTimeout(3000);
  await shot("02-pin");
  step("pin", { text: (await txt(page, 1800)).slice(300, 1200), sideways: await sideways(page) });
  await page.locator('input[placeholder*="Gandhi"], input[placeholder*="காந்தி"]').first().fill("Gandhi Nagar 2nd Cross").catch(() => {});
  await nextBtn(/Next: Type|அடுத்து: வகை|வகை/).click();
  await page.waitForTimeout(1500);
  await page.locator("button", { hasText: /^Garbage|Garbage$|குப்பை/ }).first().click();
  await page.waitForTimeout(1500);
  await page.locator("button", { hasText: /Overflowing of Garbage Bin|குப்பைத் தொட்டி/ }).first().click();
  await nextBtn(/Next: Details|அடுத்து: விவரங்கள்|விவரங்கள்/).click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="file"]').first().setInputFiles(photo).catch((e) => step("photo-skip", { e: e.message.slice(0, 80) }));
  await page.locator("textarea").first().fill(lang === "ta" ? "காந்தி நகர் 2வது குறுக்குத் தெருவில் குப்பைத் தொட்டி 5 நாட்களாக நிரம்பி வழிகிறது. குப்பை சாலையில் சிதறுகிறது." : "The garbage bin on Gandhi Nagar 2nd Cross has been overflowing for 5 days. Waste is spilling on the road and there is a bad smell.");
  await page.waitForTimeout(1000);
  await shot("03-details");
  step("details", { sideways: await sideways(page), text: (await txt(page, 2600)).slice(300, 1400) });
  await page.locator("button", { hasText: /Submit complaint|புகாரை சமர்ப்பி|சமர்ப்பி/ }).first().click();
  await page.waitForTimeout(7000);
  await shot("04-submitted");
  const after = await page.locator("body").innerText();
  const no = (after.split(/COMPLAINT NUMBER|புகார் எண்/i)[1] || "").replace(/\s+/g, "").match(/^20\d\d-[A-Z0-9]{6}/)?.[0] ?? null; // the number is drawn one character a line
  log.complaintNo = no;
  step("submitted", { complaintNo: no, text: await txt(page, 900), console: cit.w.console, http: cit.w.http });
  save();
  // 3. the citizen's own tracking list
  await goto(page, "/citizen/track-complaints", 3000);
  await shot("05-track");
  step("track", { hasNo: no ? (await page.locator("body").innerText()).includes(no) : null, text: await txt(page, 700) });
} catch (e) { step("ERROR", { message: e.message.split("\n")[0] }); await shot("99-error").catch(() => {}); }
save();

// 4. the officer afterwards: a fresh page (the queue is read when the page opens)
const off2 = await openPage(br, await stateFor("officerA"), lang, 1440);
await goto(off2.page, "/officer", 6000);
const after2 = await off2.page.locator("body").innerText();
const waitingAfter = Number(after2.match(/(\d+)\s*\n?\s*(To approve|அனுமதிக்க)/)?.[1] ?? NaN);
const note = after2.match(/[^\n]*(new complaints? (is|are) filed with your department|புதிய புகார்[^\n]*பதிவாகியுள்ளது)[^\n]*/)?.[0] ?? null;
step("officer-after", { waitingBefore, waitingAfter, hasNo: log.complaintNo ? after2.includes(log.complaintNo) : null, hasGandhi: /Gandhi Nagar 2nd Cross/.test(after2), officerNote: note, bell: await off2.page.locator("button[aria-label*=otif], button[aria-label*=ell]").first().innerText().catch(() => "") });
// the work list too: the note belongs there
await off2.page.locator("[data-key=work]").first().click().catch(() => {});
await off2.page.locator("table tbody tr td, .oi-s").first().waitFor({ timeout: 40000 }).catch(() => {});
await off2.page.waitForTimeout(3000);
const workText = await off2.page.locator("body").innerText();
step("officer-work", { note: workText.match(/[^\n]*(new complaints? (is|are) filed with your department|புதிய புகார்[^\n]*பதிவாகியுள்ளது)[^\n]*/)?.[0] ?? null });
await off2.page.screenshot({ path: path.join(EV, `C-${lang}-officer-work.png`) });
await off2.page.screenshot({ path: path.join(EV, `C-${lang}-officer-after.png`) });
// the API, as the officer's own page reads it
const api = await off2.page.evaluate(async (no) => { const r = await fetch("/api/officer/grievances?q=" + encodeURIComponent(no || "zzz")); const j = await r.json().catch(() => ({})); return { status: r.status, rows: (j.rows || j.items || j.grievances || []).length, keys: Object.keys(j).slice(0, 8) }; }, log.complaintNo);
step("officer-api", api);
log.watchers = { citizen: cit.w, officerBefore: off.w, officerAfter: off2.w };
save();
await br.close();
