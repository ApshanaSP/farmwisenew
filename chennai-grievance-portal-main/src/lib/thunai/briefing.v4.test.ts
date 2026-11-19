import { describe, expect, it } from "vitest";
import { BRIEF_END, BRIEF_MAX, buildBrief, type Standing } from "./briefing";
import { buildSignals, type WatchInput } from "./signals";
import { allowedSet, gateChunk } from "./numbergate";
import { labelIn } from "./speechcheck";

const AS_OF = "2026-11-14 18:00:00";
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);
const input = (over: Partial<WatchInput> = {}): WatchInput => ({ asOf: AS_OF, series: [], overdue: null, rain: [], lakes: [], warning: null, gaps: null, followed: [], studio: [], ...over });
const STANDING: Standing = { reported: 158, open: 392, overdue: 76, severe: 4, asOf: AS_OF,
  conditions: { rainMax: 12, rainAt: "Nungambakkam", lakeMax: 63, lakeAt: "Puzhal", t: AS_OF } };
const NONE: Standing = { reported: null, open: null, overdue: null, severe: null, asOf: null };

describe("the Collector's brief", () => {
  it("bottom line first, three to five items with source chips, and an explicit end", () => {
    const sig = buildSignals(input({ series: [{ dim: "zonecat", zone: 5, dept: null, cat: "DRAINAGE_SEWAGE", counts: [...flat(54, 5), 20, 22] }],
      rain: [{ place: "Nungambakkam", value: 72, t: AS_OF }], gaps: { n: 3, asOf: AS_OF } }));
    const b = buildBrief(sig, STANDING, AS_OF);
    expect(b.items.length).toBeGreaterThanOrEqual(3);
    expect(b.items.length).toBeLessThanOrEqual(5);
    for (const it of b.items) { expect(it.source.name.en).toBeTruthy(); expect(it.source.fresh.en).toBeTruthy(); }
    expect(b.spoken.en[0]).toMatch(/^Bottom line: one thing needs you first, the rise in reports in Royapuram\.$/);
    expect(b.spoken.en[b.spoken.en.length - 1]).toBe("That's everything for now.");
    expect(b.spoken.ta[b.spoken.ta.length - 1]).toBe("இப்போதைக்கு இவ்வளவுதான்.");
    expect(b.dropped).toBe(0);
    expect(b.told.map((t) => t.key)).toContain("rise:zonecat:5::DRAINAGE_SEWAGE");
  });
  it("a quiet day still gives three items from the console's own counts, and still ends", () => {
    const b = buildBrief([], STANDING, AS_OF);
    expect(b.spoken.en[0]).toBe("Bottom line: nothing unusual in the data right now.");
    expect(b.items.map((i) => i.id)).toEqual(["standing:overdue", "standing:today", "standing:conditions"]);
    expect(b.spoken.en).toContain("76 cases are past their deadline, out of 392 still open.");
    expect(b.spoken.en.at(-1)).toBe(BRIEF_END.en);
  });
  it("with no data at all it says so and ends", () => {
    const b = buildBrief([], NONE, AS_OF);
    expect(b.items).toEqual([]);
    expect(b.spoken.en).toEqual(["Bottom line: nothing unusual in the data right now.", BRIEF_END.en]);
  });
  it("always ends, never runs past five items, and every spoken line passes the gates with the brief's own values (300 random briefs)", () => {
    let seed = 3;
    const r = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
    for (let k = 0; k < 300; k++) {
      const series = Array.from({ length: Math.floor(r() * 12) }, (_, i) => ({ dim: "zonecat" as const, zone: 1 + (i % 15), dept: null, cat: i % 2 ? "ROAD_DAMAGE" : "FLOOD_WATERLOGGING",
        counts: [...flat(54, 2 + Math.floor(r() * 10)), 30 + Math.floor(r() * 40), 30 + Math.floor(r() * 40)] }));
      const sig = buildSignals(input({ series, rain: r() < 0.5 ? [{ place: "G", value: r() * 250, t: AS_OF }] : [], warning: r() < 0.2 ? { level: 3, t: AS_OF } : null,
        overdue: [10, 10, 10, 10, 10, 10, 10, 10, 30, 40] }), { maxRises: 12 });
      const st: Standing = r() < 0.3 ? NONE : { ...STANDING, overdue: Math.floor(r() * 100), severe: Math.floor(r() * 5) };
      const b = buildBrief(sig, st, AS_OF);
      expect(b.items.length).toBeLessThanOrEqual(BRIEF_MAX);
      for (const lang of ["en", "ta"] as const) {
        const lines = b.spoken[lang];
        expect(lines.at(-1)).toBe(BRIEF_END[lang]);
        expect(lines.filter((l) => l === BRIEF_END[lang])).toHaveLength(1);
        const allowed = allowedSet(Object.values(b.values));
        for (const l of lines) { expect(gateChunk(l, allowed).ok, l).toBe(true); expect(labelIn(l)).toBeNull(); }
      }
      expect(b.dropped).toBe(0);
    }
  });
  it("a line that would say a figure the brief does not hold is dropped, never said", () => {
    const [s] = buildSignals(input({ gaps: { n: 3, asOf: AS_OF } }));
    const bad = { ...s, text: { en: "Seven hundred cases came in.", ta: "எழுநூறு கேஸ்கள் வந்தன." } };
    const b = buildBrief([bad], NONE, AS_OF);
    expect(b.spoken.en).not.toContain("Seven hundred cases came in.");
    expect(b.dropped).toBe(2);
    expect(b.spoken.en.at(-1)).toBe(BRIEF_END.en);
  });
});
