// QA pass 6, officer-day: the citizen tracker's step times are IST wall-clock strings ("2026-11-12 14:20:00", dateStrings). The citizen
// page formats them with lib/ist-dates (new Date(v), read in the BROWSER's zone); the officer console's lib.ts ms() appends +05:30.
import { describe, expect, it } from "vitest";
import { istDateTime } from "@/lib/ist-dates";
import { fmtShort } from "@/components/collector/app/lib";

describe("a stored IST time shown to the citizen from a browser outside India", () => {
  it("shows the same clock time as the officer console", () => {
    const stored = "2026-11-12 14:20:00"; // IST wall-clock, as complaint_status_history.created_at comes back
    const out: Record<string, { citizen: string; officer: string }> = {};
    for (const tz of ["Asia/Kolkata", "UTC", "Asia/Dubai", "America/New_York"]) {
      process.env.TZ = tz;
      out[tz] = { citizen: istDateTime(stored), officer: fmtShort(stored) };
    }
    process.env.TZ = "Asia/Kolkata";
    console.log(JSON.stringify(out, null, 1));
    for (const tz of Object.keys(out)) expect(out[tz].citizen.replace(/\s/g, " ").toLowerCase()).toContain("2:20");
  });
});
