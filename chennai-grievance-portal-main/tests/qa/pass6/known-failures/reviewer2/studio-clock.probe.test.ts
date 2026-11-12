// reviewer2, QA pass 6: 555a6cf (P6-002) holds the clock with vi.useFakeTimers + onTestFinished(useRealTimers) inside one test. Does the fake
// Date leak into other tests of the file when that test fails or throws, in any order? Same pattern, shuffled, with a failing holder.
import { describe, expect, it, onTestFinished, vi } from "vitest";

const REAL_YEAR = new Date().getFullYear();
const hold = () => { vi.useFakeTimers({ now: new Date("2026-11-12T06:30:00Z"), toFake: ["Date"] }); onTestFinished(() => { vi.useRealTimers(); }); };

describe.shuffle("the P6-002 pattern, shuffled (seeded by vitest)", () => {
  it.fails("a holder that fails half-way", () => { hold(); expect(new Date().toISOString()).toBe("2026-11-12T06:30:00.000Z"); throw new Error("boom"); });
  it("a holder that passes", () => { hold(); expect(new Date().toISOString()).toBe("2026-11-12T06:30:00.000Z"); });
  for (let k = 0; k < 6; k++) it(`a test after it reads the real clock (${k})`, () => { expect(Date.now() - performance.timeOrigin - performance.now()).toBeLessThan(5_000); expect(new Date().getFullYear()).toBe(REAL_YEAR); });
});

describe("the real studio.test.ts file", () => {
  it("has no concurrent tests and no other fake-timer use that could overlap the held clock", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/lib/studio/studio.test.ts", "utf8");
    expect({ concurrent: /\.concurrent|concurrent:\s*true/.test(src), fakes: (src.match(/useFakeTimers/g) ?? []).length, restores: (src.match(/useRealTimers/g) ?? []).length })
      .toEqual({ concurrent: false, fakes: 1, restores: 1 });
  });
});
