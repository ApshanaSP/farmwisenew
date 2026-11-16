import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { modelCounts, pairRows, resultRows, resultTotal } from "./evalpair";

const tmp = (name: string, data: unknown) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "jv-pair-")); const f = path.join(d, name); fs.writeFileSync(f, JSON.stringify(data)); return f; };

describe("evalpair: b, c and p only", () => {
  const x = [{ id: "a", ok: true, model: "m1" }, { id: "b", ok: true, model: "m2" }, { id: "c", ok: false, capacity: true }, { id: "d", ok: true, model: "m1" }];
  const y = [{ id: "a", ok: false, model: "m1" }, { id: "b", ok: true, model: "m1" }, { id: "c", ok: true, model: "m2" }, { id: "d", ok: false, model: "m1" }];

  it("pairs by id and reports only counts and p", () => {
    const out = pairRows(x, y);
    expect(out).toEqual({ n: 4, b: 2, c: 1, p: 1, midP: expect.any(Number), capacityX: 1, capacityY: 0 });
    expect(Object.keys(out).sort()).toEqual(["b", "c", "capacityX", "capacityY", "midP", "n", "p"]);
  });

  it("reads a runner's result file, its total and its models", () => {
    const f = tmp("r.json", { summary: { all: { right: 3 } }, rows: x });
    expect(resultRows(f).length).toBe(4);
    expect(resultTotal(f)).toBe(3);
    expect(modelCounts(resultRows(f))).toEqual({ m1: 2, m2: 1, none: 1 });
    const g = tmp("s.json", { rows: y });
    expect(resultTotal(g)).toBe(2);
  });

  it("refuses runs on different sentences", () => {
    expect(() => pairRows(x, y.slice(0, 3))).toThrow(/same sentences/);
  });
});

describe("the repeats (11.3): a seeded subset and pass^k over three runs", () => {
  it("the subset is seeded, fixed and a subset", async () => {
    const { seededIds } = await import("./evalpair");
    const ids = Array.from({ length: 60 }, (_, i) => `x${i}`);
    const a = seededIds(ids, 20, 20261116), b = seededIds(ids, 20, 20261116);
    expect(a).toEqual(b);
    expect(a).toHaveLength(20);
    expect(new Set(a).size).toBe(20);
    expect(a.every((x) => ids.includes(x))).toBe(true);
  });
  it("pass^1, pass^3 and the majority, a capacity failure counting as wrong", async () => {
    const { repeatStats } = await import("./evalpair");
    const run = (oks: boolean[], cap: boolean[] = []) => oks.map((ok, i) => ({ id: `s${i}`, ok, capacity: !!cap[i] }));
    const s = repeatStats([run([true, true, false]), run([true, false, false]), run([true, true, true], [false, false, true])]);
    expect(s).toMatchObject({ n: 3, rightAll: 1, rightOnce: 2, majority: 2, capacityRows: 1 });
    expect(s.pass1).toBeCloseTo((3 / 3 + 2 / 3 + 0) / 3, 10);
    expect(s.pass3).toBeCloseTo(1 / 3, 10);
    expect(() => repeatStats([run([true]), run([true])])).toThrow();
  });
});
