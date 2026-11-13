// Review of Ask District IQ's wiring of the shared period reader (src/lib/assistant/fastpath.ts, intent.ts), pass 7 rules-periods.
// Pure: the data calls (incidents.ts, news.ts, lance.ts) are replaced by fakes that record what they were asked; no database, no model.
// "BREAK" tests assert the owner's spec and FAIL while the break is there; "holds" tests passed when written.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rec = vi.hoisted(() => ({ counts: [] as Record<string, unknown>[], resolved: [] as Record<string, unknown>[], news: [] as Record<string, unknown>[], search: [] as Record<string, unknown>[] }));
vi.mock("@/lib/assistant/incidents", async (orig) => {
  const o = await orig<typeof import("@/lib/assistant/incidents")>();
  const C = { n: 12, severe: 3, open: 7, dead: 0, injured: 0, complaints: 9, openComplaints: 4, prev: 10, prevDead: 0, prevComplaints: 8, complaintIncidents: 6, complaintOpen: 3, prevComplaintIncidents: 5 };
  return {
    ...o,
    countIncidents: vi.fn(async (f: Record<string, unknown>) => { rec.counts.push(f); return C; }),
    countResolved: vi.fn(async (f: Record<string, unknown>) => { rec.resolved.push(f); return { n: 3, severe: 0, late: 0, prev: 2 }; }),
    rankedIncidents: vi.fn(async (f: { period: string }) => ({ items: [], total: 0, period: f.period, widened: false })),
    anySynthetic: vi.fn(async () => false), idsOfDept: vi.fn(async () => new Set()), incidentsByIds: vi.fn(async () => []),
    incidentsWithWords: vi.fn(async () => ({ ids: [], total: 0 })), countByZone: vi.fn(async () => []), categoryRanking: vi.fn(async () => []),
    shareOfIncidents: vi.fn(async () => ({ n: 0, resolved: 0, open: 0, severe: 0, overdue: 0 })), windowRows: vi.fn(async () => ({ rows: [], total: 0, open: 0, complaints: 0 }))
  };
});
vi.mock("@/lib/assistant/news", () => ({ topStories: vi.fn(async (a: Record<string, unknown>) => { rec.news.push(a); return { stories: [], candidates: 0 }; }), storiesOfDocs: vi.fn(async () => []) }));
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: vi.fn(async (_k: string, _q: string, f: Record<string, unknown>) => { rec.search.push(f); return []; }), currentIncidentIds: vi.fn(async () => []) }));

import { countInLanguage, fastPath } from "@/lib/assistant/fastpath";
import { detectIntent } from "@/lib/assistant/intent";
import { readPeriod } from "@/lib/period/read";

const NOW = "2026-11-06 18:08:00";
const names = { zones: new Map(), depts: new Map(), cats: new Map(), taluks: new Map() };
const ask = (message: string, lang: "en" | "ta" | "tanglish" = "en") =>
  fastPath({ message, lang, scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null }, names: names as never, now: NOW, lockDept: null, ctx: null, place: null });
const istSec = (s: string) => Date.parse(`${s.replace(" ", "T")}+05:30`) / 1000;
beforeEach(() => { rec.counts.length = 0; rec.resolved.length = 0; rec.news.length = 0; rec.search.length = 0; });

describe("p7-rules-periods-01 (open, it.fails until fixed): BREAK: news over a named day or month is the rolling news window", () => {
  it.fails("BREAK: 'Top news from last month' is not answered with the last 30 days", async () => {
    const o = (await ask("Top news from last month"))!;
    expect(readPeriod("Top news from last month")).toEqual({ kind: "last", unit: "month" });
    expect({ hours: rec.news[0]?.hours, scope: o.card.scopeLine }).not.toEqual({ hours: 720, scope: "Last 30 days · Chennai news" });
  });
  it.fails("BREAK: 'yesterday's news' is not answered with the last 36 hours (which hold today)", async () => {
    const o = (await ask("yesterday's news"))!;
    expect({ hours: rec.news[0]?.hours, scope: o.card.scopeLine }).not.toEqual({ hours: 36, scope: "Last 36 hours · Chennai news" });
  });
});

describe("p7-rules-periods-02 (open, it.fails until fixed): BREAK: a narrow topic (murder) over a calendar span is searched over a rolling window that ends now", () => {
  it.fails("BREAK: 'list the murders last month' searches October (1 Oct to 1 Nov), not the 744 hours back from now", async () => {
    const o = (await ask("list the murders last month"))!;
    expect(o.card.scopeLine).toMatch(/^Last month \(October\)/);
    expect({ since: rec.search[0]?.since, until: rec.search[0]?.until }).toEqual({ since: istSec("2026-10-01 00:00:00"), until: istSec("2026-11-01 00:00:00") });
  });
  it.fails("BREAK: 'list the murders yesterday' searches 5 Nov (midnight to midnight), not the 24 hours before the last 24", async () => {
    await ask("list the murders yesterday");
    expect({ since: rec.search[0]?.since, until: rec.search[0]?.until }).toEqual({ since: istSec("2026-11-05 00:00:00"), until: istSec("2026-11-06 00:00:00") });
  });
});

describe("BREAK: 'from last month' alone is a comparison for Ask District IQ's intent rules (VS_PREVIOUS), not for the shared reader", () => {
  it.each(["Show me the incidents from last month", "complaints from last month", "show complaints from last month in Adyar"])("BREAK: '%s' is no 'vs the period before' count", (q) => {
    expect(readPeriod(q)).toEqual({ kind: "last", unit: "month" });
    const d = detectIntent(q) as { intent: string; vsPrevious?: boolean };
    expect(d.vsPrevious ?? false).toBe(false);
  });
});

describe("BREAK: the Tamil and Tanglish count names another period than the one counted (countInLanguage)", () => {
  const c = { n: 4, prev: 0, severe: 1, open: 2, dead: 0, kind: "incidents", where: "" };
  it("BREAK: the day before yesterday is not said as நேற்று / netru (yesterday)", () => {
    // (the Tamil for the day before yesterday is நேற்று முன்தினம்: it starts with the word for yesterday, and that is right)
    expect(countInLanguage("ta", { ...c, period: "the day before yesterday (4 Nov)" })!.text).toMatch(/^நேற்று முன்தினம் /);
    expect(countInLanguage("tanglish", { ...c, period: "the day before yesterday (4 Nov)" })!.text).not.toMatch(/^netru /);
  });
  it("BREAK: the last week of October (25 to 31 Oct) is not said as கடந்த வாரம் / pona vaaram (last week: 26 Oct to 1 Nov)", () => {
    expect(countInLanguage("ta", { ...c, period: "last week of October 2026 (25 to 31 October)" })!.text).not.toMatch(/^கடந்த வாரம் /);
    expect(countInLanguage("tanglish", { ...c, period: "last week of October 2026 (25 to 31 October)" })!.text).not.toMatch(/^pona vaaram /);
  });
  it("BREAK (down the real path): 'munthaa naal evlo incidents' in Tanglish says netru over the 4 Nov count", async () => {
    const o = (await ask("munthaa naal evlo incidents", "tanglish"))!;
    expect(rec.counts[0]?.range).toEqual({ from: "2026-11-04 00:00:00", to: "2026-11-05 00:00:00" });
    expect(o.card.answerMarkdown).not.toMatch(/\bnetru\b/);
  });
});

describe("p7-rules-periods-04 (open, it.fails until fixed): MINOR: the card's scope for last month (31 days) is the quarter", () => {
  it.fails("MINOR: 'how many incidents last month' is scoped 'monthly' on the card, not 'quarterly'", async () => {
    const o = (await ask("how many incidents last month"))!;
    expect(rec.counts[0]?.range).toEqual({ from: "2026-10-01 00:00:00", to: "2026-11-01 00:00:00" });
    expect((o.card.scope as { period: string }).period).toBe("monthly");
  });
});

describe("holds: Ask District IQ's counts", () => {
  it("'How many severe incidents are open right now?' counts the open ones over every day the store holds, with no figure from a period before", async () => {
    const o = (await ask("How many severe incidents are open right now?"))!;
    expect(rec.counts[0]).toMatchObject({ openOnly: true, range: { from: "2000-01-01 00:00:00", to: "2026-11-06 18:08:01" } });
    expect(o.card.headline).toMatch(/open now/);
    expect((o.card.kpis as { prev?: number }[]).every((k) => k.prev === undefined)).toBe(true);
  });
  it("'How many incidents were reported today?' counts since midnight, with no figure from a period before", async () => {
    const o = (await ask("How many incidents were reported today?"))!;
    expect(rec.counts[0]?.range).toEqual({ from: "2026-11-06 00:00:00", to: "2026-11-06 18:08:01" });
    expect(o.card.answerMarkdown).not.toMatch(/period before/);
  });
  it("'How many cases were resolved today?' counts the ones closed since midnight", async () => {
    await ask("How many cases were resolved today?");
    expect(rec.resolved[0]?.range).toEqual({ from: "2026-11-06 00:00:00", to: "2026-11-06 18:08:01" });
  });
  it("'How many incidents yesterday?' counts 5 Nov, midnight to midnight", async () => {
    await ask("How many incidents yesterday?");
    expect(rec.counts[0]?.range).toEqual({ from: "2026-11-05 00:00:00", to: "2026-11-06 00:00:00" });
  });
  it("'Garbage complaints, up or down from last month?' is the 30-day window against the 30 days before (the console window, no calendar range)", async () => {
    const d = detectIntent("Garbage complaints, up or down from last month?") as { intent: string; vsPrevious?: boolean };
    expect(d).toMatchObject({ intent: "INCIDENT_COUNT", vsPrevious: true });
    await ask("Garbage complaints, up or down from last month?");
    expect(rec.counts[0]).toMatchObject({ period: "monthly", range: null });
  });
  it("Tamil 'குப்பை புகார்கள் கடந்த மாதத்தை விட கூடியதா குறைந்ததா' is the same comparison", () =>
    expect(detectIntent("குப்பை புகார்கள் கடந்த மாதத்தை விட கூடியதா குறைந்ததா")).toMatchObject({ intent: "INCIDENT_COUNT", vsPrevious: true }));
  it("'news right now' has no open state: the news window, never 'open now'", async () => {
    const o = (await ask("what's in the news right now"))!;
    expect(o.card.scopeLine).not.toMatch(/open now/i);
  });
});
