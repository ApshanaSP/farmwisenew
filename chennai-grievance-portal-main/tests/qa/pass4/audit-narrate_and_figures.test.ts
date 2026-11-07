// QA pass 4, audit of fixed bugs (part: narrate_and_figures). Real store on the pinned snapshot, real code path, no model key in the process.
// Where a model would answer, a fake model at the boundary (planRound's `llm.generate`, or the gateway's generateJson) gives the reply: that is said in each test.
// A test named with an AUD-NF id is a bug that is open now: it.fails keeps the suite green and the bug visible. The fixer changes it to it().
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/audit-narrate_and_figures.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import intelPool, { ops } from "@/lib/collector/db";
import { asOf, exportRows, list, overview } from "@/lib/collector/intel";
import { insights, trendKeys } from "@/lib/collector/insights";
import { threads } from "@/lib/collector/threads";
import { ask } from "@/lib/assistant/pipeline";
import { serverHands } from "@/lib/thunai/data";
import { serverWorld } from "@/lib/thunai/world";
import { clearCaches, planRound, RoundBody } from "@/lib/thunai/round";
import { Ledger, MemoryStore } from "@/lib/thunai/ledger";
import { figuresIn, gateChunk } from "@/lib/thunai/numbergate";
import { idam, plainWho } from "@/lib/thunai/narrate";
import { labelIn } from "@/lib/thunai/speechcheck";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import type { CaseRowT } from "@/lib/thunai/stage";

type Row = Record<string, unknown>;
const FROZEN = "2026-11-06T06:30:00.000Z"; // 12:00 IST; the store's as-of, 18:08 IST, is later, so "now" in the app is 18:08 IST
const USER = "qa.audit.nf@example.test";
const q = async (sql: string, params: unknown[] = []): Promise<Row[]> => (await intelPool.query(sql, params))[0] as unknown as Row[];
const state = (over: Row = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false, ...over });
let turn = 0;
const hands = () => serverHands({ email: USER, role: "collector", lockDept: null });
const noModel = { generate: async () => { throw new Error("no model"); } } as never;
/** a whole sentence through the real round */
async function said(text: string, llm: never = noModel) {
  const body = RoundBody.parse({ turnId: `aud-${++turn}-${text.length}`, round: 0, text, turns: [], lastText: null, stage: null, direct: null, state: state() });
  return planRound(body, await serverWorld(), hands(), USER, { notes: [], habits: {} }, undefined, { llm });
}
/** a screen as the planner or a Stage control asks for it (the same code the planner's screen runs) */
async function direct(recipe: string, slots: Row, lang: "en" | "ta" = "en") {
  const body = RoundBody.parse({ turnId: `aud-${++turn}-d`, round: 0, text: "show", turns: [], lastText: null, stage: null, direct: { recipe, slots, lang }, state: state() });
  const r = await planRound(body, await serverWorld(), hands(), USER, { notes: [], habits: {} }, undefined, { llm: noModel });
  return r.result!;
}
const blockOf = <K extends string>(r: { stage?: { blocks: Row[] } | null } | null | undefined, kind: K) => r?.stage?.blocks.find((b) => b.kind === kind) as (Row & { rows?: CaseRowT[]; total?: number; incident?: CaseRowT }) | undefined;
const fakePlan = (plan: Row) => {
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => ({
    object: (c.name === "jarvis_router" ? { lane: "district" } : plan) as U,
    info: { step: c.name, provider: "groq", model: "fake", ms: 1, inputTokens: 1, outputTokens: 1 } } as never);
  return { generate: generate as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } as never;
};
const screenOf = (over: Row) => ({ recipe: "cases", period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null, by: null, order: null, n: null, item: null, id: null, name: null, what: null, sort: null, ...over });

const nextDay = (d: string, by: number) => new Date(Date.parse(`${d}T00:00:00Z`) + by * 864e5).toISOString().slice(0, 10);
const countDay = async (day: string, extra = "", params: unknown[] = []) => Number((await q(`SELECT COUNT(*) AS n FROM incidents i WHERE i.first_reported_at >= ? AND i.first_reported_at < ? ${extra}`, [`${day} 00:00:00`, `${nextDay(day, 1)} 00:00:00`, ...params]))[0]?.n);
const askChat = (message: string, scope: Row = {}) => ask({ user: USER, sessionId: null, message, inputMode: "text", language: "auto", scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, ...scope }, replyTo: null, pinId: null, insightKey: null, lockDept: null, signal: new AbortController().signal, stage: () => undefined } as never);
const firstNumber = (s: unknown) => Number(String(s).replace(/,/g, "").match(/\d+/)?.[0]);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
  clearCaches();
  expect(await asOf()).toBe("2026-11-06 18:08:00");
});
afterAll(() => { vi.useRealTimers(); });

// ------------------------------------------------------------ what holds --

describe("BUG-004, BUG-031: one issue is retold, and a closed one as closed (real store)", () => {
  it.each(["explain the flooding complaint in Adyar", "Adyar flooding enna aachu", "அடையாறு வெள்ள புகார் விளக்கமா சொல்லுங்க"])("%s reads no field out", async (text) => {
    const r = (await said(text)).result!;
    expect(r.stage?.recipe).toBe("case");
    const { en, ta } = r.stage!.say;
    expect(labelIn(en)).toBeNull();
    expect(`${en} ${ta}`).not.toMatch(/\bstatus\b|handles it|INC-|Severe,|High,/);
    expect(en).toMatch(/^There's |^There was /);
  });
  it.each(["Resolved", "Rejected", "Lapsed"])("a %s case has no job left in it, in either language", async (status) => {
    const [row] = await q(`SELECT incident_id AS id FROM incidents WHERE status_std = ? ORDER BY first_reported_at DESC LIMIT 1`, [status]);
    const r = await direct("case", { id: row.id, fresh: true });
    const { en, ta } = r.stage!.say;
    expect(en).toMatch(/^There (was|were) /);
    expect(en).not.toMatch(/It's been open|past its deadline|I'd ask/);
    expect(ta).not.toMatch(/தீர்க்கப்படாமல் இருக்கிறது|நிலவரம் கேட்கலாம்|கெடு/);
    expect(r.stage!.takeaway).toBeNull();
  });
  it.each(["explain ID", "ID enna aachu", "ID விளக்கு"])("by a sentence, %s (a fake model at the boundary picks the closed case by its id)", async (form) => {
    const [row] = await q(`SELECT incident_id AS id FROM incidents WHERE status_std = 'Resolved' ORDER BY first_reported_at DESC LIMIT 1`);
    const r = (await said(form.replace("ID", String(row.id)), fakePlan({ kind: "do", lang: /[஀-௿]/.test(form) ? "ta" : "en", reply: null, options: [], screen: screenOf({ recipe: "case", id: row.id }) }))).result!;
    expect(r.stage?.recipe).toBe("case");
    expect(r.stage!.say.en).toMatch(/^There (was|were) /);
    expect(r.stage!.say.en).not.toMatch(/It's been open|I'd ask/);
    expect(r.stage!.say.ta).not.toMatch(/தீர்க்கப்படாமல் இருக்கிறது|நிலவரம் கேட்கலாம்/);
  });
});

describe("BUG-008: week keys are Mondays and the weeks are not empty (this process's time zone; the server runs cover the others)", () => {
  it.each(["2026-11-07 00:30:00", "2026-11-09 00:30:00", "2026-11-09 03:00:00"])("%s", (now) => {
    const { weeks } = trendKeys(now);
    expect(weeks).toHaveLength(12);
    for (const k of weeks) expect(new Date(`${k}T00:00:00Z`).getUTCDay()).toBe(1);
  });
  it("the real Trends have reports in every week", async () => {
    const d = await insights("monthly", null, null, {}, "trends");
    const totals = d.trends.weekly.keys.map((_: string, j: number) => d.trends.weekly.lines.reduce((a: number, l: { values: number[] }) => a + l.values[j], 0));
    expect(totals.filter((n: number) => n === 0)).toEqual([]);
    expect(d.trends.weekly.keys[11]).toBe("2026-10-26");
  });
});

describe("BUG-026: the officer's bell keeps to the department", () => {
  it.each(["GCC-SWM", "GCC-ELE", "CMWSSB", "GCC-SWD", "POL-GCP"])("%s", async (dept) => {
    for (const p of ["daily", "weekly", "quarterly"] as const) {
      const d = await overview(p, null, dept);
      expect((d.bell as Row[]).filter((b) => b.dept !== dept)).toEqual([]);
    }
  });
});

describe("BUG-029: the assistant CSV's columns are filled", () => {
  it("no column is blank on every row", async () => {
    const rows = await exportRows("weekly", null, null);
    expect(rows.length).toBeGreaterThan(0);
    for (const col of ["list", "id", "what", "where", "department", "severity", "why", "reported", "past_deadline", "complaints"]) {
      expect(rows.filter((r: Row) => String(r[col] ?? "").trim() === "").length, col).toBe(0);
    }
  });
});

describe("BUG-017: the original line stays out (fake model at the boundary gives the chat line)", () => {
  it("through the real round", async () => {
    const line = "There is only one severe case open in Adyar.";
    expect(gateChunk(line, new Set()).ok).toBe(false);
    const r = await said("is Adyar ok right now tell me plainly", fakePlan({ kind: "chat", lang: "en", reply: line, options: [] }));
    expect(JSON.stringify([r.result?.reply, r.result?.say])).not.toMatch(/only one severe/i);
  });
});

describe("BUG-019: the original Tamil join", () => {
  it("every department with a Tamil name joins rightly", () => {
    for (const code of ["HLT-DMS", "POL-GCP", "CMWSSB", "PWD-WRD", "TANGEDCO", "GCC-SWD", "GCC-SWM", "GCC-ELE"]) expect(idam(plainWho(code, null)!.ta)).not.toMatch(/துறைவிடம்|இடம்$/);
  });
});

// -------------------------------------------------------------- reopened --

describe("BUG-007 reopened", () => {
  it.fails.each(["weekly", "monthly", "quarterly", "daily"])("AUD-NF-1 %s: overdue cases with no severity are listed, not 'no cases'", async (period) => {
    const c = await list({ period, zone: null, dept: null, sev: null, status: "overdue", q: null, sort: "t", dir: -1, page: 0, scope: "period" } as never);
    expect(c.incidents).toBeGreaterThan(0);
    const r = await direct("cases", { status: "overdue", period, fresh: true, zones: [] });
    expect(r.stage!.say.en).not.toMatch(/^There are no cases/);
    expect(blockOf(r, "CaseList")?.total).toBe(c.incidents);
  });
  it.fails("AUD-NF-1 'show overdue cases', a fake model picks the same screen the real planner would", async () => {
    const r = await said("show overdue cases", fakePlan({ kind: "do", lang: "en", reply: null, options: [], screen: screenOf({ status: "overdue", period: "weekly" }) }));
    expect(blockOf(r.result, "CaseList")?.total).toBeGreaterThan(0);
  });
  it.fails.each(["overdue cases this week", "indha week overdue cases kaattu", "காலக்கெடு தாண்டிய சம்பவங்கள் இந்த வாரம்"])("AUD-NF-1 %s", async (text) => {
    const r = (await said(text)).result!;
    expect(blockOf(r, "CaseList")?.total).toBeGreaterThan(0);
  });
});

describe("BUG-018 reopened: 'yesterday' is the day before yesterday", () => {
  const YDAY = "2026-11-05", BEFORE = "2026-11-04";
  it("the data has a difference to see", async () => expect(await countDay(YDAY)).not.toBe(await countDay(BEFORE)));
  it.fails.each(["how many incidents yesterday", "nethu evlo incidents"])("AUD-NF-2 %s counts 5 Nov, not 4 Nov", async (message) => {
    const a = await askChat(message);
    expect(firstNumber((a as { card: { headline: string } }).card.headline)).toBe(await countDay(YDAY));
  });
  it.fails.each(["how many incidents yesterday"])("AUD-NF-2 %s compares with the day before it", async (message) => {
    const a = await askChat(message);
    const before = Number(String((a as { card: { answerMarkdown: string } }).card.answerMarkdown).match(/\(([\d,]+) in the period before\)/)?.[1]?.replace(/,/g, ""));
    expect(before).toBe(await countDay(BEFORE));
  });
  it.fails("AUD-NF-2 நேற்று எத்தனை புகார்கள் adds up 5 Nov's complaints", async () => {
    const a = await askChat("நேற்று எத்தனை புகார்கள்");
    const [r] = await q(`SELECT SUM(i.citizen_complaints) AS n FROM incidents i WHERE i.first_reported_at >= ? AND i.first_reported_at < ?`, [`${YDAY} 00:00:00`, `2026-11-06 00:00:00`]);
    expect(firstNumber((a as { card: { headline: string } }).card.headline)).toBe(Number(r.n));
  });
});

describe("BUG-021 partly", () => {
  const consoleCount = async (period: string, sev: string | null) => (await list({ period, zone: null, dept: null, sev, status: "overdue", q: null, sort: "t", dir: -1, page: 0, scope: "period" } as never));
  it("not every overdue case: the original failure is gone", async () => {
    const all = await consoleCount("weekly", null), sev = await consoleCount("weekly", "Severe");
    const r = await direct("cases", { status: "overdue", sev: "Severe", period: "weekly", fresh: true, zones: [] });
    expect(blockOf(r, "CaseList")?.total).toBeLessThan(all.incidents);
    expect(blockOf(r, "CaseList")?.total).toBeLessThanOrEqual(sev.incidents);
  });
  it.fails.each(["weekly", "monthly", "quarterly"])("AUD-NF-3 %s: 'severe overdue' says the console's count of incidents", async (period) => {
    const c = await consoleCount(period, "Severe");
    const r = await direct("cases", { status: "overdue", sev: "Severe", period, fresh: true, zones: [] });
    expect(blockOf(r, "CaseList")?.total).toBe(c.incidents);
  });
  it.fails("AUD-NF-3 quarterly: not even the console's groups, the count stops after nine pages", async () => {
    const c = await consoleCount("quarterly", "Severe");
    const r = await direct("cases", { status: "overdue", sev: "Severe", period: "quarterly", fresh: true, zones: [] });
    expect(blockOf(r, "CaseList")?.total).toBe(c.total);
  });
  it.fails.each(["daily", "weekly", "monthly"])("AUD-NF-3 %s: overdue High cases are not 'no high cases'", async (period) => {
    const c = await consoleCount(period, "High");
    expect(c.incidents).toBeGreaterThan(0);
    const r = await direct("cases", { status: "overdue", sev: "High", period, fresh: true, zones: [] });
    expect(r.stage!.say.en).not.toMatch(/^There are no high cases/);
  });
});

describe("new: the issue or list that 'matters most' is the least severe (the list's sort runs backwards from the tool)", () => {
  it.fails.each(["explain the flooding complaint in Adyar", "Adyar flooding enna aachu", "அடையாறு வெள்ளம் விளக்கு"])("AUD-NF-4 %s picks the most severe open case", async (text) => {
    const r = (await said(text)).result!;
    const id = blockOf(r, "CaseDetail")?.incident?.id;
    const [mine] = await q(`SELECT severity_level AS sev FROM incidents WHERE incident_id = ?`, [id]);
    const [top] = await q(`SELECT i.severity_level AS sev FROM incidents i WHERE i.zone_no = 13 AND i.category_code = 'FLOOD_WATERLOGGING' AND i.is_open = 1 AND i.first_reported_at > ? ORDER BY FIELD(i.severity_level, 'Severe', 'High', 'Medium', 'Low') LIMIT 1`, ["2026-10-07 18:08:00"]);
    expect(mine.sev).toBe(top.sev);
  });
  it.fails("AUD-NF-4 a list's first row is its most severe", async () => {
    const r = await direct("cases", { q: "water", period: "weekly", fresh: true, zones: [13] });
    const sevs = blockOf(r, "CaseList")!.rows!.map((x) => x.sev);
    expect(sevs[0]).toBe(["Severe", "High", "Medium", "Low"].find((s) => sevs.includes(s)));
  });
});

describe("new: a place named in 'explain' is dropped when a topic was heard", () => {
  it.each([["explain the flooding complaint in Velachery", /velachery/i], ["explain the garbage complaint in Mylapore", /mylapore/i], ["Velachery flooding enna aachu", /velachery/i], ["வேளச்சேரி வெள்ள புகார் விளக்கு", /velachery/i], ["மயிலாப்பூர் குப்பை புகார் விளக்கமா சொல்லுங்க", /mylapore/i]])("AUD-NF-5 %s is about that place", async (text, place) => {
    const r = (await said(text)).result;
    const inc = blockOf(r, "CaseDetail")?.incident;
    if (inc) expect(`${inc.place ?? ""} ${inc.title ?? ""}`).toMatch(place as RegExp);
  });
  it.each(["explain the garbage complaint in Madurai", "explain the flooding complaint in Mumbai", "மதுரை குப்பை புகார் விளக்கு"])("AUD-NF-5 %s is not answered with a Chennai case", async (text) => {
    expect(blockOf((await said(text)).result, "CaseDetail")).toBeUndefined();
  });
});

describe("BUG-017 partly: other ways to say one, or a count, pass the gate with nothing allowed (a model line never has any)", () => {
  it.each(["There is only one severe case open in Adyar.", "One complaint came in today.", "Just one incident is open."])("held: %s", (line) => expect(gateChunk(line, new Set()).ok).toBe(false));
  it.fails.each(["Only one is open in Adyar.", "There is a single severe case open in Adyar.", "Only one severe flooding case is open in Adyar.", "There's just one flood in Adyar.", "அடையாறில் ஒரே ஒரு கடுமையான சம்பவம் மட்டுமே உள்ளது.", "ஒரு புகார் மட்டும் வந்துள்ளது.", "Adyar la oru severe case dhaan irukku.", "Adyar la onnu dhaan open la irukku."])("AUD-NF-6 %s", (line) => {
    expect(figuresIn(line).length).toBeGreaterThan(0);
  });
  it.fails("AUD-NF-6 through the real round, a fake model's line is said as it is", async () => {
    const r = await said("is Adyar ok right now tell me plainly", fakePlan({ kind: "chat", lang: "en", reply: "There is a single severe case open in Adyar.", options: [] }));
    expect(r.result?.reply ?? "").not.toMatch(/single severe case/);
  });
});

describe("BUG-019 partly: a name with no Tamil gets the suffix glued on", () => {
  it.fails.each([["DIST-DM", "District Disaster Management"], ["TNPCB", "Pollution Control Board"]])("AUD-NF-7 %s", (code, name) => {
    expect(idam(plainWho(code, name)!.ta)).not.toMatch(/[A-Za-z]இடம்/);
  });
});

describe("BUG-027 partly: a department that has no report behind a pattern still gets it", () => {
  it("a department with none of the kind gets none", async () => {
    const d = await insights("daily", null, "GCC-SWM");
    expect(d.briefing.emerging).toEqual([]);
  });
  it.fails.each(["GCC-EDU", "GCC-HLT", "GCC-LND", "GCC-BRG"])("AUD-NF-8 %s has no report behind any emerging pattern", async (dept) => {
    const d = await insights("daily", null, dept);
    expect(d.briefing.emerging as Row[]).toEqual([]);
  });
  it.fails("AUD-NF-8 the police's count is the police's", async () => {
    const d = await insights("daily", null, "POL-GCP");
    const flood = (d.briefing.emerging as Row[]).find((e) => e.cat === "FLOOD_WATERLOGGING");
    const [r] = await q(`SELECT COUNT(*) AS n FROM incidents i WHERE i.category_code = 'FLOOD_WATERLOGGING' AND i.zone_no = 4 AND i.first_reported_at >= '2026-11-04 00:00:00' AND i.first_reported_at < '2026-11-05 00:00:00' AND i.lead_dept = 'POL-GCP'`);
    expect(Number(flood?.observed)).toBe(Number(r.n));
  });
});

// A decision is written the way the route writes it. Each process has its own durable file (vitest.qa4.config.ts): nothing leaves this run.
async function decide(id: string, decision: "resolve" | "reject" | "reopen") {
  await q(`INSERT INTO ${ops("collector_decisions")} (incident_id, decision, escalate_to, note, decided_by, decided_role) VALUES (?, ?, NULL, 'QA audit', ?, 'collector')`, [id, decision, USER]);
}

describe("after a decision (BUG-028, BUG-035)", () => {
  it("BUG-028 the briefing's counts follow a decision", async () => {
    const [t] = await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.is_open = 1 AND i.sla_breached = 1 AND i.first_reported_at > '2026-11-05 18:08:00' AND i.first_reported_at <= '2026-11-06 18:08:00' ORDER BY i.priority_score DESC LIMIT 1`);
    const before = (await insights("daily", null, null)).briefing.stats as Row;
    await decide(String(t.id), "reject");
    const after = (await insights("daily", null, null)).briefing.stats as Row;
    expect(Number(after.open)).toBe(Number(before.open) - 1);
    expect(Number(after.overdue)).toBe(Number(before.overdue) - 1);
    expect((await insights("daily", null, null)).briefing.attention.map((a: Row) => a.id)).not.toContain(t.id);
    await decide(String(t.id), "reopen");
  });
  it.fails("AUD-NF-9 BUG-028 the Briefing Book's rows say the case's status after a decision", async () => {
    const [t] = await q(`SELECT i.incident_id AS id, i.lead_dept AS dept FROM incidents i WHERE i.is_open = 1 AND i.severity_level = 'Severe' AND i.first_reported_at > '2026-11-05 18:08:00' AND i.first_reported_at <= '2026-11-06 18:08:00' ORDER BY i.first_reported_at DESC LIMIT 1`);
    await decide(String(t.id), "reject");
    try {
      const book = (await insights("daily", null, null)).book as { departments: { items: Row[] }[] };
      const item = book.departments.flatMap((d) => d.items).find((x) => x.id === t.id);
      expect(item?.status).toBe("Rejected");
    } finally { await decide(String(t.id), "reopen"); }
  });
  it.fails("AUD-NF-9 BUG-028 a reopened case leaves the Briefing Book's good news", async () => {
    const book0 = (await insights("daily", null, null)).book as { good: { serious: Row[] } };
    const id = String(book0.good.serious[0]?.id);
    await decide(id, "reopen");
    const book = (await insights("daily", null, null)).book as { good: { serious: Row[] } };
    expect(book.good.serious.map((x) => x.id)).not.toContain(id);
  });
  it.fails("AUD-NF-10 BUG-035 Jarvis's case screen says closed at once", async () => {
    const [t] = await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.is_open = 1 AND i.severity_level = 'High' ORDER BY i.first_reported_at DESC LIMIT 1 OFFSET 3`);
    const r0 = await direct("case", { id: t.id, fresh: true });
    expect(r0.stage!.say.en).toMatch(/^There's /);
    await decide(String(t.id), "resolve");
    const r1 = await direct("case", { id: t.id, fresh: true });
    expect(r1.stage!.say.en).toMatch(/^There was /);
  });
  it.fails("AUD-NF-10 BUG-035 a developing story says closed at once", async () => {
    const now = await asOf();
    const s = { hours: 24, zone: null, dept: null, cat: null, taluk: null, since: "2026-11-05 18:08:00" };
    const open = (await threads(s, now)).threads.find((t) => t.open && t.incidents.length === 1);
    expect(open).toBeTruthy();
    await decide(open!.incidents[0], "resolve");
    const again = (await threads(s, now)).threads.find((t) => t.id === open!.id);
    expect(again?.open).toBe(false);
  });
});

describe("BUG-035: the AI brief's figures, with a fake model at the gateway", () => {
  it("a decided case leaves the figures the model is given", async () => {
    const gateway = await import("@/lib/ai/gateway");
    const seen: string[] = [];
    const spy = vi.spyOn(gateway, "generateJson").mockImplementation((async (c: { prompt: string }) => { seen.push(c.prompt); throw new Error("fake model: no answer"); }) as never);
    try {
      const { dayBrief } = await import("@/lib/collector/aibrief");
      const scope = { period: "daily" as const, zone: null, dept: "GCC-ELE", taluk: null };
      await dayBrief(scope, USER).catch(() => null);
      const before = seen.at(-1) ?? "";
      const [t] = await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.is_open = 1 AND i.lead_dept = 'GCC-ELE' AND i.first_reported_at > '2026-11-05 18:08:00' AND i.first_reported_at <= '2026-11-06 18:08:00' LIMIT 1`);
      await decide(String(t.id), "resolve");
      await dayBrief(scope, USER).catch(() => null);
      const after = seen.at(-1) ?? "";
      const open = (s: string) => Number(s.match(/(\d+)\s+(?:still\s+)?open/i)?.[1]);
      expect(before.length).toBeGreaterThan(0);
      expect(open(after)).toBe(open(before) - 1);
    } finally { spy.mockRestore(); }
  });
});

describe("BUG-035: the other places a decision reaches (real store)", () => {
  it("Data Studio's drill-down list says closed", async () => {
    const { incidentsFor } = await import("@/lib/studio/link");
    const open = (await incidentsFor([5], ["FLOOD_WATERLOGGING"], 8)).find((x) => x.open);
    expect(open).toBeTruthy();
    await decide(open!.id, "resolve");
    expect((await incidentsFor([5], ["FLOOD_WATERLOGGING"], 8)).find((x) => x.id === open!.id)?.open ?? false).toBe(false);
  });
  it("the warning's list of open flood problems drops it", async () => {
    const { warningsNow } = await import("@/lib/assistant/warnings");
    const [top] = await q(`SELECT i.incident_id AS id, i.place_text AS loc FROM incidents i WHERE i.is_open = 1 AND i.category_code IN ('FLOOD_WATERLOGGING') AND i.severity_level IN ('Severe', 'High') AND i.incident_id NOT IN (SELECT incident_id FROM ${ops("collector_decisions")}) ORDER BY i.priority_score DESC LIMIT 1`);
    const before = (await warningsNow(await asOf())).markdown;
    await decide(String(top.id), "resolve");
    const after = (await warningsNow(await asOf())).markdown;
    expect(after).not.toBe(before);
  });
  it("a reopened case is retold as open, and a closed one by a decision as closed", async () => {
    const [t] = await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.status_std = 'Resolved' AND i.first_reported_at > '2026-11-01 00:00:00' AND i.incident_id NOT IN (SELECT incident_id FROM ${ops("collector_decisions")}) ORDER BY i.priority_score DESC LIMIT 1`);
    vi.setSystemTime(new Date(Date.parse(FROZEN) + 5 * 60_000)); // past the tool cache: AUD-NF-10 is about the cache
    await decide(String(t.id), "reopen");
    vi.setSystemTime(new Date(Date.parse(FROZEN) + 10 * 60_000));
    const r = await direct("case", { id: t.id, fresh: true });
    expect(r.stage!.say.en).toMatch(/^There's /);
    vi.setSystemTime(new Date(FROZEN));
  });
});

describe("new, found on the way", () => {
  it("the fake model's plan reaches the cases screen (so AUD-NF-1's fake-model test fails for the right reason)", async () => {
    const r = await said("show overdue cases", fakePlan({ kind: "do", lang: "en", reply: null, options: [], screen: screenOf({ status: "overdue", period: "weekly" }) }));
    expect(r.result?.stage?.recipe).toBe("cases");
    expect(r.result?.stage?.slots.status).toBe("overdue");
  });
  it.fails("AUD-NF-11 two complaints are not 'a lot of residents'", async () => {
    const { explainIssue, factSheet } = await import("@/lib/thunai/narrate");
    const row = { id: "x", title: "t", sev: "High", status: "Open", zone: 13, zoneName: "Adyar", place: "Guindy", ward: 1, dept: "GCC-SWD", deptName: "SWD", complaints: 2, t: null, overdue: false, lat: null, lon: null, why: null, cat: "Flooding & waterlogging" } as CaseRowT;
    expect(explainIssue(factSheet(row, { openFor: "4 days" }), "x").en).not.toMatch(/a lot of residents/);
  });
  // the console holds no window for a single past day, so Jarvis now says so and shows no screen; a screen titled today would still fail here
  it.each(["severe cases yesterday", "நேற்று கடுமையான சம்பவங்கள்", "nethu severe cases"])("AUD-NF-12 Jarvis, %s: not today's list", async (text) => {
    const r = (await said(text)).result!;
    expect(r.stage?.title ?? "").not.toMatch(/today|இன்று/);
    // handed on to the planner (kind none, no screen, no steps): the words that say the window is missing are the planner's, which no model answers here (review point 4)
    expect([r.kind, r.stage, r.steps.length]).toEqual(["none", null, 0]);
  });
  it.fails("AUD-NF-13 a sewage case held by the drains team: the step names who holds it", async () => {
    const [t] = await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.is_open = 1 AND i.category_code = 'DRAINAGE_SEWAGE' AND i.lead_dept = 'GCC-SWD' ORDER BY i.first_reported_at DESC LIMIT 1`);
    const r = await direct("case", { id: t.id, fresh: true });
    expect(r.stage!.say.en).not.toMatch(/I'd ask Metrowater/);
  });
  it.fails("AUD-NF-14 a reopened case is not 'open ... closed on'", async () => {
    const [t] = await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.status_std = 'Resolved' AND i.closed_at IS NOT NULL AND i.first_reported_at > '2026-11-02 00:00:00' AND i.incident_id NOT IN (SELECT incident_id FROM ${ops("collector_decisions")}) ORDER BY i.first_reported_at DESC LIMIT 1`);
    await decide(String(t.id), "reopen");
    const a = await askChat(`what is the status of ${t.id}`);
    expect(String((a as { card: { answerMarkdown: string } }).card.answerMarkdown)).not.toMatch(/closed on/);
  });
  // the rules' lane: no model key in the process, so these are the answers when no model can be reached
  // (நேற்று எத்தனை சம்பவங்கள், "no incidents", is in the real-run log only: in this process it reaches the meaning search, whose model file is an LFS pointer here, AUD-NF-21)
  it.fails.each([["how many were resolved yesterday", /resolved/i], ["how many deaths yesterday", /death/i]])("AUD-NF-15 %s answers what was asked", async (message, want) => {
    const a = await askChat(message as string);
    expect(String((a as { card: { headline: string } }).card.headline)).toMatch(want as RegExp);
  });
  it.fails.each(["நேற்றைய புகார்கள் எத்தனை", "நேத்து எவ்வளவு புகார்"])("AUD-NF-15 %s is about yesterday", async (message) => {
    const a = await askChat(message);
    expect(String((a as { card: { headline: string } }).card.headline)).toMatch(/நேற்று/);
  });
  it.fails("AUD-NF-16 the English reads right: 'in the last 30 days'", async () => {
    const r = await direct("cases", { sev: "Severe", status: "overdue", period: "monthly", fresh: true, zones: [] });
    expect(r.stage!.say.en).not.toMatch(/cases the last 30 days/);
  });
  it.fails("AUD-NF-17 a Tamil spoken list has no English sentence in it", async () => {
    const r = (await said("இந்த வாரம் கெடு தாண்டிய கடுமையான சம்பவங்கள் காட்டு")).result!;
    expect(r.stage!.say.ta).not.toMatch(/standing water at|[a-z]+ [a-z]+ at [A-Z]/);
  });
  it.fails("AUD-NF-18 Trends' oldest week is a whole week, as the others are", async () => {
    const d = await insights("monthly", null, null, {}, "trends");
    const oldest = d.trends.weekly.keys[0];
    const total = d.trends.weekly.lines.reduce((a: number, l: { values: number[] }) => a + l.values[0], 0);
    const [r] = await q(`SELECT COUNT(*) AS n FROM incidents i WHERE i.first_reported_at >= ? AND i.first_reported_at < ?`, [`${oldest} 00:00:00`, `${nextDay(oldest, 7)} 00:00:00`]);
    expect(total).toBe(Number(r.n));
  });
  // the same count in English says "past their deadline"; countInLanguage takes no word for it, so the overdue or open count is said as everything reported
  it("the English line keeps the word, so the count is right and only the Tanglish and Tamil lines lose it", async () => {
    const a = await askChat("how many overdue incidents this week");
    expect(String((a as { card: { answerMarkdown: string } }).card.answerMarkdown)).toMatch(/past their deadline/);
  });
  it.fails.each(["evlo overdue cases indha week", "indha week evlo overdue incidents", "indha week evlo open cases"])("AUD-NF-22 %s is not said as every incident reported", async (message) => {
    const a = await askChat(message);
    const n = firstNumber((a as { card: { headline: string } }).card.headline);
    const [all] = await q(`SELECT COUNT(*) AS n FROM incidents i WHERE i.first_reported_at > '2026-10-30 18:08:00' AND i.first_reported_at <= '2026-11-06 18:08:00'`);
    expect(n).toBeLessThan(Number(all.n)); // the count itself is the filtered one
    expect(String((a as { card: { answerMarkdown: string } }).card.answerMarkdown)).not.toMatch(/[\d,]+ incidents report aagirukku/);
  });
  it.fails("AUD-NF-22 Tamil, with a fake router at the boundary that understood 'overdue': not said as every incident reported", async () => {
    const { fastPath } = await import("@/lib/assistant/fastpath");
    const { detectIntent } = await import("@/lib/assistant/intent");
    const { refNames } = await import("@/lib/assistant/scope");
    const decided = detectIntent("how many overdue incidents this week", null);
    expect(decided.overdue).toBe(true);
    const fp = await fastPath({ message: "இந்த வாரம் கெடு தாண்டிய சம்பவங்கள் எத்தனை", lang: "ta", scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null } as never, names: await refNames(), now: await asOf(), lockDept: null, ctx: null, place: null }, decided);
    expect(String(fp!.card.answerMarkdown)).not.toMatch(/பதிவாகியுள்ளன/);
  });
  it.fails("AUD-NF-19 a closed case's screen has no 'past deadline' flag beside what is said", async () => {
    const [t] = await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.status_std = 'Resolved' AND i.sla_breached = 1 AND i.incident_id NOT IN (SELECT incident_id FROM ${ops("collector_decisions")}) ORDER BY i.first_reported_at DESC LIMIT 1`);
    const r = await direct("case", { id: t.id, fresh: true });
    expect(r.stage!.takeaway).toBeNull();
    expect(blockOf(r, "CaseDetail")?.incident?.overdue).toBe(false);
  });
  it.fails("AUD-NF-19 Ask District IQ: a closed case's status is not 'and past its deadline'", async () => {
    const [t] = await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.status_std = 'Resolved' AND i.sla_breached = 1 AND i.incident_id NOT IN (SELECT incident_id FROM ${ops("collector_decisions")}) ORDER BY i.first_reported_at DESC LIMIT 1 OFFSET 1`);
    const a = await askChat(`what is the status of ${t.id}`);
    expect(String((a as { card: { answerMarkdown: string } }).card.answerMarkdown)).not.toMatch(/past its deadline/);
  });
});
