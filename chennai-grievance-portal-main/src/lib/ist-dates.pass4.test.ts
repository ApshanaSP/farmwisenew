import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RC-16 class guard (PB-107, PB-264, and the same bug on the citizen track page and the complaint-type source note).
 * A date printed with the runtime's time zone is a different day on a UTC server and in a Chennai browser: the page
 * disagrees with itself (React error 425) and a complaint filed late in the evening shows the wrong day.
 * The rule: every call that prints a calendar date or a clock time from an instant names its time zone.
 */
const SRC = path.resolve(__dirname, "..");
const files: string[] = [];
(function walk(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) files.push(p);
  }
})(SRC);

/** the text of the argument list that opens at `open` (the index of "("), balanced */
function args(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}
const DATE_KEYS = /\b(day|month|year|hour|minute|second|weekday|dateStyle|timeStyle)\s*:/;

function unzoned(): string[] {
  const bad: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const re = /\.(toLocaleDateString|toLocaleTimeString|toLocaleString)\s*\(|Intl\.DateTimeFormat\s*\(/g;
    for (let m: RegExpExecArray | null; (m = re.exec(src)); ) {
      const a = args(src, m.index + m[0].length - 1);
      const kind = m[1] ?? "Intl.DateTimeFormat";
      // toLocaleString on a number (thousands separators) has no date keys and is not a zone matter
      if (kind === "toLocaleString" && !DATE_KEYS.test(a)) continue;
      if (/\btimeZone\b/.test(a)) continue;
      // a spread of a constant that carries the zone: { ...IST, day: ... }
      const spread = [...a.matchAll(/\.\.\.(\w+)/g)].map((x) => x[1]);
      const carries = (n: string) =>
        new RegExp(String.raw`\b${n}\b[^=;]*=[^;]*timeZone`).test(src) || // declared here with its zone
        new RegExp(String.raw`import\s*\{[^}]*\b${n}\b[^}]*\}\s*from\s*"@/lib/ist-dates"`).test(src); // or the shared one
      if (spread.some(carries)) continue;
      bad.push(`${path.relative(SRC, f).split(path.sep).join("/")}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  return bad;
}

describe("RC-16: dates are printed in Chennai's time zone, on any server and in any browser", () => {
  it("no toLocaleDateString, toLocaleTimeString, date toLocaleString or Intl.DateTimeFormat call leaves the zone out", () => {
    expect(unzoned()).toEqual([]);
  });
  it("the guard sees the calls it is meant to see (a guard that matches nothing guards nothing)", () => {
    expect(files.length).toBeGreaterThan(100);
    const all = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    expect((all.match(/toLocaleDateString/g) ?? []).length).toBeGreaterThan(10);
  });
});

describe("RC-16: the shared Chennai date helpers", () => {
  it("print the Chennai day for an instant near midnight, whatever the process zone is", async () => {
    const { istDate, istDateTime } = await import("@/lib/ist-dates");
    // 20:00 UTC on 6 Nov is 01:30 on 7 Nov in Chennai
    expect(istDate("2026-11-06T20:00:00Z")).toBe("7 Nov 2026");
    expect(istDate("2026-11-06T18:29:00Z")).toBe("6 Nov 2026");
    expect(istDateTime("2026-11-06T20:00:00Z")).toMatch(/^7 Nov,? 1:30 am$/i);
  });
  it("say nothing for a value that is not a date, instead of 'Invalid Date'", async () => {
    const { istDate, istDateTime } = await import("@/lib/ist-dates");
    expect(istDate("not a date")).toBe("");
    expect(istDateTime(undefined)).toBe("");
  });
});
