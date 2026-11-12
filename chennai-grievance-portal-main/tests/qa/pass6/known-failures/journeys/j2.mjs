// Journey 2: an officer's day as officerA (GCC-SWM), at 1280 px and at 360 px. `node j2.mjs 1280` or `node j2.mjs 360`.
// Setup: citizenA files a garbage complaint (the API the citizen form posts to), so the case is the citizen's own and can be followed on every side.
// The password step reads the officer's password from the QA seed inside this process; it is never printed or saved.
import { launch, ctxFor, watch, shot, textOf, save, layout, logMark, logSince, setShotPrefix, call, PORT } from "./jlib.mjs";
import { accounts } from "../../../seed-local-users.mjs";

const W = Number(process.argv[2] ?? 1280);
setShotPrefix(W < 500 ? 120 : 80);
const P = `j2w${W}`;
const rec = { width: W, steps: [], problems: [] };
const mark = logMark();
const browser = await launch();
let page;
const step = async (name, fn) => {
  rec.step = name; const t0 = Date.now(); const s = { name };
  try { Object.assign(s, (await fn()) ?? {}); } catch (e) { s.error = String(e.message).slice(0, 300); try { s.shot = await shot(page, `${P}-${name}-error`); } catch { /* none */ } }
  s.ms = Date.now() - t0; rec.steps.push(s); save(`${P}.json`, rec); console.log(name, s.ms, s.error ?? "");
  return s;
};

// ---- setup: the citizen's complaint --------------------------------------------------------------------------------
let code = null, caseId = null;
await step("setup-complaint", async () => {
  const tax = JSON.parse((await call(PORT, "citizenA", "GET", "/api/complaint-taxonomy")).text);
  const subs = tax.categories.flatMap((c) => c.subcomplaints);
  const swm = subs.filter((s) => s.departmentId === 4 && s.mappingStatus === "mapped");
  const pick = swm.find((s) => /garbage|waste|bin/i.test(s.label)) ?? swm[0];
  const zones = JSON.parse((await call(PORT, "citizenA", "GET", "/api/locations/zones")).text).zones;
  const z = zones.find((x) => /adyar/i.test(x.zone_name)) ?? zones[0];
  const ward = z.ward_start;
  const body = { firstName: "Qa", lastName: "CitizenA", gender: "Female", streetAddress: "12 QA Street", mobileNumber: "9000000001", zoneId: z.id,
    manualStreetName: "QA Journey Street", streetType: "Street", wardNumber: ward, wardSource: "user_selected", specificLocation: "Near the QA bus stop",
    complaintSubtypeId: pick.id, title: `Garbage not cleared for three days (QA journeys ${W})`, description: "The bin at the corner has overflowed for three days and stray dogs scatter the waste on the road.", isAnonymous: false };
  const r = await call(PORT, "citizenA", "POST", "/api/complaints", { body, headers: { referer: `http://127.0.0.1:${PORT}/citizen/file-complaint` } });
  const j = JSON.parse(r.text || "{}");
  code = j.complaintCode ?? null;
  caseId = code ? `INC-W-${code}` : null;
  return { status: r.status, subtype: pick?.label, dept: pick?.departmentName, zone: z.zone_name, ward, code: code ? "issued" : null, department: j.department, queueNote: j.queueNote ?? null, departmentPending: j.departmentPending, error: j.error };
});

// ---- the officer ---------------------------------------------------------------------------------------------------
const octx = await ctxFor(browser, "officerA", W);
page = await octx.newPage();
watch(page, rec);
await step("officer-load", async () => {
  const t0 = Date.now();
  const r = await page.goto("/officer", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("#o-queue").waitFor({ timeout: 60_000 });
  const ms = Date.now() - t0;
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  return { status: r?.status(), ms, shot: await shot(page, `${P}-officer-first`), shotFull: await shot(page, `${P}-officer-full`, { fullPage: true }), layout: await layout(page),
    queue: (await textOf(page, "#o-queue")).slice(0, 2500), top: (await textOf(page, "main")).slice(0, 2500) };
});

await step("find-case", async () => {
  const row = page.locator(`#o-queue tbody tr[title^="${caseId} "]`);
  let found = await row.count();
  const out = { inFirstPage: found };
  for (let i = 0; !found && i < 6; i++) {
    const next = page.locator('#o-queue button[aria-label="Next page"]');
    if (await next.isDisabled().catch(() => true)) break;
    await next.click(); await page.waitForTimeout(1800);
    found = await row.count();
    out.page = i + 2;
  }
  out.found = found;
  out.awaitingNote = await textOf(page, "[data-testid=queue-awaiting]");
  if (found) { await row.first().scrollIntoViewIfNeeded(); await row.first().click(); }
  else { await page.evaluate((id) => { window.__want = id; }, caseId); }
  await page.waitForTimeout(3000);
  out.drawer = (await textOf(page, "aside.odrawer")).slice(0, 3500);
  out.shot = await shot(page, `${P}-case-open`);
  out.layout = await layout(page);
  return out;
});

const drawerOpen = async () => (await page.locator("aside.odrawer").count()) > 0;
if (!(await drawerOpen())) {
  // not in the queue's pages: the officer's search (palette) for the case, as an officer would look it up
  await step("search-case", async () => {
    await page.locator("button.cmdk").first().click();
    await page.waitForTimeout(600);
    await page.keyboard.type(code ?? "QA");
    await page.waitForTimeout(2500);
    const txt = await textOf(page, "[role=dialog]");
    const shotS = await shot(page, `${P}-search`);
    const hit = page.locator("[role=dialog] button, [role=dialog] [role=option]").filter({ hasText: code ?? "zzz" });
    const n = await hit.count();
    if (n) { await hit.first().click(); await page.waitForTimeout(3000); }
    return { text: txt.slice(0, 1500), hits: n, shot: shotS, drawer: (await textOf(page, "aside.odrawer")).slice(0, 2500) };
  });
}

await step("approve", async () => {
  const btn = page.locator("aside.odrawer .odrawer-f button.btn").first();
  const label = await btn.innerText().catch(() => "");
  if (!/Approve/i.test(label)) return { skipped: `footer says: ${label}` };
  await btn.click();
  await page.waitForTimeout(3500);
  return { label, toast: await textOf(page, ".toasts"), drawer: (await textOf(page, "aside.odrawer")).slice(0, 2500), shot: await shot(page, `${P}-approved`) };
});

await step("close-report", async () => {
  const btn = page.locator("aside.odrawer .odrawer-f button.btn").first();
  const label = await btn.innerText().catch(() => "");
  if (!/Complete/i.test(label)) return { skipped: `footer says: ${label}` };
  await btn.click();
  await page.waitForTimeout(1200);
  const form = page.locator(".osend");
  await form.locator("textarea").fill("Bin cleared, area swept and disinfected; a second bin placed at the corner.");
  // a real photo: a PNG of part of this screen
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 240 } });
  await form.locator('input[type="file"]').setInputFiles({ name: "site.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(1200);
  const before = { text: (await textOf(page, ".osend")).slice(0, 1500), shot: await shot(page, `${P}-report-form`), layout: await layout(page) };
  await form.locator(".osend-f button.btn").last().click();
  await page.locator(".cfm").waitFor({ timeout: 15_000 });
  const cfm = { text: await textOf(page, ".cfm"), shot: await shot(page, `${P}-password-step`) };
  // first a wrong password (what an officer mistypes), then the right one
  await page.locator("#cfm-code").fill("not-the-password");
  await page.locator(".cfm button[type=submit]").click();
  await page.waitForTimeout(2500);
  const wrong = { text: await textOf(page, ".cfm"), shot: await shot(page, `${P}-password-wrong`) };
  const pw = accounts().find((a) => a.key === "officerA").password;
  await page.locator("#cfm-code").fill(pw);
  await page.locator(".cfm button[type=submit]").click();
  await page.waitForTimeout(5000);
  return { label, before, cfm, wrong, cfmLeft: await page.locator(".cfm").count(), sendLeft: await page.locator(".osend").count(), err: await textOf(page, ".oerr"), toast: await textOf(page, ".toasts"), shot: await shot(page, `${P}-closed`) };
});

await step("officer-after", async () => {
  // the case again, from the Verified tab
  const tabs = page.locator("#o-queue .oq-tabs button");
  const out = { tabs: await tabs.allInnerTexts().catch(() => []) };
  const ver = tabs.filter({ hasText: /Verified|Closed|Done/i });
  if (await ver.count()) { await ver.first().click(); await page.waitForTimeout(2500); }
  out.queue = (await textOf(page, "#o-queue")).slice(0, 2000);
  const row = page.locator(`#o-queue tbody tr[title^="${caseId} "]`);
  out.inVerified = await row.count();
  if (out.inVerified) { await row.first().click(); await page.waitForTimeout(2500); out.drawer = (await textOf(page, "aside.odrawer")).slice(0, 3000); }
  out.shot = await shot(page, `${P}-officer-after`);
  return out;
});
rec.officerProblems = rec.problems.length;
await octx.close();

// ---- the citizen ---------------------------------------------------------------------------------------------------
const cctx = await ctxFor(browser, "citizenA", W);
page = await cctx.newPage();
watch(page, rec);
await step("citizen-view", async () => {
  await page.goto(`/citizen/track-complaints?code=${encodeURIComponent(code)}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  return { text: (await textOf(page, "main")).slice(0, 4000), shot: await shot(page, `${P}-citizen`), shotFull: await shot(page, `${P}-citizen-full`, { fullPage: true }), layout: await layout(page) };
});
await step("citizen-home", async () => {
  await page.goto("/citizen", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  return { text: (await textOf(page, "main")).slice(0, 2500), shot: await shot(page, `${P}-citizen-home`), layout: await layout(page) };
});
await cctx.close();

// ---- the Collector -------------------------------------------------------------------------------------------------
if (W >= 1000) {
  const kctx = await ctxFor(browser, "collector", W);
  page = await kctx.newPage();
  watch(page, rec);
  await step("collector-find", async () => {
    await page.goto("/collector", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("header.top").waitFor({ timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined);
    await page.locator("button.cmdk").click();
    await page.waitForTimeout(500);
    await page.keyboard.type(code);
    await page.waitForTimeout(3000);
    const pal = await textOf(page, "[role=dialog]");
    const shotP = await shot(page, `${P}-collector-search`);
    const hit = page.locator("[role=dialog] button, [role=dialog] [role=option]").filter({ hasText: code });
    const n = await hit.count();
    if (n) { await hit.first().click(); await page.waitForTimeout(4000); }
    return { palette: pal.slice(0, 1500), hits: n, shotP, incident: (await textOf(page, ".modal.iv")).slice(0, 4000), shot: await shot(page, `${P}-collector-case`) };
  });
  await kctx.close();
}

rec.code = code ? "issued" : null;
rec.log = logSince(mark);
save(`${P}.json`, rec);
save(`${P}-code.txt`, code ?? "");
console.log(JSON.stringify({ steps: rec.steps.map((s) => [s.name, s.ms, s.error ?? s.skipped ?? ""]), problems: rec.problems.length, logErrors: rec.log.errors.length }));
await browser.close();
