/**
 * 28 Nov: the comparison dashboard (recipes/board.ts) and the summary dashboard's parts, with stand-in window reads; the brain's dashboard tool
 * reading the dashboard's own figures (brain/tools/board.ts partsOfDoc), the AI summary put on top of it (brainturn.ts withAiSummary), and a
 * chat's table of a comparison (brain/loop.ts validShow, render.ts cardOf). No model, no store.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { buildScreen, emptySlots, type Hands, type Slots } from "./screens";
import { checkStage, figuresOf, figuresOk, type BlockT, type ScopeT } from "./stage";
import { fakeHands } from "./stagefake";
import { boardAsk, boardSlots } from "./board";
import { checkScreen } from "./agent";
import type { WinHands, WinIncidents, WinScope } from "./v18/window";
import { partsOfDoc } from "@/lib/brain/tools/board";
import { resultOf, withAiSummary } from "./brainturn";
import { validShow, type BrainOut } from "@/lib/brain/loop";
import { boardInput } from "@/lib/brain";
import { cardOf } from "@/lib/brain/render";
import type { Evidence, FinalAnswer } from "@/lib/brain/types";
import type { AnswerCard } from "@/lib/assistant/answer";

const NOW = "2026-11-28 10:00:00";
const inc = (n: number, severe: number, o: Partial<WinIncidents> = {}): WinIncidents => ({
  n, prev: n - 3, severe, prevSevere: 1, open: Math.ceil(n / 2), overdue: 2, resolved: 4, dead: 0, injured: 1, complaints: n + 5, rain: 0,
  from: { citizens: n - 2, police: 3, pwd: 1, hospital: 0, news: 2 },
  kinds: [{ cat: "SOLID_WASTE", label: "Garbage & solid waste", n: Math.ceil(n / 2), prev: 2, severe: 0, open: 3 }, { cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n: Math.floor(n / 2), prev: 1, severe, open: 2 }],
  zones: [], depts: [{ code: "GCC-SWM", name: "Solid Waste Management", n: Math.ceil(n / 2), open: 3, overdue: 1, severe: 0 }, { code: "GCC-SWD", name: "Storm Water Drains", n: Math.floor(n / 2), open: 2, overdue: 1, severe }],
  places: [], buckets: [{ at: "2026-11-26", n: 2, severe: 0 }, { at: "2026-11-27", n: n - 2, severe }], byHour: false,
  top: [{ id: `INC-${n}A`, title: `Waterlogging case ${n}`, sev: "Severe", status: "Open", zone: 13, zone_name: "Adyar", loc: "Main Road", dept: "GCC-SWD", dept_name: "Storm Water Drains", complaints: 2, t: "2026-11-27 09:00:00", open: true, overdue: false, lat: 13.0, lon: 80.25 }],
  points: [{ id: `INC-${n}A`, lat: 13.0, lon: 80.25, sev: "Severe", title: `Waterlogging case ${n}` }], ...o
});
/** Adyar (13) holds 34 incidents, 5 severe; Anna Nagar (8) 20, 2 severe; a locality 7, 1 severe; a department 11, 3 severe */
const BY_ZONE: Record<number, WinIncidents> = { 13: inc(34, 5), 8: inc(20, 2) };
function winFake(): WinHands & { asked: WinScope[]; news: WinHands["news"] & { calls?: number } } {
  const asked: WinScope[] = [];
  const h = {
    asked,
    now: async () => NOW,
    incidents: async (_w: unknown, s: WinScope) => { asked.push(s); return s.zone ? BY_ZONE[s.zone] ?? inc(1, 0) : s.place ? inc(7, 1) : s.dept ? inc(11, 3) : inc(50, 9); },
    news: async (_w: unknown, a: { words: string[] }) => ({ rows: [{ id: `D-${a.words[0] ?? "x"}`, title: `News about ${a.words[0] ?? "the district"}`, title_en: null, publisher: "The Hindu", url: "https://example.org/n", loc: a.words[0] ?? null, t: "2026-11-27 10:00", summary: "..." }], total: a.words.some((x) => x.includes("adyar")) ? 6 : 3 }),
    readings: async (m: string, _w: unknown, zone: number | null) => ({ rows: m === "aqi" ? [{ id: `S${zone}`, name: zone === 13 ? "Velachery Res. Area, Chennai - CPCB" : "Arumbakkam, Chennai - TNPCB", zone, lat: 13, lon: 80.2, avg: zone === 13 ? 92 : 118, max: 140, min: 40, first: 60, last: 70, lastAt: "2026-11-28 09:00", count: 5, inWindow: true }] : [], nearest: null }),
    warning: async () => null,
    prices: async (_w: unknown, zone: number | null) => ({ market: zone === 8 ? "Anna Nagar" : null, rows: [{ commodity: "Tomato", perKg: zone === 8 ? 28 : 30, firstPerKg: 32, lo: 25, hi: 33, markets: 1, date: "2026-11-27", firstDate: "2026-11-21" }, { commodity: "Onion", perKg: 40, firstPerKg: 41, lo: 38, hi: 44, markets: 1, date: "2026-11-27", firstDate: "2026-11-21" }], latest: "2026-11-27", inWindow: true, held: { from: "2026-09-15", to: "2026-11-27" }, fetched: false, keyed: true }),
    traffic: async () => null
  };
  return h as unknown as WinHands & { asked: WinScope[]; news: WinHands["news"] };
}
const BASE: ScopeT = { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null };
const hands = (win: WinHands): Hands => ({ ...fakeHands(), win });
const slotsOf = (o: Record<string, unknown>): Slots => ({ ...emptySlots(), ...(checkScreen({ recipe: "compare", ...o }, WORLD, null)?.slots ?? {}), ...(o.span ? { span: o.span as Slots["span"] } : {}) });
const cmpOf = (blocks: BlockT[]) => blocks.find((b) => b.kind === "Compare") as Extract<BlockT, { kind: "Compare" }>;

describe("the comparison dashboard: Anna Nagar and Adyar (the owner's question of 27 Nov)", () => {
  it("puts each side's own counts side by side, every part of the overall set, and says only figures on the screen", async () => {
    const win = winFake();
    const a = boardAsk("Anna Nagar-யும். அடையாரையும் compare பண்ணு.", WORLD)!;
    const { doc } = await buildScreen("compare", slotsOf(boardSlots(a)), BASE, WORLD, hands(win), "Anna Nagar-யும். அடையாரையும் compare பண்ணு.", "c1", "en");
    expect(checkStage(doc).ok).toBe(true);
    expect(doc.recipe).toBe("compare");
    const cmp = cmpOf(doc.blocks);
    // the two-place counts are the window reads' own, side by side, in the order said
    expect(cmp.sides.map((s) => [s.label, s.values.n, s.values.severe])).toEqual([["Anna Nagar", 20, 2], ["Adyar", 34, 5]]);
    expect(cmp.sides[1].values).toMatchObject({ open: 17, overdue: 2, resolved: 4, complaints: 39, news: 6 });
    expect(win.asked.map((s) => s.zone)).toEqual([8, 13]);
    // on one scale: the kinds, the departments and who reported them, for both
    expect(cmp.sides.every((s) => s.cats.length === 2 && s.depts?.length === 2 && s.from?.length === 5)).toBe(true);
    expect(cmp.chart).not.toContain("prev");
    const kinds = doc.blocks.map((b) => `${b.kind}:${b.id}`);
    expect(kinds).toEqual(["Compare:cmp", "CaseList:top-z8", "CaseList:top-z13", "NewsReader:news-z8", "NewsReader:news-z13", "Table:env", "MapView:map"]);
    const env = doc.blocks.find((b) => b.id === "env") as Extract<BlockT, { kind: "Table" }>;
    expect(env.rows.map((r) => r.cells[0])).toEqual(["Air quality (AQI)", "Tomato", "Onion"]);
    expect(String(env.rows[1].cells[1])).toMatch(/^₹28 a kg · Anna Nagar market/);
    expect(String(env.rows[1].cells[2])).toMatch(/^₹30 a kg · Chennai markets/);
    // the generated records say so
    expect(doc.notes.join(" ")).toMatch(/generated sample data/);
    expect(doc.say.en).toMatch(/^Over the last 7 days, Anna Nagar had 20 \(2 severe\), Adyar had 34 \(5 severe\)\. Adyar had the most\.$/);
    expect(figuresOk(doc.say.en, figuresOf(doc))).toBe(true);
    expect(doc.takeaway?.en).toMatch(/Adyar had/);
    expect(doc.next?.[0]).toMatchObject({ recipe: "summary", slots: { zones: [8] } });
  });
  it("is customised for severe incidents when that is asked: severe only, no news, prices or air", async () => {
    const win = winFake();
    const a = boardAsk("Create a comparative dashboard of Anna Nagar and Adyar for severe incidents", WORLD)!;
    const { doc } = await buildScreen("compare", slotsOf(boardSlots(a)), BASE, WORLD, hands(win), "comparative dashboard of Anna Nagar and Adyar for severe incidents", "c2", "en");
    expect(win.asked.every((s) => s.sev === "Severe")).toBe(true);
    const cmp = cmpOf(doc.blocks);
    expect(cmp.metrics.map((m) => m.key)).toEqual(["n", "open", "overdue", "resolved", "prev"]);
    expect(cmp.metrics[0].label).toBe("Severe incidents reported");
    expect(doc.blocks.some((b) => b.kind === "NewsReader" || b.id === "env")).toBe(false);
    expect(doc.title).toMatch(/^Anna Nagar vs Adyar · Severe incidents · last 7 days$/);
    expect(doc.say.en).toMatch(/^Over the last 7 days, Anna Nagar had 20 severe incidents \(10 still open\), Adyar had 34 \(17 still open\)/);
  });
  it("is a news comparison when only the news is asked", async () => {
    const win = winFake();
    const a = boardAsk("compare the news of Adyar and Anna Nagar", WORLD)!;
    const { doc } = await buildScreen("compare", slotsOf(boardSlots(a)), BASE, WORLD, hands(win), "compare the news of Adyar and Anna Nagar", "c3", "en");
    expect(win.asked).toEqual([]);
    expect(cmpOf(doc.blocks).metrics.map((m) => m.key)).toEqual(["news"]);
    expect(doc.blocks.map((b) => b.kind)).toEqual(["Compare", "NewsReader", "NewsReader"]);
    expect(doc.say.en).toBe("Over the last 7 days, 6 news stories named Adyar and 3 news stories named Anna Nagar.");
  });
  it("compares localities and departments", async () => {
    const pl = await buildScreen("compare", slotsOf({ places: ["T. Nagar", "Marina"] }), BASE, WORLD, hands(winFake()), "compare T Nagar and Marina", "c4", "en");
    expect(cmpOf(pl.doc.blocks).sides.map((s) => s.label)).toEqual(["T. Nagar", "Marina"]);
    expect(pl.doc.notes.join(" ")).toMatch(/locality is matched on the place/);
    const win = winFake();
    const d = await buildScreen("compare", slotsOf({ depts: ["POL-GCP", "GCC-SWD"] }), BASE, WORLD, hands(win), "compare the police and storm water drains", "c5", "en");
    expect(win.asked.map((s) => s.dept)).toEqual(["POL-GCP", "GCC-SWD"]);
    expect(cmpOf(d.doc.blocks).sides.map((s) => s.label)).toEqual(["Greater Chennai Police", "Storm Water Drains"]);
    expect(d.doc.blocks.some((b) => b.kind === "MapView")).toBe(false);
  });
  it("keeps the console's own comparison for hands without the window reads", async () => {
    const { doc } = await buildScreen("compare", { ...emptySlots(), zones: [13, 7], period: "weekly" }, BASE, WORLD, fakeHands(), "compare");
    expect(doc.blocks[0].kind).toBe("Compare");
    expect(cmpOf(doc.blocks).chart).toBeUndefined();
  });
});

describe("the summary dashboard holds what was asked", () => {
  it("the overall summary: incidents, who reported them, news, air and prices", async () => {
    const a = boardAsk("overall summary of Anna Nagar", WORLD)!;
    const { doc } = await buildScreen("summary", { ...emptySlots(), ...checkScreen({ recipe: "summary", ...boardSlots(a) }, WORLD, null)!.slots }, BASE, WORLD, hands(winFake()), "overall summary of Anna Nagar", "s1", "en");
    const ids = doc.blocks.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(["kpis", "points", "kinds", "from", "news", "aqi", "prices"]));
    expect(doc.notes.join(" ")).toMatch(/generated sample data/);
  });
  it("only the parts named: incidents and news, no prices or air", async () => {
    const { doc } = await buildScreen("summary", { ...emptySlots(), zones: [8], parts: ["incidents", "news"] }, BASE, WORLD, hands(winFake()), "dashboard of Anna Nagar incidents and news", "s2", "en");
    const ids = doc.blocks.map((b) => b.id);
    expect(ids).toContain("news");
    expect(ids.some((x) => x === "aqi" || x === "prices" || x === "from")).toBe(false);
  });
});

describe("the brain's dashboard tool and its AI summary", () => {
  it("hands the model exactly the dashboard's figures, and the summary sits on top of the dashboard", async () => {
    const { doc } = await buildScreen("compare", slotsOf({ zones: [8, 13] }), BASE, WORLD, hands(winFake()), "compare Anna Nagar and Adyar", "b1", "en");
    const got = partsOfDoc(doc);
    const sides = got.parts.find((p) => p.key === "sides")!;
    // the two-place counts the model reads are the dashboard's own
    expect(sides.rows.map((r) => [r.side, r.n, r.severe])).toEqual(cmpOf(doc.blocks).sides.map((s) => [s.label, s.values.n, s.values.severe]));
    expect(got.parts.map((p) => p.key)).toEqual(expect.arrayContaining(["sides", "kinds", "departments", "reported_by", "top_z8", "news_z13", "env"]));
    expect(got.ids).toEqual(["INC-20A", "INC-34A"]);
    const say = "Adyar had 34 incidents against Anna Nagar's 20 over the last 7 days, and 5 severe against 2.";
    const st = withAiSummary(doc, say, ["Adyar: 34 incidents, 5 severe.", "Anna Nagar: 20 incidents, 2 severe."], "en", "claude-haiku-5-5")!;
    expect(st.blocks.slice(0, 3).map((b) => `${b.kind}:${b.id}`)).toEqual(["Answer:ai", "Compare:cmp", "Brief:ai-points"]);
    expect(st.say.en).toBe(say);
    expect(st.voice).toMatchObject({ by: "aide7", model: "claude-haiku-5-5" });
    expect(figuresOk(say, figuresOf(st))).toBe(true);
    // Jarvis's turn: the dashboard, not a text card
    const answer: FinalAnswer = { kind: "answer", scope: "records", lang: "en", say, title: "Anna Nagar vs Adyar", points: [], show: [], options: [], used: [] };
    const ev: Evidence = { id: "r1", tool: "board", input: {}, ms: 1, out: { about: "x", parts: got.parts.map((p) => ({ ...p, key: `r1.${p.key}` })), sources: ["incidents (window)"], screen: { recipe: "compare", slots: doc.slots, doc } } };
    const o = { question: "compare", answer, evidence: [ev], model: "claude-haiku-5-5", rounds: 1, ms: 1, firstMs: 1, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, steps: [], screen: ev.out.screen!, stageOp: null, repaired: [], spoken: [], escalated: null, trace: [] } as BrainOut;
    const r = resultOf(o, { text: "compare Anna Nagar and Adyar", state: { page: "overview", period: "weekly" } } as never, WORLD);
    expect(r.stage?.recipe).toBe("compare");
    expect(r.stage?.blocks[0]).toMatchObject({ kind: "Answer", id: "ai", text: say });
    // the chat: the sides as a table and a chart
    const show = validShow([], [ev]);
    expect(show.slice(0, 2)).toEqual([{ as: "table", from: "r1.sides" }, { as: "bars", from: "r1.sides", label: "side", value: "n" }]);
    const card = cardOf({ ...o, answer: { ...answer, show } }, { kind: "answer", sources: {} } as unknown as AnswerCard, WORLD);
    expect(card.answerMarkdown).toMatch(/\| Side \| Reported \| Severe \|/);
    expect(card.chart?.type).toBe("horizontal_bar");
  });
  it("is given code's reading of the request, with the window the Collector named", () => {
    const a = boardAsk("Compare Adyar and Ambattur this week for severe incidents", WORLD)!;
    expect(boardInput(a, WORLD)).toEqual({ mode: "compare", places: ["Adyar", "Ambattur"], severity: "Severe", parts: ["incidents"], when: { named: "last_7_days" } });
    const s = boardAsk("Give me a summary of Royapuram today.", WORLD)!;
    expect(boardInput(s, WORLD)).toEqual({ mode: "summary", places: ["Royapuram"], when: { named: "today" } });
  });
});
