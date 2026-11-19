/**
 * Review (Phase 7, proactive MEDIUMs, server part): a rain gauge's reading up to 48 hours old was said as "in the last 24 hours", and an
 * extremely heavy one (204.5 mm or more) was life-safety however old, so a stale reading could interrupt quiet hours. The line now says
 * the 24 hours the gauge really measured, in words from code, and only a reading of the last 24 hours is life-safety. A followed change
 * the brief told is found again by its signal key (followsTold), so the brief route can mark it seen.
 */
import { describe, expect, it } from "vitest";
import { buildSignals, followsTold, type Follow, type WatchInput, type WatchSignal } from "./signals";
import { allowedSet, gateChunk } from "./numbergate";
import { labelIn } from "./speechcheck";

const AS_OF = "2026-11-14 18:00:00";
const base = (over: Partial<WatchInput> = {}): WatchInput => ({ asOf: AS_OF, series: [], overdue: null, rain: [], lakes: [], warning: null, gaps: null, followed: [], studio: [], ...over });
const rainOf = (t: string, value = 230) => buildSignals(base({ rain: [{ place: "Nungambakkam", value, t }] })).find((s) => s.kind === "rain") as WatchSignal;
const sayable = (s: WatchSignal) => { const a = allowedSet(Object.values(s.values)); for (const l of [s.text.en, s.text.ta]) { expect(gateChunk(l, a).ok, l).toBe(true); expect(labelIn(l), l).toBeNull(); } };

describe("a rain gauge's 24 hours are said as the gauge measured them", () => {
  it("a reading of the last few hours: in the last 24 hours, and extremely heavy is life-safety", () => {
    const s = rainOf("2026-11-14 16:30:00");
    expect(s.text.en).toMatch(/230 millimetres in the last 24 hours/);
    expect(s.text.ta).toMatch(/கடந்த 24 மணி நேரத்துல/);
    expect(s.lifeSafety).toBe(true);
    sayable(s);
  });
  it("this morning's reading: the 24 hours to earlier today, never the last 24 hours", () => {
    const s = rainOf("2026-11-14 08:30:00");
    expect(s.text.en).not.toMatch(/last 24 hours/);
    expect(s.text.en).toMatch(/230 millimetres in the 24 hours to earlier today/);
    expect(s.text.ta).not.toMatch(/கடந்த 24/);
    expect(s.lifeSafety).toBe(true);
    sayable(s);
  });
  it("yesterday's reading, 30 hours old: the 24 hours to yesterday, and not life-safety", () => {
    const s = rainOf("2026-11-13 12:00:00");
    expect(s.text.en).not.toMatch(/last 24 hours/);
    expect(s.text.en).toMatch(/in the 24 hours to yesterday/);
    expect(s.text.ta).toMatch(/நேத்து/);
    expect(s.lifeSafety).toBe(false);
    sayable(s);
  });
  it("a reading over 48 hours old raises nothing, as before", () => {
    expect(buildSignals(base({ rain: [{ place: "Old", value: 250, t: "2026-11-12 08:30:00" }] }))).toEqual([]);
  });
});

describe("the brief's followed items are found again by their keys", () => {
  const follows: Follow[] = [
    { id: "f1", kind: "incident", ref: "INC-2026-004", at: "2026-11-10 10:00:00", snap: { open: true } },
    { id: "f2", kind: "zone", ref: "13", at: "2026-11-10 10:00:00", snap: { openN: 40 } },
    { id: "f3", kind: "incident", ref: "INC-2026-0041", at: "2026-11-10 10:00:00", snap: { open: true } }
  ];
  it("an incident's and a zone's change keys name their follows; other keys name none", () => {
    expect(followsTold(["followed:incident:INC-2026-004:closed", "rain:nungambakkam"], follows).map((f) => f.id)).toEqual(["f1"]);
    expect(followsTold(["followed:zone:13:open:52"], follows).map((f) => f.id)).toEqual(["f2"]);
    expect(followsTold(["rise:zone:13::", "standing:today"], follows)).toEqual([]);
  });
});
