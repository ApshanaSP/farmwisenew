// QA pass 4, audit of fixed bugs (understanding): the screen states a request alone cannot show, on the production build, typed in
// the Jarvis bar exactly as the Collector would. The server has no model key: only the code lanes answer.
//   node tests/qa/pass4/server.mjs start --port 3130 --frozen --ticking
//   node tests/qa/pass4/with-lock.mjs browser 3 -- node tests/qa/pass4/audit-understanding.browser.mjs
// ONLY=later, ONLY=rules or ONLY=open runs only the scenarios added after the first run and merges them in. Writes docs/qa/pass4/evidence/bug-audit/browser.json and screenshots beside it. Passwords are read from the gitignored file, never printed.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { accounts } from "../seed-local-users.mjs";
import { APP_ROOT } from "./lib/env.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:3130";
const OUT = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "bug-audit");
fs.mkdirSync(OUT, { recursive: true });
const col = accounts().find((a) => a.key === "collector");

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const results = [];
// one sign-in for the whole run: the route allows eight an address in 15 minutes
const boot = await browser.newContext();
const login = await boot.request.post(`${BASE}/api/auth/login`, { data: { email: col.email, password: col.password } });
if (login.status() !== 200) throw new Error(`sign in ${login.status()}`);
const signedIn = await boot.storageState();
await boot.close();

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ["microphone"], storageState: signedIn });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("thunai-greeted", new Date().toDateString()); } catch { /* none */ } });
  const rounds = [];
  page.on("request", (r) => { if (r.url().endsWith("/agent/round") && r.method() === "POST") { try { const b = JSON.parse(r.postData() ?? "{}"); rounds.push({ text: b.text, sent: { dept: b.state?.dept ?? null, zone: b.state?.zone ?? null, cat: b.state?.cat ?? null, sev: b.state?.sev ?? null, taluk: b.state?.taluk ?? null, stage: b.stage?.title ?? null } }); } catch { /* none */ } } });
  const answers = [];
  page.on("response", async (r) => { if (r.url().endsWith("/agent/round")) { try { const j = await r.json(); answers.push({ http: r.status(), lane: j.lane, kind: j.result?.kind ?? null, note: j.result?.note ?? null, recipe: j.result?.stage?.recipe ?? null, title: j.result?.stage?.title ?? null, slots: j.result?.stage?.slots ?? null, say: j.result?.stage?.say?.en ?? j.result?.reply ?? null }); } catch { /* an aborted turn */ } } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(`${BASE}/collector`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  // the keyboard works once the page has hydrated: asked for again until Jarvis opens
  for (let i = 0; i < 20 && !(await page.locator(".hud-bar").count()); i++) {
    await page.waitForTimeout(1000);
    if (await page.locator(".hud-first button").count()) { await page.locator(".hud-first button").click(); continue; }
    await page.keyboard.press("Control+Shift+J");
    await page.waitForTimeout(800);
  }
  await page.waitForSelector(".hud-bar", { timeout: 30_000 });
  await page.waitForTimeout(600);
  if (await page.locator(".hud-first button").count()) await page.locator(".hud-first button").click();
  await page.waitForTimeout(600);
  return { ctx, page, rounds, answers, errors };
}

/** Types one sentence in the Jarvis bar and reads what came of it. */
async function say(s, text, shot) {
  const before = s.answers.length;
  if (!(await s.page.locator(".hud-compose input").count())) await s.page.locator(".hud-btn", { hasText: /Type|தட்டச்சு/ }).first().click();
  await s.page.locator(".hud-compose input").fill(text);
  await s.page.keyboard.press("Enter");
  for (let i = 0; i < 40 && s.answers.length === before; i++) await s.page.waitForTimeout(250);
  let heardLine = "";
  for (let i = 0; i < 9; i++) { await s.page.waitForTimeout(200); heardLine = (await s.page.locator(".hud-live").first().textContent().catch(() => "")) || heardLine; }
  const seen = await s.page.evaluate(() => ({
    said: document.querySelector(".hud-live")?.textContent?.trim().slice(0, 400) ?? "",
    stage: document.querySelector(".st-title, .stage-title, [data-testid='stage-title']")?.textContent?.trim() ?? null,
    state: document.querySelector("[data-testid='state']")?.textContent?.trim() ?? "",
    cards: [...document.querySelectorAll(".hud-cards *")].map((x) => x.childElementCount === 0 ? x.textContent?.trim() : "").filter(Boolean).slice(0, 12).join(" | ").slice(0, 400)
  }));
  if (!seen.said) seen.said = heardLine.trim().slice(0, 400);
  if (shot) await s.page.screenshot({ path: path.join(OUT, `${shot}.png`) });
  const row = { text, answer: s.answers.slice(before).pop() ?? null, roundAsked: s.answers.length > before, seen, shot: shot ? `docs/qa/pass4/evidence/bug-audit/${shot}.png` : null };
  return row;
}
/** What the dashboard's filters hold now: the next turn sends them, as the real client does. */
async function filters(s) {
  const r = await say(s, "what is the air quality", null);
  return s.rounds.filter((x) => x.text === "what is the air quality").pop()?.sent ?? r.answer ?? null;
}

const RULES_ONLY = process.env.ONLY === "rules";
const OPEN_ONLY = process.env.ONLY === "open";
const LATER_ONLY = process.env.ONLY === "later" || RULES_ONLY || OPEN_ONLY;
const scenarios = RULES_ONLY ? [] : OPEN_ONLY ? [
  { id: "BUG-020", name: "police brief open, Tamil only Adyar", open: "chennai city police report", then: "அடையாறு மட்டும்", shot: "bug020-tamil-only-adyar" },
  { id: "BUG-020", name: "police brief open, only Adyar", open: "chennai city police report", then: "only Adyar", shot: null },
  { id: "BUG-020", name: "police brief open, Tanglish Adyar mattum", open: "chennai city police report", then: "Adyar mattum", shot: null },
  { id: "BUG-020", name: "police brief open, Tamil police word", open: "chennai city police report", then: "அடையாறு போலீஸ் நிலவரம்", shot: "bug020-tamil-police-word-open", readFilters: true }
] : LATER_ONLY ? [
  { id: "BUG-020", name: "corporation brief open, describe", open: "give me the corporation update", then: "describe the flooding complaint in Adyar", shot: "bug020-corporation-open" },
  { id: "BUG-020", name: "corporation brief open, original", open: "give me the corporation update", then: "explain the flooding complaint in Adyar", shot: null }
] : [
  { id: "BUG-020", name: "original", open: "chennai city police report", then: "explain the flooding complaint in Adyar", shot: "bug020-original" },
  { id: "BUG-020", name: "tamil, the natural 'tell me about'", open: "chennai city police report", then: "அடையாறு வெள்ள புகார் பத்தி சொல்லு", shot: "bug020-tamil-reopened" },
  { id: "BUG-020", name: "tanglish", open: "chennai city police report", then: "Adyar flooding complaint pathi sollu", shot: "bug020-tanglish-reopened" },
  { id: "BUG-020", name: "english, describe", open: "chennai city police report", then: "describe the flooding complaint in Adyar", shot: "bug020-describe-reopened" },
  { id: "BUG-020", name: "control: a real follow-up still re-scopes", open: "chennai city police report", then: "and in Adyar", shot: "bug020-control" }
];
for (const c of scenarios) {
  const s = await fresh();
  const a = await say(s, c.open, c.shot ? `${c.shot}-0-open` : null);
  // the second sentence is typed only once the first screen is really up: on a busy machine it can take a while
  const stageUp = await s.page.getByText(/Back to dashboard|டாஷ்போர்டுக்கு/).first().waitFor({ timeout: 25_000 }).then(() => true).catch(() => false);
  const b = await say(s, c.then, c.shot);
  const after = c.readFilters ? await filters(s) : undefined;
  results.push({ id: c.id, name: c.name, opened: a, asked: b, ...(after ? { filtersAfter: after } : {}), stageUp, stageAfter: await s.page.getByText(/Back to dashboard|டாஷ்போர்டுக்கு/).count().then((n) => n > 0), pageErrors: s.errors });
  await s.ctx.close();
}

// the rules act first in the browser, and no round is sent when they are sure: the sentences the HTTP run alone cannot show
const RULES = [
  ["BUG-001", "சென்னை போலீஸ் ரிப்போர்ட் கொடு", "bug001-tamil-give-filter-reopened"],
  ["BUG-001", "போலீஸ் நிலவரம் சொல்லு", "bug001-tamil-status-filter-reopened"],
  ["BUG-001", "சென்னை போலீஸ் ரிப்போர்ட்", null],
  ["BUG-001", "போலீஸ் அறிக்கை", null],
  ["BUG-001", "சென்னை காவல்துறை அறிக்கை", "bug001-tamil-kavalthurai-control"],
  ["BUG-001", "chennai police report kudu", null],
  ["BUG-001", "police nilavaram sollu", null],
  ["BUG-030", "கும்பகோணம் போலீஸ் அறிக்கை", null],
  ["BUG-030", "திருச்சி போலீஸ் ரிப்போர்ட்", null],
  ["BUG-030", "ரயில்வே போலீஸ் அறிக்கை", null],
  ["BUG-005", "மயிலாப்பூர் போலீஸ் ரிப்போர்ட்", null],
  ["BUG-005", "அண்ணா சாலை போலீஸ் அறிக்கை", "bug005-anna-salai-tamil-road-filter"],
  ["BUG-005", "போலீஸ் செய்தி", null],
  ["BUG-005", "போலீஸுக்கு கடிதம் எழுது", null],
  ["BUG-003", "போலீஸ் அறிக்கை இந்த மாதம்", null],
  ["BUG-022", "police report save pannu", "bug022-tanglish-save-filter-reopened"],
  ["BUG-022", "police report ah type pannu", null],
  ["BUG-022", "police report paakanum nu remind pannu", null],
  ["BUG-022", "போலீஸ் அறிக்கையை மெயில் அனுப்பு", "bug022-tamil-mail-filter"],
  ["BUG-022", "நாளைக்கு போலீஸ் அறிக்கை பார்க்கணும்னு ஞாபகப்படுத்து", null],
  ["BUG-022", "severe cases paaka remind pannu", null],
  ["BUG-022", "Adyar flooding complaints paaka remind pannu", null],
  ["BUG-002", "filter London police", null],
  ["BUG-002", "filter Tambaram police", null]
];
for (const [id, text, shot] of OPEN_ONLY ? [] : RULES_ONLY ? RULES : LATER_ONLY ? [
  ["BUG-022", "remind me at 5 pm to check the severe cases", "bug022-severe-reminder-lost"],
  ["BUG-022", "remind me to read the news", null],
  ["BUG-022", "remind me to check the corporation update", null],
  ["BUG-022", "கடுமையான புகார்கள் பார்க்க நினைவூட்டு", null],
  ["BUG-022", "severe cases paaka remind pannu", null],
  ["BUG-032", "low lying areas in Adyar", "new-low-lying-adyar"],
  ["BUG-032", "High Court report", "new-high-court"],
  ["BUG-032", "high tide in Royapuram", null],
  ["BUG-030", "London police report", "bug030-london"],
  ["BUG-030", "துபாய் போலீஸ் அறிக்கை", null],
  ["BUG-005", "Manila report", "bug005-manila-manali"]
] : [
  ["BUG-001", "chennai city police report", "bug001-police-brief"],
  ["BUG-002", "Mumbai police", "bug002-mumbai"],
  ["BUG-002", "filter Coimbatore police", "bug002-filter-coimbatore"],
  ["BUG-002", "மும்பை போலீஸ்", null],
  ["BUG-002", "Coimbatore police filter pannu", null],
  ["BUG-002", "show Delhi police cases", null],
  ["BUG-002", "filter Mumbai police cases", null],
  ["BUG-022", "remember to check the police report", "bug022-remember"],
  ["BUG-022", "remind me at 5 pm to read the police report", null],
  ["BUG-022", "போலீஸ் ரிப்போர்ட் பார்க்க நினைவூட்டு", "bug022-tamil-remind-reopened"],
  ["BUG-022", "police report ah nyabagam vechukko", null],
  ["BUG-022", "போலீஸ் ரிப்போர்ட் சேவ் பண்ணு", "bug022-tamil-save-filter-reopened"],
  ["BUG-002", "filter Kumbakonam police", "bug002-filter-kumbakonam-reopened"],
  ["BUG-002", "கும்பகோணம் போலீஸ் பில்டர் போடு", null],
  ["BUG-002", "Nagercoil police filter pannu", null],
  ["BUG-030", "Kumbakonam police report", "bug030-kumbakonam-reopened"],
  ["BUG-030", "மாநில காவல்துறை அறிக்கை", "bug030-state-police-manali"],
  ["BUG-005", "இந்த வாரம் நிலவரம்", "bug005-this-week-madhavaram"],
  ["BUG-005", "ஆட்சியர் சுருக்கம்", "bug005-collector-summary-adyar"],
  ["BUG-005", "Anna Salai police report", "bug005-anna-salai-anna-nagar"],
  ["BUG-024", "overdue cases this week", "bug024-overdue-says-none"],
  ["BUG-024", "severe cases past deadline this week", "bug024-overdue-kpi-understated"],
  ["BUG-032", "explain the garbage complaint in Mylapore", "bug032-mylapore-korukkupet"]
]) {
  const s = await fresh();
  const a = await say(s, text, shot);
  const f = await filters(s);
  results.push({ id, name: text, asked: a, filtersAfter: f, pageErrors: s.errors });
  await s.ctx.close();
}

await browser.close();
// evidence holds no street or complaint wording: a case screen is titled with the complaint's own words (OPEN-12)
const mask = (s) => String(s ?? "").replace(/^(None[^.]*. )?(There('s| was| were)? .+?) at (.+?). (It|I'd|d)/, "$1$2 at [place]. $5");
const clean = (r) => { if (!r) return; if (r.answer?.recipe === "case") { r.answer.title = "[the complaint title, not copied here]"; } if (r.answer?.say) r.answer.say = mask(r.answer.say); if (r.seen) r.seen.said = mask(r.seen.said); };
const caseTitles = new Set(results.flatMap((r) => [r.opened, r.asked]).filter((x) => x?.answer?.recipe === "case").map((x) => x.answer.title));
for (const r of results) { if (r.filtersAfter?.stage && caseTitles.has(r.filtersAfter.stage)) r.filtersAfter.stage = "[the complaint title, not copied here]"; clean(r.opened); clean(r.asked); }
const FILE = path.join(OUT, "browser.json");
const kept = LATER_ONLY && fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")).filter((o) => !results.some((r) => r.id === o.id && r.name === o.name)) : [];
fs.writeFileSync(FILE, JSON.stringify([...kept, ...results], null, 1));
console.log(JSON.stringify({ scenarios: results.length, pageErrors: results.reduce((n, r) => n + r.pageErrors.length, 0) }));
