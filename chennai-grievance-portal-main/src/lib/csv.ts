/**
 * One CSV cell. A cell that starts with = + - @ (a headline someone wrote as "=HYPERLINK(...)") would run as a formula when
 * the file is opened in Excel: it is written as text, with a leading apostrophe. Numbers ("-12") are left alone. Quoted
 * when it holds a comma, a quote or a line break (`always`: every cell quoted). Pure: used on the server and in the browser.
 */
export function csvCell(v: unknown, always = false): string {
  if (v == null) return always ? '""' : "";
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return always || /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
