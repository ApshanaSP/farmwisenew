// QA pass 4, class guard for RC-27 (and RC-26): a figure, list or search never reads the pipeline's open flag, status, verified
// flag or closed time raw. They go through effectiveSql (effective.ts), which lays the Collector's latest decision on top, so a
// resolve, a verify, a reject or a reopen moves every number at once. A raw read is allowed only where listed below, with the reason.
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
/** the files that build the figures, lists, searches and briefs */
const FILES = [
  "lib/collector/intel.ts", "lib/collector/insights.ts", "lib/collector/briefbook.ts", "lib/collector/aibrief.ts",
  "lib/assistant/incidents.ts", "lib/assistant/queries.ts", "lib/assistant/news.ts", "lib/assistant/lance.ts", "lib/assistant/tools.ts",
  "lib/officer/insights.ts"
];
const RAW = /\b[iwb]\.(is_open|status_std|verified|closed_at)\b/;
/** a raw read that is right: it is the pipeline's own value, named, or it feeds only a set a decision already excludes */
const ALLOWED: { file: string; has: RegExp; why: string }[] = [
  { file: "lib/collector/intel.ts", has: /i\.awaiting_collector = 1/, why: "the awaiting-the-Collector sets also say NOT DECIDED(verify, reject, resolve, reopen), so a decision removes the row" },
  { file: "lib/collector/intel.ts", has: /i\.verified = 0 OR i\.awaiting_collector/, why: "the same sets: the pipeline's flag is paired with NOT DECIDED" },
  { file: "lib/collector/insights.ts", has: /status_std <> 'Lapsed'/, why: "a media-only lapse is the pipeline's own state, no decision moves it" },
  { file: "lib/collector/insights.ts", has: /SUM\(i\.is_open\)/, why: "the pipeline's count that HOT_OPEN subtracts from the decided one" },
  { file: "lib/assistant/queries.ts", has: /status_std <> 'Lapsed'/, why: "the pipeline's lapse state" },
  { file: "lib/assistant/tools.ts", has: /closed_at: i[.]closed_at [?][?] null/, why: "a JS read of the row intel.incident() returns, whose closed_at is already EFF.closedAt" },
  { file: "lib/officer/insights.ts", has: /i\.closed_at IS NOT NULL THEN TIMESTAMPDIFF/, why: "the department's own resolution time, only for closed (decided) rows" }
];

describe("RC-27 class guard: no raw pipeline flag in a figure", () => {
  for (const file of FILES) {
    it(`${file} reads open, status, verified and closed time through effective.ts`, () => {
      const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/);
      const bad = lines
        .map((text, n) => ({ text, n: n + 1 }))
        .filter(({ text }) => RAW.test(text) && !/^\s*(\/\/|\*|\/\*)/.test(text))
        .filter(({ text }) => !ALLOWED.some((a) => a.file === file && a.has.test(text)));
      expect(bad.map((b) => `${file}:${b.n} ${b.text.trim().slice(0, 100)}`)).toEqual([]);
    });
  }
});

// RC-34 class guard: "past its deadline" and "closed on time" have one rule each (metrics.ts pastDueSql, closedOnTimeSql). A figure
// that reads the pipeline's sla_breached flag alone counts a closed-months-late incident as on time and leaves open incidents whose due
// time has gone off the tile that the case page calls missed.
describe("RC-34 class guard: no raw sla_breached in a figure", () => {
  const FIGURE_FILES = [...FILES, "lib/officer/data.ts"];
  for (const file of FIGURE_FILES) {
    it(`${file} counts past-deadline and on-time through metrics.ts`, () => {
      const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/);
      const bad = lines
        .map((text, n) => ({ text, n: n + 1 }))
        .filter(({ text }) => /sla_breached/.test(text) && !/^\s*(\/\/|\*|\/\*)/.test(text))
        // the row's own field for the explain() text, which re-derives the state from the due time (deadlineState)
        .filter(({ text }) => !/sla_breached AS breached/.test(text))
        .filter(({ text }) => !/i[.]sla_breached, i[.]is_open/.test(text)) // the officer board's source columns; its flags go through flagSql
        .filter(({ text }) => !/r[.]breached [?][?] r[.]sla_breached/.test(text)) // explain()'s fallback when a row has no due time
        // a due-soon list: not flagged AND due in the future is the same date rule
        .filter(({ text }) => !/COALESCE\(w\.sla_breached, 0\) = 0 AND w\.sla_due_at >/.test(text));
      expect(bad.map((b) => `${file}:${b.n} ${b.text.trim().slice(0, 100)}`)).toEqual([]);
    });
  }
});
