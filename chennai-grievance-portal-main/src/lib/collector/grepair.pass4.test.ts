// QA4 g-repair 9: a source date is read by hand, the same on every server zone; IST, impossible days and a missing year are handled.
import { afterEach, describe, expect, it } from "vitest";
import { parseWhen } from "./sourcemap";

const saved = process.env.TZ;
afterEach(() => { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; });
const ZONES = ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"];
const CASES: [string, string][] = [
  ["02-Oct-2026", "2026-10-01T18:30:00.000Z"],
  ["Oct-02-2026", "2026-10-01T18:30:00.000Z"],
  ["2-Oct-2026 11:30 PM", "2026-10-02T18:00:00.000Z"],
  ["02 Oct 2026 23:30 IST", "2026-10-02T18:00:00.000Z"],
  ["Oct 2, 2026 11:30 PM IST", "2026-10-02T18:00:00.000Z"],
  ["2026-10-02T23:30:00 IST", "2026-10-02T18:00:00.000Z"],
  ["Thu, 02 Oct 2026 23:30:00 IST", "2026-10-02T18:00:00.000Z"],
  ["2026/10/02 23:30", "2026-10-02T18:00:00.000Z"],
  ["Fri, 02 Oct 2026 23:30:00 GMT", "2026-10-02T23:30:00.000Z"],
  ["02 Oct 2026 11:30 PM EST", "2026-10-03T04:30:00.000Z"],
  ["Fri Oct 02 2026 23:30:00 GMT+0530 (India Standard Time)", "2026-10-02T18:00:00.000Z"],
  ["2026-10-02T10:00:00.250Z", "2026-10-02T10:00:00.000Z"],
  ["12 AM 02 Oct 2026", ""]
].filter((c) => c[1]) as [string, string][];

describe("G-REPAIR 9: a source date is read by hand", () => {
  for (const tz of ZONES) it(`the same instant in ${tz}`, () => {
    process.env.TZ = tz;
    for (const [t, want] of CASES) expect(parseWhen(t, "auto")?.toISOString(), `${t} in ${tz}`).toBe(want);
  });
  it("a day that is not on the calendar is null, in every shape", () => {
    for (const t of ["31/02/2026", "2026-02-31", "29/02/2027", "31 Feb 2026", "Feb 30, 2026", "31-Apr-2026", "2026/04/31"]) expect(parseWhen(t, "auto"), t).toBeNull();
    expect(parseWhen("29 Feb 2028", "auto")?.toISOString()).toBe("2028-02-28T18:30:00.000Z");
  });
  it("no year is no date; a clock that is not a clock is no date; an unknown zone is no date", () => {
    for (const t of ["12 Oct", "Oct 12", "02 Oct 2026 25:00", "02 Oct 2026 13:00 PM", "02 Oct 2026 10:00 XYZ", "garbage 2026"]) expect(parseWhen(t, "auto"), t).toBeNull();
  });
});
