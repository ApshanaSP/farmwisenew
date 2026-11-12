// QA pass 4: the coverage map. Reads the coverage of one run of the default test suite and writes:
//   docs/qa/pass4/coverage/<label>.json         every file under src: statements, branches, functions and lines, so a later
//                                               run can prove "no fall anywhere else"
//   docs/qa/pass4/coverage/<label>-critical.md  each critical module (critical-modules.json): branch % against the target, and
//                                               every untested branch with its file:line and a short quote of the code
//
// First make the coverage, always with these options, so that two labels can be compared:
//   node tests/qa/pass4/with-lock.mjs vitest-full 2 -- <COMMAND below, with coverage/<label> in place of coverage/LABEL>
// Then:
//   node tests/qa/pass4/coverage-critical.mjs --label <label> [--dir <coverage folder, default coverage/<label>>]
//
// experimentalAstAwareRemapping is needed. Without it a file whose functions no test calls can show 1 of 1 branches (100 %), and
// an if with no else whose condition is always true shows no untested branch. This script refuses coverage made without it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/env.mjs";

const COMMAND = "npx vitest run --coverage --coverage.provider=v8 --coverage.reporter=json --coverage.reporter=json-summary "
  + "--coverage.include=src/** --coverage.experimentalAstAwareRemapping=true --coverage.reportOnFailure=true "
  + "--coverage.reportsDirectory=coverage/LABEL --reporter=default --reporter=json --outputFile.json=coverage/LABEL/vitest-results.json";
const OUT_DIR = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4", "coverage");
const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_ONLY = /(^|\/)__tests__\/|\.(test|spec)\.[^/]+$|\.d\.ts$/;   // vitest's default coverage exclude leaves these out
const QUOTE_MAX = 100;

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 1 ? process.argv[i + 1] : undefined; };
function stop(message) { console.error(message); process.exit(1); }

const label = arg("label");
if (!label || !/^[\w.-]+$/.test(label)) stop("usage: coverage-critical.mjs --label <label> [--dir <coverage folder>]");
const covDir = path.resolve(APP_ROOT, arg("dir") || path.join("coverage", label));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
for (const f of ["coverage-summary.json", "coverage-final.json"]) {
  if (!fs.existsSync(path.join(covDir, f))) stop(`No ${f} in ${covDir}. Make the coverage first:\n  ${COMMAND.replaceAll("LABEL", label)}`);
}
const rel = (abs) => path.relative(APP_ROOT, abs).replace(/\\/g, "/");
const byFile = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== "total").map(([k, v]) => [rel(k), v]));
const summaryRaw = readJson(path.join(covDir, "coverage-summary.json"));
const summary = byFile(summaryRaw);
const final = byFile(readJson(path.join(covDir, "coverage-final.json")));

const branchTypes = new Set(Object.values(final).flatMap((c) => Object.values(c.branchMap).map((b) => b.type)));
if (branchTypes.has("branch")) stop(`This coverage was made without experimentalAstAwareRemapping, so its branch figures cannot be used. Run:\n  ${COMMAND.replaceAll("LABEL", label)}`);

// ------------------------------------------------------------------- every file under src --

const four = (s) => Object.fromEntries(["statements", "branches", "functions", "lines"].map((k) => [k, { covered: s[k].covered, total: s[k].total, pct: s[k].pct }]));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (CODE_FILE.test(e.name)) out.push(rel(p));
  }
  return out;
}
const onDisk = walk(path.join(APP_ROOT, "src"));
const testOnly = onDisk.filter((f) => TEST_ONLY.test(f));
const notMeasured = onDisk.filter((f) => !TEST_ONLY.test(f) && !summary[f]).sort();

function runFacts() {
  const git = (...a) => execFileSync("git", a, { cwd: APP_ROOT, encoding: "utf8" }).trim();
  const version = (pkg) => readJson(path.join(APP_ROOT, "node_modules", pkg, "package.json")).version;
  const resultsFile = path.join(covDir, "vitest-results.json");
  const r = fs.existsSync(resultsFile) ? readJson(resultsFile) : null;
  return {
    commit: git("rev-parse", "HEAD"),
    src_changes_not_committed: git("status", "--porcelain", "--", "src").split("\n").filter(Boolean).length,
    vitest: version("vitest"),
    coverage_v8: version("@vitest/coverage-v8"),
    command: COMMAND.replaceAll("LABEL", label),
    tests: r && { files: r.testResults.length, total: r.numTotalTests, passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests, success: r.success },
  };
}

// ------------------------------------------------------------------- untested branches --

/** In simple words, which side of the branch never ran. */
function side(type, i, count) {
  if (type === "if") return i === 0 ? "if: the true side never ran" : "if: the false side never ran";
  if (type === "cond-expr") return i === 0 ? "?: the true side never ran" : "?: the false side never ran";
  if (type === "binary-expr") return `and/or: part ${i + 1} of ${count} never reached`;
  if (type === "switch") return `switch: case ${i + 1} of ${count} never ran`;
  if (type === "default-arg") return "default value never used";
  return `${type}: part ${i + 1} of ${count} never ran`;
}

const clip = (text, from = 0) =>
  `${from ? "..." : ""}${text.slice(from, from + QUOTE_MAX)}${from + QUOTE_MAX < text.length ? "..." : ""}`.replace(/\s+/g, " ");

/**
 * A short quote of the code. The source map's columns can be a little off (an if may be placed at the end of its line), so the
 * line number is what to trust: an and/or part or a ?: side is quoted as itself, anything else as its whole line.
 */
function quote(lines, loc, type) {
  const raw = lines[loc.start.line - 1] ?? "";
  const text = raw.trim();
  if ((type === "binary-expr" || type === "cond-expr") && loc.end?.line === loc.start.line && loc.end.column != null) {
    const part = raw.slice(loc.start.column, loc.end.column).replace(/\s*(\|\||&&|\?\?|\?|:|,|;)\s*$/, "").trim();
    if (/\w{3}/.test(part)) return clip(part);
  }
  if (text.length <= QUOTE_MAX || type !== "if") return clip(text);
  // a long line can hold several ifs: start at the one meant
  const col = (loc.start.column ?? 0) - (raw.length - raw.trimStart().length);
  const at = text.lastIndexOf("if (", col);
  return clip(text, at >= 0 ? at : Math.max(0, text.indexOf("if (")));
}

/** An "else if" on a new line can be placed at the end of the line before it (the source map has no mark at its start). */
function ifPlace(lines, loc) {
  const isHere = (lines[loc.start.line - 1] ?? "").indexOf("if", loc.start.column) >= 0;
  const isNext = /\bif\s*\(/.test(lines[loc.start.line] ?? "");
  return !isHere && isNext ? { ...loc, start: { line: loc.start.line + 1, column: 0 } } : loc;
}

function untestedBranches(file) {
  const c = final[file];
  const lines = fs.readFileSync(path.join(APP_ROOT, file), "utf8").split(/\r?\n/);
  const out = [];
  for (const [id, b] of Object.entries(c.branchMap)) {
    c.b[id].forEach((hits, i) => {
      if (hits) return;
      // both sides of an if point at the if itself: an if with no else has no place of its own, and "} else {" says little
      const loc = b.type === "if" ? ifPlace(lines, b.loc) : b.locations[i]?.start?.line ? b.locations[i] : b.loc;
      out.push({ line: loc.start.line, column: loc.start.column ?? 0, what: side(b.type, i, b.locations.length), code: quote(lines, loc, b.type) });
    });
  }
  return out.sort((x, y) => x.line - y.line || x.column - y.column);
}

// ------------------------------------------------------------------- critical modules --

const critical = readJson(path.join(APP_ROOT, "tests", "qa", "pass4", "critical-modules.json"));
const TARGET = critical.target_branch_pct;
const missing = critical.files.filter((f) => !fs.existsSync(path.join(APP_ROOT, f)) || !summary[f]);
const modules = critical.files.filter((f) => !missing.includes(f)).map((file) => {
  const s = summary[file];
  const untested = untestedBranches(file);
  if (untested.length !== s.branches.total - s.branches.covered) {
    stop(`${file}: the list has ${untested.length} untested branches but the summary says ${s.branches.total - s.branches.covered}`);
  }
  const needed = Math.max(0, Math.ceil((TARGET * s.branches.total) / 100) - s.branches.covered);
  let note = "";
  if (!s.statements.covered) note = "No test loads this file";
  else if (!s.functions.covered && s.functions.total) note = "Loaded, but no test calls its functions";
  return { file, ...four(s), met: s.branches.pct >= TARGET, branches_to_add_for_target: needed, note, untested };
}).sort((a, b) => a.branches.pct - b.branches.pct || a.file.localeCompare(b.file));

const covered = modules.reduce((n, m) => n + m.branches.covered, 0);
const total = modules.reduce((n, m) => n + m.branches.total, 0);
const combinedPct = total ? Math.round((covered / total) * 10000) / 100 : 100;
const met = modules.filter((m) => m.met).length;

// ------------------------------------------------------------------- write --

const facts = runFacts();
const asJson = {
  label, date: new Date().toISOString(), ...facts,
  remapper: "ast-aware",
  totals: four(summaryRaw.total),
  critical: {
    target_branch_pct: TARGET, met, below: modules.length - met, missing,
    combined_branches: { covered, total, pct: combinedPct },
    modules: modules.map(({ file, branches, met: ok, branches_to_add_for_target, note }) => ({ file, branches, met: ok, branches_to_add_for_target, note })),
  },
  test_only_files_left_out: testOnly.length,
  code_files_not_measured: notMeasured,
  files: Object.fromEntries(Object.keys(summary).sort().map((f) => [f, four(summary[f])])),
};

const inlineCode = (s) => {
  if (!s) return "(no code at this place)";
  const ticks = "`".repeat(Math.max(0, ...(s.match(/`+/g) || []).map((t) => t.length)) + 1);
  return ticks.length > 1 ? `${ticks} ${s} ${ticks}` : `\`${s}\``;
};
const pct = (b) => `${b.pct.toFixed(2)} %`;
const t = facts.tests;
const md = [
  `# Coverage of the critical modules: ${label}`,
  "",
  `Measured with the default test suite only (\`vitest.config.ts\`). Tests in \`tests/qa/pass4/\`, the live tests and the browser tests are not counted.`,
  "",
  `- Commit: \`${facts.commit}\`, with ${facts.src_changes_not_committed} changes under src not committed`,
  t ? `- Tests: ${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped, in ${t.files} files` : "- Tests: no vitest-results.json, so the test result is not known",
  `- Tool: vitest ${facts.vitest} with @vitest/coverage-v8 ${facts.coverage_v8}, AST-aware remapping (real if, ?:, and/or, switch and default-value branches)`,
  `- Every part of an and/or chain counts as a branch, and so does each side of an if, even when the if has no else`,
  `- Figures made without AST-aware remapping cannot be compared with these: that mode counts far fewer branches, and a file whose functions no test calls can show 100 %`,
  `- Command: \`${facts.command}\``,
  "",
  `## Where each module stands against ${TARGET} %`,
  "",
  `${met} of ${modules.length} modules meet ${TARGET} %. Together: ${covered} of ${total} branches, ${combinedPct.toFixed(2)} %. Worst first.`,
  "",
  `| Module | Branches | Branch % | Against ${TARGET} % | Branches to add | Functions % | Note |`,
  "|---|---|---|---|---|---|---|",
  ...modules.map((m) => `| \`${m.file}\` | ${m.branches.covered} of ${m.branches.total} | ${pct(m.branches)} | ${m.met ? "met" : "below"} | ${m.branches_to_add_for_target} | ${pct(m.functions)} | ${m.note} |`),
  "",
  critical.not_found.length || missing.length
    ? `**Not found or not measured:** ${[...critical.not_found, ...missing].map((f) => `\`${f}\``).join(", ")}`
    : "Every named module was found at the path in `tests/qa/pass4/critical-modules.json`. None has moved.",
  "",
  "Similar names that are not counted:",
  "",
  ...Object.entries(critical.similar_names_not_included).map(([f, why]) => `- \`${f}\`: ${why}`),
  "",
  `## Code files under src with no figure (${notMeasured.length})`,
  "",
  `The coverage tool could not read these, so a fall in them cannot be seen. The ones seen so far are files no test loads, with a name like [id] in their path. ${notMeasured.some((f) => critical.files.includes(f)) ? "**A critical module is among them.**" : "None is a critical module."}`,
  "",
  ...(notMeasured.length ? notMeasured.map((f) => `- \`${f}\``) : ["None."]),
  "",
  "## Every untested branch",
  "",
  ...modules.flatMap((m) => [
    `### ${m.file}: ${pct(m.branches)}, ${m.untested.length} untested`,
    "",
    ...(m.untested.length ? m.untested.map((u) => `- \`${m.file}:${u.line}\` ${u.what}: ${inlineCode(u.code)}`) : ["None."]),
    "",
  ]),
].join("\n");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, `${label}.json`), `${JSON.stringify(asJson, null, 1)}\n`);
fs.writeFileSync(path.join(OUT_DIR, `${label}-critical.md`), md);
console.log(`${label}: ${Object.keys(summary).length} files measured, ${notMeasured.length} not measured; critical modules: ${met} of ${modules.length} at ${TARGET} %, together ${combinedPct} %${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
