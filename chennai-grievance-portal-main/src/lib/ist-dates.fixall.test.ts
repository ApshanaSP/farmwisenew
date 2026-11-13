// Fix-all run after QA pass 6, officer-day-12: stored times are IST wall-clock strings, and lib/ist-dates read a zone-less one in the
// runtime's zone, so the citizen's tracker (a browser outside India) and the citizen home (a UTC server) shifted every time.
import { afterEach, describe, expect, it } from "vitest";
import { istDate, istDateTime, istInstant } from "@/lib/ist-dates";

const ZONES = ["Asia/Kolkata", "UTC", "Asia/Dubai", "America/New_York", "Pacific/Kiritimati"];
const before = process.env.TZ;
afterEach(() => { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; });
const norm = (s: string) => s.replace(/\s/g, " ").toLowerCase();

describe("officer-day-12: a stored IST time reads the same in every time zone", () => {
  it.each(ZONES)("in %s", (tz) => {
    process.env.TZ = tz;
    expect(norm(istDateTime("2026-11-12 14:20:00"))).toBe("12 nov, 2:20 pm");
    expect(norm(istDateTime("2026-11-12T14:20"))).toBe("12 nov, 2:20 pm");
    expect(norm(istDateTime("2026-11-12 23:50:00.123"))).toBe("12 nov, 11:50 pm");
    expect(istDate("2026-11-12 00:10:00")).toBe("12 Nov 2026");
    expect(istDate("2026-11-12")).toBe("12 Nov 2026");
    expect(istInstant("2026-11-12 14:20:00")!.toISOString()).toBe("2026-11-12T08:50:00.000Z");
  });
  it("a time with its zone, a Date and epoch ms are taken as they are", () => {
    process.env.TZ = "UTC";
    expect(istInstant("2026-11-12T08:50:00.000Z")!.toISOString()).toBe("2026-11-12T08:50:00.000Z");
    expect(istInstant("2026-11-12T14:20:00+05:30")!.toISOString()).toBe("2026-11-12T08:50:00.000Z");
    expect(istInstant(new Date(Date.UTC(2026, 10, 12, 8, 50)))!.toISOString()).toBe("2026-11-12T08:50:00.000Z");
    expect(istInstant(Date.UTC(2026, 10, 12, 8, 50))!.toISOString()).toBe("2026-11-12T08:50:00.000Z");
    expect(norm(istDateTime("2026-11-12T08:50:00Z"))).toBe("12 nov, 2:20 pm");
  });
  it("what is not a date stays empty", () => {
    expect(istInstant("")).toBeNull();
    expect(istInstant(null)).toBeNull();
    expect(istInstant("not a date")).toBeNull();
    expect(istDateTime("2026-13-45 99:99:99")).toBe("");
  });
});
