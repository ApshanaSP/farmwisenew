// QA pass 4: the report of a run.   node tests/qa/pass4/grader/report.mjs <label>
// Writes docs/qa/pass4/results/<label>.md: confident wrong answers first, then per family and per language tables of right, safe, wrong and code-lane coverage, with Wilson 95 % intervals.
// QA_P4_RESULTS_DIR moves the folder, for the tool's own test.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wilson } from "./grade.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.QA_P4_RESULTS_DIR || path.resolve(here, "..", "..", "..", "..", "..", "docs", "qa", "pass4", "results");

const pct = (x) => `${(x * 100).toFixed(1)} %`;
const cell = (k, n) => { const w = wilson(k, n); return n ? `${k} (${pct(k / n)}; ${pct(w.lo)} to ${pct(w.hi)})` : "0"; };
const clip = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").replace(/\|/g, "/").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const failed = (r) => Object.entries(r.checks ?? {}).filter(([, v]) => !v.pass).map(([k]) => k);

function table(rows, keyOf, title) {
  const keys = [...new Set(rows.map(keyOf))].sort();
  const out = [`## ${title}`, "", `| ${title.split(" ").pop()} | n | right | safe | wrong | confident wrong | code-lane coverage | right in the code lanes |`, "|---|---:|---:|---:|---:|---:|---:|---:|"];
  for (const k of [...keys, null]) {
    const l = k == null ? rows : rows.filter((r) => keyOf(r) === k);
    const n = l.length, g = (x) => l.filter((r) => r.grade === x).length;
    const code = l.filter((r) => r.code_lane);
    out.push(`| ${k == null ? "**all**" : k} | ${n} | ${cell(g("right"), n)} | ${cell(g("safe"), n)} | ${cell(g("wrong"), n)} | ${cell(l.filter((r) => r.confident_wrong).length, n)} | ${cell(code.length, n)} | ${code.filter((r) => r.grade === "right").length} of ${code.length} |`);
  }
  return out.join("\n");
}

function explainWrong(r) {
  const bits = [];
  for (const name of failed(r)) {
    const ev = r.checks[name].evidence;
    if (name === "1_case") bits.push(`retold ${ev.case_id}: ${(ev.faults ?? []).map((f) => `${f.field} is ${f.got}, asked ${f.want}`).join("; ")}`);
    else if (name === "2_list") bits.push(`${(ev.faults ?? []).length} of ${ev.rows_checked} rows fail: ${(ev.faults ?? []).slice(0, 2).map((f) => `${f.id} ${f.field} ${f.got}`).join("; ")}`);
    else if (name === "2_total") bits.push(`total said ${ev.said}, oracle ${ev.oracle}`);
    else if (name === "3_figures") bits.push(`figures: ${(ev.bad ?? []).slice(0, 3).map((b) => `${b.said} as ${b.as}${b.want?.length ? `, oracle ${b.want.slice(0, 2).join(" or ")}` : ""}`).join("; ")}`);
    else if (name === "3_count") bits.push(`count: said ${JSON.stringify(ev.said)}, oracle ${JSON.stringify(ev.oracle)}`);
    else if (name === "6_scope") bits.push(`scope: ${JSON.stringify(ev.mismatch ?? ev.step_faults).slice(0, 160)}`);
    else if (name === "6_outside") bits.push(`on our data: ${ev.screen ?? (ev.steps ?? []).map((s) => JSON.stringify(s.view ?? s.a)).join(" ")}`);
    else if (name === "7_action") bits.push(`asked ${ev.asked}, did ${ev.did}`);
    else if (name === "1_honest_none") bits.push(`said none, oracle ${JSON.stringify(ev.oracle)}`);
    else if (name === "4_open_closed") bits.push(`status: ${JSON.stringify(ev.told_wrong ?? ev.faults).slice(0, 160)}`);
    else if (name === "5_language") bits.push(`language: ${ev.rule}`);
    else bits.push(name);
  }
  return bits.join(". ") || (r.reasons ?? []).join(". ");
}

export function renderReport(doc) {
  const rows = doc.rows, cw = rows.filter((r) => r.confident_wrong), s = doc.summary ?? {};
  const wrongPlain = rows.filter((r) => r.grade === "wrong" && !r.confident_wrong);
  const out = [`# QA pass 4: ${doc.label}`, "",
    `Set: ${doc.set} (${rows.length} rows), hash ${String(doc.set_hash ?? "").slice(0, 16)}. Mode: ${doc.mode}. Build ${doc.build_id}. Clock frozen at ${doc.frozen_clock}. Wall time ${Math.round((doc.ms ?? 0) / 1000)} s.`, "",
    `Right ${s.right}, safe ${s.safe}, wrong ${s.wrong} (confident wrong ${s.confident_wrong}, language alone ${s.wrong_language_only ?? 0}). Answered with no model: ${s.code_lane}. Reached the model lane: ${s.model_needed}. Crashes: ${rows.filter((r) => r.crash).length}.`, "",
    doc.mode === "live" ? "" : "This run had no model key. A row marked model needed got what a real server with no model gives, and it says nothing about what the model would do. The code-lane column is the part this run does measure.", "",
    `## Confident wrong answers (${cw.length})`, "", "| id | family/lang | said | what is wrong |", "|---|---|---|---|"];
  for (const r of [...cw].sort((a, b) => `${a.family}${a.id}`.localeCompare(`${b.family}${b.id}`))) out.push(`| ${r.id} | ${r.family}/${r.lang} | ${clip(r.text, 70)} -> ${clip(r.said, 90)} | ${clip(explainWrong(r), 240)} |`);
  out.push("", table(rows, (r) => r.family, "By family"), "", table(rows, (r) => r.lang, "By language"), "");
  const chk = {};
  for (const r of rows) for (const n of failed(r)) chk[n] = (chk[n] ?? 0) + 1;
  out.push("## Which checks failed", "", "| check | rows |", "|---|---:|", ...Object.entries(chk).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), "");
  out.push(`## Wrong, not confident (${wrongPlain.length})`, "", "A language failure alone, or a move that answers nothing and contradicts nothing.", "", "| id | said | why |", "|---|---|---|");
  for (const r of wrongPlain) out.push(`| ${r.id} | ${clip(r.said, 80)} | ${clip((r.reasons ?? []).join("; "), 160)} |`);
  const rightUnchecked = rows.filter((r) => r.grade === "right" && (r.unchecked_must ?? []).length);
  out.push("", `## Right, with plain-language lines for a human judge (${rightUnchecked.length})`, "", "Code cannot read these lines. They are kept for a person to check.", "");
  for (const r of rightUnchecked) out.push(`- **${r.id}** ${clip(r.said, 100)}: ${(r.unchecked_must ?? []).map((m) => clip(m, 90)).join("; ")}`);
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const label = process.argv[2];
  if (!label) { console.error("usage: report.mjs <label>"); process.exit(2); }
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, `${label}.json`), "utf8"));
  const file = path.join(DIR, `${label}.md`);
  fs.writeFileSync(file, renderReport(doc));
  console.log(file);
}
