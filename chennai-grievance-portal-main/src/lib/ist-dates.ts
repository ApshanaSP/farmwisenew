/**
 * Chennai's calendar and clock, whatever time zone the server or the browser runs in (RC-16).
 * A date printed in the runtime's zone is a different day on a UTC server and in a Chennai browser, so the page
 * disagrees with itself (React error 425) and a complaint filed after 18:30 UTC shows the wrong day.
 */
export const IST = { timeZone: "Asia/Kolkata" } as const;

// A stored time with no zone ("2026-11-12 14:20:00", "2026-11-12T14:20", "2026-11-12"): the stores keep IST wall-clock strings (dateStrings,
// the AWS store's istNow), as the officer console reads them (collector/app/lib ms()). new Date() read them in the runtime's zone, so the
// citizen's tracker showed a 2:20 pm step as 7:50 pm in a UTC browser and 3:50 pm in Dubai (QA pass 6, officer-day-12).
const ZONELESS = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?))?$/;

/** A stored time as a Date: a time with no zone is Chennai's wall clock; one with Z or an offset, or a Date or epoch ms, is taken as it is. */
export function istInstant(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === "string") {
    const m = v.trim().match(ZONELESS);
    d = new Date(m ? `${m[1]}T${m[2] ?? "00:00:00"}+05:30` : v);
  } else d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const toDate = istInstant;

/** "7 Nov 2026" in Chennai, or "" when the value is not a date */
export function istDate(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short", year: "numeric" }) : "";
}

/** "7 Nov, 1:30 am" in Chennai, or "" when the value is not a date */
export function istDateTime(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleString("en-IN", { ...IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "";
}
