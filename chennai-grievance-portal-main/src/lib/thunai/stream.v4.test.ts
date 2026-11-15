/**
 * Jarvis v4, lane L2: the streamed turn. Events come in the documented order (events.ts), the work timeline carries the real trace, the
 * screen comes before its sentences, every sentence passed the number gate on the server, and RUN_FINISHED is the JSON reply.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import type { AgentResult } from "./agent";
import { NDJSON, readEvents, type TurnEvent } from "./events";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { clearCaches, planRound, RoundBody, type RoundBodyT, type RoundDeps } from "./round";
import { fakeHands } from "./stagefake";
import type { StageDocT } from "./stage";
import { roundStream, spokenSentences } from "./streamturn";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: "s-turn", round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
const PLAN = { kind: "do", lang: "en", reply: null, options: [], calls: [], done: true, say: null, steps: [], stage: null, screen: null };
const STEP = (o: Record<string, unknown>) => ({ action: "page", page: null, period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, mapMode: null, layer: null, on: null, item: null, which: null, option: null, n: null, text: null, when: null, ...o });
function model(answer: (i: number) => unknown) {
  let i = 0;
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => ({ object: answer(i++) as U, info: { step: c.name, provider: "groq", model: "m", ms: 3, inputTokens: 100, outputTokens: 20, attempts: 1 } });
  return generate as never;
}
const deps = (gen: unknown, o: Partial<RoundDeps> = {}): RoundDeps => ({ llm: { generate: gen as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false }, ...o });
const kindOf = (e: TurnEvent) => (e.type === "CUSTOM" ? `CUSTOM:${e.name}` : e.type);

describe("the streamed turn", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-stream4-"))); });
  afterEach(() => vi.unstubAllEnvs());

  it("emits RUN_STARTED, ack, heard, the real steps, the screen, its sentences, then RUN_FINISHED with the JSON reply", async () => {
    const events: TurnEvent[] = [];
    const r = await planRound(body("severe cases in Adyar this week"), WORLD, fakeHands(), "u", undefined, undefined, deps(model(() => PLAN), { emit: (e) => events.push(e) }));
    const kinds = events.map(kindOf);
    expect(kinds.slice(0, 3)).toEqual(["RUN_STARTED", "CUSTOM:ack", "CUSTOM:heard"]);
    const snap = kinds.indexOf("STATE_SNAPSHOT");
    expect(snap).toBeGreaterThan(kinds.lastIndexOf("STEP_FINISHED"));
    expect(kinds.indexOf("TEXT_MESSAGE_CONTENT")).toBeGreaterThan(snap);
    expect(kinds.at(-1)).toBe("RUN_FINISHED");
    expect((events.at(-1) as Extract<TurnEvent, { type: "RUN_FINISHED" }>).out).toEqual(r);
    for (const e of events) expect(e).toMatchObject({ turnId: "s-turn", round: 0 });
    // the work timeline is the real trace: every finished step is a trace item with its own time
    const finished = events.filter((e): e is Extract<TurnEvent, { type: "STEP_FINISHED" }> => e.type === "STEP_FINISHED");
    expect(finished.length).toBeGreaterThan(0);
    for (const f of finished) expect(r.trace.some((t) => t.label === f.stepName && t.ms === f.ms && t.ok === f.ok)).toBe(true);
    // the ack is code's and holds no figure; the heard event says the lane
    const ack = events.find((e) => kindOf(e) === "CUSTOM:ack") as Extract<TurnEvent, { name: "ack" }>;
    expect(ack.value.text).not.toMatch(/\p{Nd}/u);
    expect((events.find((e) => kindOf(e) === "CUSTOM:heard") as Extract<TurnEvent, { name: "heard" }>).value.lane).toBe("district");
    // the sentences are the say, in order
    const said = events.filter((e): e is Extract<TurnEvent, { type: "TEXT_MESSAGE_CONTENT" }> => e.type === "TEXT_MESSAGE_CONTENT").map((e) => e.delta).join(" ");
    expect(said.replace(/\s+/g, " ")).toBe((r.result?.say ?? "").replace(/\s+/g, " ").trim());
  });
  it("without emit the reply is what it was: the same shape, no stream", async () => {
    const plain = await planRound(body("severe cases in Adyar this week", { turnId: "p1" }), WORLD, fakeHands(), "u", undefined, undefined, deps(model(() => PLAN)));
    expect(Object.keys(plain).sort()).toEqual(["cached", "calls", "done", "hops", "lane", "result", "steps", "timing", "tokens", "trace"]);
  });
  it("a look-first round streams its console steps and no screen", async () => {
    const events: TurnEvent[] = [];
    const gen = model((i) => (i === 0 ? { ...PLAN, steps: [STEP({ action: "page", page: "trends" })], done: false } : PLAN));
    const r = await planRound(body("go to the trends page and tell me what is there", { turnId: "s-steps" }), WORLD, fakeHands(), "u", undefined, undefined, deps(gen, { emit: (e) => events.push(e) }));
    expect(r.done).toBe(false);
    const steps = events.find((e) => kindOf(e) === "CUSTOM:steps") as Extract<TurnEvent, { name: "steps" }>;
    expect(steps.value.steps).toEqual([{ a: "page", page: "trends" }]);
    expect(events.some((e) => e.type === "STATE_SNAPSHOT")).toBe(false);
    expect(events.at(-1)?.type).toBe("RUN_FINISHED");
  });
  it("a sentence with a figure the screen does not hold is never emitted", () => {
    // the model's own words with its figure in them ("flood deaths 300") reached the title through the q slot (Finding 51)
    const doc = { v: 1, id: "st-x", recipe: "cases", title: "Cases about flood deaths 300", takeaway: null, say: { en: "", ta: "" },
      blocks: [{ kind: "Kpis", id: "s", title: "Severe", items: [{ key: "n", label: "Severe", value: 4, unit: null, prev: null, delta: null, tone: "neutral", spark: [] }] }],
      scope: { period: "weekly", zone: 13, dept: null, cat: null, taluk: null, sev: null }, slots: { q: "flood deaths 300" }, sources: [], asOf: null, notes: [] } as unknown as StageDocT;
    const r = { kind: "do", lang: "en", reply: null, steps: [], stage: doc, stageOp: null, say: "Adyar has 4 severe cases this week. Flood deaths 300 were reported. Zone 13 needs a look.", options: [], rounds: 0, calls: [], model: null, ms: 0, note: null } as AgentResult;
    const out = spokenSentences(r, WORLD).map((s) => s.text);
    expect(out).toContain("Adyar has 4 severe cases this week.");
    expect(out.join(" ")).not.toMatch(/300/);
    expect(out).toContain("Zone 13 needs a look.");
    // a reply with no screen: a figure in it is never said either
    const chat = { ...r, stage: null, say: null, kind: "chat", reply: "Good morning, Collector. You have 12 new cases." } as AgentResult;
    expect(spokenSentences(chat, WORLD).map((s) => s.text)).toEqual(["Good morning, Collector."]);
  });
  it("over HTTP: NDJSON that readEvents reads back in order; an error is a RUN_ERROR, never a stack", async () => {
    const res = roundStream(async (emit) => { emit({ type: "RUN_STARTED", turnId: "h1", round: 0, at: 1 }); emit({ type: "RUN_FINISHED", turnId: "h1", round: 0, out: { done: true, result: null, steps: [], trace: [], tokens: 0, calls: 0, hops: [], lane: "x", cached: false } }); }, { turnId: "h1", round: 0 });
    expect(res.headers.get("content-type")).toBe(NDJSON);
    const got: TurnEvent[] = [];
    await readEvents(res.body!, (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"]);
    const bad = roundStream(async () => { throw new Error("secret stack detail"); }, { turnId: "h2", round: 0 });
    const got2: TurnEvent[] = [];
    await readEvents(bad.body!, (e) => got2.push(e));
    expect(got2.map((e) => e.type)).toEqual(["RUN_ERROR"]);
    expect(JSON.stringify(got2)).not.toMatch(/secret stack/);
  });
});
