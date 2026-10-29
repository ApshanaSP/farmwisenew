/**
 * Calibration (run once, by hand: npx vitest run --config vitest.golden.config.ts src/lib/rehearsal/calibrate.golden.ts):
 * tries the flood memory's settings on the rains BEFORE 21 Oct 2026 only, picks the best by lift over random streets
 * of the same length (with at least 10 km marked as likely, so the list is useful), then reports how that choice does
 * on the 21–23 Oct rain, which it never saw. Prints a table; asserts nothing about the numbers.
 */
import { describe, it } from "vitest";
import { buildMemory, type MemoryOpts } from "./memory";
import { haveRealData, realData } from "./realdata";
import { judge, rainReports, replayAsOf } from "./replay";

describe.skipIf(!haveRealData() || process.env.CALIBRATE !== "1")("flood memory calibration", () => {
  it("chooses the settings on earlier rains and tests them on 21–23 Oct", () => {
    const { g, ix, incs, events } = realData();
    const test = events.find((e) => e.start === "2026-10-21")!;
    const train = events.filter((e) => e.end < "2026-10-21" && rainReports(incs, e).length >= 40 && e.start >= "2026-08-01");
    const grid: Omit<MemoryOpts, "asOf">[] = [];
    // round 2 (29 Oct): the chosen memory, re-ordered by low ground and by water nearby
    for (const lowBoost of [0, 0.5, 1, 2]) for (const waterBoost of [0, 0.5, 1])
      grid.push({ rSpot: 150, likelyRains: 3, possibleRains: 1, rExact: 50, rNear: 120, likelyKm: 20, possibleKm: 40, lowBoost, waterBoost });
    const rows: { o: Omit<MemoryOpts, "asOf">; train: number; trainL: number; km: number; testShare: number; testLift: number | null; testLiftL: number | null; kmL: number; testRand: number }[] = [];
    for (const o of grid) {
      const lifts: number[] = [], liftsL: number[] = [];
      let kmL = 0;
      for (const ev of train) {
        const mem = buildMemory(g, ix, incs, events, { ...o, asOf: replayAsOf(ev) });
        const j = judge(g, ix, mem, rainReports(incs, ev), 60);
        if (j.lift != null) lifts.push(j.lift);
        if (j.liftLikely != null) liftsL.push(j.liftLikely);
        kmL = j.kmLikely;
      }
      const memT = buildMemory(g, ix, incs, events, { ...o, asOf: replayAsOf(test) });
      const jt = judge(g, ix, memT, rainReports(incs, test), 200);
      rows.push({ o, train: lifts.length ? lifts.reduce((a, b) => a + b, 0) / lifts.length : 0, trainL: liftsL.length ? liftsL.reduce((a, b) => a + b, 0) / liftsL.length : 0,
        km: jt.km, kmL: jt.kmLikely, testShare: jt.covered / jt.tested, testLift: jt.lift, testLiftL: jt.liftLikely, testRand: jt.random.median });
      void kmL;
    }
    rows.sort((a, b) => b.train - a.train);
    for (const r of rows) console.log(`low ${r.o.lowBoost} water ${r.o.waterBoost}: train lift ${r.train.toFixed(2)} (likely ${r.trainL.toFixed(2)}) | test 21 Oct: ${(100 * r.testShare).toFixed(1)} % on ${r.km.toFixed(1)} km (likely ${r.kmL.toFixed(1)} km), random ${(100 * r.testRand).toFixed(1)} %, lift ${r.testLift?.toFixed(2)} (likely ${r.testLiftL?.toFixed(2)})`);
    const pick = rows.filter((r) => r.kmL >= 10).sort((a, b) => b.train - a.train)[0];
    console.log(`PICK (by earlier rains only): ${JSON.stringify(pick?.o)} -> test lift ${pick?.testLift?.toFixed(2)}`);
  }, 900_000);
});
