/**
 * Chennai's calendar and clock, whatever time zone the server or the browser runs in (RC-16).
 * A date printed in the runtime's zone is a different day on a UTC server and in a Chennai browser, so the page
 * disagrees with itself (React error 425) and a complaint filed after 18:30 UTC shows the wrong day.
 */
export const IST = { timeZone: "Asia/Kolkata" } as const;

const toDate = (v: string | number | Date | null | undefined): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

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
