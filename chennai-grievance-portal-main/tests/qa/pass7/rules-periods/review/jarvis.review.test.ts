// Review of the Jarvis rules lanes' wiring of the shared period reader (quick.ts, entities.ts, understand.ts, frame.ts, spanned.ts, screens.ts), pass 7 rules-periods.
// Pure: the fixture world, fake hands (stagefake.ts) and a fake `span` hand that dates the span with the real spanOf. No database, no model.
// "BREAK" tests assert the owner's spec and FAIL while the break is there; "holds" tests passed when written.
import { describe, expect, it } from "vitest";
import { WORLD } from "@/lib/thunai/fixture";
import { referenceWorld } from "@/lib/thunai/world";
import { DEPT_TA, ZONE_TA_NAME } from "@/lib/thunai/lexicon";
import { CAT_LABEL_TA } from "@/lib/thunai/narrate";
import { briefTurn } from "@/lib/thunai/entities";
import { asksCount, quickScreen } from "@/lib/thunai/quick";
import { resolveFrame } from "@/lib/thunai/frame";
import { understand } from "@/lib/thunai/understand";
import { isNavCommand } from "@/lib/thunai/plan";
import { spanScreen } from "@/lib/thunai/spanned";
import { buildScreen, emptySlots, type Hands } from "@/lib/thunai/screens";
import { checkStage } from "@/lib/thunai/stage";
import { fakeHands, SEVERE } from "@/lib/thunai/stagefake";
import { compareOf, readPeriod, spanOf, type PeriodSpec } from "@/lib/period/read";
import { customWindow } from "@/lib/assistant/fastpath";

const NOW = "2026-11-06 18:08:00";
const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const START = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, list: [], lastFilter: null, now: Date.parse("2026-11-06T12:38:00Z") };
const BASE = { period: "weekly" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };

/** fake hands with a span hand (the rows are the fixture's, the dates are the real spanOf's) and a compare hand; `spans` records what the span hand was asked */
function hands() {
  const h = fakeHands();
  const spans: PeriodSpec[] = [];
  const toolArgs: Record<string, unknown>[] = [];
  const tool = h.tool;
  const out: Hands & { calls: string[]; spans: PeriodSpec[]; toolArgs: Record<string, unknown>[] } = {
    ...h, calls: h.calls, spans, toolArgs,
    tool: async (n, a) => { toolArgs.push({ tool: n, ...a }); return tool(n, a); },
    span: async (spec) => {
      spans.push(spec);
      const span = spanOf(spec, NOW);
      if (!span) return null;
      const rows = SEVERE.slice(0, 3).map((r) => ({ ...r, place: r.loc, overdue: r.breached === 1 }));
      return { span, rows, total: 3, severe: 3, open: 3, late: 1, dead: 0, prev: null, asOf: NOW };
    },
    compare: async (key) => ({ cmp: compareOf(key, NOW)!, n: 10, prev: 8, severe: 1, open: 5, asOf: NOW })
  };
  return out;
}
const rules = (t: string) => understand(t, START as never, world as never) as { kind: string; steps?: { a: string; period?: string }[]; confidence?: number };

describe("BREAK: the rules read after a planner miss (round.ts rulesRead) and a follow-up's last sentence (frame.ts lastFrame) drop the span: quickScreen noBail", () => {
  it.each([
    ["Show severe cases in Adyar last month", { kind: "last", unit: "month" }],
    ["severe cases in Adyar right now", { kind: "now" }],
    ["how many severe cases are open right now", { kind: "now" }],
    ["flooding complaints in Adyar since 1 October", { kind: "since", month: 9, day: 1 }]
  ] as [string, PeriodSpec][])("BREAK: noBail reading of '%s' keeps its span", (q, spec) => {
    const nb = quickScreen(q, world as never, { noBail: true });
    expect(nb === null || JSON.stringify(nb.slots.span) === JSON.stringify(spec)).toBe(true);
  });
  it("BREAK: noBail reading of 'Show severe cases in Adyar two weeks ago' is no screen (it is a cases screen over the console's window)", () =>
    expect(quickScreen("Show severe cases in Adyar two weeks ago", world as never, { noBail: true })).toBeNull());
  it("BREAK: noBail reading of 'which zone has the most severe cases last month' is no ranking over the last 30 days", () =>
    expect(quickScreen("which zone has the most severe cases last month", world as never, { noBail: true })).toBeNull());
  it("BREAK: built as round.ts builds it (spanScreen), the noBail screen for 'last month' is counted over the last 30 days, never over October", async () => {
    const h = hands();
    const q = quickScreen("Show severe cases in Adyar last month", world as never, { noBail: true })!;
    const r = await spanScreen(q.recipe, q.slots, START as never, world as never, h, "Show severe cases in Adyar last month", "en");
    expect(h.spans).toEqual([{ kind: "last", unit: "month" }]);
    expect(`${r.stage?.title} ${r.say}`).toMatch(/October/);
  });
  it("BREAK: 'and in Adyar?' after 'severe cases last month' (no Stage open) keeps last month", () => {
    const fr = resolveFrame({ text: "and in Adyar?", stage: null, turns: [{ heard: "severe cases last month", did: "cases" } as never], lastText: "severe cases last month", lastPlace: null, world: world as never });
    expect(fr.kind).toBe("screen");
    expect((fr as { slots: { span?: unknown } }).slots.span).toEqual({ kind: "last", unit: "month" });
  });
});

describe("BREAK: the fast lane answers a Tamil/Tanglish time it misreads with a console window", () => {
  it("BREAK: 'Adyar la rendu vaarathukku munnaadi severe cases' (two weeks ago) is never answered (it is: the weekly window)", () =>
    expect(quickScreen("Adyar la rendu vaarathukku munnaadi severe cases", world as never)).toBeNull());
  it("BREAK: 'அடையாறில் கடந்த 10 நாட்களில் கடுமையான புகார்கள்' is counted over the last 10 days, as the English is", () => {
    const ta = quickScreen("அடையாறில் கடந்த 10 நாட்களில் கடுமையான புகார்கள்", world as never)!;
    const en = quickScreen("Adyar severe cases in the last 10 days", world as never)!;
    expect(en.slots.span).toEqual({ kind: "hours", hours: 240, n: 10, unit: "day" });
    expect(ta.slots.span).toEqual(en.slots.span);
  });
  it("BREAK: 'Show tree fall complaints from last month' is October's tree-fall cases, not a 30-day against 30-day trend", () => {
    const q = quickScreen("Show tree fall complaints from last month", world as never)!;
    expect(q.recipe).toBe("cases");
    expect(q.slots.span).toEqual({ kind: "last", unit: "month" });
  });
  it("BREAK: 'ok now show me the severe cases in Adyar' is not the open-now (all days) screen", () =>
    expect(quickScreen("ok now show me the severe cases in Adyar", world as never)?.slots.span).toBeUndefined());
  it("BREAK: 'severe cases in Adyar today till now' is today since midnight, not open-now", () =>
    expect(quickScreen("severe cases in Adyar today till now", world as never)?.slots.span).toEqual({ kind: "day", back: 0 }));
});

describe("BREAK: 'today' answered with the last 24 hours and labelled 'today' (the reader's today is since midnight)", () => {
  it("BREAK: 'how many cases were resolved today' is counted since midnight, as Ask District IQ counts it", async () => {
    const q0 = quickScreen("how many cases were resolved today", world as never);
    expect(customWindow("how many cases were resolved today", NOW)!.range!.from).toBe("2026-11-06 00:00:00"); // Ask District IQ: since midnight
    // the fast lane cannot list resolved cases over a span: it hands the question on (Ask District IQ counts it), never the last 24 hours as "today"
    if (!q0) return;
    const q = q0;
    const h = hands();
    const r = await spanScreen(q.recipe, q.slots, START as never, world as never, h, "how many cases were resolved today", "en");
    const askedDaily = h.toolArgs.some((a) => a.period === "daily" || (a.scope as { period?: string } | undefined)?.period === "daily");
    // the screen may say "today" only over today's dates
    expect(askedDaily && /\btoday\b/i.test(`${r.stage?.title} ${r.say}`)).toBe(false);
  });
  it("BREAK: the brief turn's 'Adyar report today' (the briefing tool's last 24 hours) is not titled or said as 'today'", async () => {
    const t = briefTurn("Adyar report today", world as never) as { kind: string; slots: Record<string, unknown> };
    expect(t.slots.span).toBeUndefined(); // by design: the last 24 hours that hold today
    const h = hands();
    const r = await spanScreen("brief", t.slots, START as never, world as never, h, "Adyar report today", "en");
    expect(h.toolArgs.some((a) => a.tool === "briefing")).toBe(true);
    expect(`${r.stage?.title} ${r.say}`).not.toMatch(/\btoday\b/i);
  });
  it("BREAK: 'severe cases in the last 24 hours' is not said as 'today'", async () => {
    const q = quickScreen("severe cases in the last 24 hours", world as never)!;
    const h = hands();
    const r = await spanScreen(q.recipe, q.slots, START as never, world as never, h, "severe cases in the last 24 hours", "en");
    expect(`${r.stage?.title} ${r.say}`).not.toMatch(/\btoday\b/i);
  });
});

describe("BREAK: the rules lane (understand.ts) acts on a time it should ask about", () => {
  it.each(["filter Adyar severe cases tomorrow", "show Adyar severe cases next day", "நாளை அடையாறு கடுமையான புகார்கள் காட்டு", "naalaikku Adyar severe cases kaattu"])(
    "BREAK: '%s' (unheld for the shared reader) is asked about, never applied to the current window", (q) => {
      expect(readPeriod(q).kind).toBe("unheld");
      expect(rules(q).kind).toBe("ask");
    });
  it("BREAK: 'அடையாறில் இரண்டு வாரங்களுக்கு முன்பு கடுமையான புகார்கள் காட்டு' (two weeks ago) is asked about, as the English is", () =>
    expect(rules("அடையாறில் இரண்டு வாரங்களுக்கு முன்பு கடுமையான புகார்கள் காட்டு").kind).toBe(rules("show severe cases in Adyar two weeks ago").kind));
  it("BREAK: 'filter tree fall complaints from last month' does not move the console to the last 30 days (instantly, as a nav command)", () => {
    const u = rules("filter tree fall complaints from last month");
    // last month is no console window: the rules ask which one to show (or run no period step); before the fix this ran at once and set Monthly
    if (u.kind === "do") expect(isNavCommand("filter tree fall complaints from last month", u.steps as never) && u.steps?.some((s) => s.a === "period" && s.period === "monthly")).toBe(false);
    else expect(u.kind).toBe("ask");
  });
});

describe("BREAK: a count asked in Tanglish is widened when empty (agentServer.ts / round.ts use asksCount)", () => {
  it.each(["Adyar la evvalo severe cases this week", "Adyar la evalo severe cases this week"])("BREAK: asksCount('%s')", (q) => expect(asksCount(q)).toBe(true));
});

describe("Tamil screen labels and the catalog limits (stage.ts)", () => {
  const longest = <T,>(xs: T[], f: (x: T) => string) => xs.reduce((a, b) => (f(b).length > f(a).length ? b : a));
  const zone = longest(world.zones, (z) => String(z.ta ?? ""));
  const cat = longest(Object.keys(CAT_LABEL_TA), (c) => CAT_LABEL_TA[c]);
  const dept = longest(Object.keys(DEPT_TA), (d) => DEPT_TA[d]);
  for (const spec of [{ kind: "last", unit: "week" }, { kind: "last", unit: "quarter" }, { kind: "lastWeekOf", month: 9, year: null }, { kind: "now" }, { kind: "day", back: 0 }] as PeriodSpec[]) {
    it(`a Tamil cases screen over ${JSON.stringify(spec)} for the longest zone and category passes the Stage checker`, async () => {
      const b = await buildScreen("cases", { ...emptySlots(), zones: [zone.n], cat, sev: "Severe", status: "overdue", span: spec, fresh: true }, BASE, world as never, hands(), "கடுமையான காலக்கெடு தாண்டிய புகார்கள்");
      const c = checkStage(b.doc);
      expect(c.ok ? "ok" : c.why).toBe("ok");
    });
    it(`BREAK?: a Tamil cases screen over ${JSON.stringify(spec)} with zone, department and category passes the Stage checker`, async () => {
      const b = await buildScreen("cases", { ...emptySlots(), zones: [zone.n], dept, cat, sev: "Severe", span: spec, fresh: true }, BASE, world as never, hands(), "கடுமையான புகார்கள்");
      const c = checkStage(b.doc);
      expect(c.ok ? "ok" : c.why).toBe("ok");
    });
    it(`the Tamil key-number label over ${JSON.stringify(spec)} names the whole period (not cut at 80 characters)`, async () => {
      const b = await buildScreen("cases", { ...emptySlots(), zones: [zone.n], cat, sev: "Severe", status: "overdue", span: spec, fresh: true }, BASE, world as never, hands(), "கடுமையான காலக்கெடு தாண்டிய புகார்கள்");
      const k = b.doc.blocks.find((x) => x.kind === "Kpis") as { items: { key: string; label: string }[] };
      const label = k.items.find((i) => i.key === "total")!.label;
      const s = spanOf(spec, NOW)!;
      // the tile names the period in full words (its dates are in the title): never cut in the middle of a word
      expect(label.length).toBeLessThanOrEqual(80);
      expect(label.endsWith(s.now ? "எந்த நாள் பதிவானாலும்" : s.label.ta.replace(/\s*\(.*\)$/, ""))).toBe(true);
    });
  }
});

describe("holds: the fast lane, the brief turn and the rules lane", () => {
  it("'Show severe cases in Adyar last month' counts October with the span hand, and says October", async () => {
    const q = quickScreen("Show severe cases in Adyar last month", world as never)!;
    expect(q.slots.span).toEqual({ kind: "last", unit: "month" });
    const h = hands();
    const r = await spanScreen(q.recipe, q.slots, START as never, world as never, h, "Show severe cases in Adyar last month", "en");
    expect(h.spans).toEqual([{ kind: "last", unit: "month" }]);
    expect(r.stage?.title).toMatch(/last month \(October\)/);
    expect(r.steps.some((s) => s.a === "period")).toBe(false);
  });
  it("'Garbage complaints, up or down from last month?' is the 30-day comparison, both figures said", async () => {
    const q = quickScreen("Garbage complaints, up or down from last month?", world as never)!;
    expect(q.recipe).toBe("trend");
    const r = await spanScreen(q.recipe, q.slots, START as never, world as never, hands(), "Garbage complaints, up or down from last month?", "en");
    expect(r.say).toMatch(/10 in the last 30 days against 8/);
  });
  it("Tamil 'குப்பை புகார்கள் கடந்த மாதத்தை விட கூடியதா குறைந்ததா' is the same comparison", () =>
    expect(quickScreen("குப்பை புகார்கள் கடந்த மாதத்தை விட கூடியதா குறைந்ததா", world as never)?.slots.span).toEqual({ kind: "compare", key: "monthly" }));
  it("a time no lane can answer is never a screen: two weeks ago, next week, last year", () => {
    for (const q of ["Show severe cases in Adyar two weeks ago", "severe cases next week", "severe cases last year", "அடுத்த வாரம் கடுமையான புகார்கள்"]) expect(quickScreen(q, world as never), q).toBeNull();
  });
  it("'news right now' is not a news screen over a window (left to the planner)", () => expect(quickScreen("news right now", world as never)).toBeNull());
  it("air quality right now stays a reading", () => expect(quickScreen("air quality right now", world as never)?.recipe).toBe("readings"));
  it("a count over a span is never widened: the span is on the slots (agentServer.ts skips widening when span is set)", () =>
    expect(quickScreen("how many severe cases in Adyar today", world as never)?.slots.span).toEqual({ kind: "day", back: 0 }));
  it("the brief turn: 'Adyar report last month' carries last month; 'Adyar report up or down from last month' is no brief", () => {
    expect((briefTurn("Adyar report last month", world as never) as { slots: { span?: unknown } }).slots.span).toEqual({ kind: "last", unit: "month" });
    expect(briefTurn("Adyar report up or down from last month", world as never)).toBeNull();
  });
  it("the rules lane asks about last month, two weeks ago and yesterday, and sets this week", () => {
    expect(rules("show severe cases in Adyar last month").kind).toBe("ask");
    expect(rules("show severe cases in Adyar two weeks ago").kind).toBe("ask");
    expect(rules("show severe cases in Adyar yesterday").kind).toBe("ask");
    expect(rules("show severe cases in Adyar this week").steps?.some((s) => s.a === "period" && s.period === "weekly")).toBe(true);
  });
  it("the 'Show them on a map' next step of a last-month list keeps last month (mapScreen goes through cases)", async () => {
    const q = quickScreen("Show severe cases in Adyar last month", world as never)!;
    const r = await spanScreen(q.recipe, q.slots, START as never, world as never, hands(), "Show severe cases in Adyar last month", "en");
    const n = r.stage!.next!.find((x) => x.recipe === "map");
    expect(n).toBeTruthy();
    const h = hands();
    const m = await spanScreen("map", n!.slots, START as never, world as never, h, "Show them on a map", "en");
    expect(h.spans).toEqual([{ kind: "last", unit: "month" }]);
    expect(m.stage?.title).toMatch(/last month \(October\)/);
  });
  it("a follow-up on an open last-month Stage ('and in Adyar?') keeps last month", () => {
    const stage = { recipe: "cases", title: "Severe cases · last month (October)", blocks: [], slots: { sev: "Severe", zones: [], period: "monthly", span: { kind: "last", unit: "month" } }, focus: null };
    const fr = resolveFrame({ text: "and in Adyar?", stage: stage as never, turns: [], lastText: null, lastPlace: null, world: world as never }) as { kind: string; slots?: { span?: unknown } };
    expect(fr.kind).toBe("screen");
    expect(fr.slots?.span).toEqual({ kind: "last", unit: "month" });
  });
  it("SPEC?: 'show severe cases in Adyar today' moves the console to its last 24 hours (the rules lane has no since-midnight window)", () =>
    expect(rules("show severe cases in Adyar today").steps?.some((s) => s.a === "period" && s.period === "daily")).toBe(true));
  it("'right now' on a cases screen is counted as open now over every day the store holds", async () => {
    const q = quickScreen("severe cases in Adyar right now", world as never)!;
    const r = await spanScreen(q.recipe, q.slots, START as never, world as never, hands(), "severe cases in Adyar right now", "en");
    expect(r.stage?.title).toMatch(/open now/);
    expect(r.say).toMatch(/whatever the day reported/);
  });
});
