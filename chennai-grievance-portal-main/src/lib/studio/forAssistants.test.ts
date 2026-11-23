/**
 * v17 (22 Nov): the Collector's Data Studio datasets for Jarvis and Ask District IQ (forAssistants.ts). Datasets shaped like the samples (the
 * relief shelters file, the desilting register, the fever surveillance return), held in memory: the store, the Studio's analyst and the
 * reference tables are stand-ins, so no file, database or model is touched. The rules fallback runs the Studio's real rules and engine.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatasetCard, DatasetMeta } from "@/lib/studio/types";

const mem = vi.hoisted(() => ({ metas: [] as unknown[], rows: new Map<string, unknown[]>(), ask: null as null | ((...a: unknown[]) => Promise<unknown>) }));

vi.mock("@/lib/studio/store", () => {
  const all = () => mem.metas as DatasetMeta[];
  return {
    datasetIds: () => all().map((m) => m.id),
    getMeta: (id: string) => all().find((m) => m.id === id) ?? null,
    getRows: (id: string) => mem.rows.get(id) ?? [],
    listDatasets: (): DatasetCard[] => [...all()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((m) => ({ id: m.id, name: m.name, kind: "file", file: m.name,
      rows: m.rows, health: 90, department: m.spec.deptName, updatedAt: m.updatedAt, link: null, sample: true }))
  };
});
vi.mock("@/lib/studio/pipeline", () => ({
  ask: (...a: unknown[]) => (mem.ask ? mem.ask(...a) : Promise.reject(new Error("no analyst in this test"))),
  namesOf: () => ({ zone: (z: number) => `Zone ${z}`, taluk: (t: string) => t, zoneOf: () => null })
}));
vi.mock("@/lib/studio/refs", () => ({ refs: async () => ({ wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() }) }));

import { datasetOfTag, isSummaryQuestion, mayUse, pickDataset, resetStudioIndex, studioAsk, studioDigest } from "./forAssistants";
import { datasetAnswerCard, datasetNamed, lastStudioPlan } from "@/lib/assistant/studiolink";
import type { AnswerCard } from "@/lib/assistant/answer";

const COLLECTOR = { role: "collector", lockDept: null };
const OFFICER = { role: "department_officer", lockDept: "GCC-SWD" };

type Col = { key: string; label: string; role: string; type?: string };
function meta(o: { id: string; name: string; title: string; entity: string; plural: string; dept: string | null; cols: Col[]; rows: number; at: string; verdict?: string;
  summary?: string[]; top?: Record<string, string[]>; questions?: string[] }): DatasetMeta {
  return {
    id: o.id, name: o.name, source: { kind: "file", file: o.name }, createdAt: o.at, updatedAt: o.at, rows: o.rows, cols: o.cols.length, window: { from: "2026-04-01", to: "2026-09-30" },
    spec: { title: o.title, summary: `${o.plural} in Chennai`, entity: o.entity, entityPlural: o.plural, department: null, deptName: o.dept,
      columns: o.cols.map((c) => ({ key: c.key, header: c.label, label: c.label, role: c.role, type: c.type ?? (c.role === "measure" ? "number" : "text"), unit: null,
        agg: c.role === "measure" ? "sum" : null, conf: 0.9, why: "" })),
      openValues: ["Pending"], primary: o.cols.find((c) => c.role === "measure")?.key ?? null, linkCategories: [], questions: o.questions ?? [], by: "rules", model: null },
    profile: o.cols.map((c) => ({ key: c.key, header: c.label, type: "text", filled: o.rows, distinct: 5, top: (o.top?.[c.key] ?? []).map((v) => ({ v, n: 3 })), min: null, max: null,
      median: null, dmin: null, dmax: null, avgLen: 6, sample: [], guess: c.role, unit: null })),
    detective: { before: 80, after: 95, rowsIn: o.rows, rowsOut: o.rows, issues: [], placed: o.rows, unplaced: [] }, panels: [], link: null, story: null,
    brief: o.verdict ? { verdict: o.verdict, summary: o.summary ?? [], items: [], questions: [], considered: 12, by: "ai", model: "test/model", dropped: 0, at: o.at } : null,
    rules: [], steps: [], sample: true
  } as unknown as DatasetMeta;
}

const SHELTERS = meta({ id: "ds_shelters01", name: "Chennai Relief Shelter Locations", title: "Chennai Relief Shelter Locations", entity: "relief shelter", plural: "relief shelters",
  dept: "District Disaster Management", rows: 4, at: "2026-11-20T10:00:00Z",
  cols: [{ key: "loc", label: "Shelter location", role: "place" }, { key: "ph", label: "Contact number", role: "person" }, { key: "fam", label: "Families accommodated", role: "measure" },
    { key: "zone", label: "Zone", role: "zone" }, { key: "per", label: "Persons accommodated", role: "measure" }],
  top: { zone: ["Adyar", "Royapuram"], loc: ["Corporation School Saidapet"] },
  verdict: "Shelter capacity is uneven across Chennai; call 9876543210 for the list.", summary: ["The file covers 4 sites with room for 230 persons.", "Adyar has the most sites."],
  questions: ["How many relief shelters are listed?", "Which zones have the most relief shelters?"] });
const DESILT = meta({ id: "ds_desilt0001", name: "GCC_SWD_Desilting_Register_Sep2026.xlsx", title: "Storm-water drain desilting register", entity: "desilting work", plural: "desilting works",
  dept: "GCC Storm Water Drain", rows: 120, at: "2026-11-19T10:00:00Z",
  cols: [{ key: "zone", label: "Zone", role: "zone" }, { key: "ward", label: "Ward", role: "ward" }, { key: "st", label: "Status", role: "status" }, { key: "len", label: "Length (m)", role: "measure" },
    { key: "cost", label: "Cost", role: "measure" }], top: { st: ["Pending", "Completed"] }, verdict: "Desilting is behind in Zone 9." });
const FEVER = meta({ id: "ds_fever00001", name: "Fever & dengue surveillance", title: "Fever & dengue surveillance", entity: "hospital week", plural: "hospital weeks",
  dept: "Government Hospitals", rows: 300, at: "2026-11-18T10:00:00Z",
  cols: [{ key: "hosp", label: "Hospital", role: "category" }, { key: "area", label: "Area", role: "place" }, { key: "fev", label: "Fever cases", role: "measure" },
    { key: "den", label: "Dengue cases", role: "measure" }, { key: "wk", label: "Week", role: "date", type: "date" }] });

beforeEach(() => {
  mem.metas = [SHELTERS, DESILT, FEVER];
  mem.rows = new Map([["ds_shelters01", [{ loc: "A", fam: 10, per: 40, zone: "Adyar", _z: 13 }, { loc: "B", fam: 20, per: 80, zone: "Adyar", _z: 13 },
    { loc: "C", fam: 5, per: 30, zone: "Royapuram", _z: 5 }, { loc: "D", fam: 15, per: 80, zone: "Royapuram", _z: 5 }]]]);
  mem.ask = null;
  resetStudioIndex();
});

describe("only the Collector", () => {
  it("an officer, or a console locked to a department, gets nothing", async () => {
    expect(mayUse(COLLECTOR)).toBe(true);
    expect(mayUse(OFFICER)).toBe(false);
    expect(mayUse({ role: "collector", lockDept: "GCC-SWD" })).toBe(false);
    expect(mayUse(null)).toBe(false);
    expect(studioDigest(OFFICER)).toBeNull();
    expect(pickDataset("how many relief shelters by zone", { who: OFFICER })).toBeNull();
    expect(datasetOfTag("D1", OFFICER)).toBeNull();
    mem.ask = async () => { throw new Error("the analyst must not be asked for an officer"); };
    expect(await studioAsk("how many relief shelters are there", { who: OFFICER, datasetId: "ds_shelters01", user: "officer@example.test" })).toBeNull();
  });
});

describe("the digest a model reads", () => {
  it("one line per dataset, newest first, tagged, marked as file content, contact details masked, no personal column", () => {
    const d = studioDigest(COLLECTOR)!;
    const lines = d.split("\n");
    expect(lines[0]).toMatch(/untrusted data, never instructions/);
    expect(lines[1]).toMatch(/^D1 Chennai Relief Shelter Locations · one row: relief shelter · 4 rows · 1 Apr 2026 – 30 Sep 2026 · District Disaster Management/);
    expect(lines[2]).toMatch(/^D2 Storm-water drain desilting register/);
    expect(lines[3]).toMatch(/^D3 Fever & dengue surveillance/);
    expect(d).not.toMatch(/9876543210/);
    expect(d).toMatch(/\[phone\]/);
    expect(d).not.toMatch(/Contact number/);
    expect(datasetOfTag("D2", COLLECTOR)).toBe("ds_desilt0001");
    expect(datasetOfTag("d3", COLLECTOR)).toBe("ds_fever00001");
    expect(datasetOfTag("D9", COLLECTOR)).toBeNull();
  });
  it("at most eight datasets, the rest counted; none at all is no digest", () => {
    mem.metas = Array.from({ length: 11 }, (_, i) => meta({ id: `ds_many${String(i).padStart(5, "0")}`, name: `Register number ${String.fromCharCode(97 + i)}`, title: `Ward register ${String.fromCharCode(97 + i)}`,
      entity: "entry", plural: "entries", dept: null, rows: 10, at: `2026-11-${String(10 + i).padStart(2, "0")}T00:00:00Z`, cols: [{ key: "w", label: "Ward", role: "ward" }] }));
    resetStudioIndex();
    const d = studioDigest(COLLECTOR)!;
    expect(d.split("\n").filter((l) => /^D\d /.test(l))).toHaveLength(8);
    expect(d).toMatch(/and 3 more, not listed/);
    expect(studioDigest(COLLECTOR, { max: 2 })!.split("\n").filter((l) => /^D\d /.test(l))).toHaveLength(2);
    mem.metas = [];
    resetStudioIndex();
    expect(studioDigest(COLLECTOR)).toBeNull();
  });
  it("kept for a minute, and made again at once when a dataset is added", () => {
    const a = studioDigest(COLLECTOR);
    expect(studioDigest(COLLECTOR)).toBe(a);
    mem.metas = [...mem.metas, meta({ id: "ds_newone0001", name: "Ration shop stock", title: "Ration shop stock", entity: "shop stock entry", plural: "shop stock entries", dept: "Civil Supplies",
      rows: 50, at: "2026-11-21T10:00:00Z", cols: [{ key: "shop", label: "Shop", role: "category" }] })];
    expect(studioDigest(COLLECTOR)).toMatch(/^D1 Ration shop stock/m);
  });
});

describe("pickDataset: the dataset a question is about", () => {
  const pick = (t: string, o: { openId?: string; lastId?: string } = {}) => pickDataset(t, { who: COLLECTOR, ...o });
  it("named by a word only the file has, with a column or a second word", () => {
    expect(pick("how many relief shelters by zone")?.id).toBe("ds_shelters01");
    expect(pick("desilting works pending in Zone 9")?.id).toBe("ds_desilt0001");
    expect(pick("total families accommodated in the shelters")?.id).toBe("ds_shelters01");
    expect(pick("how many relief shelters by zone")?.strong).toBe(true);
  });
  it("a question about the district is never sent to an upload that shares its words", () => {
    expect(pick("how many complaints in Adyar today?")).toBeNull();
    expect(pick("any dengue deaths this week")).toBeNull();
    expect(pick("show the severe flooding cases in Royapuram")).toBeNull();
    expect(pick("which department has the most overdue complaints")).toBeNull();
  });
  it("the console's own words name a dataset with 'my data'", () => {
    expect(pick("dengue cases trend in my data")?.id).toBe("ds_fever00001");
  });
  it("the digest's tag, the dataset open in the Studio, and a follow-up on the last answer", () => {
    expect(pick("what does D2 say")?.id).toBe("ds_desilt0001");
    expect(pick("what is the average?", { openId: "ds_desilt0001" })?.id).toBe("ds_desilt0001");
    expect(pick("how many severe complaints today?", { openId: "ds_desilt0001" })).toBeNull();
    expect(pick("and by zone?", { lastId: "ds_shelters01" })?.id).toBe("ds_shelters01");
    expect(pick("and by zone?")).toBeNull();
    // the last answer's dataset does not take a new question about the district
    expect(pick("how many complaints in Adyar?", { lastId: "ds_shelters01" })).toBeNull();
  });
  it("a dataset named by its own words wins over the one open in the Studio and the last answer's", () => {
    expect(pick("what does the shelters dataset say?", { openId: "ds_desilt0001" })?.id).toBe("ds_shelters01");
    expect(pick("what does the shelters dataset say?", { lastId: "ds_desilt0001" })?.id).toBe("ds_shelters01");
    expect(pick("what does the shelters dataset say?", { openId: "ds_desilt0001" })?.strong).toBe(true);
    // the open one still answers what names nothing else, and a follow-up stays on the last answer's
    expect(pick("what does this dataset say?", { openId: "ds_desilt0001" })?.id).toBe("ds_desilt0001");
    expect(pick("and by zone?", { lastId: "ds_desilt0001" })?.id).toBe("ds_desilt0001");
  });
});

describe("the index is made again after a minute", () => {
  it("a brief written later (its updatedAt unchanged) reaches the digest", () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T10:00:00Z") });
    try {
      expect(studioDigest(COLLECTOR)).toMatch(/brief: Desilting is behind in Zone 9\./);
      mem.metas = mem.metas.map((m) => ((m as DatasetMeta).id === "ds_desilt0001"
        ? { ...(m as DatasetMeta), brief: { ...(m as DatasetMeta).brief!, verdict: "Desilting has caught up in Zone 9." } } : m));
      expect(studioDigest(COLLECTOR)).toMatch(/Desilting is behind/);
      vi.advanceTimersByTime(61_000);
      expect(studioDigest(COLLECTOR)).toMatch(/brief: Desilting has caught up in Zone 9\./);
      // the same datasets keep their tags
      expect(datasetOfTag("D2", COLLECTOR)).toBe("ds_desilt0001");
    } finally { vi.useRealTimers(); }
  });
});

describe("studioAsk", () => {
  it("'summarise my shelters data' is the brief, with no model, its contact details masked", async () => {
    mem.ask = async () => { throw new Error("a summary must not ask the analyst"); };
    expect(isSummaryQuestion("summarise my shelters data")).toBe(true);
    expect(isSummaryQuestion("what does my relief shelter data say")).toBe(true);
    expect(isSummaryQuestion("which zone has the most shelters")).toBe(false);
    const a = (await studioAsk("Summarise my shelters data", { who: COLLECTOR, datasetId: "ds_shelters01", user: "collector@example.test" }))!;
    expect(a.source).toBe("brief");
    expect(a.reply.kind).toBe("summary");
    expect(a.sentence.en).toMatch(/^Shelter capacity is uneven across Chennai/);
    expect(a.sentence.en).not.toMatch(/9876543210/);
    expect(a.reply.points).toEqual(["The file covers 4 sites with room for 230 persons.", "Adyar has the most sites."]);
    expect(a.dataset.questions[0]).toBe("How many relief shelters are listed?");
    expect(a.facts[0].value).toBe(4);
  });
  it("a question goes to the Studio's analyst, and its answer is said in both languages from the same figures", async () => {
    const panel = { id: "p", plan: { id: "p", title: "Shelters by zone", chart: "bar", agg: "count", col: null, by: "zone", byCol: null, unit: null, filters: [], sort: "desc", limit: 10 },
      title: "Shelters by zone", subtitle: "Count of relief shelters", chart: "bar", labels: ["Adyar", "Royapuram"], values: [2, 2], keys: [13, 5], geo: "zone", points: [], total: 4, rows: 4,
      format: "int", unit: null, kpi: null, table: null, note: null };
    mem.ask = async (...args: unknown[]) => {
      expect(args.slice(0, 2)).toEqual(["ds_shelters01", "relief shelters by zone"]);
      return { kind: "query", plan: panel.plan, panel, answer: "Adyar leads with 2 — 50% of the total; then Royapuram (2).", note: null, by: "ai", model: "test/fast", watch: null, window: null, how: "Count over 4 relief shelters" };
    };
    const a = (await studioAsk("relief shelters by zone", { who: COLLECTOR, datasetId: "ds_shelters01", user: "collector@example.test" }))!;
    expect(a.source).toBe("ai");
    expect(a.sentence.en).toMatch(/^Adyar leads with 2/);
    expect(a.sentence.ta).toMatch(/அதிகம் Adyar \(2\)/);
    expect(a.facts.map((f) => f.label)).toEqual(["Adyar", "Royapuram", "Rows counted"]);
    expect(a.reply.plan?.by).toBe("zone");
  });
  it("an analyst past its deadline is not waited for: the Studio's rules answer, counted from the rows", async () => {
    // (the rules' modules loaded first: on this PC the test runner's first load of them alone takes seconds)
    await Promise.all([import("./ask"), import("./ai"), import("./chartlint"), import("./engine")]);
    mem.ask = () => new Promise(() => undefined);
    const t0 = Date.now();
    const a = (await studioAsk("how many relief shelters are there", { who: COLLECTOR, datasetId: "ds_shelters01", user: "collector@example.test", deadlineMs: 1000 }))!;
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(a.source).toBe("rules");
    expect(a.reply.by).toBe("rules");
    expect(a.reply.panel?.kpi?.value ?? a.reply.panel?.total).toBe(4);
    expect(a.sentence.en).toMatch(/4/);
  });
  it("a follow-up asked in other words keeps the last answer's filters, counted again from the rows; a column the file does not have is dropped", async () => {
    await Promise.all([import("./chartlint"), import("./engine")]);
    const plan = { id: "q2", title: "Relief shelters", chart: "kpi", agg: "count", col: null, by: "none", byCol: null, unit: null, filters: [], sort: "desc", limit: 10 };
    // the analyst read the reworded question afresh: no filter of its own
    mem.ask = async () => ({ kind: "query", plan, panel: { id: "q2", plan, title: "Relief shelters", subtitle: "Count of relief shelters", chart: "kpi", labels: [], values: [], keys: [], geo: null,
      points: [], total: 4, rows: 4, format: "int", unit: null, kpi: { label: "Relief shelters", value: 4, sub: "", tone: "teal", delta: null, spark: [] }, table: null, note: null },
      answer: "4 relief shelters.", note: null, by: "ai", model: "test/fast", watch: null, window: null, how: "Count over 4 relief shelters" });
    const context = { filters: [{ col: "zone", op: "eq" as const, values: ["Adyar"] }, { col: "ph", op: "eq" as const, values: ["98"] }, { col: "made_up", op: "eq" as const, values: ["x"] }] };
    const a = (await studioAsk("How many relief shelters are there?", { who: COLLECTOR, datasetId: "ds_shelters01", user: "collector@example.test", context, keep: true }))!;
    expect(a.reply.plan?.filters).toEqual([{ col: "zone", op: "eq", values: ["Adyar"] }]);
    expect(a.reply.panel?.rows).toBe(2);
    expect(a.reply.how).toMatch(/the last answer's filters kept/);
    // without `keep` the Studio's own rule holds: a question that does not start like a follow-up starts afresh
    const b = (await studioAsk("How many relief shelters are there?", { who: COLLECTOR, datasetId: "ds_shelters01", user: "collector@example.test", context }))!;
    expect(b.reply.plan?.filters).toEqual([]);
  });
  it("a 'why' with nothing to chart says its account of the change, not only its note", async () => {
    mem.ask = async () => ({ kind: "why", plan: null, panel: null, answer: "Pending works rose in Zone 9 after the rains.", note: "What moved, from the rows: an account of the change, not its cause.", by: "rules", model: null, watch: null, window: null });
    const a = (await studioAsk("why did desilting fall behind", { who: COLLECTOR, datasetId: "ds_desilt0001", user: "collector@example.test" }))!;
    expect(a.sentence.en).toBe("Pending works rose in Zone 9 after the rains.");
  });
  it("a dataset that is gone is no answer", async () => {
    expect(await studioAsk("anything", { who: COLLECTOR, datasetId: "ds_gone0000001", user: "collector@example.test" })).toBeNull();
  });
});

describe("Ask District IQ's Data Studio lane (assistant/studiolink.ts)", () => {
  const base = () => ({ kind: "answer", headline: "", answerMarkdown: "", display: "text", chart: null, datasets: [], kpis: [], chips: [], caveats: [], scope: null, scopeLine: "",
    sources: { tools: [], assumptions: [], models: [], sql: [], limits: [], incidentIds: [], verifier: null } }) as unknown as AnswerCard;
  it("a follow-up reads the last answer's saved plan: its dataset and its filters", () => {
    const f = [{ col: "_z", op: "eq", values: ["Adyar"] }];
    expect(lastStudioPlan([{ role: "user", plan: null }, { role: "assistant", plan: { intent: "studio_query", dataset: "ds_shelters01", filters: f } }])).toEqual({ dataset: "ds_shelters01", filters: f });
    expect(lastStudioPlan([{ role: "assistant", plan: { intent: "studio_query", dataset: "ds_shelters01" } }, { role: "assistant", plan: { intent: "map" } }])).toBeNull();
  });
  it("'summarise my shelters data' as a chat card: the verdict, the brief's points, the dataset's own questions", async () => {
    const a = (await studioAsk("summarise my shelters data", { who: COLLECTOR, datasetId: "ds_shelters01", user: "collector@example.test" }))!;
    const c = datasetAnswerCard(base(), a);
    expect(c.headline).toBe("Shelter capacity is uneven across Chennai; call [phone] for the list");
    expect(c.answerMarkdown).toMatch(/- Adyar has the most sites\./);
    expect(c.scopeLine).toMatch(/^Data Studio · Chennai Relief Shelter Locations/);
    expect(c.chips).toEqual(["How many relief shelters are listed?", "Which zones have the most relief shelters?"]);
    expect(c.sources.assumptions[0]).toMatch(/no AI was asked again/);
  });
  it("datasetNamed keeps the officer out", () => {
    expect(datasetNamed("how many relief shelters by zone")?.id).toBe("ds_shelters01");
    expect(datasetNamed("how many relief shelters by zone", { who: OFFICER })).toBeNull();
  });
});
