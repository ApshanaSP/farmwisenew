/**
 * v7 review (3B, 3D, 3E): round.ts's handling of the aide's streamed answer. The writer's model is a test double; the gap's web look-up is
 * off (JARVIS_AIDE_WEB=0), so nothing leaves the process.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "./events";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import type { Rung } from "./llm";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";
import type { OpenRung } from "./aide7/stream";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string): RoundBodyT => RoundBody.parse({ turnId: "turn7", round: 0, text, state: STATE, turns: [], stage: null, direct: null });
const RUNGS: Rung[] = [{ provider: "groq", model: "qwen/qwen3.8-27b" }];
type Text = Extract<TurnEvent, { type: "TEXT_MESSAGE_CONTENT" }>;
const texts = (events: TurnEvent[]) => events.filter((e): e is Text => e.type === "TEXT_MESSAGE_CONTENT");

/** the facts' line holding a zone and a figure, as the model reads it */
const factOf = (prompt: string) => [...prompt.matchAll(/^(F\d+) \[[^\]]+\] (.*)$/gm)]
  .map((m) => ({ id: m[1], zone: m[2].match(/\b(Adyar|Royapuram|Anna Nagar)\b/)?.[1] ?? "The record", n: m[2].match(/\b(\d{1,4})\b(?!\s*(?:hours?|days?|weeks?))/)?.[1] })).find((x) => x.n);
const llm = { generate: (async () => { throw new Error("no planner in this test"); }) as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false };

describe("v7 review: round.ts and the aide's streamed answer", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-round7-"))); vi.stubEnv("JARVIS_AIDE_WEB", "0"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("3B: a code-written line (the gap's fallback, naming a dashboard row's outlet) carries only the screen's facts' figures; checked model sentences keep their own", async () => {
    vi.stubEnv("JARVIS_AIDE_WEB", "1");
    // the outlets' feeds are never read here: the dashboard's news answers the gap first (and a network call would fail the test)
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in this test"); }));
    const row = { publisher: "Channel 913 News", title: "Governor visiting Adyar today, 47 officers on duty", url: "https://example.com/governor", t: null };
    const hands = fakeHands({ search_records: () => ({ ok: true, data: { news: [row] }, facts: [] }) } as never);
    for (const gapSays of ["checked", "nothing"] as const) {
      clearCaches();
      // the first call names the gap and ends its checked sentence without a newline; the gap's call (about the report) says a checked
      // sentence with the report's own figure, or nothing (then the gap's code fallback names the outlet)
      const open: OpenRung = async (rung, c, onText) => {
        if (/only this part/.test(c.prompt)) {
          const f = c.prompt.match(/^(F\d+) \[/m)?.[1];
          if (gapSays === "checked" && f) onText(`S: The report says 47 officers are on duty for it. [${f}]\n`);
        } else {
          const f = factOf(c.prompt);
          onText("GAP: the Governor visiting\n");
          if (f) onText(`S: ${f.zone} shows ${f.n} on this count. [${f.id}]`);
        }
        return { provider: rung.provider, model: rung.model, tokens: 50, firstMs: 1, ms: 2, stop: null };
      };
      const events: TurnEvent[] = [];
      await planRound(body("what is happening in Adyar and is the Governor visiting"), WORLD, hands, "u", undefined, undefined,
        { llm, emit: (e) => events.push(e), aide: { open, rungs: () => RUNGS } });
      const snap = events.find((e): e is Extract<TurnEvent, { type: "STATE_SNAPSHOT" }> => e.type === "STATE_SNAPSHOT");
      const facts = new Set(snap?.snapshot.stage.voice?.figures ?? []);
      expect(facts.has(913)).toBe(false);
      expect(facts.has(47)).toBe(false);
      const said = texts(events);
      const model = said.find((e) => /on this count/.test(e.delta));
      expect(model).toBeTruthy();
      expect(model!.figures).toContain(Number(model!.delta.match(/\b(\d{1,4})\b/)![1]));
      if (gapSays === "checked") {
        // a web or dashboard report's figure, checked against the report: not on the screen, so it must come with its sentence
        const gap = said.find((e) => /47 officers/.test(e.delta));
        expect(gap?.figures).toContain(47);
      } else {
        const fb = said.find((e) => /has a report on that/.test(e.delta));
        expect(fb?.delta).toMatch(/913/);
        // the browser would let 913 through for this line if the server called it checked: it is a row's outlet name, no checker held it
        expect(fb?.figures ?? []).not.toContain(913);
      }
    }
  });

  it("3D: a barge-in during the writer's Claude stream (the SDK's abort keeps the name \"Error\") ends the round as an abort: no warning, no v6 line into a dead stream", async () => {
    const ctl = new AbortController();
    const open: OpenRung = async () => { ctl.abort(); throw new Error("Request was aborted."); };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events: TurnEvent[] = [];
    await expect(planRound(body("what is happening in Adyar"), WORLD, fakeHands(), "u", undefined, ctl.signal,
      { llm, emit: (e) => events.push(e), aide: { open, rungs: () => RUNGS } })).rejects.toThrow();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("[jarvis aide]"))).toHaveLength(0);
    expect(texts(events)).toHaveLength(0);
    expect(events.some((e) => e.type === "RUN_FINISHED")).toBe(false);
  });

  it("3E: the aide fails after the ready screen went up: v6's line is said without \"Reading them now\" (no item will be read: the screen has the aide's voice)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const events: TurnEvent[] = [];
    const o = await planRound(body("show me the latest news"), WORLD, fakeHands(), "u", undefined, undefined,
      { llm, emit: (e) => events.push(e), aide: { open: (async () => { throw new Error("unused"); }) as OpenRung, rungs: () => { throw new Error("the rungs broke"); } } });
    const snap = events.find((e): e is Extract<TurnEvent, { type: "STATE_SNAPSHOT" }> => e.type === "STATE_SNAPSHOT");
    expect(snap?.snapshot.stage.recipe).toBe("news");
    expect(snap?.snapshot.stage.voice?.by).toBe("aide7");
    const said = texts(events).map((e) => e.delta);
    expect(said.join(" ")).toMatch(/headline/);
    expect(said.join(" ")).not.toMatch(/Reading them now/i);
    expect(o.result?.say ?? "").not.toMatch(/Reading them now/i);
    expect(o.result?.stage?.say.en ?? "").not.toMatch(/Reading them now/i);
  });
});
