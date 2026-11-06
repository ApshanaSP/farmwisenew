/**
 * FLAKY-1: parseWhen reads a date with a month name in the server's own time zone, not in Chennai time. On a machine in India this
 * cannot be seen. On a server in UTC the time is 5 h 30 min late, and a late evening moves to the next Chennai day.
 * This file forces UTC, so it shows the bug on any machine. The fixer changes it.fails to it.
 *   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/flaky-parsewhen-tz.test.ts
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.TZ = "UTC"; });

import { parseWhen } from "@/lib/collector/sourcemap";

describe("parseWhen on a server in UTC", () => {
  it("this file really runs in UTC", () => {
    expect(new Date(2026, 9, 2).getTimezoneOffset()).toBe(0);
  });

  it("the forms it already handles stay in Chennai time", () => {
    expect(parseWhen("05/10/2026 14:30", "dmy")?.toISOString()).toBe("2026-10-05T09:00:00.000Z");
    expect(parseWhen("2026-10-02")?.toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(parseWhen("2026-10-02 23:30")?.toISOString()).toBe("2026-10-02T18:00:00.000Z");
  });

  it("FLAKY-1 a date with a month name and no zone is Chennai time", () => {
    expect(parseWhen("02 Oct 2026")?.toISOString()).toBe("2026-10-01T18:30:00.000Z");
  });

  it("FLAKY-1 a late evening with a month name stays on its own Chennai day", () => {
    expect(parseWhen("02 Oct 2026 23:30")?.toISOString()).toBe("2026-10-02T18:00:00.000Z");
  });
});
