import { afterEach, describe, expect, it } from "vitest";
import { serverClock } from "@/lib/thunai/stagetime";
import { resetTrace, stamp, stampServer, traceLane, traceRows, traces, traceStart } from "./trace";

afterEach(() => resetTrace());

describe("the per-stage trace (v5 6.4)", () => {
  it("measures from the last voiced sample, and the first stamp of a stage wins", () => {
    traceStart(1000);
    stamp("eou", 1300);
    stamp("uploadSent", 1310);
    stamp("uploadSent", 1900);
    traceLane("planner");
    const t = traces()[0];
    expect(traceRows(t)).toEqual([{ stage: "voicedEnd", ms: 0 }, { stage: "eou", ms: 300 }, { stage: "uploadSent", ms: 310 }]);
    expect(t.lane).toBe("planner");
  });

  it("places a server's offsets at the browser stage that sent the request", () => {
    traceStart(0);
    stamp("uploadSent", 150);
    stampServer("uploadSent", { sttSent: 5, sttBack: 470 });
    expect(traceRows(traces()[0]).map((r) => [r.stage, r.ms])).toEqual([["voicedEnd", 0], ["uploadSent", 150], ["sttSent", 155], ["sttBack", 620]]);
  });

  it("does nothing with no turn open, and keeps at most 20 turns", () => {
    stamp("eou", 5);
    expect(traces()).toEqual([]);
    for (let i = 0; i < 25; i++) traceStart(i);
    expect(traces().length).toBe(21);
  });

  it("holds timings only: a trace has numbers and a lane, never words", () => {
    traceStart(0);
    stamp("gateDone", 40);
    expect(JSON.stringify(traces()[0])).toMatch(/^\{"n":\d+,"zero":0,"at":\{"voicedEnd":0,"gateDone":40\},"lane":null\}$/);
  });

  it("a route's clock gives offsets from its receipt of the request", () => {
    const c = serverClock();
    c.mark("sttSent");
    c.mark("sttSent");
    const t = c.timing();
    expect(Object.keys(t)).toEqual(["sttSent"]);
    expect(t.sttSent).toBeGreaterThanOrEqual(0);
  });
});

describe("the server's stage times on the browser clock", () => {
  it("epoch times are placed at their offset from the time origin; unknown stages and non-numbers are left out", async () => {
    const { stampEpoch } = await import("./trace");
    traceStart(100);
    stampEpoch({ plannerSent: 1_000_200, plannerBack: 1_001_400, bogus: 5, toolsDone: Number.NaN } as Record<string, number>, 1_000_000);
    expect(traceRows(traces()[0]).map((r) => [r.stage, r.ms])).toEqual([["voicedEnd", 0], ["plannerSent", 100], ["plannerBack", 1300]]);
  });
});
