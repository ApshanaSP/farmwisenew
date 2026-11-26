/**
 * "Reports differ" stays (26 Nov 2026, the owner: "I saw the Differ one a few minutes before, and after a few minutes I didn't see the Differ again").
 * Two builds one after the other (other document, story and incident ids, another grouping, an outlet that joins), a model that fails or answers
 * otherwise: what was found in the day is still listed, in the same order, until the day rolls over; a corrected report says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Doc { id: string; title: string; publisher: string; t: string; url: string; summary?: string; body?: string; incident?: string | null; story?: string }
const w = vi.hoisted(() => ({ docs: [] as unknown[], stories: [] as unknown[], build: "build-1", ai: null as null | ((prompt: string) => unknown), aiUp: true, calls: 0 }));

vi.mock("@/lib/collector/db", () => ({
  default: {
    query: async (sql: string, params: unknown[] = []) => {
      if (!/FROM documents d WHERE/.test(sql)) return [[]];
      const lists = params.filter(Array.isArray) as string[][];
      const ids = /doc_id IN/.test(sql) ? lists[0] ?? [] : [], urls = /url IN/.test(sql) ? lists[lists.length - 1] ?? [] : [];
      return [(w.docs as Doc[]).filter((d) => ids.includes(d.id) || urls.includes(d.url)).map((d) => ({ id: d.id, title: d.title, title_en: null, lang: "en", publisher: d.publisher,
        publisher_domain: "thehindu.com", publisher_tier: "established", summary: d.summary ?? "", url: d.url, incident: d.incident ?? null, body: d.body ?? "", places: "", place_text: null, t: d.t }))];
    }
  }, ops: (t: string) => t, TITLE: "i.title"
}));
vi.mock("@/lib/collector/newsrel", () => ({ isNewsMedia: () => true }));
vi.mock("@/lib/collector/intel", () => ({ newsStories: async () => w.stories, periodSince: (p: string, now: string) => (p === "daily" ? `${now.slice(0, 10)} 00:00:00` : "2026-11-19 00:00:00"),
  exportMeta: async () => ({ build_id: w.build }) }));
vi.mock("@/lib/collector/datakey", () => ({ dataVersion: async () => w.build }));
vi.mock("@/lib/collector/analysis", () => ({ when: (t: string) => t }));
vi.mock("@/lib/ai/gateway", () => ({ aiStatus: () => ({ available: w.aiUp }) }));
vi.mock("@/lib/collector/aibrief", () => ({ aiJson: async (c: { facts: string }) => { w.calls++; const o = w.ai?.(c.facts); return o ? { o, model: "m", at: "x" } : null; } }));

const { dayDifferences, periodConflicts, storyConflicts } = await import("./conflicts");
const { bookItems, clearBook } = await import("./differbook");

const doc = (id: string, publisher: string, title: string, t: string, more: Partial<Doc> = {}): Doc => ({ id, publisher, title, t, url: `https://${publisher.replace(/\W/g, "").toLowerCase()}.com/${title.slice(0, 12).replace(/\W/g, "")}`, ...more });
const story = (id: string, docs: Doc[], incident: string | null = null) => ({ id, title: docs[0].title, incident, docIds: docs.map((d) => d.id), t: docs[0].t, outletNames: [...new Set(docs.map((d) => d.publisher))] });
/** one build: its documents, and its stories */
const build = (id: string, stories: ReturnType<typeof story>[], docs: Doc[]) => { w.build = id; w.docs = docs; w.stories = stories; global.__conflicts?.clear(); };
/** the model finds Deaths differing in a story whose reports give two figures */
const finds = (facts: string) => {
  const out = facts.split(/\n\n/).map((s, k) => {
    const lines = s.split("\n").filter((l) => /^\s+R\d+ \|/.test(l));
    const c = lines.map((l, j) => ({ r: j + 1, n: /(\d+|two|three) (?:killed|die|dead)/i.exec(l)?.[1] })).filter((x) => x.n);
    const differ = new Set(c.map((x) => x.n!.toLowerCase())).size > 1;
    return { story: k + 1, same: lines.map((_, j) => j + 1), differences: differ ? [{ field: "Deaths", kind: "conflict", claims: c.map((x) => ({ r: x.r, says: `${x.n} killed` })), what: "The death toll differs.", reason: "", check: "Ask the police." }] : [] };
  });
  return { stories: out };
};
const none = (facts: string) => ({ stories: facts.split(/\n\n/).map((_, k) => ({ story: k + 1, same: [1, 2], differences: [] })) });

const NOW = "2026-11-26 14:00:00";
const hindu = doc("D1", "The Hindu", "Two killed as wall collapses in Pallavaram", "2026-11-26 09:00:00"), dt = doc("D2", "DT Next", "Three killed as wall collapses in Pallavaram", "2026-11-26 09:30:00");
const toi = doc("D3", "The Times of India", "Wall collapse in Pallavaram: rescue work goes on", "2026-11-26 11:00:00");
const fire1 = doc("F1", "The Hindu", "Four injured in Perambur fire", "2026-11-26 08:00:00"), fire2 = doc("F2", "Dinamani", "Nine injured in Perambur fire", "2026-11-26 08:20:00");
const words = (r: { stories: { title: string; items: { field: string; resolved?: string | null }[] }[] }) => r.stories.map((s) => `${s.items.map((i) => i.field).join(",")}${s.items[0].resolved ? ` (${s.items[0].resolved})` : ""}`);

beforeEach(() => {
  clearBook();
  global.__conflicts = new Map(); global.__conflictVerdicts = new Map(); global.__conflictRest = 0;
  Object.assign(w, { docs: [], stories: [], build: "build-1", ai: finds, aiUp: true, calls: 0 });
});

describe("a difference found in the day stays", () => {
  it("when the next build draws new document, story and incident ids and regroups the news, and an outlet joins", async () => {
    build("build-1", [story("S1", [dt, hindu], "INC-A")], [hindu, dt]);
    const a = await periodConflicts("daily", NOW, "u");
    expect([a.stories.length, a.stories[0].items[0].field, a.stories[0].incident, a.ai]).toEqual([1, "Deaths", "INC-A", true]);
    // the next build: the same two reports under other ids, in a story with a third outlet, linked to another incident; the model now sees no difference
    w.ai = none;
    const h2 = { ...hindu, id: "X9" }, d2 = { ...dt, id: "X8" };
    build("build-2", [story("S77", [toi, d2, h2], "INC-B")], [h2, d2, toi]);
    const b = await periodConflicts("daily", "2026-11-26 14:10:00", "u");
    expect(words(b)).toEqual(["Deaths"]);
    // re-attached to this build: its incident, its ids
    expect([b.stories[0].id, b.stories[0].incident]).toEqual([a.stories[0].id, "INC-B"]);
    expect(b.stories[0].items[0].claims.map((c) => c.docId)).toEqual(["X9", "X8"]);
    expect(b.stories[0].docIds).toEqual(expect.arrayContaining(["X9", "X8", "D3"]));
  });
  it("when its story is no longer on the page at all (the desk, the grouping or the category changed)", async () => {
    build("build-1", [story("S1", [dt, hindu], "INC-A")], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    build("build-2", [], [{ ...hindu, incident: "INC-C" }, dt]);
    const b = await periodConflicts("daily", "2026-11-26 15:00:00", "u");
    expect([words(b), b.stories[0].incident, b.checked]).toEqual([["Deaths"], "INC-C", 0]);
  });
  it("when the model fails, is out of budget or is off: nothing is removed, and a new story gets the rules' answer until it is read", async () => {
    build("build-1", [story("S1", [dt, hindu])], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    w.ai = () => null; // every call fails
    build("build-2", [story("S2", [toi, dt, hindu]), story("S3", [fire2, fire1])], [hindu, dt, toi, fire1, fire2]);
    const b = await periodConflicts("daily", "2026-11-26 14:20:00", "u");
    expect(words(b)).toEqual(["Injured", "Deaths"]); // the larger gap first (4 against 9, then 2 against 3)
    const n = w.calls;
    await periodConflicts("daily", "2026-11-26 14:21:00", "u");
    expect(w.calls).toBe(n); // it rests after a failure: not asked again on every load
    w.aiUp = false; global.__conflictRest = 0;
    expect(words(await periodConflicts("daily", "2026-11-26 14:22:00", "u"))).toEqual(["Injured", "Deaths"]);
    expect(w.calls).toBe(n);
    // the model answers again: the story the rules stood in for is read now (their answer was never the verdict)
    w.aiUp = true; w.ai = none;
    await periodConflicts("daily", "2026-11-26 14:40:00", "u");
    expect(w.calls).toBe(n + 1);
    expect(words(await periodConflicts("daily", "2026-11-26 14:41:00", "u"))).toEqual(["Injured", "Deaths"]);
  });
  it("the same text is judged once, under whatever id, and its verdict is reused when no model answers", async () => {
    build("build-1", [story("S1", [dt, hindu])], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    expect(w.calls).toBe(1);
    clearBook(); // a restart that lost the list: the verdict alone brings it back
    w.aiUp = false;
    const h2 = { ...hindu, id: "Y1" }, d2 = { ...dt, id: "Y2" };
    build("build-2", [story("S9", [d2, h2])], [h2, d2]);
    const b = await periodConflicts("daily", NOW, "u");
    expect([words(b), w.calls, b.stories[0].items[0].claims.map((c) => c.docId)]).toEqual([["Deaths"], 1, ["Y1", "Y2"]]);
  });
  it("until the day rolls over, and not after; a longer period still has it", async () => {
    build("build-1", [story("S1", [dt, hindu])], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    build("build-9", [], [hindu, dt]);
    expect((await periodConflicts("daily", "2026-11-26 23:59:00", "u")).stories).toHaveLength(1);
    expect((await periodConflicts("daily", "2026-11-27 06:00:00", "u")).stories).toHaveLength(0);
    expect((await periodConflicts("weekly", "2026-11-27 06:00:00", "u")).stories).toHaveLength(1);
  });
});

describe("one list for every reader, in one order", () => {
  it("largest gap first, then the newest, then the key; the same on every load", async () => {
    const bus1 = doc("B1", "The Hindu", "Two killed in bus crash at Guindy", "2026-11-26 10:00:00"), bus2 = doc("B2", "Dinamani", "Three killed in bus crash at Guindy", "2026-11-26 10:05:00");
    const all = [story("S1", [dt, hindu]), story("S3", [fire2, fire1]), story("S4", [bus2, bus1])];
    w.aiUp = false;
    build("build-1", all, [hindu, dt, fire1, fire2, bus1, bus2]);
    const a = await periodConflicts("daily", NOW, "u");
    build("build-2", [...all].reverse(), [hindu, dt, fire1, fire2, bus1, bus2]);
    const b = await dayDifferences("2026-11-26 14:05:00", "u");
    expect(a.stories.map((s) => s.title)).toEqual(["Nine injured in Perambur fire", "Three killed in bus crash at Guindy", "Three killed as wall collapses in Pallavaram"]);
    expect(b.stories.map((s) => s.id)).toEqual(a.stories.map((s) => s.id));
  });
  it("the incident pop-up shows the list's entries for its reports, with no second opinion", async () => {
    build("build-1", [story("S1", [dt, hindu])], [hindu, dt, toi]);
    const a = await periodConflicts("daily", NOW, "u");
    w.ai = none;
    const pop = await storyConflicts(["D1", "D2", "D3"], "t", "u");
    expect([pop!.items.map((i) => i.field), w.calls]).toEqual([a.stories[0].items.map((i) => i.field), 1]);
  });
});

describe("corrected, not gone", () => {
  it("an outlet's newer report gives the other's figure: it says when the reports agreed", async () => {
    build("build-1", [story("S1", [dt, hindu])], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    const later = doc("D7", "The Hindu", "Three killed in Pallavaram wall collapse", "2026-11-26 14:05:00");
    build("build-2", [story("S1", [later, dt, hindu])], [hindu, dt, later]);
    w.ai = none;
    const b = await periodConflicts("daily", "2026-11-26 14:20:00", "u");
    expect(words(b)).toEqual(["Deaths (resolved at 2:20 PM: the reports now agree)"]);
    // and it stays so
    expect(words(await periodConflicts("daily", "2026-11-26 18:00:00", "u"))).toEqual(["Deaths (resolved at 2:20 PM: the reports now agree)"]);
  });
  it("the report itself was corrected to the other's figure", async () => {
    build("build-1", [story("S1", [dt, hindu])], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    build("build-2", [story("S1", [dt, hindu])], [{ ...hindu, title: "Three killed as wall collapses in Pallavaram, say police" }, dt]);
    w.ai = none;
    expect(words(await periodConflicts("daily", "2026-11-26 09:45:00".replace("09:45", "16:05"), "u"))).toEqual(["Deaths (resolved at 4:05 PM: the reports now agree)"]);
  });
  it("a text re-worded without the figure is no correction", async () => {
    build("build-1", [story("S1", [dt, hindu])], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    build("build-2", [story("S1", [dt, hindu])], [{ ...hindu, title: "Wall collapses in Pallavaram" }, dt]);
    w.ai = none;
    expect(words(await periodConflicts("daily", "2026-11-26 16:05:00", "u"))).toEqual(["Deaths"]);
  });
  it("a report missing from one build is not withdrawn; from a second one, it is, and the entry says so", async () => {
    build("build-1", [story("S1", [dt, hindu])], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    build("build-2", [], [dt]);
    expect(words(await periodConflicts("daily", "2026-11-26 15:00:00", "u"))).toEqual(["Deaths"]);
    build("build-3", [story("S1", [dt, hindu])], [hindu, dt]);
    expect(words(await periodConflicts("daily", "2026-11-26 16:00:00", "u"))).toEqual(["Deaths"]);
    build("build-4", [], [dt]);
    await periodConflicts("daily", "2026-11-26 17:00:00", "u");
    build("build-5", [], [dt]);
    expect(words(await periodConflicts("daily", "2026-11-26 18:00:00", "u"))).toEqual(["Deaths (resolved at 6:00 PM: a report was withdrawn)"]);
  });
  it("the book holds reports by their addresses, never a story or incident id", async () => {
    build("build-1", [story("S1", [dt, hindu], "INC-A")], [hindu, dt]);
    await periodConflicts("daily", NOW, "u");
    const x = bookItems()[0];
    expect(x.key).toMatch(/^2026-11-26\|deaths\|[0-9a-f]{16}$/);
    expect(x.reports.map((r) => r.key).sort()).toEqual(["dtnext.com/Threekilled", "thehindu.com/Twokilleda"]);
  });
});
