import { describe, expect, it } from "vitest";
import { MAX_ROUNDS, agentSchemas, callText, narrowToNamed, noNumbers, observe, onlyNumbersFrom, runAgent, type AgentCall, type AgentInput, type AgentStep } from "@/lib/assistant/agent";
import type { ToolResult } from "@/lib/assistant/types";

const call = (tool: string, extra: Partial<AgentCall> = {}): AgentCall => ({ tool, period: null, zone: null, dept: null, cat: null, taluk: null, id: null, text: null,
  q: null, place: null, metric: null, above: null, below: null, commodity: null, market: null, sev: null, status: null, allTime: null, ...extra });
const step = (s: Partial<AgentStep>): AgentStep => ({ action: "tools", language: "en", question: "why did flooding rise in Adyar?", calls: [], done: true, brief: null,
  show: null, clarify: null, refusal: null, visual: false, chartType: null, ...s });
const result = (tool: string, facts: [string, number][] = [], data: unknown = {}): ToolResult => ({ tool, args: {}, scope: null, asOf: "2026-10-20 10:00:00", data,
  facts: facts.map(([label, value], k) => ({ id: `${tool}.${k}`, label, value })), sources: [], incidentIds: [], testData: false, caveats: [] });

/** An agent whose model returns the given steps in turn, and whose tools return a result named after the tool (or throw for "broken"). */
function agent(steps: AgentStep[]) {
  const prompts: string[] = [];
  const ran: string[] = [];
  const input: AgentInput = {
    message: "why did flooding rise in Adyar?", asOf: "2026-10-20 10:00", scopeLine: "Last 90 days · All zones", summary: "", previous: "", place: "", window: "",
    detected: "en", system: "",
    llm: async (_name, prompt) => { prompts.push(prompt); const s = steps.shift(); if (!s) throw new Error("no more steps"); return s; },
    run: async (c) => {
      ran.push(callText(c));
      if (c.tool === "broken") throw new Error("Invalid arguments for broken: zone");
      return { name: c.tool, args: { zone: c.zone }, result: result(c.tool, [[`${c.tool} total`, 12]], { rows: [{ id: "INC-1", title: "Canal overflow", secret: "x" }] }) };
    }
  };
  return { input, prompts, ran };
}

describe("agent loop", () => {
  it("answers in one round when the model says its calls are enough", async () => {
    const a = agent([step({ calls: [call("zones")], done: true })]);
    const o = await runAgent(a.input);
    expect(o.kind).toBe("compose");
    expect(o.runs.map((r) => r.name)).toEqual(["zones"]);
    expect(a.prompts).toHaveLength(1);
  });

  it("reads the results and digs further before answering", async () => {
    const a = agent([
      step({ calls: [call("change_drivers", { zone: 13 })], done: false }),
      step({ calls: [call("place_breakdown", { zone: 13, cat: "FLOOD_WATERLOGGING" })], done: false, brief: "Flooding rose 40% mostly in 3 wards after rain; act on the open canal first." })
    ]);
    const o = await runAgent(a.input);
    expect(o.kind).toBe("compose");
    expect(o.runs.map((r) => r.name)).toEqual(["change_drivers", "place_breakdown"]);
    // the second prompt carries the first tool's figures and records
    expect(a.prompts[1]).toContain("change_drivers total = 12");
    expect(a.prompts[1]).toContain("<untrusted_data>");
    expect(a.prompts[1]).toContain("title: Canal overflow");
    expect(a.prompts[1]).not.toContain("secret");
    // the brief keeps words, never numbers (they would pass the number check)
    expect(o.brief).not.toMatch(/\d/);
    expect(o.brief).toContain("Flooding rose");
  });

  it("never runs the same call twice and stops after the last round", async () => {
    const same = call("change_drivers", { zone: 13 });
    const a = agent([step({ calls: [same], done: false }), step({ calls: [same, call("zones")], done: false }), step({ calls: [call("taluks")], done: false })]);
    const o = await runAgent(a.input);
    expect(MAX_ROUNDS).toBe(2);
    expect(a.ran).toEqual(["change_drivers(zone=13)", "zones()"]);
    expect(a.prompts).toHaveLength(MAX_ROUNDS);
    expect(a.prompts[MAX_ROUNDS - 1]).toContain("Last round");
    expect(o.kind).toBe("compose");
  });

  it("shows a tool's error to the model, which can correct the call", async () => {
    const a = agent([step({ calls: [call("broken", { zone: 99 })], done: false }), step({ calls: [call("zones")], done: true })]);
    const o = await runAgent(a.input);
    expect(a.prompts[1]).toContain("[error] broken(zone=99): Invalid arguments");
    expect(o.errors).toHaveLength(1);
    expect(o.runs.map((r) => r.name)).toEqual(["zones"]);
  });

  it("hands records, refusals and questions back to the console", async () => {
    const show = await runAgent(agent([step({ action: "show", show: { kind: "incident_list", period: "weekly", zone: 13, dept: null, cat: null, taluk: null,
      incidentId: null, storyId: null, find: null, count: null, openOnly: true, overdueOnly: false, severity: null } })]).input);
    expect(show.kind).toBe("show");
    expect(show.show?.zone).toBe(13);
    expect((await runAgent(agent([step({ action: "refuse", refusal: "general knowledge" })]).input)).kind).toBe("refuse");
    const c = await runAgent(agent([step({ action: "clarify", clarify: { question: "Which one?", options: ["Explain the canal", "Summarise Adyar", " "] } })]).input);
    expect(c.kind).toBe("clarify");
    expect(c.clarify?.options).toEqual(["Explain the canal", "Summarise Adyar"]);
  });

  it("a busy model after the first round still answers from what was gathered", async () => {
    const a = agent([step({ calls: [call("change_drivers")], done: false })]);
    const o = await runAgent(a.input);
    expect(o.kind).toBe("compose");
    expect(o.runs.map((r) => r.name)).toEqual(["change_drivers"]);
    await expect(runAgent(agent([]).input)).rejects.toThrow("no more steps");
  });

  it("an answer with nothing gathered goes to the console's own answers", async () => {
    expect((await runAgent(agent([step({ action: "answer" })]).input)).kind).toBe("show");
    expect((await runAgent(agent([step({ calls: [] })]).input)).kind).toBe("show");
  });

  it("keeps the first step's language, question and picture choice", async () => {
    const o = await runAgent(agent([step({ language: "tanglish", question: "Adyar flooding why", visual: true, calls: [call("zones")], done: false }),
      step({ action: "answer", language: "en", visual: false })]).input);
    expect(o.language).toBe("tanglish");
    expect(o.question).toBe("Adyar flooding why");
    expect(o.visual).toBe(true);
  });
});

describe("agent helpers", () => {
  it("carries the category the question names into explanations and series, never over the model's own", () => {
    expect(narrowToNamed(call("change_drivers", { zone: 13 }), "FLOOD_WATERLOGGING").cat).toBe("FLOOD_WATERLOGGING");
    expect(narrowToNamed(call("incident_series"), "ROAD_ACCIDENT").cat).toBe("ROAD_ACCIDENT");
    expect(narrowToNamed(call("change_drivers", { cat: "DRAINAGE_SEWAGE" }), "FLOOD_WATERLOGGING").cat).toBe("DRAINAGE_SEWAGE");
    // rankings across zones and contacts are not narrowed; no named category, no change
    expect(narrowToNamed(call("zones"), "FLOOD_WATERLOGGING").cat).toBeNull();
    const c = call("change_drivers");
    expect(narrowToNamed(c, null)).toBe(c);
  });

  it("keeps only the Collector's own numbers in the restated question", () => {
    expect(onlyNumbersFrom("Why did flooding in Zone 13 rise by 45% to 120 incidents?", "why flooding up in zone 13")).toBe("Why did flooding in Zone 13 rise by % to incidents?");
    expect(onlyNumbersFrom("Top 5 wards", "top 5 wards")).toBe("Top 5 wards");
  });

  it("strips numbers from a brief, and an empty brief is none", () => {
    expect(noNumbers("Rose 1,234 (45.5%) after rain")).toBe("Rose after rain");
    expect(noNumbers("42")).toBeNull();
    expect(noNumbers(null)).toBeNull();
  });

  it("lists at most the first figures and says how many more there are", () => {
    const r = result("zones", Array.from({ length: 40 }, (_, k) => [`Zone ${k + 1} open`, k] as [string, number]));
    const text = observe(1, "zones()", r, 28);
    expect(text).toContain("Zone 28 open = 27");
    expect(text).not.toContain("Zone 29 open");
    expect(text).toContain("12 more figures");
  });

  it("the strict schema needs every field, the lenient one forgives an unknown value", () => {
    const { strict, lenient } = agentSchemas(["zones", "change_drivers"], ["aqi"]);
    const draft = { ...step({ calls: [call("zones")] }), chartType: "spiral" };
    expect(strict.safeParse(draft).success).toBe(false);
    const ok = lenient.safeParse(draft);
    expect(ok.success && ok.data.chartType).toBe(null);
  });
});
