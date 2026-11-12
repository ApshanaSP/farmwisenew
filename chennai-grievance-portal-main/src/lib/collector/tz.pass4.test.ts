// RC-16: a source's date is read the same on a server in any time zone. A text that names no zone is Chennai time (UTC+05:30).
// Node re-reads TZ when it is assigned, so one run crosses the zones; the answer must not move.
import { afterEach, describe, expect, it } from "vitest";
import { parseWhen } from "./sourcemap";

const OFFSET: Record<string, number> = { UTC: 0, "Asia/Kolkata": -330, "America/Los_Angeles": 420, "Pacific/Auckland": -780, "Asia/Tokyo": -540, "Europe/London": -60, "Pacific/Kiritimati": -840 }; // getTimezoneOffset on 2 Oct 2026
const ZONES = Object.keys(OFFSET);
/** [text, the instant it means] : no zone named means Chennai; a zone named means that zone */
const CASES: [string, string][] = [
  ["02 Oct 2026", "2026-10-01T18:30:00.000Z"],
  ["2 October 2026", "2026-10-01T18:30:00.000Z"],
  ["2nd October, 2026", "2026-10-01T18:30:00.000Z"],
  ["Oct 2, 2026", "2026-10-01T18:30:00.000Z"],
  ["October 2 2026", "2026-10-01T18:30:00.000Z"],
  ["02 Oct 2026 23:30", "2026-10-02T18:00:00.000Z"],
  ["02 Oct 2026 11:30 PM", "2026-10-02T18:00:00.000Z"],
  ["Fri, 02 Oct 2026 23:30:00", "2026-10-02T18:00:00.000Z"],
  ["Fri, 02 Oct 2026 23:30:00 GMT", "2026-10-02T23:30:00.000Z"],
  ["Fri, 02 Oct 2026 23:30:00 +0530", "2026-10-02T18:00:00.000Z"],
  ["Fri Oct 02 2026 23:30:00 GMT+0530 (India Standard Time)", "2026-10-02T18:00:00.000Z"],
  ["2026-10-02T10:00:00Z", "2026-10-02T10:00:00.000Z"],
  ["2026-10-02T10:00:00+05:30", "2026-10-02T04:30:00.000Z"],
  ["2026-10-02T10:00:00", "2026-10-02T04:30:00.000Z"],
  ["2026-10-02T10:00:00.000", "2026-10-02T04:30:00.000Z"],
  ["2026-10-02", "2026-10-01T18:30:00.000Z"],
  ["2026-10-02 23:30", "2026-10-02T18:00:00.000Z"],
  ["05/10/2026 14:30", "2026-10-05T09:00:00.000Z"],
  ["1759401000", "2025-10-02T10:30:00.000Z"]
];
const saved = process.env.TZ;
afterEach(() => { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; });

describe("RC-16: parseWhen does not depend on the server's time zone", () => {
  for (const tz of ZONES) {
    it(`in ${tz}`, () => {
      process.env.TZ = tz;
      expect(new Date(2026, 9, 2, 12).getTimezoneOffset()).toBe(OFFSET[tz]); // the zone really changed
      for (const [text, want] of CASES) expect(parseWhen(text, "auto")?.toISOString(), `${text} in ${tz}`).toBe(want);
    });
  }
  it("a month-name date near midnight stays on its own Chennai day in every zone", () => {
    for (const tz of ZONES) {
      process.env.TZ = tz;
      const d = parseWhen("02 Oct 2026 23:59", "auto") as Date;
      expect(new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10), tz).toBe("2026-10-02");
    }
  });
  it("text that is not a date is null in every zone", () => {
    for (const tz of ZONES) { process.env.TZ = tz; expect(parseWhen("nonsense", "auto")).toBeNull(); expect(parseWhen("", "auto")).toBeNull(); }
  });
});
