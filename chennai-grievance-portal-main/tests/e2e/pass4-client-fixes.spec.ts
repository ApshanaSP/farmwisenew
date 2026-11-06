/**
 * QA pass 4: BUG-012, BUG-014, BUG-015 and BUG-016 in a real browser, on the production build, as the Collector. These fixes were
 * only ever read as code; this drives them. See pass4-client.harness.ts for what stands at the browser's edges (the microphone,
 * Whisper, the speech service and the voice). The server has no model key: anything that needs a model says so in its name and
 * mocks the agent's route at the boundary.
 *   node tests/qa/pass4/server.mjs start --port 3135 --ticking --env STUDIO_DIR=data/aws-cache/qa/srv/3135/studio
 *   node tests/qa/pass4/with-lock.mjs browser 3 -- npx playwright test --config tests/qa/pass4/playwright.client.config.ts
 * Use --ticking for a whole run: on a frozen clock the Studio's rate limits (30 added files, 40 questions) never pass, and the last tests fail on them.
 * A test named for a finding calls test.fail() only just before its last assertion, so a set-up failure fails loudly and is never taken for the bug.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { answerCard, captions, collector, coreState, jarvisOn, observed, openConsole, postsTo, shot, signedInState, spoken, thread, typed, type Rig } from "./pass4-client.harness";

let state = "";
test.beforeAll(async ({ browser }) => { state = await signedInState(browser); });

const last = (t: { who: string; text: string }[], who = "jarvis") => [...t].reverse().find((m) => m.who === who)?.text ?? "";
const ACTION = /\/api\/collector\/incidents\/[^/]+\/action$/;
const lastSaid = async (rig: Rig, re: RegExp, ms = 15_000) => {
  const t0 = Date.now();
  for (;;) {
    const l = last(await thread(rig));
    if (re.test(l)) return l;
    if (Date.now() - t0 > ms) throw new Error(`not said: ${re}; the last line: ${l}`);
    await rig.page.waitForTimeout(150);
  }
};

// ------------------------------------------------------------------------------------------- BUG-012: the tray --
const trayItems = (page: Page) => page.locator(".th-tray ol li");
const approve = (page: Page) => page.locator(".th-tray button.primary");

/** Two real drafts in the tray from the real draft route, and past the two seconds the tray must be on screen */
async function twoDrafts(rig: Rig, ask = "Show me the severe cases", then = "draft for the first two") {
  const { page } = rig;
  await jarvisOn(rig);
  await typed(rig, ask);
  await page.waitForSelector(".st-root", { timeout: 30_000 });
  await typed(rig, then);
  await page.waitForSelector(".th-tray", { timeout: 30_000 });
  await expect(trayItems(page)).toHaveCount(2);
  await page.waitForTimeout(2300);
}
/** the screen goes back to the dashboard; the tray stays */
async function closeScreen(page: Page) {
  await page.locator(".st-home").click();
  await page.waitForSelector(".st-root", { state: "detached", timeout: 10_000 });
}
/** what the Collector can actually reach at the middle of an element: true when it is the element itself */
const reachable = (page: Page, sel: string) => page.evaluate((q) => {
  const el = document.querySelector(q);
  if (!el) return { there: false, onTop: false, top: null as string | null };
  const r = el.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { there: true, onTop: !!t && (t === el || el.contains(t)), top: t ? `${t.tagName.toLowerCase()}.${String((t as HTMLElement).className).slice(0, 40)}` : null };
}, sel);
/** every "Confirm it's you" box that comes up gets the real password, up to n boxes. Returns how many came up, and how many were already filled in when they came up */
async function confirmBoxes(page: Page, n: number, waitMs = 15_000) {
  let boxes = 0, prefilled = 0;
  const ok = page.locator(".cfm-acts button.pri");
  for (let i = 0; i < n; i++) {
    const up = await page.locator(".cfm").waitFor({ timeout: waitMs }).then(() => true).catch(() => false);
    if (!up) break;
    boxes++;
    await page.waitForTimeout(250);
    if (await page.locator("#cfm-code").inputValue().catch(() => "")) prefilled++;
    await page.locator("#cfm-code").fill(collector().password);
    await ok.click();
    // the check has come back: the box has gone, or the next one stands in its place
    await page.waitForFunction(() => !/Checking/.test(document.querySelector(".cfm-acts button.pri")?.textContent ?? ""), null, { timeout: 15_000 });
    await page.waitForTimeout(700);
  }
  return { boxes, prefilled };
}
const auditOutcome = (rig: Rig) => postsTo(rig, /thunai\/audit$/).map((p) => { try { return String(JSON.parse(p.body ?? "{}").outcome ?? ""); } catch { return ""; } }).filter((o) => /^sent /.test(o)).pop() ?? null;

test.describe("BUG-012 tray send failure and cancel", () => {
  test("a real failed send (the request is aborted): both drafts stay, nothing says Approved", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await page.route(ACTION, (r: Route) => (r.request().method() === "POST" ? r.abort("connectionrefused") : r.fallback()));
    await approve(page).click();
    const said = await lastSaid(rig, /could not be sent/);
    await shot(page, "bug012-abort");
    await expect(trayItems(page)).toHaveCount(2);
    const t = await thread(rig);
    expect(t.map((m) => m.text).join(" ")).not.toMatch(/Approved\./);
    observed("BUG-012 abort", { said, tray: await trayItems(page).count(), actionPosts: postsTo(rig, ACTION).length, audit: auditOutcome(rig) });
    await rig.ctx.close();
  });

  test("a server error on the send (500): both drafts stay", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await page.route(ACTION, (r: Route) => (r.request().method() === "POST" ? r.fulfill({ status: 500, json: { error: "Could not send the instruction." } }) : r.fallback()));
    await approve(page).click();
    const said = await lastSaid(rig, /could not be sent/);
    await expect(trayItems(page)).toHaveCount(2);
    observed("BUG-012 500", { said, tray: await trayItems(page).count() });
    await rig.ctx.close();
  });

  test("a real cancel of Confirm it's you (Cancel, then Esc): both drafts stay", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await closeScreen(page);
    await page.waitForTimeout(2300);
    await approve(page).click();
    await page.waitForSelector(".cfm", { timeout: 15_000 });
    await shot(page, "bug012-confirm-box");
    const boxReach = { cancel: await reachable(page, ".cfm-acts button"), code: await reachable(page, "#cfm-code"), confirm: await reachable(page, ".cfm-acts button.pri") };
    const title = await page.locator("#cfm-t").innerText();
    await page.locator(".cfm-acts button", { hasText: "Cancel" }).click();
    // the second draft has its own box
    await page.waitForSelector(".cfm", { timeout: 15_000 });
    await page.keyboard.press("Escape");
    const said = await lastSaid(rig, /could not be sent/);
    await shot(page, "bug012-cancel");
    await expect(trayItems(page)).toHaveCount(2);
    expect((await thread(rig)).map((m) => m.text).join(" ")).not.toMatch(/Approved\./);
    observed("BUG-012 cancel", { boxReach, title, said, tray: await trayItems(page).count(), actionPosts: postsTo(rig, ACTION).length, audit: auditOutcome(rig) });
    await rig.ctx.close();
  });

  test("cancel one, confirm the other: one goes, one stays, and it is said so", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await closeScreen(page);
    await page.waitForTimeout(2300);
    await approve(page).click();
    await page.waitForSelector(".cfm", { timeout: 15_000 });
    await page.locator(".cfm-x").click();
    await page.waitForFunction(() => !!document.querySelector(".cfm"), null, { timeout: 15_000 });
    await page.locator("#cfm-code").fill(collector().password);
    await page.locator(".cfm-acts button.pri").click();
    const said = await lastSaid(rig, /could not be sent|Sent|Approved/, 30_000);
    await shot(page, "bug012-partial");
    observed("BUG-012 partial", { said, tray: await trayItems(page).count(), audit: auditOutcome(rig) });
    await expect(trayItems(page)).toHaveCount(1);
    expect(said).toMatch(/^1 could not be sent and are still in the tray\. 1 went through\.$/);
    await rig.ctx.close();
  });

  test("control: the same tray with both confirmed really sends, and empties", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await closeScreen(page);
    await page.waitForTimeout(2300);
    await approve(page).click();
    for (let i = 0; i < 2; i++) {
      await page.waitForFunction(() => !!document.querySelector(".cfm"), null, { timeout: 15_000 });
      await page.locator("#cfm-code").fill(collector().password);
      await page.locator(".cfm-acts button.pri").click();
      await page.waitForFunction(() => !document.querySelector(".cfm input:disabled"), null, { timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(800);
    }
    const said = await lastSaid(rig, /Sent 2|could not be sent/, 30_000);
    observed("BUG-012 control", { said, tray: await trayItems(page).count(), audit: auditOutcome(rig) });
    expect(said).toMatch(/^Sent 2 through the test channel\.$/);
    await expect(page.locator(".th-tray")).toHaveCount(0);
    await rig.ctx.close();
  });

  test("retry after a real failure: the kept drafts wait two seconds again, then really send and the tray empties", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await page.route(ACTION, (r: Route) => (r.request().method() === "POST" ? r.abort("connectionrefused") : r.fallback()));
    await approve(page).click();
    await lastSaid(rig, /could not be sent/);
    await page.unroute(ACTION);
    // the kept drafts' two seconds start again
    const mark = postsTo(rig, ACTION).length;
    await approve(page).click();
    await page.waitForTimeout(400);
    const tooEarly = { line: last(await thread(rig)), posts: postsTo(rig, ACTION).length - mark, tray: await trayItems(page).count() };
    await closeScreen(page);
    await page.waitForTimeout(2300);
    await approve(page).click();
    const boxes = await confirmBoxes(page, 2);
    const said = await lastSaid(rig, /Sent 2|could not be sent/, 30_000);
    observed("BUG-012 retry", { tooEarly, boxes, said, tray: await trayItems(page).count(), audit: auditOutcome(rig) });
    expect(said).toMatch(/^Sent 2 through the test channel\.$/);
    await expect(page.locator(".th-tray")).toHaveCount(0);
    await rig.ctx.close();
  });

  test("a click outside the box (the veil) cancels too: both drafts stay", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await closeScreen(page);
    await page.waitForTimeout(2300);
    await approve(page).click();
    for (let i = 0; i < 2; i++) {
      await page.waitForSelector(".cfm", { timeout: 15_000 });
      await page.mouse.click(6, 6);
      await page.waitForTimeout(500);
    }
    const said = await lastSaid(rig, /could not be sent/);
    await expect(trayItems(page)).toHaveCount(2);
    observed("BUG-012 veil", { said, tray: await trayItems(page).count() });
    await rig.ctx.close();
  });

  test("Tamil screen: a real failed send says so in Tamil and keeps the drafts", async ({ browser }) => {
    const rig = await openConsole(browser, state, { lang: "ta" });
    const { page } = rig;
    await twoDrafts(rig, "கடுமையான சம்பவங்களைக் காட்டு");
    await page.route(ACTION, (r: Route) => (r.request().method() === "POST" ? r.abort("connectionrefused") : r.fallback()));
    await approve(page).click();
    const said = await lastSaid(rig, /அனுப்ப முடியவில்லை/);
    await shot(page, "bug012-tamil");
    await expect(trayItems(page)).toHaveCount(2);
    expect((await thread(rig)).map((m) => m.text).join(" ")).not.toMatch(/ஒப்புதல் அளிக்கப்பட்டது/);
    observed("BUG-012 tamil", { said, tray: await trayItems(page).count() });
    await rig.ctx.close();
  });

  test("Tanglish request: the drafts come from Tanglish, and a real failed send still keeps them", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig, "severe cases kaattu");
    await page.route(ACTION, (r: Route) => (r.request().method() === "POST" ? r.abort("connectionrefused") : r.fallback()));
    await approve(page).click();
    const said = await lastSaid(rig, /could not be sent/);
    await expect(trayItems(page)).toHaveCount(2);
    observed("BUG-012 tanglish", { said, tray: await trayItems(page).count() });
    await rig.ctx.close();
  });
});

test.describe("BUG-012: more of the tray", () => {
  test("audit-client_browser-4: Approve on the open Jarvis screen, the password box must be on top", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await approve(page).click();
    await page.waitForFunction(() => !!document.querySelector(".cfm"), null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    await shot(page, "bug012-box-under-screen");
    const reach = { cancel: await reachable(page, ".cfm-acts button"), code: await reachable(page, "#cfm-code"), confirm: await reachable(page, ".cfm-acts button.pri") };
    // nothing can be seen, so the Collector taps again
    const mark = postsTo(rig, ACTION).length;
    await approve(page).click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const postsAfterSecondTap = postsTo(rig, ACTION).length - mark;
    const line = last(await thread(rig));
    // the one way out that does not need the box to be seen
    for (let i = 0; i < 6 && (await page.locator(".cfm").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
    await page.waitForTimeout(1200);
    const rec = { reach, postsAfterSecondTap, lineWhileWaiting: line, lineAfterEsc: last(await thread(rig)), tray: await trayItems(page).count() };
    observed("BUG-012 box under the screen", rec);
    await rig.ctx.close();
    test.fail();
    expect(rec.reach.code.onTop, "the password field can be reached").toBe(true);
  });

  /** how many instructions the server itself has on record for each draft in the tray */
  const onRecord = async (rig: Rig, ids: string[]) => Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await rig.page.evaluate(async (i) => { const r = await fetch(`/api/collector/incidents/${encodeURIComponent(i)}/action`); const j = await r.json() as { sent?: unknown[] }; return (j.sent ?? []).length; }, id)] as const)));

  test("audit-client_browser-5: a double tap on Approve must not send the same draft twice", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    const seen = new Set<string>();
    page.on("request", (q) => { const u = new URL(q.url()); if (ACTION.test(u.pathname)) seen.add(decodeURIComponent(u.pathname.split("/").at(-2)!)); });
    await twoDrafts(rig);
    await closeScreen(page);
    await page.waitForTimeout(2300);
    const ids = [...seen];
    const before = await onRecord(rig, ids);
    await approve(page).dblclick();
    const { boxes, prefilled } = await confirmBoxes(page, 8, 4000);
    await page.waitForTimeout(1500);
    const after = await onRecord(rig, ids);
    const added = ids.map((id) => (after[id] ?? 0) - (before[id] ?? 0));
    const rec = { drafts: ids.length, boxes, prefilled, addedOnTheServerForEachDraft: added, line: last(await thread(rig)), tray: await page.locator(".th-tray ol li").count(), audit: postsTo(rig, /thunai\/audit$/).map((p) => { try { return String(JSON.parse(p.body ?? "{}").outcome ?? ""); } catch { return ""; } }).filter((o) => /^sent /.test(o)) };
    await shot(page, "bug012-double-tap");
    observed("BUG-012 double tap", rec);
    await rig.ctx.close();
    test.fail();
    expect(rec.addedOnTheServerForEachDraft.every((n) => n === 1), "each draft went once").toBe(true);
  });

  test("audit-client_browser-15: the next Confirm it's you box must not come up with the password already in it", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    await closeScreen(page);
    await page.waitForTimeout(2300);
    await approve(page).dblclick();
    await page.locator(".cfm").waitFor({ timeout: 15_000 });
    await page.locator("#cfm-code").fill(collector().password);
    await page.locator(".cfm-acts button.pri").click();
    await page.waitForFunction(() => !/Checking/.test(document.querySelector(".cfm-acts button.pri")?.textContent ?? ""), null, { timeout: 15_000 });
    await page.waitForTimeout(600);
    const next = { box: await page.locator(".cfm").count(), filled: (await page.locator("#cfm-code").inputValue().catch(() => "")).length > 0, confirmEnabled: await page.locator(".cfm-acts button.pri").isEnabled().catch(() => false) };
    await shot(page, "bug012-box-prefilled");
    // leave the rest unsent
    for (let i = 0; i < 6 && (await page.locator(".cfm").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
    observed("Confirm box keeps the password", next);
    await rig.ctx.close();
    expect(next.box, "a second box came up").toBe(1);
    test.fail();
    expect(next.filled, "the second box is empty").toBe(false);
  });

  test("audit-client_browser-6: the tray's own hint says what works: saying confirm 2 in three languages", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await twoDrafts(rig);
    const hint = await page.locator(".th-tray .hint").innerText();
    const mark = postsTo(rig, ACTION).length;
    const out: Record<string, { line: string; actionPosts: number; tray: number }> = {};
    for (const w of ["confirm 2", "உறுதி 2", "uruthi 2 pannu"]) {
      await spoken(rig, { text: `Jarvis, ${w}` });
      await page.waitForTimeout(3000);
      out[w] = { line: last(await thread(rig)), actionPosts: postsTo(rig, ACTION).length - mark, tray: await trayItems(page).count() };
    }
    observed("BUG-012 spoken confirm", { hint, out });
    await shot(page, "bug012-spoken-confirm");
    await rig.ctx.close();
    // nothing must be sent by voice, and that part holds; what is wrong is the hint
    expect(Object.values(out).every((r) => r.actionPosts === 0)).toBe(true);
    test.fail();
    expect(hint, "the tray does not tell the Collector to say something Jarvis refuses").not.toMatch(/confirm 2/);
  });

  test("audit-client_browser-7: two drafts the sandbox cannot send (EMAIL_MODE live, one field changed at the boundary): none may vanish", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    // the delivery mode comes from the server's own answer: only that one field is changed, at the boundary
    await page.route(ACTION, async (r: Route) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      const j = await resp.json();
      await r.fulfill({ response: resp, json: { ...j, delivery: { ...(j.delivery ?? {}), mode: "live" } } });
    });
    await twoDrafts(rig);
    await closeScreen(page);
    await page.waitForTimeout(2300);
    const label = await approve(page).innerText();
    const mark = postsTo(rig, ACTION).length;
    await approve(page).click();
    await page.waitForTimeout(2500);
    await shot(page, "bug012-live-drafts");
    const rec = { label, line: last(await thread(rig)), tray: await page.locator(".th-tray ol li").count(), actionPosts: postsTo(rig, ACTION).length - mark };
    observed("BUG-012 live drafts", rec);
    await rig.ctx.close();
    // two drafts, one panel, nothing sent: the other draft must still be somewhere
    test.fail();
    expect(rec.tray, "the draft whose panel is not open stays in the tray").toBe(1);
  });
});

// ------------------------------------------------------------------------------------------- BUG-016: the captions yes --
const saveCard = (page: Page) => page.locator(".th-card.amber");

/** Whisper is down (a real failed request or a 503), so the browser's recogniser is what hears; a save card is waiting */
async function captionsDown(rig: Rig, failure: "fail" | "503" = "fail") {
  const { page } = rig;
  await jarvisOn(rig);
  await spoken(rig, failure);
  await page.waitForFunction(() => (window as unknown as { __srLive: () => { interim: boolean }[] }).__srLive().some((r) => !r.interim), null, { timeout: 10_000 });
}
async function askSave(rig: Rig, name = "Monsoon") {
  const { page } = rig;
  await typed(rig, `save this view as ${name}`);
  await saveCard(page).waitFor({ timeout: 25_000 });
  // captions are ignored while the voice speaks: wait for it to end
  await page.waitForFunction(() => document.querySelector('[data-testid="hud"]')?.getAttribute("data-core") !== "speaking", null, { timeout: 15_000 });
  await page.waitForTimeout(600);
}
const WS = /\/api\/collector\/workspaces$/;
const AGENT = /\/api\/collector\/thunai\/(agent\/round|plan)$/;

test.describe("BUG-016 the captions yes", () => {
  test("control: the original input, a yes Whisper heard, saves", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    await askSave(rig);
    const mark = rig.posts.length;
    await spoken(rig, { text: "yes" });
    await page.waitForFunction(() => !document.querySelector(".th-card.amber"), null, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    observed("BUG-016 control whisper yes", { savedPosts: postsTo(rig, WS, mark).length, line: last(await thread(rig)) });
    expect(postsTo(rig, WS, mark).length).toBe(1);
    await rig.ctx.close();
  });

  for (const failure of ["fail", "503"] as const) {
    test(`the original input: a yes heard only by captions (Whisper ${failure === "fail" ? "unreachable" : "answers 503"}) keeps the card and sends nothing on`, async ({ browser }) => {
      const rig = await openConsole(browser, state);
      const { page } = rig;
      await captionsDown(rig, failure);
      await askSave(rig);
      const mark = rig.posts.length;
      expect(await captions(rig, "yes")).toBe(1);
      const said = await lastSaid(rig, /couldn't hear that yes/);
      await shot(page, `bug016-captions-yes-${failure}`);
      await expect(saveCard(page)).toBeVisible();
      expect(postsTo(rig, AGENT, mark).length).toBe(0);
      expect(postsTo(rig, WS, mark).length).toBe(0);
      // and it can still be tapped
      const card = (await saveCard(page).innerText()).split("\n")[0];
      await saveCard(page).locator("button.primary").click();
      await page.waitForFunction(() => !document.querySelector(".th-card.amber"), null, { timeout: 15_000 });
      await page.waitForTimeout(1500);
      observed(`BUG-016 captions yes (${failure})`, { said, card, agentPosts: postsTo(rig, AGENT, mark).length, savedAfterTap: postsTo(rig, WS, mark).length, line: last(await thread(rig)) });
      expect(postsTo(rig, WS, mark).length).toBe(1);
      await rig.ctx.close();
    });
  }

  test("every word on the accepted yes list, from captions, in English, Tamil script and Tanglish: the card stays", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await captionsDown(rig);
    await askSave(rig);
    const out: Record<string, unknown> = {};
    for (const w of ["Yes.", "ok", "okay", "save", "do it", "ஆம்", "ஆமா", "சரி", "aama", "sari", "seri", "Jarvis, yes", "ஜார்விஸ், சரி"]) {
      const mark = rig.posts.length;
      const n = await captions(rig, w);
      await page.waitForTimeout(1200);
      out[w] = { reached: n, card: await saveCard(page).count(), agentPosts: postsTo(rig, AGENT, mark).length, saved: postsTo(rig, WS, mark).length, line: last(await thread(rig)).slice(0, 70) };
    }
    observed("BUG-016 accepted words by captions", out);
    for (const [w, r] of Object.entries(out) as [string, { card: number; agentPosts: number; saved: number }][]) {
      expect.soft(r.card, `${w}: the card stays`).toBe(1);
      expect.soft(r.agentPosts + r.saved, `${w}: nothing goes on`).toBe(0);
    }
    await rig.ctx.close();
  });

  test("the voice still speaking: captions are not heard at all, the card stays", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await captionsDown(rig);
    await page.unroute("**/api/jarvis/say");
    await page.route("**/api/jarvis/say", async (r: Route) => { await new Promise((x) => setTimeout(x, 4000)); await r.abort().catch(() => undefined); });
    await typed(rig, "save this view as Monsoon");
    await saveCard(page).waitFor({ timeout: 25_000 });
    const mark = rig.posts.length;
    await captions(rig, "yes");
    await page.waitForTimeout(800);
    observed("BUG-016 while speaking", { card: await saveCard(page).count(), agentPosts: postsTo(rig, AGENT, mark).length });
    await expect(saveCard(page)).toBeVisible();
    expect(postsTo(rig, AGENT, mark).length).toBe(0);
    await rig.ctx.close();
  });

  test("the ribbon's own recogniser hearing yes is display only: the card stays", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    await askSave(rig);
    const mark = rig.posts.length;
    const n = await captions(rig, "yes", "ribbon");
    await page.waitForTimeout(1000);
    observed("BUG-016 ribbon", { reached: n, card: await saveCard(page).count(), agentPosts: postsTo(rig, AGENT, mark).length });
    await expect(saveCard(page)).toBeVisible();
    await rig.ctx.close();
  });

  test("a pin card on an open screen: a captions yes keeps it, a tap pins", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await captionsDown(rig);
    await typed(rig, "Show me the severe cases");
    await page.waitForSelector(".st-root", { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="hud"]')?.getAttribute("data-core") !== "speaking", null, { timeout: 30_000 });
    await typed(rig, "pin this");
    await saveCard(page).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(900);
    const mark = rig.posts.length;
    await captions(rig, "yes");
    await lastSaid(rig, /couldn't hear that yes/);
    await expect(saveCard(page)).toBeVisible();
    const pinsBefore = postsTo(rig, /thunai\/memory$/, mark).filter((p) => /"op":"pin"/.test(p.body ?? "")).length;
    await saveCard(page).locator("button.primary").click();
    await page.waitForTimeout(1200);
    const pinsAfter = postsTo(rig, /thunai\/memory$/, mark).filter((p) => /"op":"pin"/.test(p.body ?? "")).length;
    observed("BUG-016 pin card", { pinsBefore, pinsAfter });
    expect(pinsBefore).toBe(0);
    expect(pinsAfter).toBe(1);
    await rig.ctx.close();
  });

  test("audit-client_browser-3: other everyday ways of saying yes, from captions: the card must stay and nothing goes on", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await captionsDown(rig);
    const out: Record<string, { reached: number; cardRightAfter: number; agentPosts: number; saved: number; newLines: string[] }> = {};
    for (const w of ["ஆமாம்", "yes please", "yes save it", "யெஸ்", "ஓகே", "aamam", "seri seri", "okay da"]) {
      if (!(await saveCard(page).count())) await askSave(rig);
      const mark = rig.posts.length;
      const before = (await thread(rig)).length;
      const n = await captions(rig, w);
      await page.waitForTimeout(800);
      const cardRightAfter = await saveCard(page).count();
      await page.waitForTimeout(2500);
      out[w] = { reached: n, cardRightAfter, agentPosts: postsTo(rig, AGENT, mark).length, saved: postsTo(rig, WS, mark).length, newLines: (await thread(rig)).slice(before).map((m) => `${m.who}: ${m.text.slice(0, 80)}`) };
      await shot(page, `bug016-word-${Object.keys(out).length}`);
    }
    observed("BUG-016 other yes words by captions", out);
    await rig.ctx.close();
    test.fail();
    expect(Object.values(out).every((r) => r.cardRightAfter === 1 && r.agentPosts === 0)).toBe(true);
  });

  test("audit-client_browser-3: the same everyday yes words heard by Whisper: the card must save", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    const out: Record<string, { saved: number; card: number; agentPosts: number; newLines: string[] }> = {};
    for (const w of ["ஆமாம்", "yes please", "யெஸ்", "ஓகே", "aamam", "seri seri"]) {
      if (!(await saveCard(page).count())) await askSave(rig);
      const mark = rig.posts.length;
      const before = (await thread(rig)).length;
      await spoken(rig, { text: w });
      await page.waitForTimeout(3000);
      out[w] = { saved: postsTo(rig, WS, mark).length, card: await saveCard(page).count(), agentPosts: postsTo(rig, AGENT, mark).length, newLines: (await thread(rig)).slice(before).map((m) => `${m.who}: ${m.text.slice(0, 80)}`) };
    }
    await shot(page, "bug016-whisper-words");
    observed("BUG-016 other yes words by Whisper", out);
    await rig.ctx.close();
    test.fail();
    expect(Object.values(out).every((r) => r.saved === 1)).toBe(true);
  });

  test("audit-client_browser-11: Jarvis's own question caught by captions just after the voice ended must change nothing", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await captionsDown(rig);
    await askSave(rig);
    const first = (await saveCard(page).innerText()).split("\n")[0];
    const mark = rig.posts.length, before = (await thread(rig)).length;
    const n = await captions(rig, first);
    await page.waitForTimeout(3500);
    const rec = { first, reached: n, now: (await saveCard(page).count()) ? (await saveCard(page).innerText()).split("\n")[0] : null, agentPosts: postsTo(rig, AGENT, mark).length, newLines: (await thread(rig)).slice(before).map((m) => `${m.who}: ${m.text.slice(0, 80)}`) };
    await shot(page, "bug016-echo");
    observed("BUG-016 echo", rec);
    await rig.ctx.close();
    test.fail();
    expect(rec.now, "the card is the one it was").toBe(first);
    expect(rec.newLines, "nothing was added to the thread").toEqual([]);
  });

  for (const v of [{ name: "Tamil script", ask: "இதை 'திங்கள் ஆய்வு' என்று சேமி", yes: "ஆம்" }, { name: "Tanglish", ask: "idha 'Monday review' nu save pannu", yes: "seri" }]) {
    test(`a save asked in ${v.name}, a captions yes: the card stays and it is said in Tamil`, async ({ browser }) => {
      const rig = await openConsole(browser, state, { lang: "ta" });
      const { page } = rig;
      await captionsDown(rig);
      await typed(rig, v.ask);
      await saveCard(page).waitFor({ timeout: 25_000 });
      await page.waitForFunction(() => document.querySelector('[data-testid="hud"]')?.getAttribute("data-core") !== "speaking", null, { timeout: 15_000 });
      await page.waitForTimeout(600);
      const card = (await saveCard(page).innerText()).split("\n")[0];
      const mark = rig.posts.length;
      const n = await captions(rig, v.yes);
      const said = await lastSaid(rig, /தெளிவாகக் கேட்கவில்லை|couldn't hear/);
      observed(`BUG-016 asked in ${v.name}`, { card, reached: n, said, cardStill: await saveCard(page).count(), agentPosts: postsTo(rig, AGENT, mark).length, saved: postsTo(rig, WS, mark).length });
      await expect(saveCard(page)).toBeVisible();
      expect(said).toMatch(/தெளிவாகக் கேட்கவில்லை/);
      expect(postsTo(rig, AGENT, mark).length).toBe(0);
      await rig.ctx.close();
    });
  }
});

// ------------------------------------------------------------------------------------------- Data Studio set-up --
/** The page's own fetch: the sign-in cookie is Secure and lives in the tab's slot, so a call made outside the page has no session. */
const pageFetch = (rig: Rig, url: string, o: { json?: unknown; csv?: { name: string; text: string } } = {}) => rig.page.evaluate(async ([u, j, c]) => {
  const init: RequestInit = {};
  if (j != null) { init.method = "POST"; init.headers = { "content-type": "application/json" }; init.body = JSON.stringify(j); }
  if (c) { const f = new FormData(); f.append("file", new File([(c as { text: string }).text], (c as { name: string }).name, { type: "text/csv" })); init.method = "POST"; init.body = f; }
  return (await fetch(u as string, init)).text();
}, [url, o.json ?? null, o.csv ?? null] as const);
/** A dataset through the real pipeline (rules only: no model key). It comes back as it was on a second run. */
const addCsv = async (rig: Rig, name: string, text: string) => finish(rig, await pageFetch(rig, "/api/collector/studio", { csv: { name, text } }));
const SAMPLE_FILE: Record<string, RegExp> = { fever: /^Fever & dengue/, beds: /^Hospital beds/ };
const addSample = async (rig: Rig, sample: string) => {
  const have = (JSON.parse(await pageFetch(rig, "/api/collector/studio")) as { datasets: { id: string; name: string }[] }).datasets.find((d) => SAMPLE_FILE[sample]?.test(d.name));
  return have ? { id: have.id, name: have.name } : finish(rig, await pageFetch(rig, "/api/collector/studio", { json: { sample } }));
};
async function finish(rig: Rig, body: string): Promise<{ id: string; name: string }> {
  const parsed = (t: string) => t.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  const all = parsed(body);
  const done = all.find((l) => l.t === "done"), o = all.find((l) => l.t === "outcome")?.outcome;
  let id = done?.id ?? o?.dupOf?.id;
  if (!id && o?.pendingId) id = parsed(await pageFetch(rig, `/api/collector/studio/${o.pendingId}`, { json: { action: "force" } })).find((l) => l.t === "done")?.id;
  if (!id) throw new Error(`the dataset was not added: ${JSON.stringify(all.slice(-1)).slice(0, 300)}`);
  const list = JSON.parse(await pageFetch(rig, "/api/collector/studio"));
  return { id, name: list.datasets.find((d: { id: string }) => d.id === id)?.name ?? id };
}
async function openStudio(rig: Rig) {
  await rig.page.locator('.ptabs [data-key="studio"]').click();
  await rig.page.waitForSelector(".ds-lib", { timeout: 30_000 });
}
async function openDataset(rig: Rig, d: { name: string }) {
  await openStudio(rig);
  await rig.page.locator(".ds-li:not(.board)", { hasText: d.name }).first().click();
  await rig.page.waitForSelector(".ds-tabs", { timeout: 30_000 });
  await rig.page.waitForTimeout(500);
}

// ------------------------------------------------------------------------------------------- BUG-015: the late answer --
/** Every dataset question goes to the real engine; the first answer is then held back until the test lets it go. */
async function holdFirstAsk(rig: Rig, id: string, o: { hold?: number; fail?: boolean } = {}) {
  const asks: { question: string; answer: string | null; delivered: boolean }[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  await rig.page.route(`**/api/collector/studio/${id}`, async (route: Route) => {
    const q = route.request();
    if (q.method() !== "POST") return route.fallback();
    const body = q.postDataJSON() as { action?: string; question?: string };
    if (body?.action !== "ask") return route.fallback();
    const rec = { question: String(body.question), answer: null as string | null, delivered: false };
    asks.push(rec);
    const first = asks.length === (o.hold ?? 1);
    const resp = await route.fetch();
    const j = await resp.json() as { kind?: string; note?: string; answer?: string };
    rec.answer = j.kind === "unsupported" ? j.note ?? "" : j.answer ?? "";
    if (first) await gate;
    try { if (first && o.fail) await route.abort("connectionrefused"); else await route.fulfill({ response: resp }); rec.delivered = true; } catch { rec.delivered = false; }
  });
  return { asks, letGo: () => release() };
}
const untilAsks = async (rig: Rig, asks: { answer: string | null }[], n: number) => {
  const t0 = Date.now();
  while (!(asks.length >= n && asks[n - 1].answer != null)) {
    if (Date.now() - t0 > 30_000) throw new Error(`only ${asks.length} questions reached the dataset`);
    await rig.page.waitForTimeout(100);
  }
};
const Q1 = "how many rows are there";
const Q2 = "which zone has the most fever cases";
const counting = /^Counting it in |கணக்கிடுகிறேன்/;

test.describe("BUG-015 the late Data Studio answer", () => {
  test("control: with nothing newer, the same held answer does arrive and is spoken", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const d = await addSample(rig, "fever");
    await jarvisOn(rig);
    await openDataset(rig, d);
    const h = await holdFirstAsk(rig, d.id);
    await typed(rig, Q1);
    await untilAsks(rig, h.asks, 1);
    await rig.page.waitForTimeout(800);
    h.letGo();
    await rig.page.waitForTimeout(3000);
    const a = h.asks[0].answer!;
    const t = await thread(rig);
    observed("BUG-015 control", { asked: Q1, answer: a, delivered: h.asks[0].delivered, inThread: t.some((m) => m.who === "jarvis" && m.text === a), spoken: rig.said.some((x) => x === a || a.startsWith(x)), card: await answerCard(rig) });
    expect(h.asks[0].delivered).toBe(true);
    expect(t.some((m) => m.who === "jarvis" && m.text === a)).toBe(true);
    await rig.ctx.close();
  });

  const interruptions: { name: string; id: string; run: (rig: Rig) => Promise<unknown> }[] = [
    { name: "a newer question (the original input)", id: "newer", run: (rig) => typed(rig, Q2) },
    { name: "a newer question in Tamil script", id: "newer-ta", run: (rig) => typed(rig, "எந்த மண்டலத்தில் அதிக காய்ச்சல்") },
    { name: "a newer question in Tanglish", id: "newer-tg", run: (rig) => typed(rig, "entha zone la fever adhigam") },
    { name: "typed stop (the original input)", id: "stop", run: (rig) => typed(rig, "stop") },
    { name: "நிறுத்து (Tamil script)", id: "stop-ta", run: (rig) => typed(rig, "நிறுத்து") },
    { name: "niruthu (Tanglish)", id: "stop-tg", run: (rig) => typed(rig, "niruthu") },
    { name: "Esc", id: "esc", run: (rig) => rig.page.keyboard.press("Escape") },
    { name: "Close Jarvis", id: "close", run: (rig) => rig.page.locator(".hud-btn.close").click() }
  ];
  for (const it of interruptions) {
    test(`the first answer comes back after: ${it.name}`, async ({ browser }) => {
      const rig = await openConsole(browser, state);
      const { page } = rig;
      const d = await addSample(rig, "fever");
      await jarvisOn(rig);
      await openDataset(rig, d);
      const h = await holdFirstAsk(rig, d.id);
      await typed(rig, Q1);
      await untilAsks(rig, h.asks, 1);
      await page.waitForTimeout(400);
      const failed: string[] = [];
      page.on("requestfailed", (q) => { if (q.url().includes(d.id)) failed.push(q.failure()?.errorText ?? "failed"); });
      await it.run(rig);
      await page.waitForTimeout(1800);
      const before = (await thread(rig)).length;
      h.letGo();
      await page.waitForTimeout(2500);
      const a = h.asks[0].answer!;
      const t = await thread(rig);
      const card = await answerCard(rig);
      await shot(page, `bug015-${it.id}`);
      const rec = {
        late: a, delivered: h.asks[0].delivered, aborted: failed, inThread: t.some((m) => m.who === "jarvis" && m.text === a), linesAfterRelease: t.length - before,
        spoken: rig.said.some((x) => x === a || a.startsWith(x)), card, asks: h.asks.map((x) => x.question), lines: t.map((m) => `${m.who}: ${m.text.slice(0, 110)}`),
        stuck: t.filter((m) => m.who === "jarvis" && counting.test(m.text)).length, core: (await page.locator('[data-testid="hud"]').count()) ? await coreState(rig) : "closed"
      };
      observed(`BUG-015 ${it.id}`, rec);
      expect(rec.inThread, "the late answer is not in the thread").toBe(false);
      expect(rec.spoken, "the late answer is not spoken").toBe(false);
      expect(card === a, "the late answer is not on the card").toBe(false);
      await rig.ctx.close();
    });
  }
});

test.describe("BUG-015: the question and the stop both by voice, as it is really used", () => {
  const cases: { id: string; name: string; ask: "spoken" | "typed" | "typed-engaged"; then: string; open?: string }[] = [
    { id: "sp-stop", name: "spoken question, spoken stop", ask: "spoken", then: "stop" },
    { id: "sp-jarvis-stop", name: "spoken question, Jarvis stop", ask: "spoken", then: "Jarvis, stop" },
    { id: "sp-stop-ta", name: "spoken question, நிறுத்து", ask: "spoken", then: "நிறுத்து" },
    { id: "sp-stop-tg", name: "spoken question, niruthu", ask: "spoken", then: "niruthu" },
    { id: "sp-newer", name: "spoken question, a newer spoken question", ask: "spoken", then: Q2 },
    { id: "sp-newer-ta", name: "spoken question, a newer one in Tamil script", ask: "spoken", then: "எந்த மண்டலத்தில் அதிக காய்ச்சல்" },
    { id: "sp-newer-tg", name: "spoken question, a newer one in Tanglish", ask: "spoken", then: "entha zone la fever adhigam" },
    { id: "ty-newer", name: "typed question, a newer spoken question", ask: "typed", then: `Jarvis, ${Q2}` }
  ];
  for (const c of cases) {
    test(`after ${c.name}: the late answer stays quiet`, async ({ browser }) => {
      const rig = await openConsole(browser, state);
      const { page } = rig;
      const d = await addSample(rig, "fever");
      await jarvisOn(rig);
      await openDataset(rig, d);
      const h = await holdFirstAsk(rig, d.id, { hold: c.ask === "typed-engaged" ? 2 : 1 });
      const held = c.ask === "typed-engaged" ? 2 : 1;
      if (c.ask === "typed-engaged") { await typed(rig, "how many hospitals are there"); await untilAsks(rig, h.asks, 1); await page.waitForTimeout(1200); }
      if (c.ask === "spoken") await spoken(rig, { text: `Jarvis, ${Q1}` }); else await typed(rig, Q1);
      await untilAsks(rig, h.asks, held);
      await page.waitForTimeout(400);
      await spoken(rig, { text: c.then });
      await page.waitForTimeout(2500);
      const before = (await thread(rig)).length;
      h.letGo();
      await page.waitForTimeout(2500);
      const a = h.asks[held - 1].answer!;
      const t = await thread(rig);
      await shot(page, `bug015-${c.id}`);
      const rec = { late: a, inThread: t.some((m) => m.who === "jarvis" && m.text === a), linesAfterRelease: t.length - before, spoken: rig.said.some((x) => x === a || a.startsWith(x)), card: await answerCard(rig), asks: h.asks.map((x) => x.question), lines: t.map((m) => `${m.who}: ${m.text.slice(0, 110)}`), core: await coreState(rig) };
      observed(`BUG-015 ${c.id}`, rec);
      await rig.ctx.close();
      expect(rec.inThread, "the late answer is not in the thread").toBe(false);
      expect(rec.spoken, "the late answer is not spoken").toBe(false);
    });
  }

  for (const v of [
    { id: "name", w: "Jarvis, stop", after: false }, { id: "name-ta", w: "ஜார்விஸ், நிறுத்து", after: false }, { id: "name-tg", w: "Jarvis, niruthu", after: false },
    { id: "engaged", w: "stop", after: true }, { id: "engaged-ta", w: "நிறுத்து", after: true },
    { id: "bare", w: "stop", after: false }, { id: "bare-ta", w: "நிறுத்து", after: false }
  ]) {
    test(`audit-client_browser-9: typed question${v.after ? " just after an answer" : ""}, spoken ${v.w} while the answer is coming: it must stop`, async ({ browser }) => {
      const rig = await openConsole(browser, state);
      const { page } = rig;
      const d = await addSample(rig, "fever");
      await jarvisOn(rig);
      await openDataset(rig, d);
      const held = v.after ? 2 : 1;
      const h = await holdFirstAsk(rig, d.id, { hold: held });
      if (v.after) { await typed(rig, "how many hospitals are there"); await untilAsks(rig, h.asks, 1); await page.waitForTimeout(1200); }
      await typed(rig, Q1);
      await untilAsks(rig, h.asks, held);
      await page.waitForTimeout(400);
      await spoken(rig, { text: v.w });
      await page.waitForTimeout(2000);
      const stateAfterStop = await page.locator('[data-testid="state"]').innerText();
      h.letGo();
      await page.waitForTimeout(2500);
      const a = h.asks[held - 1].answer!, t = await thread(rig);
      const rec = { late: a, inThread: t.some((m) => m.who === "jarvis" && m.text === a), spoken: rig.said.some((x) => x === a || a.startsWith(x)), stateAfterStop, lines: t.map((m) => `${m.who}: ${m.text.slice(0, 110)}`) };
      await shot(page, `bug015-typed-then-${v.id}`);
      observed(`BUG-015 typed question then spoken ${v.id}`, rec);
      await rig.ctx.close();
      test.fail();
      expect(rec.spoken, "the late answer is not spoken after a stop").toBe(false);
    });
  }

  test("a late failure after a newer question says nothing either", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    const d = await addSample(rig, "fever");
    await jarvisOn(rig);
    await openDataset(rig, d);
    const h = await holdFirstAsk(rig, d.id, { fail: true });
    await typed(rig, Q1);
    await untilAsks(rig, h.asks, 1);
    await page.waitForTimeout(400);
    await typed(rig, Q2);
    await page.waitForTimeout(1800);
    h.letGo();
    await page.waitForTimeout(2000);
    const t = await thread(rig);
    const rec = { saidFail: t.some((m) => /could not be asked/.test(m.text)), lines: t.map((m) => `${m.who}: ${m.text.slice(0, 110)}`) };
    observed("BUG-015 late failure", rec);
    await rig.ctx.close();
    expect(rec.saidFail).toBe(false);
  });

  test("audit-client_browser-8: after Esc the card must not go on saying Counting", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    const d = await addSample(rig, "fever");
    await jarvisOn(rig);
    await openDataset(rig, d);
    const h = await holdFirstAsk(rig, d.id);
    await typed(rig, Q1);
    await untilAsks(rig, h.asks, 1);
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1800);
    h.letGo();
    await page.waitForTimeout(6000);
    const t = await thread(rig);
    const rec = { card: await answerCard(rig), core: await coreState(rig), state: await page.locator('[data-testid="state"]').innerText(), stuckInThread: t.filter((m) => m.who === "jarvis" && counting.test(m.text)).length };
    await shot(page, "bug015-esc-counting");
    observed("BUG-015 esc leaves counting", rec);
    await rig.ctx.close();
    test.fail();
    expect(rec.card, "the card does not say it is still counting").not.toMatch(counting);
    expect(rec.stuckInThread, "the thread does not keep a counting line as the answer").toBe(0);
  });
});

test.describe("New on the way: what the Data Studio's rules answer on this path (no model on this server)", () => {
  // the file itself: data/studio-samples/Fever_Surveillance_Weekly_2026.csv has 400 rows after cleaning, and every hospital reports tens of fever cases a week
  const askAll = async (browser: import("@playwright/test").Browser) => {
    const rig = await openConsole(browser, state);
    const d = await addSample(rig, "fever");
    const ask = async (question: string) => { const a = JSON.parse(await pageFetch(rig, `/api/collector/studio/${d.id}`, { json: { action: "ask", question, context: null } })) as { kind?: string; answer?: string; note?: string; error?: string }; if (a.error) throw new Error(a.error); return a.answer ?? a.note ?? ""; };
    const out: Record<string, string> = {};
    for (const q of ["how many rows are there", "which zone has the most fever cases", "எந்த மண்டலத்தில் அதிக காய்ச்சல்", "entha zone la fever adhigam"]) out[q] = await ask(q);
    observed("Data Studio answers (rules only)", out);
    await rig.ctx.close();
    return out;
  };
  test("audit-client_browser-13: how many rows are there says the file's 400 rows", async ({ browser }) => {
    const out = await askAll(browser);
    test.fail();
    expect(out["how many rows are there"]).toMatch(/\b400\b/);
  });
  test("audit-client_browser-13: which zone has the most fever cases counts fever cases, not report rows", async ({ browser }) => {
    const out = await askAll(browser);
    test.fail();
    expect(out["which zone has the most fever cases"]).not.toMatch(/leads with \d\b/);
  });
  test("audit-client_browser-13: the same question in Tamil script is answered with a zone", async ({ browser }) => {
    const out = await askAll(browser);
    test.fail();
    expect(out["எந்த மண்டலத்தில் அதிக காய்ச்சல்"]).not.toMatch(/^Case reports: 16/);
  });
});

// ------------------------------------------------------------------------------------------- BUG-014: the keeping buttons --
/** the number Jarvis's badge shows on an element, read from the screen as the Collector would */
const badgeOn = (page: Page, sel: string) => page.evaluate((q) => {
  const el = document.querySelector(q);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const b = [...document.querySelectorAll<HTMLElement>(".th-badge")].find((x) => Math.abs(parseFloat(x.style.left) - Math.max(0, r.left - 6)) < 2 && Math.abs(parseFloat(x.style.top) - Math.max(0, r.top - 8)) < 2);
  return b ? parseInt(b.textContent ?? "", 10) : null;
}, sel);
const weakCsv = (tag: string) => ["Item,Note,Count", ...Array.from({ length: 24 }, (_, i) => `Thing ${tag} ${i},Note ${i % 3},${i * 7 % 13}`)].join("\n");
const lines = async (rig: Rig, n: number) => (await thread(rig)).slice(n).map((m) => `${m.who}: ${m.text.slice(0, 120)}`);
const fakeModelClick = (name: string) => ({ done: true, result: { kind: "do", lang: "en", reply: null, steps: [{ a: "click", n: null, name }], stage: null, stageOp: null, say: null, options: [], rounds: 1, calls: [], model: "fake-model", ms: 5, note: null } });
const familyPosts = (rig: Rig, from: number) => postsTo(rig, /\/api\/collector\/studio\/ds_/, from).filter((p) => /"action":"family"/.test(p.body ?? "")).length;
const pinPosts = (rig: Rig, from: number) => postsTo(rig, /\/api\/collector\/studio\/ds_/, from).filter((p) => /"action":"pin"/.test(p.body ?? "")).length;
/** a fake model's answer at the boundary: an answer card with a dataset, which is what the Pin button needs */
const fakeCard = {
  id: "qa-fake-card", kind: "answer", language: "en", display: "table", headline: "A fake answer for the Pin test", answerMarkdown: "A fake answer for the Pin test", voiceSummary: "", voiceLang: "en-IN",
  chart: null, datasets: [{ id: "d", title: "Fake", fields: [], rows: [] }], kpis: [], table: null, followUps: [], chips: [], consoleActions: [], autoActions: [], caveats: [], scope: null, scopeLine: "", asOf: "", testData: false,
  sources: { tools: [], sql: [], plan: null, refs: [], rows: 0, incidentIds: [], models: [], verifier: { checked: 1, unmatched: [], regenerated: false, template: false }, assumptions: [], limits: [] }
};

test.describe("BUG-014 the keeping buttons", () => {
  test("Save new version: spoken click by name and by number, English and Tamil script", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    await typed(rig, "open workspaces");
    const btn = page.getByRole("button", { name: "Save new version" });
    await btn.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await shot(page, "bug014-workspace");
    const mark = rig.posts.length;
    const out: Record<string, unknown> = {};
    for (const h of ["Jarvis, click save new version", "press save new version", "tap save new version", "ஜார்விஸ், கிளிக் save new version", "அழுத்து save new version", "hit save new version"]) {
      const n = (await thread(rig)).length;
      await spoken(rig, { text: h });
      await page.waitForTimeout(3800);
      out[h] = { saved: postsTo(rig, WS, mark).length, lines: await lines(rig, n), stillOpen: await btn.count() };
    }
    // by number
    await typed(rig, "show numbers");
    await page.waitForSelector(".th-badge", { timeout: 15_000 });
    const num = await badgeOn(page, ".wsave .btn");
    const n = (await thread(rig)).length;
    await typed(rig, `click ${num}`);
    await page.waitForTimeout(1500);
    out[`click ${num} (the badge on Save new version)`] = { saved: postsTo(rig, WS, mark).length, lines: await lines(rig, n), stillOpen: await btn.count() };
    observed("BUG-014 save new version", out);
    await shot(page, "bug014-save-refused");
    expect(postsTo(rig, WS, mark).length).toBe(0);
    await rig.ctx.close();
  });

  test("Save new version with a fake model at the boundary: Tanglish and Tamil the rules cannot read", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    await typed(rig, "open workspaces");
    const btn = page.getByRole("button", { name: "Save new version" });
    await btn.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);
    const mark = rig.posts.length;
    const out: Record<string, unknown> = {};
    // first with no model: nothing can be pressed; then the plan a model would give goes through the same guard
    for (const h of ["Jarvis, save new version click pannu", "ஜார்விஸ், புதிய பதிப்பை சேமி பட்டனை அழுத்து"]) {
      const n = (await thread(rig)).length;
      await spoken(rig, { text: h });
      await page.waitForTimeout(5000);
      out[`no model: ${h}`] = { saved: postsTo(rig, WS, mark).length, lines: await lines(rig, n) };
    }
    await page.route("**/api/collector/thunai/agent/round", (r: Route) => r.fulfill({ json: fakeModelClick("Save new version") }));
    for (const h of ["Jarvis, save new version click pannu", "ஜார்விஸ், புதிய பதிப்பை சேமி பட்டனை அழுத்து"]) {
      const n = (await thread(rig)).length;
      await spoken(rig, { text: h });
      await page.waitForTimeout(3500);
      out[`fake model: ${h}`] = { saved: postsTo(rig, WS, mark).length, lines: await lines(rig, n) };
    }
    observed("BUG-014 tanglish with a fake model", out);
    expect(postsTo(rig, WS, mark).length).toBe(0);
    await rig.ctx.close();
  });

  test("control: a spoken click on a harmless button does press it, by name and by number", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    const selected = () => page.evaluate(() => document.querySelector('.ptabs [aria-selected="true"]')?.getAttribute("data-key") ?? null);
    const account = page.getByRole("button", { name: "Account", exact: true });
    const n = (await thread(rig)).length;
    await spoken(rig, { text: "Jarvis, click account" });
    await page.waitForTimeout(3000);
    const byName = { expanded: await account.getAttribute("aria-expanded"), lines: await lines(rig, n) };
    await page.keyboard.press("Escape");
    await typed(rig, "show numbers");
    await page.waitForSelector(".th-badge", { timeout: 15_000 });
    const num = await badgeOn(page, '.ptabs [data-key="environment"]');
    await spoken(rig, { text: `Jarvis, click ${num}` });
    await page.waitForTimeout(3000);
    const byNumber = { n: num, selected: await selected() };
    observed("BUG-014 control", { byName, byNumber });
    await rig.ctx.close();
    expect(byName.expanded).toBe("true");
    expect(byNumber.selected).toBe("environment");
  });

  test("audit-client_browser-12: click Trends presses the tab, it does not read out a chart", async ({ browser }) => {
    const out: Record<string, { selected: string | null; lines: string[] }> = {};
    for (const h of ["Jarvis, click Trends", "Jarvis, press trends", "ஜார்விஸ், கிளிக் trends"]) {
      const rig = await openConsole(browser, state);
      const { page } = rig;
      await jarvisOn(rig);
      await spoken(rig, { text: h });
      await page.waitForTimeout(3500);
      out[h] = { selected: await page.evaluate(() => document.querySelector('.ptabs [aria-selected="true"]')?.getAttribute("data-key") ?? null), lines: await lines(rig, 0) };
      if (h === "Jarvis, click Trends") await shot(page, "bug014-click-trends");
      await rig.ctx.close();
    }
    observed("click Trends by name", out);
    test.fail();
    expect(out["Jarvis, click Trends"].selected).toBe("trends");
  });

  test("audit-client_browser-16: click menu presses the button whose word is Menu", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    const n = (await thread(rig)).length;
    await spoken(rig, { text: "Jarvis, click menu" });
    await page.waitForTimeout(3500);
    const rec = { expanded: await menu.getAttribute("aria-expanded"), title: await menu.getAttribute("title"), lines: await lines(rig, n) };
    await shot(page, "bug014-click-menu");
    observed("click menu by name", rec);
    await rig.ctx.close();
    test.fail();
    expect(rec.expanded).toBe("true");
  });

  test("Pin on an answer card in Ask District IQ (a fake answer at the boundary: the server has no model), and a tap does pin", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await page.route("**/api/collector/assistant/chat", (r: Route) => r.fulfill({ status: 200, contentType: "text/event-stream", body: `event: answer\ndata: ${JSON.stringify(fakeCard)}\n\n` }));
    await jarvisOn(rig);
    await page.locator(".ask-fab").click();
    const box = page.locator(".aq-f textarea");
    await box.waitFor({ timeout: 15_000 });
    await box.fill("how many severe cases are open today");
    await box.press("Enter");
    const pin = page.locator(".aq-pin");
    await pin.first().waitFor({ timeout: 45_000 });
    await shot(page, "bug014-answer-pin");
    const mark = rig.posts.length;
    const out: Record<string, unknown> = { name: await pin.first().getAttribute("aria-label") };
    for (const h of ["Jarvis, click pin", "Jarvis, press pin this answer", "ஜார்விஸ், கிளிக் pin"]) {
      const n = (await thread(rig)).length;
      await spoken(rig, { text: h });
      await page.waitForTimeout(3800);
      out[h] = { pinPosts: postsTo(rig, /assistant\/pins/, mark).length, pinned: await page.locator(".aq-pin.on").count(), lines: await lines(rig, n) };
    }
    const byVoice = postsTo(rig, /assistant\/pins/, mark).length;
    await pin.first().click();
    await page.waitForTimeout(800);
    const byTap = postsTo(rig, /assistant\/pins/, mark).length - byVoice;
    observed("BUG-014 pin", { ...out, byVoice, byTap });
    await rig.ctx.close();
    expect(byVoice).toBe(0);
    expect(byTap).toBe(1);
  });

  test("Pin this screen on an open Jarvis screen: no pin by voice, in English and Tamil, and a tap pins", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    await typed(rig, "Show me the severe cases");
    await page.waitForSelector(".st-root", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const mark = rig.posts.length;
    const out: Record<string, unknown> = {};
    const pins = () => postsTo(rig, /thunai\/memory$/, mark).filter((p) => /"op":"pin"/.test(p.body ?? "")).length;
    for (const h of ["Jarvis, click pin", "Jarvis, press pin this screen", "ஜார்விஸ், கிளிக் pin", "ஜார்விஸ், அழுத்து இந்தத் திரையைப் பின் செய்"]) {
      const n = (await thread(rig)).length;
      await spoken(rig, { text: h });
      await page.waitForTimeout(3800);
      out[h] = { pins: pins(), card: await saveCard(page).count(), lines: await lines(rig, n) };
      if (await saveCard(page).count()) { await saveCard(page).locator("button").last().click(); await page.waitForTimeout(300); }
    }
    const byVoice = pins();
    const stillOpen = await page.locator(".st-root").count();
    observed("BUG-014 pin this screen", { ...out, byVoice, stillOpen });
    await shot(page, "bug014-screen-pin");
    if (stillOpen) { await page.locator('.st-icon[aria-label="Pin this screen"]').click(); await page.waitForTimeout(1200); }
    observed("BUG-014 pin this screen", { ...out, byVoice, stillOpen, afterTap: pins(), cardAfterTap: await saveCard(page).count() });
    await rig.ctx.close();
    expect(byVoice).toBe(0);
  });

  test("audit-client_browser-17: with a Jarvis screen open, a spoken click must not press a control hidden behind it", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    await jarvisOn(rig);
    await typed(rig, "Show me the severe cases");
    await page.waitForSelector(".st-root", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    // what a press really lands on, read at the browser's edge: the tag, whether it is behind the screen, and the word that matched
    await page.evaluate(() => {
      const W = window as unknown as { __pressed: { tag: string; cls: string; behindScreen: boolean; word: string | null; name: string }[] };
      W.__pressed = [];
      document.addEventListener("click", (e) => { const t = e.target as HTMLElement; const name = `${t.getAttribute("aria-label") ?? ""} ${t.getAttribute("title") ?? ""} ${t.innerText ?? ""}`; W.__pressed.push({ tag: t.tagName.toLowerCase(), cls: String(t.className).slice(0, 30), behindScreen: !t.closest(".st-root") && !t.closest("[data-thunai-ui]"), word: /\S*(pin|trend)\S*/i.exec(name)?.[0]?.slice(0, 30) ?? null, name: name.replace(/\s+/g, " ").trim().slice(0, 70) }); }, true);
    });
    const pressed = () => page.evaluate(() => (window as unknown as { __pressed: unknown[] }).__pressed.slice());
    const selected = () => page.evaluate(() => document.querySelector('.ptabs [aria-selected="true"]')?.getAttribute("data-key") ?? null);
    const out: Record<string, unknown> = {};
    for (const h of ["Jarvis, click pin", "ஜார்விஸ், கிளிக் pin", "Jarvis, press trends"]) {
      const n = (await thread(rig)).length;
      await spoken(rig, { text: h });
      await page.waitForTimeout(3500);
      out[h] = { pressed: await pressed(), selected: await selected(), lines: await lines(rig, n), screen: await page.locator(".st-root").count() };
    }
    const all = (await pressed()) as { behindScreen: boolean }[];
    await shot(page, "bug014-pressed-behind-screen");
    observed("BUG-014 click on an open screen", out);
    await rig.ctx.close();
    test.fail();
    expect(all.filter((p) => p.behindScreen), "nothing behind the screen was pressed").toEqual([]);
  });

  test("Unpin on the Data Studio's board", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    const d = await addSample(rig, "beds");
    await jarvisOn(rig);
    await openDataset(rig, d);
    const add = page.locator(".ds-todash:not(.on)").first();
    if (await add.count()) { await add.click(); await page.waitForTimeout(1200); }
    await page.locator(".ds-li.board", { hasText: "On the dashboard" }).click();
    const unpin = page.locator('.ds-p-acts button[aria-label="Unpin"]');
    await unpin.first().waitFor({ timeout: 15_000 });
    await shot(page, "bug014-board");
    const count = await unpin.count();
    const mark = rig.posts.length;
    const out: Record<string, unknown> = {};
    const un = () => postsTo(rig, /\/api\/collector\/studio\/ds_/, mark).filter((p) => /"action":"unpin"/.test(p.body ?? "")).length;
    for (const h of ["Jarvis, click unpin", "Jarvis, press unpin", "ஜார்விஸ், கிளிக் unpin"]) {
      const n = (await thread(rig)).length;
      await spoken(rig, { text: h });
      await page.waitForTimeout(3800);
      out[h] = { unpinPosts: un(), onBoard: await unpin.count(), lines: await lines(rig, n) };
    }
    observed("BUG-014 unpin", { before: count, ...out });
    expect(un()).toBe(0);
    await expect(unpin).toHaveCount(count);
    await rig.ctx.close();
  });

  /** the Data card of a dataset the rules are not sure of, with Jarvis's numbers on. The numbers are asked for before the dataset opens: inside it "show numbers" goes to the dataset. */
  async function dataCardWithNumbers(rig: Rig) {
    const { page } = rig;
    const d = await addCsv(rig, `qa_weak_${Date.now()}.csv`, weakCsv(String(Date.now())));
    await jarvisOn(rig);
    await typed(rig, rig.lang === "ta" ? "எண்களைக் காட்டு" : "show numbers");
    await page.waitForSelector(".th-badge", { timeout: 15_000 });
    await openDataset(rig, d);
    await page.locator(".ds-tabs button").last().click();
    const yes = page.locator(".ds-out-acts .ds-btn");
    await yes.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    return { d, yes };
  }
  for (const lang of ["en", "ta"] as const) {
    test(`audit-client_browser-1: Yes on the Data card (${lang === "ta" ? "Tamil screen" : "English screen"}), a spoken click by number must not press it`, async ({ browser }) => {
      const rig = await openConsole(browser, state, lang === "ta" ? { lang } : {});
      const { page } = rig;
      const { yes } = await dataCardWithNumbers(rig);
      const label = await yes.innerText();
      await shot(page, `bug014-datacard-before-${lang}`);
      const num = await badgeOn(page, ".ds-out-acts .ds-btn");
      const mark = rig.posts.length, n = (await thread(rig)).length;
      await spoken(rig, { text: lang === "ta" ? `ஜார்விஸ், கிளிக் ${num}` : `Jarvis, click ${num}` });
      await page.waitForTimeout(3500);
      const rec = { label, num, familyPosts: familyPosts(rig, mark), yesStill: await yes.count(), lines: await lines(rig, n) };
      await shot(page, `bug014-datacard-after-${lang}`);
      observed(`BUG-014 data card yes by number (${lang})`, rec);
      await rig.ctx.close();
      expect(rec.num, "the Yes button has a number on the screen").not.toBeNull();
      test.fail();
      expect(rec.familyPosts, "the spoken click did not change the dataset").toBe(0);
    });
  }

  test("Yes on the Data card by name: nothing is pressed, and what Jarvis says instead", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    const d = await addCsv(rig, `qa_weak_${Date.now()}.csv`, weakCsv(String(Date.now())));
    await jarvisOn(rig);
    await openDataset(rig, d);
    await page.locator(".ds-tabs button").last().click();
    const yes = page.locator(".ds-out-acts .ds-btn");
    await yes.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    const mark = rig.posts.length;
    const out: Record<string, unknown> = {};
    for (const h of ["Jarvis, click yes", "Jarvis, press yes", "ஜார்விஸ், கிளிக் yes", "ஜார்விஸ், yes click pannu"]) {
      const n = (await thread(rig)).length;
      await spoken(rig, { text: h });
      await page.waitForTimeout(3500);
      out[h] = { familyPosts: familyPosts(rig, mark), yesStill: await yes.count(), lines: await lines(rig, n) };
    }
    observed("BUG-014 data card yes by name", out);
    await rig.ctx.close();
    expect(Object.values(out).every((r) => (r as { familyPosts: number }).familyPosts === 0)).toBe(true);
  });

  test("audit-client_browser-2: Add to dashboard, the Studio's own pin, a spoken click by number must not press it", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    const d = await addCsv(rig, `qa_weak_${Date.now()}.csv`, weakCsv(String(Date.now())));
    await jarvisOn(rig);
    await typed(rig, "show numbers");
    await page.waitForSelector(".th-badge", { timeout: 15_000 });
    await openDataset(rig, d);
    await page.waitForTimeout(1500);
    const sel = ".ds-todash:not(.on)";
    const num = await badgeOn(page, sel);
    const name = await page.locator(sel).first().getAttribute("title").catch(() => null);
    const mark = rig.posts.length, n = (await thread(rig)).length;
    await spoken(rig, { text: `Jarvis, click ${num}` });
    await page.waitForTimeout(3000);
    const rec = { num, name, pinPosts: pinPosts(rig, mark), lines: await lines(rig, n), markedOn: await page.locator(".ds-todash.on").count() };
    await shot(page, "bug014-add-to-dashboard");
    observed("BUG-014 add to dashboard by number", rec);
    await rig.ctx.close();
    test.fail();
    expect(rec.pinPosts, "the spoken click did not pin").toBe(0);
  });

  test("audit-client_browser-10: show numbers inside a dataset shows the numbers", async ({ browser }) => {
    const rig = await openConsole(browser, state);
    const { page } = rig;
    const d = await addSample(rig, "fever");
    await jarvisOn(rig);
    await openDataset(rig, d);
    const n = (await thread(rig)).length;
    await typed(rig, "show numbers");
    await page.waitForTimeout(3000);
    const rec = { badges: await page.locator(".th-badge").count(), lines: await lines(rig, n) };
    await shot(page, "bug014-numbers-in-dataset");
    observed("show numbers inside a dataset", rec);
    await rig.ctx.close();
    test.fail();
    expect(rec.badges).toBeGreaterThan(0);
  });
});
