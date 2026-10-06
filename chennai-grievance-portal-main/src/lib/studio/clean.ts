/**
 * The Data Detective: checks a table before anything is counted, fixes what is safe to fix and flags the rest.
 *
 *  fixed    stray spaces; spelling variants of one place / type / status merged to the most common spelling
 *  removed  empty rows; "Total" rows (they would double every sum); exact duplicate rows
 *  flagged  dates that cannot be read, lie in the future or long ago; numbers that cannot be read, are negative, or
 *           are far outside the rest (robust z-score on the median and MAD); key fields left empty
 *
 * Every change is listed with examples, so the Collector can see what the file said and what the dashboard used.
 */
import type { Cell, Table } from "@/lib/studio/parse";
import { YEAR_HDR, dateOf, dateOrder } from "@/lib/studio/profile";
import type { Detective, Issue, Spec } from "@/lib/studio/types";
import { median, niceCase, parseNum, sameValue, tidy, todayIST } from "@/lib/studio/values";

export type DRow = Record<string, string | number | null>;

const TOTAL_RE = /^(grand\s*total|sub[\s-]?total|total|totals|overall|மொத்தம்|கூடுதல்)\b/i;
const SERIAL_RE = /^(s\.?\s?no\.?|sl\.?\s?no\.?|sr\.?\s?no\.?|serial( no\.?)?|#|no\.?|வ\.?\s?எண்)$/i;
const VARIANT_ROLES = new Set(["category", "status", "place", "zone", "taluk"]);

export interface Cleaned { rows: DRow[]; detective: Detective; window: { from: string | null; to: string | null }; minDate: string }

export function clean(t: Table, spec: Spec): Cleaned {
  const issues: Issue[] = [];
  const cols = spec.columns;
  const add = (i: Issue) => { if (i.count > 0) issues.push(i); };
  const rowsIn = t.rows.length;

  // 1. tidy every text cell
  let tidied = 0;
  let rows: DRow[] = t.rows.map((r) => {
    const o: DRow = {};
    cols.forEach((c, i) => {
      const v: Cell = r[i] ?? null;
      if (typeof v === "string") {
        const s = tidy(v);
        if (s !== v) tidied++;
        o[c.key] = s === "" ? null : s;
      } else o[c.key] = v;
    });
    return o;
  });
  add({ kind: "spaces", column: null, label: "Tidied extra spaces and invisible characters", count: tidied, action: "fixed", examples: [] });

  // 2. empty rows
  const before = rows.length;
  rows = rows.filter((r) => cols.some((c) => r[c.key] != null));
  add({ kind: "empty_rows", column: null, label: "Removed empty rows", count: before - rows.length, action: "removed", examples: [] });

  // 3. total rows: a "Total" in one of the first columns, usually with sums beside it
  const firstCols = cols.slice(0, 4).filter((c) => c.role !== "measure");
  const totals = rows.filter((r) => firstCols.some((c) => typeof r[c.key] === "string" && TOTAL_RE.test(String(r[c.key]))));
  if (totals.length) {
    rows = rows.filter((r) => !totals.includes(r));
    add({ kind: "total_rows", column: null, label: "Removed total rows (they would count everything twice)", count: totals.length, action: "removed",
      examples: totals.slice(0, 3).map((r) => cols.slice(0, 4).map((c) => r[c.key]).filter((v) => v != null).join(" · ").slice(0, 70)) });
  }

  // 4. exact duplicates (a running serial number is not part of a row's identity)
  const idCols = cols.filter((c) => !(c.role === "id" && SERIAL_RE.test(c.header.trim())));
  const seen = new Set<string>();
  const dups: DRow[] = [];
  rows = rows.filter((r) => {
    const k = JSON.stringify(idCols.map((c) => (typeof r[c.key] === "string" ? String(r[c.key]).toLowerCase() : r[c.key])));
    if (seen.has(k)) { dups.push(r); return false; }
    seen.add(k);
    return true;
  });
  const idCol = cols.find((c) => c.role === "id" && !SERIAL_RE.test(c.header.trim()));
  add({ kind: "duplicates", column: null, label: "Removed duplicate rows (the same record entered twice)", count: dups.length, action: "removed",
    examples: dups.slice(0, 3).map((r) => String((idCol ? r[idCol.key] : null) ?? cols.slice(0, 3).map((c) => r[c.key]).filter((v) => v != null).join(" · ")).slice(0, 60)) });

  const today = todayIST();
  let from: string | null = null, to: string | null = null;
  // the earliest date that counts as real (lowered for a long historical series)
  let minDate = "2000-01-01";
  for (const c of cols) {
    const vals = rows.map((r) => r[c.key]);
    // 5. dates to YYYY-MM-DD
    if (c.role === "date") {
      const dayFirst = dateOrder(vals.filter((v): v is string => typeof v === "string"));
      const bad: string[] = [], future: string[] = [], old: string[] = [];
      for (const r of rows) {
        const v = r[c.key];
        if (v == null) continue;
        const d = dateOf(v, dayFirst, true, YEAR_HDR.test(c.header));
        if (!d) { bad.push(String(v)); r[c.key] = null; continue; }
        r[c.key] = d;
        if (d.slice(0, 10) > today) future.push(d.slice(0, 10));
        else if (d < "2000-01-01") old.push(d.slice(0, 10));
      }
      // a few dates before 2000 among recent ones are typing errors; a long series (1960 to now) is history
      const dated = rows.filter((r) => typeof r[c.key] === "string").length;
      const history = dated > 0 && old.length > dated * 0.1;
      if (history) minDate = "1900-01-01";
      add({ kind: "bad_date", column: c.key, label: `${c.label}: dates that could not be read were left blank`, count: bad.length, action: "flagged", examples: [...new Set(bad)].slice(0, 4) });
      add({ kind: "future_date", column: c.key, label: `${c.label}: dates in the future (likely typing errors)`, count: future.length, action: "flagged", examples: [...new Set(future)].slice(0, 4) });
      if (!history) add({ kind: "old_date", column: c.key, label: `${c.label}: dates before 2000 (likely typing errors)`, count: old.length, action: "flagged", examples: [...new Set(old)].slice(0, 4) });
      const ok = rows.map((r) => r[c.key]).filter((d): d is string => typeof d === "string" && d.slice(0, 10) <= today && d >= minDate).map((d) => d.slice(0, 10)).sort();
      if (ok.length && c.key === cols.find((x) => x.role === "date")?.key) { from = ok[0]; to = ok[ok.length - 1]; }
    }
    // 6. numbers
    if (c.role === "measure" || c.role === "lat" || c.role === "lon") {
      const bad: string[] = [];
      for (const r of rows) {
        const v = r[c.key];
        if (v == null) continue;
        const n = parseNum(v);
        if (n == null) { bad.push(String(v)); r[c.key] = null; } else r[c.key] = n;
      }
      add({ kind: "bad_number", column: c.key, label: `${c.label}: values that are not numbers were left blank`, count: bad.length, action: "flagged", examples: [...new Set(bad)].slice(0, 4) });
      if (c.role === "measure") {
        const nums = rows.map((r) => r[c.key]).filter((x): x is number => typeof x === "number");
        const neg = nums.filter((x) => x < 0);
        if (neg.length && neg.length < nums.length * 0.2)
          add({ kind: "negative", column: c.key, label: `${c.label}: negative values`, count: neg.length, action: "flagged", examples: neg.slice(0, 4).map(String) });
        const pos = nums.filter((x) => x > 0);
        const med = median(pos);
        const mad = med == null ? null : median(pos.map((x) => Math.abs(x - med)));
        if (med != null && mad && pos.length >= 12) {
          const out = rows.filter((r) => typeof r[c.key] === "number" && ((r[c.key] as number) - med) / (1.4826 * mad) > 8);
          if (out.length && out.length <= Math.max(3, pos.length * 0.02))
            add({ kind: "outlier", column: c.key, label: `${c.label}: far larger than the rest (worth checking)`, count: out.length, action: "flagged",
              examples: out.sort((a, b) => (b[c.key] as number) - (a[c.key] as number)).slice(0, 3)
                .map((r) => `${(r[c.key] as number).toLocaleString("en-IN")}${idCol && r[idCol.key] ? ` (${r[idCol.key]})` : ""}`) });
        }
      }
    }
    // 7. one spelling per value
    if (VARIANT_ROLES.has(c.role)) {
      const counts = new Map<string, number>();
      for (const v of vals) if (typeof v === "string") counts.set(v, (counts.get(v) ?? 0) + 1);
      if (counts.size > 1 && counts.size <= 3000) {
        const order = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const canon = new Map<string, string>();
        const heads: string[] = [];
        for (const [v] of order) {
          const h = heads.find((x) => sameValue(x, v));
          if (h) canon.set(v, h);
          else { heads.push(v); canon.set(v, v); }
        }
        // the most common spelling leads; one written in capitals is shown in normal case
        const nice = new Map(heads.map((h) => [h, niceCase(h)]));
        let changed = 0;
        const groups = new Map<string, Set<string>>();
        for (const r of rows) {
          const v = r[c.key];
          if (typeof v !== "string") continue;
          const target = nice.get(canon.get(v)!)!;
          if (target !== v) {
            changed++;
            (groups.get(target) ?? groups.set(target, new Set()).get(target)!).add(v);
            r[c.key] = target;
          }
        }
        const merged = [...groups.entries()].filter(([t, s]) => [...s].some((x) => x.toLowerCase() !== t.toLowerCase()));
        if (merged.length)
          add({ kind: "variants", column: c.key, label: `${c.label}: merged spellings of the same value`, count: merged.reduce((a, [, s]) => a + s.size, 0), action: "fixed",
            examples: merged.slice(0, 4).map(([t, s]) => `${[...s].slice(0, 3).join(", ")} → ${t}`) });
        else if (changed) add({ kind: "variants", column: c.key, label: `${c.label}: capital letters written in normal case`, count: changed, action: "fixed", examples: [] });
      }
    }
    // 8. empty key fields
    if (["date", "place", "ward", "zone"].includes(c.role)) {
      const miss = rows.filter((r) => r[c.key] == null).length;
      if (miss && miss < rows.length)
        add({ kind: "missing", column: c.key, label: `${c.label}: left empty`, count: miss, action: "flagged", examples: [] });
    }
  }

  const persons = cols.filter((c) => c.role === "person");
  if (persons.length)
    add({ kind: "masked", column: null, label: `Personal details (${persons.map((c) => c.label).join(", ")}) are kept out of the AI, the charts and the table`, count: persons.length, action: "info", examples: [] });

  // Health: each kind of problem costs by how much damage it would do to the numbers, not only by how many rows it
  // touches (one "Total" row doubles every sum). "Before" counts everything; "after" only what cleaning could not fix.
  const n = Math.max(1, rowsIn);
  const count = (k: Issue["kind"]) => issues.filter((i) => i.kind === k).reduce((s, i) => s + i.count, 0);
  const cost = (k: Issue["kind"], base: number, perShare: number, cap: number) => (count(k) ? Math.min(cap, base + (count(k) / n) * perShare) : 0);
  const fixedPenalty = cost("total_rows", 8, 400, 12) + cost("duplicates", 4, 300, 14) + cost("variants", 3, 80, 10) + cost("empty_rows", 1, 40, 4)
    + (tidied ? Math.min(3, 1 + (tidied / n) * 5) : 0);
  const leftPenalty = Math.min(50, cost("bad_date", 2, 100, 10) + cost("future_date", 2, 100, 8) + cost("old_date", 2, 100, 6) + cost("bad_number", 2, 100, 10)
    + cost("missing", 0, 60, 10) + cost("negative", 2, 60, 6) + Math.min(6, count("outlier") * 2));
  const detective: Detective = {
    before: Math.round(Math.max(25, 100 - fixedPenalty - leftPenalty)),
    after: Math.round(Math.max(40, 100 - leftPenalty)),
    rowsIn, rowsOut: rows.length, issues, placed: 0, unplaced: []
  };
  return { rows, detective, window: { from, to }, minDate };
}
