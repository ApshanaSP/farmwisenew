/**
 * One CSV cell. A cell that starts with = + - @ (a headline someone wrote as "=HYPERLINK(...)") would run as a formula when
 * the file is opened in Excel: it is written as text, with a leading apostrophe. A cell that is wholly a number ("-12", "-1.5e-7")
 * is left alone; "-2+3" or "-1+cmd|..." starts like a number and is a formula, so it is text too (RC-25). Quoted
 * when it holds a comma, a quote or a line break (`always`: every cell quoted). Pure: used on the server and in the browser.
 */
export function csvCell(v: unknown, always = false): string {
  if (v == null) return always ? '""' : "";
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s) ? `'${s}` : s;
  return always || /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
