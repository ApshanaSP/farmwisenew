/**
 * D2 (v5 build): the applied echo canceller and the last turn's trace are shown only in the measurement view (JarvisLogView),
 * never in the bottom bar (rule 6). Timings and the echo setting only: no words of any sentence.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { measureLines } from "./hudstore";

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");

describe("the measurement view's lines", () => {
  it("the echo canceller the track reports, and the last turn's stages in ms from its last voiced sample", () => {
    const rows = [{ stage: "voicedEnd", ms: 0 }, { stage: "eou", ms: 310 }, { stage: "uploadSent", ms: 312 }, { stage: "hearBack", ms: 820 }];
    expect(measureLines("on", { rows, lane: "planner" }, false)).toEqual(["Echo cancellation: on", "Last turn (planner): eou 310 ms · uploadSent 312 ms · hearBack 820 ms"]);
    expect(measureLines("all", null, false)).toEqual(["Echo cancellation: all"]);
    expect(measureLines(null, { rows, lane: null }, false)).toEqual(["Last turn: eou 310 ms · uploadSent 312 ms · hearBack 820 ms"]);
  });
  it("nothing measured, nothing shown (a turn with only its zero is not a turn)", () => {
    expect(measureLines(null, null, false)).toEqual([]);
    expect(measureLines(null, { rows: [{ stage: "voicedEnd", ms: 0 }], lane: null }, false)).toEqual([]);
  });
  it("in Tamil the labels are Tamil; the stage names and numbers stay as measured", () => {
    const [a, b] = measureLines("on", { rows: [{ stage: "voicedEnd", ms: 0 }, { stage: "eou", ms: 300 }], lane: "rules" }, true);
    expect(a).toMatch(/: on$/);
    expect(a).not.toMatch(/Echo/);
    expect(b).toMatch(/eou 300 ms$/);
  });
});

describe("where they show: the measurement view, never the bottom bar", () => {
  it("JarvisLogView shows them, from the hud's strip.echo and the trace", () => {
    const v = read("JarvisLogView.tsx");
    expect(v).toContain("measureLines(");
    expect(v).toContain("traceRows(");
    expect(v).toMatch(/strip\.echo/);
  });
  it("the bottom bar (Hud.tsx) draws neither", () => {
    const h = read("Hud.tsx");
    expect(h).not.toMatch(/strip\.echo|measureLines|traceRows/);
  });
});
