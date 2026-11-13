// QA pass 4: compares two coverage maps made by coverage-critical.mjs (same options, AST-aware remapping) and writes the comparison.
//   node tests/qa/pass4/coverage-compare.mjs --before baseline --after final
// Reads docs/qa/pass4/coverage/<before>.json and <after>.json. Writes docs/qa/pass4/coverage/<after>.md:
//   the critical modules before and after (branch %, target 85 %), the ones still under, and any file whose branch coverage fell.
// A fall is counted two ways, because code moves between the two commits: the branch % went down by more than 0.01 point, or the number of
// covered branches went down. Both are listed with the file's before and after, so a reader can tell a real loss from a file that was cut down.
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/env.mjs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const before = arg("before"), after = arg("after");
if (!before || !after) { console.error("usage: coverage-compare.mjs --before <label> --after <label>"); process.exit(1); }
const DIR = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4", "coverage");
const read = (l) => JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), "utf8"));
const b = read(before), a = read(after);
const target = a.critical.target_branch_pct;
const pc = (x) => `${x.pct.toFixed(2)} %`;
const bm = Object.fromEntries(b.critical.modules.map((m) => [m.file, m]));
const rows = a.critical.modules.map((m) => ({ file: m.file, was: bm[m.file]?.branches ?? null, now: m.branches, met: m.met, add: m.branches_to_add_for_target, note: m.note }))
  .sort((x, y) => x.now.pct - y.now.pct || x.file.localeCompare(y.file));
const under = rows.filter((r) => !r.met);

const falls = [];
for (const [f, now] of Object.entries(a.files)) {
  const was = b.files[f];
  if (!was) continue;
  const dropPct = was.branches.total > 0 && now.branches.pct < was.branches.pct - 0.01;
  const dropCovered = now.branches.covered < was.branches.covered;
  const dropLines = now.lines.total > 0 && was.lines.total > 0 && now.lines.pct < was.lines.pct - 0.01;
  if (dropPct || dropCovered || dropLines) falls.push({ file: f, was, now, why: [dropPct && "branch %", dropCovered && "covered branches", dropLines && "line %"].filter(Boolean).join(", ") });
}
falls.sort((x, y) => (x.now.branches.pct - x.was.branches.pct) - (y.now.branches.pct - y.was.branches.pct));
const newFiles = Object.keys(a.files).filter((f) => !b.files[f]);
const goneFiles = Object.keys(b.files).filter((f) => !a.files[f]);

const out = {
  before: { label: before, commit: b.commit, tests: b.tests, totals: b.totals, critical: b.critical.combined_branches },
  after: { label: after, commit: a.commit, tests: a.tests, totals: a.totals, critical: a.critical.combined_branches },
  target,
  modules: rows, modules_under_target: under.map((r) => r.file),
  falls_elsewhere: falls.filter((x) => !bm[x.file]).map((x) => ({ file: x.file, branches_before: x.was.branches, branches_after: x.now.branches, lines_before: x.was.lines, lines_after: x.now.lines, why: x.why })),
  falls_in_critical: falls.filter((x) => bm[x.file]).map((x) => ({ file: x.file, branches_before: x.was.branches, branches_after: x.now.branches, why: x.why })),
  new_files: newFiles.length, removed_files: goneFiles.length,
};
fs.writeFileSync(path.join(DIR, `${after}-compare.json`), `${JSON.stringify(out, null, 1)}\n`);

const f2 = (x) => `${x.covered}/${x.total} (${pc(x)})`;
const md = [
  `# Coverage: ${before} against ${after}`, "",
  `- Before: \`${b.commit.slice(0, 7)}\`, ${b.tests ? `${b.tests.passed} passed, ${b.tests.failed} failed, ${b.tests.skipped} skipped` : "test result not recorded"}`,
  `- After: \`${a.commit.slice(0, 7)}\`, ${a.tests ? `${a.tests.passed} passed, ${a.tests.failed} failed, ${a.tests.skipped} skipped` : "test result not recorded"}`,
  `- Same tool and options both times: vitest default suite (\`vitest.config.ts\`) with v8 coverage and AST-aware remapping. The qa4 tests in \`tests/qa/pass4/\` are not counted.`,
  `- All of src: branches ${f2(b.totals.branches)} before, ${f2(a.totals.branches)} after; lines ${f2(b.totals.lines)} before, ${f2(a.totals.lines)} after`, "",
  `## Critical modules (target ${target} % of branches)`, "",
  `Together: ${b.critical.combined_branches.covered}/${b.critical.combined_branches.total} (${b.critical.combined_branches.pct} %) before, ${a.critical.combined_branches.covered}/${a.critical.combined_branches.total} (${a.critical.combined_branches.pct} %) after. ${b.critical.met} of ${b.critical.modules.length} met the target before, ${a.critical.met} of ${a.critical.modules.length} after.`, "",
  `| Module | Before | After | Against ${target} % | Branches to add |`, "|---|---|---|---|---|",
  ...rows.map((r) => `| \`${r.file}\` | ${r.was ? f2(r.was) : "not in baseline"} | ${f2(r.now)} | ${r.met ? "met" : "**below**"} | ${r.add} |`), "",
  `## Under ${target} %: ${under.length}`, "",
  ...(under.length ? under.map((r) => `- \`${r.file}\`: ${pc(r.now)}, ${r.add} more branches needed${r.note ? ` (${r.note})` : ""}`) : ["None."]), "",
  `## Falls in the critical modules: ${out.falls_in_critical.length}`, "",
  ...(out.falls_in_critical.length ? out.falls_in_critical.map((x) => `- \`${x.file}\`: ${f2(x.branches_before)} to ${f2(x.branches_after)} (${x.why})`) : ["None."]), "",
  `## Falls anywhere else: ${out.falls_elsewhere.length}`, "",
  `A file is listed when its branch % went down by more than 0.01 point, its covered branches went down, or its line % went down. Code changed between the two commits, so a fall can also mean a bigger file with the same tests. Worst first.`, "",
  ...(out.falls_elsewhere.length ? ["| File | Branches before | Branches after | Lines before | Lines after | Why |", "|---|---|---|---|---|---|",
    ...out.falls_elsewhere.map((x) => `| \`${x.file}\` | ${f2(x.branches_before)} | ${f2(x.branches_after)} | ${f2(x.lines_before)} | ${f2(x.lines_after)} | ${x.why} |`)] : ["None."]), "",
  `Files only in the after map: ${newFiles.length}. Files only in the before map: ${goneFiles.length}.`, "",
].join("\n");
fs.writeFileSync(path.join(DIR, `${after}.md`), md);
console.log(`critical ${b.critical.combined_branches.pct} % -> ${a.critical.combined_branches.pct} %; met ${b.critical.met} -> ${a.critical.met} of ${a.critical.modules.length}; under: ${under.length}; falls in critical: ${out.falls_in_critical.length}; falls elsewhere: ${out.falls_elsewhere.length}`);
