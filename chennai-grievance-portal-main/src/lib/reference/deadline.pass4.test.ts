// DSK-4: one rule for "past its deadline" on a row already read (the twin of pastDueSql). RC-34.
import { describe, expect, it } from "vitest";
import { isPastDeadline } from "@/lib/reference/metrics";

const NOW = "2026-11-06 18:08:00";
describe("isPastDeadline", () => {
  it("an open incident whose due time has gone by is past its deadline, flag or not", () => {
    expect(isPastDeadline({ open: 1, breached: 0, due: "2026-11-06 12:42:54" }, NOW)).toBe(true);
    expect(isPastDeadline({ breached: 0, sla_due: "2026-11-06 12:42:54" }, NOW)).toBe(true);
  });
  it("an open incident not yet due is not, unless the pipeline flagged it", () => {
    expect(isPastDeadline({ open: 1, breached: 0, due: "2026-11-07 09:00:00" }, NOW)).toBe(false);
    expect(isPastDeadline({ open: 1, breached: 1, due: "2026-11-07 09:00:00" }, NOW)).toBe(true);
  });
  it("a closed incident keeps the flag and is not made late by the clock", () => {
    expect(isPastDeadline({ open: 0, breached: 0, due: "2026-11-06 12:42:54" }, NOW)).toBe(false);
    expect(isPastDeadline({ open: 0, breached: 1, due: "2026-11-06 12:42:54" }, NOW)).toBe(true);
  });
  it("no due time, or a bad clock, falls back to the flag", () => {
    expect(isPastDeadline({ open: 1, breached: 0, due: null }, NOW)).toBe(false);
    expect(isPastDeadline({ open: 1, breached: 0, due: "2026-11-06 12:42:54" }, "garbage")).toBe(false);
  });
});

// Class guard (DSK-4): a text, brief or row never reads the pipeline's raw flag as "past its deadline". The RC-34 guard let
// `sla_breached AS breached` through, and every JS read of that column then said "not late" for an open incident whose due time had gone.
import fs from "node:fs";
import path from "node:path";
describe("DSK-4 class guard: no JS read of the raw breached flag outside metrics.ts", () => {
  const ROOT = path.resolve(__dirname, "..", "..");
  const FILES = ["lib/collector/insights.ts", "lib/collector/aibrief.ts", "lib/collector/actionmail.ts", "lib/collector/analysis.ts", "lib/collector/briefbook.ts",
    "lib/assistant/incidents.ts", "lib/assistant/warnings.ts", "lib/assistant/tools.ts", "lib/studio/link.ts", "lib/collector/intel.ts"];
  for (const file of FILES) {
    it(`${file} says "past its deadline" through isPastDeadline or deadlineState`, () => {
      const bad = fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/)
        .map((text, n) => ({ text, n: n + 1 }))
        .filter(({ text }) => /[.]breached\b/.test(text) && !/^\s*(\/\/|\*|\/\*)/.test(text))
        .filter(({ text }) => !/isPastDeadline|deadlineState/.test(text));
      expect(bad.map((b) => `${file}:${b.n} ${b.text.trim().slice(0, 100)}`)).toEqual([]);
    });
  }
});
