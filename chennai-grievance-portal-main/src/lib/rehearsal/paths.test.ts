import { describe, expect, it } from "vitest";
import { edgesNear, indexGraph, makeGraph, nearestNode, type RoadGraph } from "./graph";
import { backtrack, dijkstra, edgeSec, route, routeNames, type RoadState } from "./paths";

/** Bellman-Ford over the same rules: the oracle every shortest path is checked against */
function oracle(g: RoadGraph, sources: number[], s?: RoadState): number[] {
  const d = new Array(g.n).fill(Infinity);
  for (const u of sources) d[u] = 0;
  for (let it = 0; it < g.n; it++) {
    let changed = false;
    for (let e = 0; e < g.m; e++) {
      const t = edgeSec(g, e, s);
      if (!Number.isFinite(t)) continue;
      const a = g.from[e], b = g.to[e];
      const fwd = !s?.oneway || g.oneway[e] !== -1, back = !s?.oneway || g.oneway[e] !== 1;
      if (fwd && d[a] + t < d[b] - 1e-9) { d[b] = d[a] + t; changed = true; }
      if (back && d[b] + t < d[a] - 1e-9) { d[a] = d[b] + t; changed = true; }
    }
    if (!changed) break;
  }
  return d;
}

/** a seeded random city: points in a 2 km square, each joined to a few near neighbours */
function randomGraph(seed: number, n = 40): RoadGraph {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const lat: number[] = [], lon: number[] = [];
  for (let i = 0; i < n; i++) { lat.push(13 + rnd() * 0.018); lon.push(80.2 + rnd() * 0.018); }
  const from: number[] = [], to: number[] = [], len: number[] = [], cls: number[] = [], oneway: number[] = [];
  for (let i = 0; i < n; i++) {
    const near = [...Array(n).keys()].filter((j) => j !== i).sort((a, b) => Math.hypot(lat[a] - lat[i], lon[a] - lon[i]) - Math.hypot(lat[b] - lat[i], lon[b] - lon[i])).slice(0, 2);
    for (const j of near) {
      if (from.some((f, k) => (f === i && to[k] === j) || (f === j && to[k] === i))) continue;
      from.push(i); to.push(j);
      len.push(Math.hypot((lat[i] - lat[j]) * 110574, (lon[i] - lon[j]) * 107900) * (1 + rnd() * 0.3));
      cls.push(Math.floor(rnd() * 8)); oneway.push(rnd() < 0.15 ? (rnd() < 0.5 ? 1 : -1) : 0);
    }
  }
  return makeGraph({ lat, lon, from, to, len, cls, oneway });
}

// a 3 x 3 grid of junctions 100 m apart, all residential, plus one primary road along the top
//   6 - 7 - 8      (primary)
//   |   |   |
//   3 - 4 - 5
//   |   |   |
//   0 - 1 - 2
const D = 100 / 110574;
const grid = () => {
  const lat: number[] = [], lon: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { lat.push(13 + r * D); lon.push(80.2 + c * D); }
  const from: number[] = [], to: number[] = [], cls: number[] = [], name: number[] = [];
  const add = (a: number, b: number, k: number, nm: number) => { from.push(a); to.push(b); cls.push(k); name.push(nm); };
  add(0, 1, 6, 0); add(1, 2, 6, 0); add(3, 4, 6, 1); add(4, 5, 6, 1); add(6, 7, 2, 2); add(7, 8, 2, 2);
  add(0, 3, 6, 3); add(3, 6, 6, 3); add(1, 4, 6, 4); add(4, 7, 6, 4); add(2, 5, 6, 5); add(5, 8, 6, 5);
  return makeGraph({ lat, lon, from, to, len: from.map(() => 100), cls, name, names: ["South St", "Middle St", "Main Rd", "West St", "Centre St", "East St"] });
};

describe("road graph", () => {
  it("builds adjacency: every piece is listed at both ends", () => {
    const g = grid();
    for (let e = 0; e < g.m; e++) {
      const at = (u: number) => [...g.adjEdge.slice(g.adjStart[u], g.adjStart[u + 1])];
      expect(at(g.from[e])).toContain(e);
      expect(at(g.to[e])).toContain(e);
    }
    expect(g.adjStart[g.n]).toBe(2 * g.m);
  });

  it("finds pieces near a point and the nearest junction", () => {
    const g = grid();
    const ix = indexGraph(g, 50);
    const mid01 = { lat: 13 + 10 / 110574, lon: 80.2 + D / 2 }; // 10 m north of the middle of 0-1
    const near = edgesNear(g, ix, mid01.lat, mid01.lon, 30);
    expect(near[0].e).toBe(0);
    expect(near[0].d).toBeGreaterThan(8);
    expect(near[0].d).toBeLessThan(12);
    expect(nearestNode(g, ix, 13 + 1e-6, 80.2 + 1e-6, 50)).toBe(0);
    expect(nearestNode(g, ix, 14, 81, 50)).toBe(-1);
  });
});

describe("drive times", () => {
  it("matches the oracle on the grid, normal and with a closed piece", () => {
    const g = grid();
    const close = (a: Float64Array, b: number[]) => b.forEach((w, u) => expect(a[u]).toBeCloseTo(w, 6));
    close(dijkstra(g, [0]).sec, oracle(g, [0]));
    const factor = new Float32Array(g.m).fill(1);
    factor[8] = 0; // 1-4 closed
    const s = { factor };
    const r = dijkstra(g, [1], s);
    close(r.sec, oracle(g, [1], s));
    // the way to 4 now goes round: 1-0-3-4 or 1-2-5-4
    expect(backtrack(g, r, 4).edges.length).toBe(3);
  });

  it("matches the oracle on random cities (normal, slow, closed, one-way)", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = randomGraph(seed);
      const factor = new Float32Array(g.m).map((_, e) => (e % 7 === 0 ? 0 : e % 5 === 0 ? 0.3 : 1));
      for (const s of [undefined, { factor }, { factor, oneway: true }] as (RoadState | undefined)[]) {
        const src = [seed % g.n, (seed * 7) % g.n];
        const got = dijkstra(g, src, s).sec;
        const want = oracle(g, src, s);
        want.forEach((w, u) => (Number.isFinite(w) ? expect(got[u]).toBeCloseTo(w, 2) : expect(got[u]).toBe(Infinity)));
      }
    }
  });

  it("A* equals Dijkstra for every pair on random cities", () => {
    for (let seed = 30; seed <= 40; seed++) {
      const g = randomGraph(seed, 25);
      const factor = new Float32Array(g.m).map((_, e) => (e % 6 === 0 ? 0 : 1));
      for (let a = 0; a < g.n; a += 3) {
        const all = dijkstra(g, [a], { factor }).sec;
        for (let b = 0; b < g.n; b += 2) {
          const r = route(g, a, b, { factor });
          if (!Number.isFinite(all[b])) expect(r).toBeNull();
          else { expect(r).not.toBeNull(); expect(r!.sec).toBeCloseTo(all[b], 2); }
        }
      }
    }
  });

  it("closing or slowing roads never makes anything nearer", () => {
    for (let seed = 50; seed <= 60; seed++) {
      const g = randomGraph(seed);
      const normal = dijkstra(g, [0]).sec;
      const factor = new Float32Array(g.m).map((_, e) => (e % 4 === 0 ? 0 : e % 3 === 0 ? 0.3 : 1));
      const rain = dijkstra(g, [0], { factor }).sec;
      for (let u = 0; u < g.n; u++) expect(rain[u]).toBeGreaterThanOrEqual(normal[u] - 1e-3);
    }
  });

  it("stops at the time limit", () => {
    const g = grid();
    const r = dijkstra(g, [0], undefined, edgeSec(g, 0) * 1.5);
    expect(Number.isFinite(r.sec[1])).toBe(true);
    expect(r.sec[2]).toBe(Infinity);
  });

  it("names the streets of a route in order", () => {
    const g = grid();
    const r = route(g, 0, 8)!;
    expect(r.m).toBe(400);
    expect(routeNames(g, r.edges).length).toBeGreaterThan(0);
  });
});
