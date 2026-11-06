// QA pass 4, audit of fixed bugs (privacy_injection): what a request alone cannot show, on the production build, typed in the Jarvis bar
// as the Collector would. The server has no model key: only the code lanes answer. One case fakes the model at the browser's round
// call and says so; everything else is the real client, the real routes and a local copy of the snapshot with planted records.
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/audit-privacy_injection.browser.mjs
// Writes docs/qa/pass4/evidence/bug-audit/privacy_injection-browser.json and screenshots beside it. Passwords are never printed.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
import { APP_ROOT } from "./lib/env.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:3133";
const OUT = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "bug-audit");
fs.mkdirSync(OUT, { recursive: true });
const col = accounts().find((a) => a.key === "collector");
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const results = [];
const boot = await browser.newContext();
const login = await boot.request.post(`${BASE}/api/auth/login`, { data: { email: col.email, password: col.password } });
if (login.status() !== 200) throw new Error(`sign in ${login.status()}`);
const signedIn = await boot.storageState();
// the session cookie is marked Secure, so a browser context's own request object does not send it over http: a plain fetch does
const cookie = signedIn.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const api = (p, body) => fetch(`${BASE}${p}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ["microphone"], storageState: signedIn });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem("thunai-greeted", new Date().toDateString()); } catch { /* none */ }
    window.__said = [];
    const real = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
    if (real) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); real(u); };
  });
  const answers = [], calls = [], errors = [], tts = [];
  page.on("request", (r) => { if (r.url().includes("/api/jarvis/say")) { try { tts.push(JSON.parse(r.postData() ?? "{}").text ?? ""); } catch { /* none */ } } });
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/collector/workspaces")) calls.push(`${r.request().method()} ${u.pathname} ${r.status()}`);
    if (u.pathname.endsWith("/agent/round")) { try { const j = await r.json(); answers.push({ http: r.status(), lane: j.lane, kind: j.result?.kind ?? null, note: j.result?.note ?? null, recipe: j.result?.stage?.recipe ?? null, reply: j.result?.reply ?? null, say: j.result?.say ?? null }); } catch { /* aborted */ } }
  });
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(`${BASE}/collector`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  for (let i = 0; i < 20 && !(await page.locator(".hud-bar").count()); i++) {
    await page.waitForTimeout(1000);
    if (await page.locator(".hud-first button").count()) { await page.locator(".hud-first button").click(); continue; }
    await page.keyboard.press("Control+Shift+J");
    await page.waitForTimeout(800);
  }
  await page.waitForSelector(".hud-bar", { timeout: 30_000 });
  await page.waitForTimeout(800);
  for (let i = 0; i < 8 && (await page.locator(".hud-first button").count()); i++) { await page.locator(".hud-first button").first().click(); await page.waitForTimeout(500); }
  await page.waitForTimeout(800);
  return { ctx, page, answers, calls, errors, tts, panels: () => page.evaluate(() => [...document.querySelectorAll("[role=dialog] h1, [role=dialog] h2, [role=dialog] h3")].map((x) => x.textContent?.trim()).filter(Boolean).slice(0, 3)) };
}

async function say(s, text, shot, wait = 1800) {
  const before = s.answers.length;
  if (!(await s.page.locator(".hud-compose input").count())) await s.page.locator(".hud-btn", { hasText: /Type|தட்டச்சு/ }).first().click();
  await s.page.locator(".hud-compose input").fill(text);
  await s.page.keyboard.press("Enter");
  for (let i = 0; i < 40 && s.answers.length === before; i++) await s.page.waitForTimeout(250);
  await s.page.waitForTimeout(wait);
  const seen = await s.page.evaluate(() => ({
    said: document.querySelector(".hud-live")?.textContent?.trim().slice(0, 500) ?? "",
    stage: document.querySelector(".st-title")?.textContent?.trim().slice(0, 200) ?? null,
    confirm: [...document.querySelectorAll(".st-confirm, .hud-ask, [role=alert]")].map((x) => x.textContent?.trim().slice(0, 200)).filter(Boolean).slice(0, 3),
    toast: [...document.querySelectorAll(".toast, [class*=toast]")].map((x) => x.textContent?.trim().slice(0, 200)).filter(Boolean).slice(0, 3)
  }));
  if (shot) await s.page.screenshot({ path: path.join(OUT, `privacy_injection-${shot}.png`) });
  const spoken = await s.page.evaluate(() => { const x = window.__said ?? []; window.__said = []; return x; });
  const tts = s.tts.splice(0);
  const r = { text, spoken_by_browser: spoken, spoken_by_tts: tts, panels: await s.panels(), shot: shot ? `docs/qa/pass4/evidence/bug-audit/privacy_injection-${shot}.png` : null, answer: s.answers[s.answers.length - 1] ?? null, answered: s.answers.length > before, seen, calls: [...s.calls], errors: [...s.errors] };
  results.push(r);
  return r;
}
// saved through the real route. A copy that does not save (every PC but one, and this server) numbers its own rows from 1000000001
const save = async (name) => {
  const r = await api("/api/collector/workspaces", { name, filters: { zone: 13, period: "weekly" }, layout: { qa: true } });
  const j = await r.json();
  const open = await api(`/api/collector/workspaces/${j.id}`);
  results.push({ text: `save ${name}, then GET it by id`, saved: r.status, id: j.id, open: open.status, body: (await open.text()).slice(0, 90) });
  return j.id;
};
const stamp = Date.now().toString(36);
const REVIEWISH = `Monday review ${stamp}`;
const NAME = `QA Daily ${stamp}`, LOCAL = `QA Local ${stamp}`;
const firstId = await save(NAME);
await save(LOCAL);
await save(REVIEWISH);
// the first gets the small number a saving PC would give it, in this server's own durable copy, to test the voice path by itself
{
  const db = new DatabaseSync(path.join(APP_ROOT, "data", "aws-cache", "qa", "srv", process.env.QA_INSTANCE || "3133", "durable.sqlite"));
  db.exec("PRAGMA busy_timeout = 5000");
  const small = 700 + Math.floor(Math.random() * 200);
  db.prepare("UPDATE workspaces SET workspace_id = ? WHERE workspace_id = ?").run(small, firstId);
  db.close();
  const open = await api(`/api/collector/workspaces/${small}`);
  results.push({ text: "the same workspace with a small id", id: small, open: open.status, name: (await open.json()).name });
}
const list = await (await api("/api/collector/workspaces")).json();
results.push({ text: "GET /api/collector/workspaces", shape: (JSON.stringify(list.workspaces?.find((w) => w.name === NAME) ?? null) ?? "").replace(/"(layout|filters)":\{[^}]*\},?/g, "").slice(0, 200) });

// BUG-013: open a saved workspace by name, in the words the rules read
{ const s = await fresh();
  await say(s, `open workspace ${NAME}`, "bug013-1-open-asked");
  await say(s, "yes", "bug013-2-yes");
  await s.page.waitForTimeout(1500);
  const after = await say(s, "where am i", "bug013-3-where");
  results.push({ text: "after opening", calls: s.calls, where: after.seen.said });
  await s.ctx.close(); }
{ const s = await fresh();
  await say(s, `open my ${NAME} workspace`, null); await say(s, "yes", "bug013-4-second-form");
  await say(s, "open workspace nothing by this name", null); await say(s, "yes", "bug013-5-no-such");
  await s.ctx.close(); }
// BUG-013: the same by voice when the id has ten digits, as on any copy that does not save
{ const s = await fresh();
  await say(s, `open workspace ${LOCAL}`, null);
  await say(s, "yes", "bug013-10-local-id");
  results.push({ text: "ten-digit id", calls: [...s.calls] });
  await s.ctx.close(); }
// BUG-013 in Tamil and Tanglish: the rules hold no such words, and no model is here
{ const s = await fresh();
  await say(s, `${NAME} workspace open pannu`, "bug013-6-tanglish");
  await s.page.keyboard.press("Escape");
  await say(s, `${NAME} ஒர்க்ஸ்பேஸ் திற`, "bug013-7-tamil");
  await s.page.keyboard.press("Escape");
  await say(s, `${NAME} workspace-a thira`, null);
  await s.page.keyboard.press("Escape");
  await say(s, `open saved view ${NAME}`, null);
  await say(s, `OPEN WORKSPACE ${NAME.toUpperCase()}`, null);
  await s.ctx.close(); }
// a word in the name read as a command
{ const s = await fresh();
  await say(s, `${REVIEWISH} ஒர்க்ஸ்பேஸ் திற`, "bug013-12-tamil-review-panel");
  await s.ctx.close(); }
// BUG-013 with a fake model at the round call, as the model's plan would be: the client's own step runs on the real routes
{ const s = await fresh();
  await s.page.route("**/agent/round", (route) => route.fulfill({ json: { done: true, result: { kind: "do", lang: "ta", reply: null, steps: [{ a: "workspace", op: "open", name: NAME }], stage: null, stageOp: null, say: null, options: [], rounds: 1, calls: [], model: "fake", ms: 1, note: null }, steps: [], trace: [], tokens: 0, calls: 1, hops: [], lane: "planner", cached: false } }));
  await say(s, `${NAME} ஒர்க்ஸ்பேஸ் திற`, "bug013-8-fake-model-tamil");
  await say(s, "சரி", "bug013-9-fake-model-yes");
  await s.ctx.close(); }

// BUG-009, BUG-010: typed requests
{ const s = await fresh();
  await say(s, "read me the complainant's number", "bug010-1-refused-en");
  await say(s, "புகார் கொடுத்தவரின் தொலைபேசி எண் என்ன", "bug010-2-refused-ta");
  await say(s, "pugar kuduthavar number enna", "bug010-3-refused-tanglish");
  await say(s, "give me their number", "bug010-4-not-refused");
  await say(s, "புகார் கொடுத்தவர் பேரு என்ன", "bug010-5-not-refused-ta");
  await s.ctx.close(); }

// BUG-011: planted records on a real list, and the planted place read aloud
{ const s = await fresh();
  await say(s, "severe cases in Adyar", "bug011-1-list-spoken", 2500);
  await say(s, "open 1", "bug011-2-case-spoken", 5000);
  await s.ctx.close(); }

// found on the way: severe complaints in Adyar, in Tamil
{ const s = await fresh();
  await say(s, "அடையாறில் தீவிர புகார்கள்", "tamil-fire-1-severe", 2500);
  await say(s, "தீர்வு செய்யப்படாத புகார்கள் அடையாறில்", "tamil-fire-2-unresolved", 2500);
  await s.ctx.close(); }

fs.writeFileSync(path.join(OUT, "privacy_injection-browser.json"), JSON.stringify(results, null, 1));
await boot.close();
await browser.close();
console.log(JSON.stringify({ steps: results.length, wrote: "docs/qa/pass4/evidence/bug-audit/privacy_injection-browser.json" }));
