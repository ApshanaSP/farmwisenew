/**
 * v10: the narrated district tour (tour10.ts): stops from a hotspot answer, one line each from its own numbers (at most 20 words), the camera's
 * shot for each, the check-in after stop 3, next / back / repeat / stop / go deeper, and the tour's questions read by the map's rules (no AI).
 */
import { describe, expect, it } from "vitest";
import { deptFromWords } from "@/lib/assistant/deptwords";
import type { RefNames } from "@/lib/assistant/scope";
import { fixtureResolver } from "@/lib/map/fixture";
import { makeResolver } from "@/lib/map/resolve";
import { rulesRoute, type RouteEnv } from "@/lib/map/route";
import { firstMove, introLine, startTour, stopLine, TOUR_Q, tourStep, tourStops, type TourState } from "./tour10";
import { hotspotAnswer } from "./mapfix.testkit";

const W = { en: "today", ta: "இன்று" };
const wordsIn = (s: string) => s.replace(/^\d+\.\s*/, "").split(/\s+/).filter(Boolean).length;

describe("the tour's stops", () => {
  it("are the answer's clusters, biggest first, with their own numbers, their ward and the shot that flies there", () => {
    const st = tourStops(hotspotAnswer(5), "hotspots");
    expect(st.map((s) => s.n)).toEqual([10, 9, 8, 7, 6]);
    expect(st[0]).toMatchObject({ name: "Kasimedu", place: { en: "near Kasimedu, Ward 40" }, open: 9, severe: 2, shot: 1 });
    expect(st[2]).toMatchObject({ name: "Ward 42", place: { en: "Ward 42", ta: "வார்டு 42" }, shot: 3 });
    expect(st[3].shot).toBe(null);
    expect(st[0].line.en).toBe("1. Near Kasimedu, Ward 40: 10 reports, 9 still open, 2 severe; the biggest cluster.");
    expect(st[1].line.ta).toBe("2. Royapuram அருகே, வார்டு 41: 9 அறிக்கைகள், 8 திறந்தவை, 2 கடுமையானவை.");
  });
  it("each line is at most 20 words, every number in it is the stop's own", () => {
    for (const source of ["hotspots", "news", "flood"] as const) {
      for (const s of tourStops(hotspotAnswer(7), source, 9)) {
        expect(wordsIn(s.line.en), s.line.en).toBeLessThanOrEqual(20);
        const nums = (s.line.en.replace(/^\d+\.\s*/, "").replace(/Ward \d+/, "").match(/\d+/g) ?? []).map(Number);
        for (const n of nums) expect([s.n, s.open, s.severe], s.line.en).toContain(n);
      }
    }
    expect(stopLine({ id: "x", place: { en: "Ward 9", ta: "வார்டு 9" }, name: "Ward 9", lat: 0, lon: 0, ids: [], n: 3, open: 3, severe: 0, shot: null }, 2, "news").en).toBe("2. Ward 9: 3 reports in the news, all still open.");
  });
  it("five stops by default, nine for the full round; none from an answer with no clusters", () => {
    expect(startTour(hotspotAnswer(7), "hotspots", "q", W)!.stops).toHaveLength(5);
    expect(startTour(hotspotAnswer(7), "hotspots", "q", W, true)!.stops).toHaveLength(7);
    expect(startTour(hotspotAnswer(0), "hotspots", "q", W)).toBe(null);
  });
});

describe("steering the tour", () => {
  const s0 = startTour(hotspotAnswer(5), "hotspots", "hotspots of open incidents today", W) as TourState;
  it("the intro says how many stops, which, and how to steer, then stop 1", () => {
    expect(introLine(s0).en).toBe("Hotspots today: 5 stops, Kasimedu, Royapuram and Ward 42 and more. Say next, back, stop or go deeper.");
    const m = firstMove(s0);
    expect(m.stop?.id).toBe("c0");
    expect(m.say.en).toMatch(/^Hotspots today: 5 stops.*1\. Near Kasimedu/);
    expect(m.say.ta).toMatch(/இடங்கள்/);
  });
  it("next, back and repeat move stop by stop; back at the first stop says so", () => {
    let s = firstMove(s0).s;
    let m = tourStep(s, "next");
    expect(m.stop?.id).toBe("c1"); s = m.s;
    m = tourStep(s, "back");
    expect(m.stop?.id).toBe("c0"); s = m.s;
    m = tourStep(s, "back");
    expect(m.stop?.id).toBe("c0");
    expect(m.say.en).toMatch(/^This is the first stop\. 1\./);
    expect(tourStep(s, "repeat").stop?.id).toBe("c0");
  });
  it("after the third stop it asks before going on, once", () => {
    let s = firstMove(s0).s;
    s = tourStep(s, "next").s;
    const m3 = tourStep(s, "next");
    expect(m3.s.check).toBe(true);
    expect(m3.say.en).toMatch(/Shall I go on\? 2 more: Adyar and Velachery\.$/);
    expect(m3.say.ta).toMatch(/தொடரவா\? இன்னும் 2/);
    const m4 = tourStep(m3.s, "next");
    expect(m4.stop?.id).toBe("c3");
    expect(m4.s.check).toBe(false);
    // back to stop 3 does not ask again
    expect(tourStep(m4.s, "back").s.check).toBe(false);
  });
  it("the last stop says it is the last; next after it ends the tour", () => {
    let s = firstMove(s0).s;
    for (let i = 0; i < 4; i++) s = tourStep(s, "next").s;
    expect(s.i).toBe(4);
    expect(tourStep(s, "repeat").say.en).toMatch(/That was the last stop\./);
    const end = tourStep(s, "next");
    expect(end.end).toBe(true);
    expect(end.s.phase).toBe("done");
  });
  it("stop ends it; go deeper keeps the stop and marks the tour to come back to", () => {
    const s = firstMove(s0).s;
    const st = tourStep(s, "stop");
    expect(st.end).toBe(true);
    expect(st.s.phase).toBe("stopped");
    expect(tourStep(st.s, "next").end).toBe(true);
    const d = tourStep(s, "deeper");
    expect(d.stop?.id).toBe("c0");
    expect(d.s.deeper).toBe(true);
    expect(tourStep(d.s, "next").s.deeper).toBe(false);
  });
});

describe("the tour's questions", () => {
  const resolve = makeResolver(fixtureResolver());
  const names = { zones: new Map(), cats: new Map(), taluks: new Map(), depts: new Map() } as unknown as RefNames;
  const env: RouteEnv = { resolve, dept: (t) => deptFromWords(t, names)?.code ?? null };
  it("are hotspot plans read by the map's rules, with no AI", () => {
    for (const [source, qs] of Object.entries(TOUR_Q)) {
      for (const { q } of qs) {
        const r = rulesRoute(q, null, env);
        expect(r?.kind, `${source}: ${q}`).toBe("plan");
        if (r?.kind === "plan") {
          expect(r.plan.steps.some((s) => s.op === "hotspot"), q).toBe(true);
          const take = r.plan.steps.find((s) => s.op === "take");
          if (source === "news" && take?.op === "take") expect(take.filter?.news, q).toBe(true);
          if (source === "flood" && take?.op === "take") expect(take.filter?.family, q).toEqual(["FLOOD"]);
        }
      }
    }
  });
});
