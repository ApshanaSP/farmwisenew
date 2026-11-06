// QA pass 4, audit of fixed bugs (privacy_injection), second browser script: what Jarvis really speaks when it reads a list out ("read them"),
// recorded at speechSynthesis and /api/jarvis/say, and the wording of the yes card when a plan opens a workspace (the model faked at the
// browser's round call, and said so). Run on a server whose snapshot copy holds the planted records.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/audit-privacy_injection.read.browser.mjs
// Writes docs/qa/pass4/evidence/bug-audit/privacy_injection-read.json and screenshots beside it.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
import { APP_ROOT } from "./lib/env.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:3133";
const OUT = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "bug-audit");
const col = accounts().find((a) => a.key === "collector");
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const boot = await browser.newContext();
const login = await boot.request.post(`${BASE}/api/auth/login`, { data: { email: col.email, password: col.password } });
if (login.status() !== 200) throw new Error(`sign in ${login.status()}`);
const signedIn = await boot.storageState();

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ["microphone"], storageState: signedIn });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem("thunai-greeted", new Date().toDateString()); } catch { /* none */ }
    window.__said = [];
    const real = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
    if (real) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); real(u); };
  });
  const tts = [];
  page.on("request", (r) => { if (r.url().includes("/api/jarvis/say")) { try { tts.push(JSON.parse(r.postData() ?? "{}").text ?? ""); } catch { /* none */ } } });
  await page.goto(`${BASE}/collector`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  for (let i = 0; i < 20 && !(await page.locator(".hud-bar").count()); i++) {
    await page.waitForTimeout(1000);
    if (await page.locator(".hud-first button").count()) { await page.locator(".hud-first button").click(); continue; }
    await page.keyboard.press("Control+Shift+J");
    await page.waitForTimeout(800);
  }
  await page.waitForSelector(".hud-bar", { timeout: 30_000 });
  await page.waitForTimeout(800);
  if (await page.locator(".hud-first button").count()) await page.locator(".hud-first button").click();
  return { ctx, page, tts };
}
async function type(s, text, wait) {
  if (!(await s.page.locator(".hud-compose input").count())) await s.page.locator(".hud-btn", { hasText: /Type|தட்டச்சு/ }).first().click();
  await s.page.locator(".hud-compose input").fill(text);
  await s.page.keyboard.press("Enter");
  await s.page.waitForTimeout(wait);
}
const results = [];

for (const [label, ask, read] of [["en", "severe cases in Adyar", "read them"], ["ta", "அடையாறில் கடுமையான சம்பவங்கள்", "படி"]]) {
  const s = await fresh();
  await type(s, ask, 4000);
  const narrate = await s.page.locator(".hud-live").textContent().catch(() => "");
  await type(s, read, 9000);
  await s.page.screenshot({ path: path.join(OUT, `privacy_injection-read-${label}.png`) });
  const said = await s.page.evaluate(() => window.__said);
  const onScreen = await s.page.evaluate(() => document.querySelector(".hud-live")?.textContent ?? "");
  results.push({ what: `the list, then "${read}"`, label, list_line: narrate, spoken_by_browser: said, spoken_by_tts: s.tts, live_line: onScreen });
  await s.ctx.close();
}

// opening is level A, so a plan that opens a workspace should ask nothing: a fake model at the round call
{
  const s = await fresh();
  await s.page.route("**/agent/round", (route) => route.fulfill({ json: { done: true, result: { kind: "do", lang: "en", reply: null, steps: [{ a: "workspace", op: "open", name: "Monday review" }], stage: null, stageOp: null, say: null, options: [], rounds: 1, calls: [], model: "fake", ms: 1, note: null }, steps: [], trace: [], tokens: 0, calls: 1, hops: [], lane: "planner", cached: false } }));
  await type(s, "bring back the view I kept for Monday", 6000);
  const text = await s.page.evaluate(() => document.body.innerText);
  await s.page.screenshot({ path: path.join(OUT, "privacy_injection-bug013-11-plan-opens-no-card.png") });
  results.push({ what: "a plan that opens a workspace asks for no yes (fake model)", save_card_seen: text.match(/.{0,40}(Save this view|Open: ).{0,60}/g), spoken_by_browser: await s.page.evaluate(() => window.__said) });
  await s.ctx.close();
}
fs.writeFileSync(path.join(OUT, "privacy_injection-read.json"), JSON.stringify(results, null, 1));
await boot.close();
await browser.close();
console.log(JSON.stringify({ steps: results.length }));
