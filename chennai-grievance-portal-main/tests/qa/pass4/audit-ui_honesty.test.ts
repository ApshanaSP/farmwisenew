/**
 * QA pass 4, audit of a fixed bug. BUG-006: "Generated police, PWD and hospital feeds were shown as Live and Healthy."
 * The walk runs the production build in a real Chromium, on port 3134 (started here if it is not up, stopped again if it was).
 * Everything is read in beforeAll, so a broken server fails the run instead of quietly satisfying an it.fails.
 *
 * Models: none is called. The server has no key, so Ask District IQ answers on its rules lane and these tests say nothing about what
 * a model would answer. Two places fake the model at the boundary, and say so: the browser rewrites only `ai.available` in the
 * status reply so that the dialog's "Live data" chip shows, and Jarvis's screen is built with a fake plan in place of generateJson.
 *
 * Search in this worktree depends on two things outside the app: the model file is a git-lfs pointer, and data/lancedb is shared by every
 * server here and comes and goes. So "How many feeds are live?" gets a wrong answer with no index and an error with one; the test takes
 * either as open. audit-ui_honesty-13 fakes that failure at the boundary, so it does not depend on the folder.
 * On a plain --frozen clock one pass fits; the chat's 20 questions a minute never leave the window there, so a second pass gets 429s.
 *
 *   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/audit-ui_honesty.test.ts
 *   AUDIT_SHOTS=1 ... also rewrites the screenshots in docs/qa/pass4/evidence/bug-audit
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accounts } from "../seed-local-users.mjs";
import { APP_ROOT, PIN_DIR } from "./lib/env.mjs";

// the fake model for Jarvis: look at source_health, then choose no screen of its own and write no sentence, so code words the answer
vi.mock("@/lib/ai/gateway", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/gateway")>();
  const plan = (o: { calls: unknown[]; lang: string }) => ({ kind: "do", lang: o.lang, reply: null, steps: [], screen: null, stage: null, calls: o.calls, done: !o.calls.length, say: null, options: [] });
  const look = { tool: "source_health", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null };
  return { ...real, generateJson: async (o: { name: string; prompt: string }) => ({
    object: plan({ calls: o.name.endsWith("0") ? [look] : [], lang: /[஀-௿]/.test(o.prompt.slice(-400)) ? "ta" : "en" }), info: { model: "fake-model" } }) };
});

const PORT = Number(process.env.QA_UI_HONESTY_PORT || 3134);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "bug-audit");
// .officer is the department contact's card (a name and a phone number): covered, so no such number reaches the committed pictures
const shoot = async (p: Page, name: string) => { if (process.env.AUDIT_SHOTS) await p.screenshot({ path: path.join(SHOTS, `ui_honesty-${name}.png`), mask: [p.locator(".officer")] }); };
const wait = (p: Page, ms: number) => p.waitForTimeout(ms);

type Feed = { source: string; kind?: string; status: string };
type Answer = { status: number; kind?: string; headline?: string; answerMarkdown?: string; datasets?: { id: string }[]; streamError?: string };
const QUESTIONS = {
  allLive: "Are all the data feeds live?", howManyLive: "How many feeds are live?", policeGen: "Is the police feed live or generated?",
  whichHealthy: "Which data sources are healthy?", realOrTest: "Is the data real or test data?", hospitalReal: "Is the hospital data real?", pwdGen: "Are the PWD records generated?",
  taAllLive: "தரவு ஊட்டங்கள் நேரலையில் உள்ளனவா?", taPoliceReal: "காவல் துறை தரவு உண்மையானதா அல்லது சோதனை தரவா?", taStatus: "தரவு மூலங்களின் நிலை என்ன?", taTest: "சோதனை தரவு உள்ளதா?",
  tgAllLive: "feeds ellam live-a irukka?", tgPoliceGen: "police feed generated-a?", tgPoliceReal: "police data real-a illa test data-va?", tgHospitalFake: "hospital data fake-a?",
  sinkholeReports: "Any reports about a sinkhole?"
};
// these reach the search tool, so what they get depends on the search index and the model file (see the top of this file)
const SEARCH_BOUND = ["howManyLive", "sinkholeReports"];

let browser: Browser;
let startedHere = false;
const logins = new Map<string, Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>>();
const seen = {
  signIn: {} as Record<string, { text: string; dotInChip: boolean }>,
  truth: { live: 0, total: 0, generated: [] as string[] },
  collectorChip: {} as Record<string, { text: string; title: string }>,
  collectorPages: {} as Record<string, string[]>,
  dataSources: { sub: "", rows: [] as { name: string; url: string; status: string }[], body: "" },
  officerChip: {} as Record<string, { text: string; title: string; pop: string }>,
  officerFeeds: [] as Feed[],
  ask: {} as Record<string, { chip: string; hint: string }>,
  askNoModel: {} as Record<string, { chip: string; hint: string }>,
  officerOthers: {} as Record<string, string>,
  officerPages: {} as Record<string, string[]>,
  citizenPages: {} as Record<string, string[]>,
  studio: { lines: [] as string[], connectors: -1 },
  searchStatus: {} as { ready?: boolean; error?: string | null },
  indexOnDisk: false,
  answers: {} as Record<keyof typeof QUESTIONS, Answer>,
  rain: {} as Record<string, { text: string; tags: { tag: string; line: string }[]; sources: { label: string; kind: string; n: number }[] }>,
  rainLinked: { reports: 0, generated: 0 },
  citizen: ""
};

async function pageFor(key: string | null, lang?: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-IN", storageState: key ? logins.get(key) : undefined });
  if (lang) await ctx.addInitScript((l) => localStorage.setItem("diq-lang", l), lang);
  const page = await ctx.newPage();
  if (key && !logins.has(key)) {
    // from the page, so the browser keeps the secure session cookie as it would for a person
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const a = accounts().find((x: { key: string }) => x.key === key)!;
    const st = await page.evaluate(async (b) => (await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).status, { email: a.email, password: a.password });
    if (st !== 200) throw new Error(`sign-in failed for ${key}: ${st}`);
    logins.set(key, await ctx.storageState());
  }
  return page;
}
const get = <T,>(p: Page, u: string) => p.evaluate(async (x) => (await fetch(x)).json(), u) as Promise<T>;
const visibleLines = (p: Page, re: RegExp) => p.evaluate((src) => { const r = new RegExp(src, "i"); return [...new Set(document.body.innerText.split("\n").map((s) => s.trim()).filter((s) => s && s.length < 240 && r.test(s)))]; }, re.source);

async function ask(p: Page, message: string): Promise<Answer> {
  for (let tries = 0; ; tries++) {
    const r = await p.evaluate(async (m) => {
      const x = await fetch("/api/collector/assistant/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: m, language: "auto", sessionId: null }) });
      return { status: x.status, text: await x.text(), after: Number(x.headers.get("retry-after") ?? 0) };
    }, message);
    if (r.status === 429 && tries < 3) { await wait(p, (r.after || 30) * 1000 + 500); continue; }
    const blocks = r.text.split("\n\n");
    const of = (name: string) => { const b = blocks.find((x) => x.startsWith(`event: ${name}`)); return b ? JSON.parse(b.slice(b.indexOf("data: ") + 6)) : null; };
    return { status: r.status, ...(of("answer") ?? {}), streamError: of("error")?.error };
  }
}

async function walk() {
  // ---- signed out, in both languages
  for (const lang of ["en", "ta"]) {
    const p = await pageFor(null, lang);
    for (const route of ["/login", "/register", "/forgot-password"]) {
      await p.goto(BASE + route, { waitUntil: "networkidle" });
      await wait(p, 1500);
      seen.signIn[`${lang}${route}`] = await p.evaluate(() => {
        const chip = [...document.querySelectorAll("span")].find((s) => /15/.test(s.textContent ?? "") && s.className.includes("rounded-full"));
        return { text: document.body.innerText, dotInChip: !!chip?.querySelector(".ui-live") };
      });
      if (route === "/login") await shoot(p, `login-${lang}`);
    }
    await p.context().close();
  }

  // ---- Collector, the feeds screens in both languages
  for (const lang of ["en", "ta"]) {
    const p = await pageFor("collector", lang);
    await p.goto(`${BASE}/collector`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".band .daily", { timeout: 90_000 });
    await wait(p, 2500);
    const chip = p.locator(".band .daily").first();
    seen.collectorChip[lang] = { text: (await chip.textContent()) ?? "", title: (await chip.getAttribute("title")) ?? "" };
    await shoot(p, `collector-overview-${lang}`);
    if (lang === "en") {
      // what the oracle says, from the feed table's own `kind`
      const ov = await get<{ feeds: Feed[] }>(p, "/api/collector/overview?period=daily");
      const generated = ov.feeds.filter((f) => /synthetic/i.test(String(f.kind)));
      seen.truth = { live: ov.feeds.filter((f) => (f.status === "ok" || f.status === "degraded") && !/synthetic/i.test(String(f.kind))).length, total: ov.feeds.length, generated: generated.map((f) => f.source) };
      for (const k of ["overview", "briefing", "trends", "environment"]) {
        await p.locator(`.ptabs [data-key="${k}"]`).click();
        await wait(p, 3000);
        seen.collectorPages[k] = (await visibleLines(p, /\b(live|healthy)\b/)).filter((s) => !/\d+\/\d+ live/.test(s));
      }
      await p.locator(`.ptabs [data-key="overview"]`).click();
      await wait(p, 1500);
    }
    await chip.click();
    await p.waitForSelector("table tbody tr", { timeout: 30_000 });
    await wait(p, 1200);
    if (lang === "en") {
      seen.dataSources = {
        sub: await p.locator(".sub").first().innerText(), body: await p.evaluate(() => document.body.innerText),
        rows: await p.evaluate(() => [...document.querySelectorAll("table tbody tr")].map((tr) => { const c = [...tr.querySelectorAll("td")]; return { name: (c[0].childNodes[0]?.textContent ?? "").trim(), url: c[0].querySelector("small")?.textContent?.trim() ?? "", status: (c[2].querySelector(".st")?.textContent ?? "").trim() }; }))
      };
    }
    await shoot(p, `collector-data-sources-${lang}`);
    await p.context().close();
  }

  // ---- Officer, in both languages, and what its screen is given
  for (const lang of ["en", "ta"]) {
    const p = await pageFor("officerA", lang);
    await p.goto(`${BASE}/officer`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".daily", { timeout: 90_000 });
    await wait(p, 2500);
    const chip = p.locator(".daily").first();
    const text = (await chip.textContent()) ?? "", title = (await chip.getAttribute("title")) ?? "";
    await chip.click();
    await wait(p, 700);
    seen.officerChip[lang] = { text, title, pop: await p.locator(".pop").first().innerText() };
    await shoot(p, `officer-feeds-${lang}`);
    if (lang === "en") seen.officerFeeds = (await get<{ feeds: Feed[] }>(p, "/api/officer/overview?period=monthly")).feeds;
    if (lang === "en") {
      await chip.click(); // closes the list again
      await wait(p, 300);
      seen.officerPages.overview = (await visibleLines(p, /\b(live|healthy)\b/)).filter((s) => !/\d+\/\d+ live/.test(s));
      await p.locator('[data-key="work"]').first().click();
      await wait(p, 2500);
      seen.officerPages.work = (await visibleLines(p, /\b(live|healthy)\b/)).filter((s) => !/\d+\/\d+ live/.test(s));
    }
    await p.context().close();
  }
  for (const key of ["officerB", "officerC"]) {
    const p = await pageFor(key);
    await p.goto(`${BASE}/officer`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".daily", { timeout: 90_000 });
    await wait(p, 1500);
    seen.officerOthers[key] = (await p.locator(".daily").first().textContent()) ?? "";
    await p.context().close();
  }

  // ---- Ask District IQ's header with no fake: what this server really shows; then the Officer's with the model faked up
  for (const [key, route] of [["collector", "/collector"], ["officerA", "/officer"]] as const) {
    const who = key === "collector" ? "collector" : "officer";
    const p = await pageFor(key);
    await p.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".ask-fab", { timeout: 90_000 });
    await wait(p, 1500);
    await p.locator(".ask-fab").first().click();
    await p.waitForSelector(".aq-live", { timeout: 30_000 });
    await wait(p, 2000);
    const lines = await p.locator(".aq").first().innerText();
    seen.askNoModel[who] = { chip: await p.locator(".aq-live").first().innerText(), hint: lines.split("\n").map((s) => s.trim()).filter(Boolean).at(-1) ?? "" };
    await shoot(p, `ask-${who}-en-no-model`);
    if (who === "collector") {
      seen.searchStatus = (await get<{ search: typeof seen.searchStatus }>(p, "/api/collector/assistant/status")).search;
      seen.indexOnDisk = fs.existsSync(path.join(APP_ROOT, "data", "lancedb", "incidents.lance"));
    }
    await p.context().close();
    if (who === "officer") {
      const q = await pageFor(key);
      await q.route("**/api/collector/assistant/status", async (r) => {
        const res = await r.fetch(); const j = await res.json();
        j.ai = { ...j.ai, available: true, problem: null };
        await r.fulfill({ response: res, json: j });
      });
      await q.goto(BASE + route, { waitUntil: "domcontentloaded" });
      await q.waitForSelector(".ask-fab", { timeout: 90_000 });
      await wait(q, 1500);
      await q.locator(".ask-fab").first().click();
      await q.waitForSelector(".aq-live", { timeout: 30_000 });
      await wait(q, 2000);
      await shoot(q, "ask-officer-en-fake-model-up");
      await q.context().close();
    }
  }

  // ---- Ask District IQ's header: the model is faked as up in the status reply only, at the browser (no model is called)
  {
    const p = await pageFor("collector");
    await p.route("**/api/collector/assistant/status", async (r) => {
      const res = await r.fetch(); const j = await res.json();
      j.ai = { ...j.ai, available: true, problem: null };
      await r.fulfill({ response: res, json: j });
    });
    await p.goto(`${BASE}/collector`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".ask-fab", { timeout: 90_000 });
    await wait(p, 1500);
    await p.locator(".ask-fab").first().click();
    await p.waitForSelector(".aq-live", { timeout: 30_000 });
    await wait(p, 2000);
    for (const v of ["ta", "tanglish", "en"]) {
      await p.locator(".aq-lang select").selectOption(v);
      await wait(p, 700);
      const lines = await p.locator(".aq").first().innerText();
      seen.ask[v] = { chip: await p.locator(".aq-live").first().innerText(), hint: lines.split("\n").map((s) => s.trim()).filter(Boolean).at(-1) ?? "" };
      await shoot(p, `ask-collector-${v}-fake-model-up`);
    }
    // a real question typed into the real box (rules lane, the header's fake changes nothing about the answer)
    const box = p.locator(".aq textarea, .aq input[type=text]").first();
    await box.fill(QUESTIONS.whichHealthy);
    await box.press("Enter");
    await wait(p, 8000);
    await shoot(p, "ask-which-sources-healthy");
    await p.context().close();
  }

  // ---- the question itself, on the real route (no model: the rules lane)
  {
    const p = await pageFor("collector");
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    for (const [k, q] of Object.entries(QUESTIONS)) seen.answers[k as keyof typeof QUESTIONS] = await ask(p, q);
    await p.context().close();
  }

  // ---- Rain's tabs, and how many of the reports behind Traffic are generated (the pinned incidents table says)
  {
    const p = await pageFor("collector");
    await p.goto(`${BASE}/collector`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".band .daily", { timeout: 90_000 });
    await wait(p, 2500);
    await p.getByRole("button", { name: /^Rain/ }).first().click();
    await wait(p, 4000);
    for (const lens of ["traffic", "power", "metro"]) {
      const api = await get<{ sources: { label: string; kind: string; n: number }[]; reports: { incident: string | null }[] }>(p, `/api/rehearsal/impacts?lens=${lens}`);
      await p.locator("[class*=rv-] button").filter({ hasText: new RegExp(`^${lens}`, "i") }).first().click();
      await wait(p, 3500);
      const from = p.locator("details.rv-from summary").filter({ hasText: /Where this comes from/i }).first();
      if (await from.count()) { await from.click(); await wait(p, 500); await p.locator(".rv-src").first().scrollIntoViewIfNeeded(); await wait(p, 300); }
      seen.rain[lens] = {
        text: await p.evaluate(() => document.body.innerText), sources: api.sources,
        tags: await p.locator(".rv-src li").evaluateAll((els) => els.map((e) => ({ tag: e.querySelector(".rv-tag")?.textContent?.trim() ?? "", line: (e as HTMLElement).innerText.replace(/\s+/g, " ") })))
      };
      await shoot(p, `rain-${lens}`);
      if (lens === "traffic") {
        const t = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, "tables", "incidents.json.gz"))).toString()) as { columns: [string, string][]; rows: unknown[][] };
        const id = t.columns.findIndex((c) => c[0] === "incident_id"), syn = t.columns.findIndex((c) => c[0] === "is_synthetic_any");
        const flag = new Map(t.rows.map((r) => [String(r[id]), Number(r[syn])]));
        const linked = api.reports.filter((r) => r.incident);
        seen.rainLinked = { reports: linked.length, generated: linked.filter((r) => flag.get(String(r.incident)) === 1).length };
      }
    }
    await p.context().close();
  }

  // ---- the citizen's home
  {
    const p = await pageFor("citizenA");
    await p.goto(`${BASE}/citizen`, { waitUntil: "networkidle" });
    await wait(p, 1200);
    seen.citizen = await p.evaluate(() => document.body.innerText);
    for (const r of ["/citizen/file-complaint", "/citizen/track-complaints"]) {
      await p.goto(BASE + r, { waitUntil: "networkidle" });
      await wait(p, 800);
      seen.citizenPages[r] = (await visibleLines(p, /\b(live|healthy)\b/)).filter((s) => !/where you live/i.test(s));
    }
    await p.context().close();
  }

  // ---- Data Studio's Live Connectors (the only other "Live · Healthy" wording in the app), and Jarvis opened: one picture of each
  {
    const p = await pageFor("collector");
    await p.goto(`${BASE}/collector`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".band .daily", { timeout: 90_000 });
    await wait(p, 2000);
    await p.locator('.ptabs [data-key="studio"]').click();
    await wait(p, 3500);
    seen.studio.lines = await visibleLines(p, /\b(live|healthy)\b/);
    await shoot(p, "studio-list");
    seen.studio.connectors = (await get<{ connectors: unknown[] }>(p, "/api/collector/studio/connectors")).connectors.length;
    await p.locator('.ptabs [data-key="overview"]').click();
    await wait(p, 1500);
    await p.locator(".jvf").first().click();
    await wait(p, 3000);
    await shoot(p, "jarvis-dock");
    await p.context().close();
  }
}

beforeAll(async () => {
  const up = await fetch(`${BASE}/login`).then((r) => r.status < 500).catch(() => false);
  if (!up) {
    execFileSync(process.execPath, ["tests/qa/pass4/server.mjs", "start", "--port", String(PORT), "--frozen", "--ticking"], { cwd: APP_ROOT, stdio: "ignore", timeout: 240_000 });
    startedHere = true;
  }
  browser = await chromium.launch();
  await walk();
}, 420_000);

afterAll(async () => {
  await browser?.close();
  if (startedHere) execFileSync(process.execPath, ["tests/qa/pass4/server.mjs", "stop", "--port", String(PORT)], { cwd: APP_ROOT, stdio: "ignore" });
});

const generatedRows = () => seen.dataSources.rows.filter((r) => /generator|hospital_data/i.test(r.url));
const liveCount = () => `${seen.truth.live}/${seen.truth.total} live`;

describe("BUG-006: what the fix did hold", () => {
  it("the walk read what it needed (the oracle: police, PWD and hospital are generated, in the feed table's own words)", () => {
    expect(seen.truth.generated).toEqual(expect.arrayContaining(["police", "pwd", "hospital"]));
    expect(seen.truth.total).toBe(8);
    expect(generatedRows().map((r) => r.name)).toEqual(["Police incident reports", "PWD Water Resources", "Hospital MIS"]);
    for (const a of Object.values(seen.answers)) expect(a.status).toBe(200);
    // the others all have an answer, so the it.fails below cannot pass on a missing answer
    for (const [k, a] of Object.entries(seen.answers)) if (!SEARCH_BOUND.includes(k)) { expect(a.streamError, k).toBeUndefined(); expect(a.answerMarkdown, k).toBeTruthy(); }
  });
  it("the sign-in pages no longer say Live, in English or Tamil", () => {
    expect(Object.keys(seen.signIn)).toHaveLength(6);
    for (const s of Object.values(seen.signIn)) expect(s.text).not.toMatch(/\blive\b|நேரலை/i);
    expect(seen.signIn["en/login"].text).toMatch(/Across Chennai's 15 zones/);
    expect(seen.signIn["en/login"].text).toMatch(/data feeds/i);
  });
  it("the Collector's chip does not count a generated feed as live, and its tooltip names them", () => {
    expect(seen.collectorChip.en.text).toContain(liveCount());
    expect(seen.collectorChip.ta.text).toContain(`${seen.truth.live}/${seen.truth.total} நேரலை`);
    expect(seen.collectorChip.en.title).toContain(`${seen.truth.generated.length} of ${seen.truth.total} feeds are generated test data`);
    for (const g of seen.truth.generated) expect(seen.collectorChip.en.title).toContain(g);
    expect(seen.collectorChip.en.title).not.toMatch(/every source is collected hourly/i);
  });
  it("no Collector page body and not the citizen's home says Live or Healthy", () => {
    expect(Object.keys(seen.collectorPages)).toEqual(["overview", "briefing", "trends", "environment"]);
    for (const lines of Object.values(seen.collectorPages)) expect(lines).toEqual([]);
    expect(seen.citizen.length).toBeGreaterThan(100);
    expect(seen.citizen).not.toMatch(/\b(live|healthy)\b/i);
  });
  it("no Officer page body, and no other citizen page, says Live or Healthy", () => {
    expect(Object.keys(seen.officerPages)).toEqual(["overview", "work"]);
    for (const lines of Object.values(seen.officerPages)) expect(lines).toEqual([]);
    expect(Object.keys(seen.citizenPages)).toHaveLength(2);
    for (const lines of Object.values(seen.citizenPages)) expect(lines).toEqual([]);
  });
  it("Data Studio shows no generated feed as Live or Healthy: it has no connector, only the feature's name and its tagline", () => {
    expect(seen.studio.connectors).toBe(0);
    expect(seen.studio.lines.sort()).toEqual(["Get the story, the map and a live dashboard.", "Live Connectors"]);
  });
  it("asked plainly in English or Tanglish, Ask District IQ says the departmental feeds are mock data", () => {
    expect(seen.answers.realOrTest.answerMarkdown).toMatch(/mock departmental data/);
    expect(seen.answers.tgPoliceReal.answerMarkdown).toMatch(/mock departmental data/);
  });
  it("Jarvis's brief on a generated department says generated", async () => {
    const { recordsOf } = await import("@/lib/thunai/screens");
    expect(recordsOf("POL-TRF").en).toMatch(/generated police test records/);
    expect(recordsOf("HLT-DMS").en).toMatch(/generated test data/);
  });
  it("the evidence behind audit-ui_honesty-3: every report behind Rain's Traffic that links to an incident is generated", () => {
    expect(seen.rainLinked.reports).toBeGreaterThan(100);
    expect(seen.rainLinked.generated).toBe(seen.rainLinked.reports);
  });
});

// The search tool with a fake at the boundary: a fake LanceDB table and a fake embed, nothing from the shared data/lancedb folder and no model.
async function searchWith(makeError: (m: typeof import("@/lib/assistant/embed")) => Error) {
  const held = (global as { __lance?: unknown }).__lance;
  (global as { __lance?: unknown }).__lance = undefined;
  vi.resetModules();
  vi.doMock("@lancedb/lancedb", () => ({ connect: async () => ({ tableNames: async () => ["incidents", "news"], openTable: async () => ({}) }) }));
  // the error is made from the same copy of the module that lance.ts is given, or its instanceof check could never match
  vi.doMock("@/lib/assistant/embed", async (orig) => {
    const real = await orig<typeof import("@/lib/assistant/embed")>();
    return { ...real, embed: async () => { throw makeError(real); } };
  });
  try {
    const { hybridSearch } = await import("@/lib/assistant/lance");
    return await hybridSearch("incidents", "how many feeds are live", {}, 5);
  } finally {
    vi.doUnmock("@lancedb/lancedb"); vi.doUnmock("@/lib/assistant/embed"); vi.resetModules();
    (global as { __lance?: unknown }).__lance = held;
  }
}

// The search tool with no index on disk, on the real pinned data: a fake LanceDB that has no tables, nothing from the shared folder and no model.
async function keywordSearch(text: string) {
  const held = (global as { __lance?: unknown }).__lance;
  (global as { __lance?: unknown }).__lance = undefined;
  vi.resetModules();
  vi.doMock("@lancedb/lancedb", () => ({ connect: async () => ({ tableNames: async () => [] }) }));
  try {
    const { runTool } = await import("@/lib/assistant/tools");
    const r = await runTool("search_records", { text, allTime: true });
    const n = (id: string) => Number((r.facts as { id: string; value: unknown }[]).find((x) => x.id === id)?.value ?? -1);
    return { incidents: n("search.incidents"), news: n("search.news") };
  } finally {
    vi.doUnmock("@lancedb/lancedb"); vi.resetModules();
    (global as { __lance?: unknown }).__lance = held;
  }
}
const pinnedCount = (table: string, cols: string[], word: string) => {
  const t = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, "tables", `${table}.json.gz`))).toString()) as { columns: [string, string][]; rows: unknown[][] };
  const at = cols.map((c) => t.columns.findIndex((x) => x[0] === c));
  return t.rows.filter((r) => at.map((i) => String(r[i] ?? "")).join(" ").toLowerCase().includes(word)).length;
};

describe("BUG-006: reopened, and what was found on the way (open: it.fails until fixed)", () => {
  // ---- Data sources, the only feed screen the console has: FeedsBody, where the fix put "Test data", is rendered by nothing
  it.fails("audit-ui_honesty-1: the Data sources list does not call a generated feed Healthy", () => {
    for (const r of generatedRows()) expect(r.status).not.toBe("Healthy");
  });
  it.fails("audit-ui_honesty-1: the Data sources list marks a generated feed as test data", () => {
    expect(seen.dataSources.body).toMatch(/test data/i);
  });
  it.fails("audit-ui_honesty-1: the Data sources line does not count generated feeds healthy or say they are collected every hour", () => {
    expect(seen.dataSources.sub).not.toMatch(/8 of 12 sources healthy/);
    expect(seen.dataSources.sub).not.toMatch(/pipeline feeds are collected every hour/);
  });

  // ---- Officer: the same filter as the Collector's, on rows that have no `kind`
  it.fails("audit-ui_honesty-2: the Officer's chip gives the same live count as the Collector's", () => {
    expect(seen.officerChip.en.text).toContain(liveCount());
  });
  it.fails("audit-ui_honesty-2: the Officer's feed list gives the same live count as the Collector's", () => {
    expect(seen.officerChip.en.pop).toContain(`Data feeds · ${liveCount()}`);
  });
  it.fails("audit-ui_honesty-2: the Officer's chip in Tamil gives the same live count", () => {
    expect(seen.officerChip.ta.text).toContain(`${seen.truth.live}/${seen.truth.total} நேரலை`);
  });
  it.fails("audit-ui_honesty-2: every department's Officer gets the Collector's live count", () => {
    expect(Object.keys(seen.officerOthers)).toEqual(["officerB", "officerC"]);
    for (const text of Object.values(seen.officerOthers)) expect(text).toContain(liveCount());
  });
  it.fails("audit-ui_honesty-2: the Officer's overview is given each feed's kind", () => {
    const police = seen.officerFeeds.find((f) => f.source === "police");
    expect(police).toBeTruthy();
    expect(String(police?.kind)).toMatch(/synthetic/);
  });
  it.fails("audit-ui_honesty-2: the Officer's tooltip does not say every source is collected hourly", () => {
    expect(seen.officerChip.en.title).not.toMatch(/every source is collected hourly/i);
  });

  // ---- Rain
  it.fails("audit-ui_honesty-3: Rain's Traffic does not tag the generated police and complaint reports REAL", () => {
    const line = seen.rain.traffic.tags.find((t) => /Police traffic reports/.test(t.line));
    expect(line).toBeTruthy();
    expect(line?.tag.toLowerCase()).not.toBe("real");
  });
  it.fails("audit-ui_honesty-4: Rain's Power says its outage log is generated (the API knows; owner's decision, reported)", () => {
    expect(seen.rain.power.sources.some((s) => s.kind === "generated")).toBe(true);
    expect(seen.rain.power.text).toMatch(/generated|test data|for the demo/i);
  });
  it.fails("audit-ui_honesty-4: Rain's Metro says its delays and closures are generated (the API knows; owner's decision, reported)", () => {
    expect(seen.rain.metro.sources.some((s) => s.kind === "generated")).toBe(true);
    expect(seen.rain.metro.text).toMatch(/generated|test data|for the demo/i);
  });

  // ---- Ask District IQ's header (fake model at the browser: only ai.available in the status reply)
  it.fails("audit-ui_honesty-5: Ask District IQ's chip does not say Live data over generated feeds (owner's decision, reported)", () => {
    expect(seen.ask.en.chip).not.toMatch(/live/i);
  });
  it.fails("audit-ui_honesty-5: its hint line does not say the answers come from live data, in any language (owner's decision, reported)", () => {
    expect(seen.ask.en.hint).not.toMatch(/live data/i);
    expect(seen.ask.tanglish.hint).not.toMatch(/live data/i);
    expect(seen.ask.ta.hint).not.toMatch(/நேரடித் தரவு/);
  });

  it.fails("audit-ui_honesty-5: its hint line does not say live data with no fake at all, on either console (owner's decision, reported)", () => {
    expect(seen.askNoModel.collector.hint).toBeTruthy();
    expect(seen.askNoModel.officer.hint).toBeTruthy();
    expect(seen.askNoModel.collector.hint).not.toMatch(/live data/i);
    expect(seen.askNoModel.officer.hint).not.toMatch(/live data/i);
  });

  // ---- the rules lane answering something else, with figures (no model on this server)
  it.fails("audit-ui_honesty-6: 'Are all the data feeds live?' is not answered with severe events", () => {
    expect(seen.answers.allLive.answerMarkdown).toMatch(/feed/i);
  });
  it.fails("audit-ui_honesty-6: 'How many feeds are live?' is answered with the feeds (it gets an empty incident search, or an error while an index is on disk)", () => {
    expect(seen.answers.howManyLive.answerMarkdown).toMatch(/feed/i);
  });
  it.fails("audit-ui_honesty-6: 'Is the hospital data real?' is not answered with bed occupancy", () => {
    expect(seen.answers.hospitalReal.answerMarkdown).not.toMatch(/bed occupancy/);
  });
  it.fails("audit-ui_honesty-6: Tanglish 'hospital data fake-a?' is not answered with bed occupancy", () => {
    expect(seen.answers.tgHospitalFake.answerMarkdown).not.toMatch(/bed occupancy/);
  });
  it.fails("audit-ui_honesty-6: Tamil 'is the police data real or test data?' is not answered with the top incidents", () => {
    expect(seen.answers.taPoliceReal.answerMarkdown).not.toMatch(/சம்பவங்கள்/);
  });

  // ---- a question about the feeds, answered with the feeds, never saying which are generated
  it.fails("audit-ui_honesty-7: 'Is the police feed live or generated?' gets an answer that says generated (owner's decision, reported)", () => {
    expect(seen.answers.policeGen.answerMarkdown).toMatch(/generated|mock|test/i);
  });
  it.fails("audit-ui_honesty-7: Tanglish 'police feed generated-a?' gets an answer that says generated (owner's decision, reported)", () => {
    expect(seen.answers.tgPoliceGen.answerMarkdown).toMatch(/generated|mock|test/i);
  });
  it.fails("audit-ui_honesty-7: the source_health tool does not hand a model 'Feeds healthy' counting generated feeds", async () => {
    const { runTool } = await import("@/lib/assistant/tools");
    const r = await runTool("source_health", {});
    const f = r.facts.find((x: { id: string }) => x.id === "feeds.ok") as { label: string; value: number };
    expect(f.value).toBeGreaterThan(0);
    expect(f.label).not.toMatch(/healthy/i);
  }, 170_000);
  it.fails("audit-ui_honesty-7: Jarvis's answer screen, fake model at generateJson, does not say 'Feeds healthy'", async () => {
    const { handleAgent } = await import("@/lib/thunai/agentServer");
    const { serverHands } = await import("@/lib/thunai/data");
    const { serverWorld } = await import("@/lib/thunai/world");
    const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0 };
    const r = await handleAgent({ text: "Which data sources are healthy?", state } as never, await serverWorld(), serverHands({ email: "qa@local", role: "collector", lockDept: null } as never), "collector:audit");
    expect(r.model).toBe("fake-model");
    expect(r.say).toBeTruthy();
    expect(r.say).not.toMatch(/healthy/i);
  }, 170_000);

  // ---- Tamil gets less than English and Tanglish on the same questions (no model on this server)
  it.fails("audit-ui_honesty-8: Tamil questions about the feeds are understood, as the English and Tanglish ones are", () => {
    expect(seen.answers.whichHealthy.datasets?.[0]?.id).toBe("feeds");
    expect(seen.answers.tgAllLive.datasets?.[0]?.id).toBe("feeds");
    for (const a of [seen.answers.taAllLive, seen.answers.taStatus]) expect(a.kind).not.toBe("clarify");
  });
  it.fails("audit-ui_honesty-8: Tamil 'is there test data?' reaches the same answer as English", () => {
    expect(seen.answers.realOrTest.kind).toBe("answer");
    expect(seen.answers.taTest.kind).not.toBe("clarify");
  });

  // ---- small things
  it.fails("audit-ui_honesty-9: the sign-in chip no longer carries the pulsing live dot", () => {
    expect(seen.signIn["en/login"].text).toMatch(/Across Chennai's 15 zones/);
    expect(seen.signIn["en/login"].dotInChip).toBe(false);
  });
  it.fails("audit-ui_honesty-10: in Tamil, the chip does not call an evening time மதியம்", () => {
    expect(seen.collectorChip.en.text).toMatch(/0[4-9]:\d\d PM/);
    expect(seen.collectorChip.ta.text).not.toMatch(/மதியம்/);
  });
  it.fails("audit-ui_honesty-11: the meaning-search model in this checkout is the real file, not a git-lfs pointer", () => {
    expect(fs.statSync(path.join(APP_ROOT, ".cache", "models", "Xenova", "multilingual-e5-base", "onnx", "model_quantized.onnx")).size).toBeGreaterThan(1_000_000);
  });
  it.fails("audit-ui_honesty-11: the search status says the meaning search is ready", () => {
    expect(seen.searchStatus.ready).toBe(true);
  });
  it.fails("audit-ui_honesty-12: the Data sources list does not show a localhost link as a source", () => {
    expect(seen.dataSources.rows.length).toBeGreaterThan(8);
    expect(seen.dataSources.rows.map((r) => r.url).join("\n")).not.toMatch(/localhost/);
  });

  // ---- a question that reaches the search tool, when the model cannot load: the code promises keywords, and gives an error
  it("the control for audit-ui_honesty-13: a model still loading falls back to keywords (null)", async () => {
    await expect(searchWith((m) => new m.ModelNotReady())).resolves.toBeNull();
  });
  // ---- and with no index, the keyword answer: its sentence says no reports exist when the store holds them
  it("the evidence behind audit-ui_honesty-14: the store holds incidents and news about a sinkhole, and the fallback finds them when asked in one word", async () => {
    expect(pinnedCount("incidents", ["title", "place_text"], "sinkhole")).toBeGreaterThanOrEqual(5);
    expect(pinnedCount("documents", ["title", "body"], "sinkhole")).toBeGreaterThanOrEqual(50);
    expect((await keywordSearch("Any sinkhole?")).incidents).toBeGreaterThanOrEqual(5);
  });
  it("audit-ui_honesty-14: with no index, asking for 'reports' about a sinkhole still finds the incidents the store holds", async () => {
    expect((await keywordSearch("Any reports about a sinkhole?")).incidents).toBeGreaterThanOrEqual(5);
  });
  it("audit-ui_honesty-14: with no index, the fallback looks in the news before saying no news report matches", async () => {
    expect((await keywordSearch("Any sinkhole?")).news).toBeGreaterThan(0);
  });
  it.fails("audit-ui_honesty-14: on the real route, 'Any reports about a sinkhole?' does not say that no reports match", () => {
    expect(seen.answers.sinkholeReports.headline).not.toMatch(/No incidents or news reports match/);
  });

  it("audit-ui_honesty-13: a model that cannot load also falls back to keywords, and does not end the answer in an error", async () => {
    await expect(searchWith(() => new Error("Load model from model_quantized.onnx failed:Protobuf parsing failed."))).resolves.toBeNull();
  });
});
