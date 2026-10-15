import { describe, expect, it } from "vitest";
import { chain, simplify } from "./geo";

describe("map outlines", () => {
  it("joins segments that share end points, in any order or direction, into one line", () => {
    const segs = [[[2, 0], [3, 0]], [[0, 0], [1, 0]], [[2, 0], [1, 0]], [[4, 0], [3, 0]]];
    const out = chain(segs);
    expect(out).toHaveLength(1);
    const xs = out[0].map((p) => p[0]);
    expect(xs.join()).toMatch(/^(0,1,2,3,4|4,3,2,1,0)$/);
  });

  it("keeps separate pieces apart", () => {
    expect(chain([[[0, 0], [1, 0]], [[5, 5], [6, 5]]])).toHaveLength(2);
  });

  it("drops points that lie within the tolerance of a straight edge and keeps corners", () => {
    const line: [number, number][] = [[0, 0], [0, 1], [0.00001, 2], [0, 3], [5, 3]];
    expect(simplify(line, 0.0001)).toEqual([[0, 0], [0, 3], [5, 3]]);
  });

  it("leaves tiny rings alone", () => {
    const tri: [number, number][] = [[0, 0], [1, 1], [0, 0]];
    expect(simplify(tri, 1)).toEqual(tri);
  });
});
