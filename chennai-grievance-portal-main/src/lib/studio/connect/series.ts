/**
 * A series: files whose names (or ?date= parameters) differ only by a date, "Reservoir_Levels_01-10-2026.xlsx" to
 * "Reservoir_Levels_27-10-2026.xlsx". They are one dataset published day by day, shown as one card ("Daily reservoir
 * levels · 27 files · 1 Oct → 27 Oct 2026") with three choices: the latest only, all combined, or kept updating.
 *
 * The pattern is found by code from the names, and then checked on the files themselves (the same columns).
 */
import { pad } from "@/lib/studio/values";

export interface SeriesLink { url: string; name: string }
export interface Series { pattern: string; files: { url: string; date: string; name: string }[]; from: string; to: string; step: "day" | "month" | "other" }

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const valid = (y: number, m: number, d: number) => y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** The date in a file name or address, and the name with it replaced by its pattern ("{DD-MM-YYYY}"). */
export function dateIn(s: string): { date: string; pattern: string } | null {
  const tries: [RegExp, (m: RegExpMatchArray) => [number, number, number] | null, string][] = [
    [/(\d{4})[-_.](\d{2})[-_.](\d{2})/, (m) => [+m[1], +m[2], +m[3]], "{YYYY-MM-DD}"],
    [/(\d{2})[-_.](\d{2})[-_.](\d{4})/, (m) => [+m[3], +m[2], +m[1]], "{DD-MM-YYYY}"],
    [/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/, (m) => [+m[1], +m[2], +m[3]], "{YYYYMMDD}"],
    [/(\d{1,2})[-_ ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ ]?(\d{4})/i, (m) => [+m[3], MON.indexOf(m[2].toLowerCase()) + 1, +m[1]], "{D-Mon-YYYY}"],
    [/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ ]?(\d{4})/i, (m) => [+m[2], MON.indexOf(m[1].toLowerCase()) + 1, 1], "{Mon-YYYY}"]
  ];
  for (const [re, get, token] of tries) {
    const m = s.match(re);
    if (!m) continue;
    const ymd = get(m);
    if (!ymd || !valid(...ymd)) continue;
    return { date: iso(...ymd), pattern: s.replace(m[0], token) };
  }
  return null;
}

const nameOf = (u: string) => { try { const x = new URL(u); return decodeURIComponent(x.pathname.split("/").pop() || "") + x.search; } catch { return u; } };

/** The series among a page's links (3 or more files with one pattern), and the links left over. */
export function findSeries(links: SeriesLink[]): { series: Series[]; rest: SeriesLink[] } {
  const groups = new Map<string, { url: string; date: string; name: string }[]>();
  const rest: SeriesLink[] = [];
  for (const l of links) {
    const n = nameOf(l.url) || l.name;
    const d = dateIn(n);
    if (!d) { rest.push(l); continue; }
    const g = groups.get(d.pattern) ?? [];
    if (!g.some((x) => x.date === d.date)) g.push({ url: l.url, date: d.date, name: n });
    groups.set(d.pattern, g);
  }
  const series: Series[] = [];
  for (const [pattern, files] of groups) {
    if (files.length < 3) { rest.push(...files.map((f) => ({ url: f.url, name: f.name }))); continue; }
    files.sort((a, b) => a.date.localeCompare(b.date));
    const gaps = files.slice(1).map((f, i) => (Date.parse(f.date) - Date.parse(files[i].date)) / 864e5);
    const med = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
    series.push({ pattern, files, from: files[0].date, to: files[files.length - 1].date, step: med === 1 ? "day" : med >= 28 && med <= 31 ? "month" : "other" });
  }
  return { series, rest };
}

/** A series' name for its card: the pattern without the date and the file type ("Reservoir Levels"). */
export function seriesTitle(s: Pick<Series, "pattern" | "step">): string {
  const base = s.pattern.replace(/\{[^}]+\}/g, " ").replace(/\?.*$/, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  return `${s.step === "day" ? "Daily " : s.step === "month" ? "Monthly " : ""}${base.toLowerCase()}`.trim() || "Files by date";
}
