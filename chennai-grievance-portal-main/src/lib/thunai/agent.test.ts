/**
 * Thunai v2's agent core with fakes (no model, no database): the acceptance scenarios 1-20 of
 * docs/thunai/AGENT_BUILD_PROMPT.md as the model would plan them, checked end to end through the checker, the screen
 * builders and the spoken-figure rule. The live model is measured separately (agent.live.ts).
 */
import { describe, expect, it } from "vitest";
import { runThunaiAgent, checkScreen, directScreen, type AgentPlan, type AgentResult } from "./agent";
import { START, WORLD, withState } from "./fixture";
import { fakeHands } from "./stagefake";
import { figuresOf, figuresOk, stageContext, type BlockT, type StageContext, type StageDocT } from "./stage";
import type { ScreenState, World } from "./types";

const world: World = { ...WORLD, depts: [...WORLD.depts, { code: "HLT-DMS", name: "Government Hospitals" }] };

const NULL_SCREEN = { recipe: "cases" as const, period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null,
  by: null, order: null, n: null, item: null, id: null, name: null, what: null, sort: null };
type Screen = NonNullable<AgentPlan["screen"]>;
type ScreenIn = Partial<Omit<Screen, "recipe">> & { recipe: Screen["recipe"] };
const plan = (p: Omit<Partial<AgentPlan>, "screen"> & { screen?: ScreenIn | null }): AgentPlan => ({
  kind: "do", lang: "en", reply: null, steps: [], stage: null, calls: [], done: true, say: null, options: [], ...p,
  screen: p.screen ? { ...NULL_SCREEN, ...p.screen } as AgentPlan["screen"] : null
});

async function run(text: string, plans: AgentPlan[], opts: { state?: Partial<ScreenState>; stage?: StageContext | null; now?: () => number } = {}) {
  const hands = fakeHands();
  let i = 0;
  const r = await runThunaiAgent({ text, state: withState(opts.state ?? {}), ctx: { now: START.now }, stage: opts.stage ?? null }, {
    world, hands, now: opts.now, llm: async () => {
      const p = plans[Math.min(i, plans.length - 1)];
      i++;
      return { plan: p, model: "fake" };
    }
  });
  return { r, hands, rounds: i };
}

const block = <K extends BlockT["kind"]>(d: StageDocT | null, k: K) => d?.blocks.find((b) => b.kind === k) as Extract<BlockT, { kind: K }> | undefined;
/** every figure Thunai says is on its screen, and it never says an id or a phone number */
function spokenIsClean(r: AgentResult, heard = "") {
  expect(r.stage).toBeTruthy();
  expect(r.say).toBeTruthy();
  expect(figuresOk(r.say!, figuresOf(r.stage!), heard)).toBe(true);
  expect(r.say).not.toMatch(/INC-/);
  expect(r.say).not.toMatch(/\d{8,}/);
}

describe("scenario 1: the severe cases", () => {
  it("shows exactly the console's severe rows, sets the console, and says how many and the worst", async () => {
    const { r, hands } = await run("Show me the 6 severe cases", [plan({ screen: { recipe: "cases", sev: "Severe", n: 6 } })]);
    expect(r.kind).toBe("do");
    const list = block(r.stage, "CaseList")!;
    expect(list.source).toBe("console-severity");
    expect(list.rows.map((x) => x.id)).toEqual(["INC-A1", "INC-A2", "INC-A3", "INC-A4", "INC-A5", "INC-A6"]);
    expect(list.total).toBe(6);
    expect(hands.calls).toContain("console_severe");
    expect(r.steps).toContainEqual({ a: "view", view: { sev: "Severe" } });
    expect(r.say).toMatch(/^6 severe cases today/);
    expect(r.say).toMatch(/past (its|their) deadline/);
    spokenIsClean(r);
    // a citizen's letter opening and phone number never reach the card or the voice
    expect(list.rows[0].title).not.toMatch(/respected sir|9876543210/i);
    expect(block(r.stage, "MapView")!.points.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("answers in Tamil when asked in Tamil", async () => {
    const { r } = await run("கடுமையான சம்பவங்களைக் காட்டு", [plan({ lang: "ta", screen: { recipe: "cases", sev: "Severe" } })]);
    expect(r.lang).toBe("ta");
    expect(r.say).toMatch(/கடுமையான/);
    spokenIsClean(r, "");
  });
});

describe("scenarios 2-3: news", () => {
  it("today's news, read aloud, with unsafe links dropped", async () => {
    const { r } = await run("Read today's news", [plan({ screen: { recipe: "news", period: "daily" } })]);
    const n = block(r.stage, "NewsReader")!;
    expect(n.items).toHaveLength(3);
    expect(n.items[1].url).toBeNull();
    expect(r.say).toMatch(/3 headlines/);
  });
  it("news about flooding in Velachery keeps only those", async () => {
    const { r } = await run("What's in the news about flooding in Velachery", [plan({ screen: { recipe: "news", q: "flooding Velachery" } })]);
    expect(block(r.stage, "NewsReader")!.items.map((x) => x.id)).toEqual(["N1", "N3"]);
  });
});

describe("scenario 4: readings", () => {
  it("speaks the reservoir's level from the data with its time, and opens the Environment page", async () => {
    const { r } = await run("How full is Chembarambakkam?", [plan({ screen: { recipe: "readings", metric: "lakes", name: "Chembarambakkam" } })]);
    expect(r.say).toBe("Chembarambakkam is at 40% full, as of 28 Oct, 6:00 AM.");
    expect(r.steps).toContainEqual({ a: "page", page: "environment" });
    spokenIsClean(r);
  });
});

describe("scenarios 5, 14: compare", () => {
  it("compares two zones side by side, the biggest gap computed by code", async () => {
    const { r } = await run("Compare Adyar and Ambattur this week", [plan({ screen: { recipe: "compare", zones: [13, 7], period: "weekly" } })]);
    const c = block(r.stage, "Compare")!;
    expect(c.sides.map((s) => s.label)).toEqual(["Adyar", "Ambattur"]);
    expect(c.diffs[0]).toMatchObject({ hi: "Adyar", lo: "Ambattur" });
    expect(r.stage!.takeaway!.en).toMatch(/^Adyar had/);
    spokenIsClean(r);
  });
  it("'add Perungudi' adds a column to the open board", async () => {
    const first = await run("Adyar vs Ambattur this month", [plan({ screen: { recipe: "compare", zones: [13, 7], period: "monthly" } })]);
    const { r } = await run("add Perungudi", [plan({ screen: { recipe: "compare", zones: [13, 7, 14], period: "monthly" } })], { stage: stageContext(first.r.stage!) });
    expect(block(r.stage, "Compare")!.sides.map((s) => s.label)).toEqual(["Adyar", "Ambattur", "Perungudi"]);
  });
  it("a comparison with one area is not a screen", () => {
    expect(checkScreen({ recipe: "compare", zones: [13] }, world, null)).toBeNull();
  });
});

describe("scenario 6: why", () => {
  it("gives the reasons with the figures they rest on", async () => {
    const { r } = await run("Why is Perungudi so bad lately?", [plan({ screen: { recipe: "why", zones: [14], period: "weekly" } })]);
    expect(block(r.stage, "Answer")).toBeTruthy();
    expect(block(r.stage, "Chart")!.labels[0]).toMatch(/Street lights/);
    expect(r.say).toMatch(/59 incidents this week against 40/);
    expect(r.steps).toContainEqual({ a: "view", view: { zone: 14 } });
    spokenIsClean(r);
  });
});

describe("scenario 7: the open Stage", () => {
  it("'open the third one' opens the third case on the Stage", async () => {
    const list = await run("severe cases", [plan({ screen: { recipe: "cases", sev: "Severe" } })]);
    const { r } = await run("open the third one", [plan({ screen: { recipe: "case", item: 3 } })], { stage: stageContext(list.r.stage!) });
    expect(block(r.stage, "CaseDetail")!.incident.id).toBe("INC-A3");
    spokenIsClean(r);
  });
  it("'draft action for 2' is an action on the Stage (the tray), never a send", async () => {
    const list = await run("severe cases", [plan({ screen: { recipe: "cases", sev: "Severe" } })]);
    const { r } = await run("draft action for 2", [plan({ stage: { op: "draft", n: 2, text: null } })], { stage: stageContext(list.r.stage!) });
    expect(r.stageOp).toEqual({ op: "draft", n: 2, text: null });
    expect(r.steps.some((s) => s.a === "confirm")).toBe(false);
  });
  it("an item beyond the Stage is refused by the checker", async () => {
    const list = await run("severe cases", [plan({ screen: { recipe: "cases", sev: "Severe" } })]);
    const { r } = await run("open the 40th", [plan({ stage: { op: "open", n: 40, text: null } })], { stage: stageContext(list.r.stage!) });
    expect(r.kind).toBe("none");
  });
});

describe("scenario 8: brief", () => {
  it("the brief as numbered points", async () => {
    const { r } = await run("Brief me", [plan({ screen: { recipe: "brief" } })]);
    expect(block(r.stage, "Brief")!.points.length).toBeGreaterThanOrEqual(3);
    expect(block(r.stage, "Kpis")!.items[0].value).toBe(158);
  });
});

describe("scenarios 10, 18: performance", () => {
  it("department-wise: slowest first, with the console's own measures and a heat strip", async () => {
    const { r } = await run("Which department is slowest?", [plan({ screen: { recipe: "performance", by: "dept" } })]);
    const rk = block(r.stage, "Ranking")!;
    expect(rk.items[0]).toMatchObject({ key: "POL-GCP", value: 36, action: "dept" });
    expect(block(r.stage, "Heat")).toBeTruthy();
    expect(r.say).toMatch(/^Slowest: Greater Chennai Police, open incidents 36 days old/);
    spokenIsClean(r);
  });
  it("zone-wise: worst zone first", async () => {
    const { r } = await run("zone-wise performance", [plan({ screen: { recipe: "performance", by: "zone" } })]);
    expect(block(r.stage, "Ranking")!.items[0].label).toBe("Anna Nagar");
    spokenIsClean(r);
  });
});

describe("scenario 11: heavy rain", () => {
  it("the v1 mission still runs (and ends on a Stage in the console)", async () => {
    const { r } = await run("Prepare for heavy rain", [plan({ steps: [{ action: "mission", option: "rain" } as AgentPlan["steps"][number]].map((s) => ({ ...nullStep(), ...s })) })]);
    expect(r.steps).toContainEqual({ a: "mission", name: "rain" });
  });
});

describe("scenario 12: talk, refusals, clarifications, steering", () => {
  it("chat, refuse and clarify pass through the checker", async () => {
    expect((await run("good morning", [plan({ kind: "chat", reply: "Good morning! What shall we look at?" })])).r).toMatchObject({ kind: "chat" });
    expect((await run("delete all the old complaints", [plan({ kind: "refuse", reply: "I can't delete records." })])).r).toMatchObject({ kind: "refuse" });
    const c = (await run("water problems", [plan({ kind: "clarify", reply: "Drinking water or flooding?", options: [{ label: "Drinking water", request: "show drinking water complaints" }, { label: "Flooding", request: "show flooding" }] })])).r;
    expect(c.kind).toBe("clarify");
    expect(c.options).toHaveLength(2);
  });
  it("a chat reply with a figure in it is dropped (the model never says a number)", async () => {
    expect((await run("hi", [plan({ kind: "chat", reply: "Hi! There are 40 severe cases." })])).r.kind).toBe("none");
  });
  it("pure steering is steps only", async () => {
    const { r } = await run("Zone 7, weekly", [plan({ steps: [{ ...nullStep(), action: "view", zone: 7 }, { ...nullStep(), action: "period", period: "weekly" }] })]);
    expect(r.stage).toBeNull();
    expect(r.steps).toEqual([{ a: "view", view: { zone: 7 } }, { a: "period", period: "weekly" }]);
  });
  it("an unreal zone in a screen is dropped", () => {
    expect(checkScreen({ recipe: "cases", zones: [99], sev: "Severe" }, world, null)!.slots.zones).toEqual([]);
  });
});

describe("scenario 13: top 3 areas with the most rainfall", () => {
  it("ranks the stations by the latest reading, labels the method, says the top with its time", async () => {
    const { r } = await run("Top 3 areas with the most rainfall", [plan({ screen: { recipe: "ranking", measure: "rain", n: 3 } })]);
    const rk = block(r.stage, "Ranking")!;
    expect(rk.items.map((x) => x.label)).toEqual(["Chennai-Nungambakkam", "Chennai-Meenambakkam", "Chennai-Ennore"]);
    expect(rk.method).toMatch(/Latest reading at each station/);
    expect(block(r.stage, "MapView")!.points).toHaveLength(3);
    expect(r.say).toMatch(/^Highest: Chennai-Nungambakkam, 64.2 mm, as of 28 Oct, 8:30 AM/);
    spokenIsClean(r);
  });
});

describe("scenario 15: trend", () => {
  it("marks the weeks above the usual range and says the peak", async () => {
    const { r } = await run("How has dengue moved this quarter?", [plan({ screen: { recipe: "trend", cat: "VECTOR_DISEASE", period: "quarterly" } })]);
    const t = block(r.stage, "Trend")!;
    expect(t.marks.map((m) => m.i)).toEqual([1, 4, 7, 8, 9, 10, 11]);
    expect(r.say).toMatch(/The peak was 29/);
    expect(block(r.stage, "Ranking")).toBeTruthy();
    spokenIsClean(r);
  });
});

describe("scenario 16: maps", () => {
  it("map the severe cases: the map leads, numbered as the list", async () => {
    const { r } = await run("Map the severe cases", [plan({ screen: { recipe: "map", what: "severe" } })]);
    expect(r.stage!.blocks[0].kind).toBe("MapView");
    expect(r.steps).toContainEqual({ a: "layer", layer: "severe", on: true });
  });
  it("hotspots on a map", async () => {
    const { r } = await run("show hotspots on a map", [plan({ screen: { recipe: "map", what: "hotspots" } })]);
    expect(block(r.stage, "MapView")!.points).toHaveLength(2);
  });
});

describe("scenario 17: a dashboard", () => {
  it("a flooding dashboard has KPIs, map, ranking, trend and cases", async () => {
    const { r } = await run("Make me a flooding dashboard for this week", [plan({ screen: { recipe: "dashboard", cat: "FLOOD_WATERLOGGING", period: "weekly" } })]);
    expect(r.stage!.blocks.map((b) => b.kind)).toEqual(["Kpis", "MapView", "Ranking", "Trend", "CaseList"]);
    expect(r.steps).toContainEqual({ a: "view", view: { cat: "FLOOD_WATERLOGGING" } });
    spokenIsClean(r);
  });
});

describe("scenario 19: Ask the Map inside the Stage", () => {
  it("schools within 1 km of the flooding: numbered, ranked by distance, the far one left out", async () => {
    const { r, hands } = await run("Schools within 1 km of flooding in Adyar", [plan({ screen: { recipe: "nearby", q: "schools within 1 km of flooding in Adyar zone" } })]);
    expect(hands.calls).toEqual(["ask_map"]);
    const near = block(r.stage, "Ranking")!;
    expect(near.items.map((x) => x.label)).toEqual(["Akshaya School", "Velachery Govt School"]);
    expect(near.items[0].value).toBeLessThan(near.items[1].value);
    expect(r.say).toMatch(/^2 schools within 1000 metres/);
    spokenIsClean(r);
  });
});

describe("scenario 20: on any screen", () => {
  it("table, pin, export and save are Stage operations", async () => {
    const list = await run("severe cases", [plan({ screen: { recipe: "cases", sev: "Severe" } })]);
    const ctx = stageContext(list.r.stage!);
    for (const [say, op] of [["show it as a table", "view"], ["pin this", "pin"], ["export this", "export"], ["save as Monsoon watch", "save"]] as const) {
      const { r } = await run(say, [plan({ stage: { op, n: null, text: op === "view" ? "table" : op === "save" ? "Monsoon watch" : null } })], { stage: ctx });
      expect(r.stageOp?.op).toBe(op);
    }
  });
});

describe("rounds, deadline, failures and the number check", () => {
  it("looks first, then answers with figures that are in the results", async () => {
    const { r, rounds } = await run("tomato price at Koyambedu", [
      plan({ calls: [{ tool: "mandi_prices", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: "tomato" }], done: false }),
      plan({ screen: { recipe: "answer" }, say: "Tomato is Rs 42 a kilo at Koyambedu." })
    ]);
    expect(rounds).toBe(2);
    expect(r.stage!.recipe).toBe("answer");
    expect(r.say).toBe("Tomato is Rs 42 a kilo at Koyambedu.");
  });
  it("an answer with a figure the tools did not return is replaced by the figures themselves", async () => {
    const { r } = await run("tomato price", [
      plan({ calls: [{ tool: "mandi_prices", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: "tomato" }], done: false }),
      plan({ screen: { recipe: "answer" }, say: "Tomato is Rs 55 a kilo." })
    ]);
    expect(r.say).not.toMatch(/55/);
    expect(r.say).toMatch(/42/);
    expect(r.stage!.notes[0]).toMatch(/figure the data does not hold/);
  });
  it("stops at three rounds", async () => {
    const look = plan({ calls: [{ tool: "zones", period: "weekly", zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false });
    const look2 = plan({ calls: [{ tool: "departments", period: "weekly", zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false });
    const look3 = plan({ calls: [{ tool: "taluks", period: "weekly", zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false });
    const { r, rounds } = await run("tell me everything", [look, look2, look3, look3]);
    expect(rounds).toBe(3);
    expect(r.stage!.recipe).toBe("answer");
  });
  it("stops at the deadline and answers with what it gathered", async () => {
    let t = 0;
    const look = plan({ calls: [{ tool: "zones", period: "weekly", zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false });
    const { r, rounds } = await run("tell me everything", [look, look], { now: () => (t += 9000) });
    expect(rounds).toBe(1);
    expect(r.stage!.recipe).toBe("answer");
  });
  it("a model failure is 'none' (the console falls back to the v1 planner, then the rules)", async () => {
    const r = await runThunaiAgent({ text: "x", state: START, ctx: {}, stage: null }, { world, hands: fakeHands(), llm: async () => { throw new Error("rate limited"); } });
    expect(r).toMatchObject({ kind: "none", note: "model" });
  });
  it("a screen asked for directly needs no model", async () => {
    const r = await directScreen("ranking", { measure: "zone_attention", n: 3 }, START, world, fakeHands(), "worst zones", "en");
    expect(r.model).toBeNull();
    expect(block(r.stage, "Ranking")!.items[0].label).toBe("Anna Nagar");
  });
});

function nullStep(): AgentPlan["steps"][number] {
  return { action: "help", page: null, period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, mapMode: null, layer: null, on: null, item: null, which: null,
    option: null, n: null, text: null, when: null };
}

describe("a Stage action the model put among the console steps", () => {
  it("is read as that Stage action and not run on the console", async () => {
    const list = await run("severe cases", [plan({ screen: { recipe: "cases", sev: "Severe" } })]);
    const { r } = await run("export this", [plan({ steps: [{ ...nullStep(), action: "panel", panel: "export" }] })], { stage: stageContext(list.r.stage!) });
    expect(r.stageOp?.op).toBe("export");
    expect(r.steps).toEqual([]);
  });
  it("an answer screen with nothing looked up is not shown", async () => {
    const { r } = await run("how full is Chembarambakkam", [plan({ screen: { recipe: "answer" } })]);
    expect(r.stage).toBeNull();
  });
});

describe("review fixes: the model cannot slip a figure or a send past the checker", () => {
  it("a chat reply with a spelled-out figure is dropped; an answer's figure the Collector said is not evidence", async () => {
    expect((await run("hi", [plan({ kind: "chat", reply: "Hi! There are forty severe cases." })])).r.kind).toBe("none");
    const { r } = await run("did 50 people die", [
      plan({ calls: [{ tool: "mandi_prices", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: "tomato" }], done: false }),
      plan({ screen: { recipe: "answer" }, say: "Yes, 50 people died." })
    ]);
    expect(r.say).not.toMatch(/50/);
  });
  it("never presses a sending or deleting button by name, and presses by name only when asked to click", async () => {
    const send = await run("click approve and send", [plan({ steps: [{ ...nullStep(), action: "click", text: "Approve & send" }] })]);
    expect(send.r.steps).toEqual([]);
    const sneaky = await run("show me the export options", [plan({ steps: [{ ...nullStep(), action: "click", text: "Export" }] })]);
    expect(sneaky.r.steps).toEqual([]);
    const ok = await run("click Export", [plan({ steps: [{ ...nullStep(), action: "click", text: "Export" }] })]);
    expect(ok.r.steps).toEqual([{ a: "click", n: null, name: "Export" }]);
  });
  it("console steps stay console steps while a Stage is open", async () => {
    const list = await run("severe cases", [plan({ screen: { recipe: "cases", sev: "Severe" } })]);
    const { r } = await run("Zone 7, weekly", [plan({ steps: [{ ...nullStep(), action: "view", zone: 7 }] })], { stage: stageContext(list.r.stage!) });
    expect(r.stageOp).toBeNull();
    expect(r.steps).toEqual([{ a: "view", view: { zone: 7 } }]);
  });
  it("an unknown incident says so in words", async () => {
    const hands = fakeHands({ incident_detail: () => ({ tool: "incident_detail", args: {}, scope: null, asOf: "", data: null, facts: [], sources: [], incidentIds: [], testData: false, caveats: [] }) });
    const r = await directScreen("case", { id: "INC-NOPE1" }, START, world, hands, "x", "en");
    expect(r.say).toMatch(/could not find incident INC-NOPE1/);
  });
});

describe("Ask the Map is inside Thunai", () => {
  it("a console map step becomes the in-Stage nearby screen", async () => {
    const { r } = await run("schools near flooding in Adyar", [plan({ steps: [{ ...nullStep(), action: "map", text: "schools within 1 km of flooding in Adyar zone" }] })]);
    expect(r.stage?.recipe).toBe("nearby");
    expect(r.steps.some((s) => s.a === "map")).toBe(false);
  });
});

describe("v1 read steps are screens now", () => {
  it("a reservoir read becomes the readings screen", async () => {
    const { r } = await run("how full is Chembarambakkam", [plan({ steps: [{ ...nullStep(), action: "read", option: "reservoir", text: "Chembarambakkam" }] })]);
    expect(r.stage?.recipe).toBe("readings");
    expect(r.say).toMatch(/^Chembarambakkam is at 40% full/);
  });
});

describe("filters copied from the console", () => {
  it("a category the sentence never mentions is dropped; one it mentions stays", async () => {
    const copied = await run("Why is Perungudi so bad lately?", [plan({ screen: { recipe: "why", zones: [14], cat: "VECTOR_DISEASE" } })], { state: { cat: "VECTOR_DISEASE" } });
    expect(copied.r.stage!.scope.cat).toBeNull();
    const said = await run("why is dengue rising in Perungudi", [plan({ screen: { recipe: "why", zones: [14], cat: "VECTOR_DISEASE" } })], { state: { cat: "VECTOR_DISEASE" } });
    expect(said.r.stage!.scope.cat).toBe("VECTOR_DISEASE");
  });
});
