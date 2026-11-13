// QA pass 4: the before-and-after ledger of two runs.   node tests/qa/pass4/grader/ledger.mjs <labelA> <labelB>
// Lists every row that changed grade, right-to-wrong first, with the words each run said on it. Exit code 1 on any right-to-wrong.
// Also writes docs/qa/pass4/results/ledger-<labelA>--<labelB>.md. QA_P4_RESULTS_DIR moves the folder, for the tool's own test.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.QA_P4_RESULTS_DIR || path.resolve(here, "..", "..", "..", "..", "..", "docs", "qa", "pass4", "results");
const RANK = { right: 2, safe: 1, wrong: 0 };

/** The words added and taken away between two lines. */
export function wordDiff(a, b) {
  const wa = String(a ?? "").split(/\s+/).filter(Boolean), wb = String(b ?? "").split(/\s+/).filter(Boolean);
  const count = (l) => l.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map());
  const ca = count(wa), cb = count(wb), gone = [], added = [];
  for (const w of wa) { if ((cb.get(w) ?? 0) > 0) cb.set(w, cb.get(w) - 1); else gone.push(w); }
  for (const w of wb) { if ((ca.get(w) ?? 0) > 0) ca.set(w, ca.get(w) - 1); else added.push(w); }
  return { gone, added };
}

/** Every row whose grade or confident flag changed. Right-to-wrong first, then other falls, then rises. */
export function ledger(docA, docB) {
  const byA = new Map(docA.rows.map((r) => [r.id, r]));
  const changes = [], onlyA = new Set(byA.keys()), onlyB = [];
  for (const b of docB.rows) {
    const a = byA.get(b.id);
    if (!a) { onlyB.push(b.id); continue; }
    onlyA.delete(b.id);
    if (a.grade === b.grade && !!a.confident_wrong === !!b.confident_wrong && a.said === b.said) continue;
    const d = wordDiff(a.said, b.said);
    changes.push({ id: b.id, family: b.family, lang: b.lang, text: b.text, from: a.grade, to: b.grade, confident_from: !!a.confident_wrong, confident_to: !!b.confident_wrong, kind: a.grade === b.grade ? "same grade, new words" : a.grade === "right" && b.grade === "wrong" ? "right to wrong" : RANK[b.grade] < RANK[a.grade] ? "fell" : "rose",
      said_from: a.said, said_to: b.said, words_gone: d.gone, words_added: d.added, reasons_to: b.reasons ?? [] });
  }
  const order = { "right to wrong": 0, fell: 1, "same grade, new words": 2, rose: 3 };
  changes.sort((x, y) => order[x.kind] - order[y.kind] || x.id.localeCompare(y.id));
  return { changes, right_to_wrong: changes.filter((c) => c.kind === "right to wrong").length, fell: changes.filter((c) => c.kind === "fell").length, rose: changes.filter((c) => c.kind === "rose").length, only_in_a: [...onlyA], only_in_b: onlyB };
}

export function renderLedger(labelA, labelB, l) {
  const out = [`# QA pass 4 ledger: ${labelA} to ${labelB}`, "", `Right to wrong: ${l.right_to_wrong}. Other falls: ${l.fell}. Rises: ${l.rose}. New words at the same grade: ${l.changes.length - l.right_to_wrong - l.fell - l.rose}.`, ""];
  if (l.only_in_a.length || l.only_in_b.length) out.push(`Rows in one run only: ${[...l.only_in_a, ...l.only_in_b].join(", ")}.`, "");
  for (const c of l.changes) {
    out.push(`## ${c.kind}: ${c.id} (${c.family}/${c.lang}), ${c.from}${c.confident_from ? " confident" : ""} to ${c.to}${c.confident_to ? " confident" : ""}`, "", `Said to it: ${c.text}`, "", `Before: ${c.said_from}`, "", `After: ${c.said_to}`, "");
    if (c.words_gone.length || c.words_added.length) out.push(`Words gone: ${c.words_gone.join(" ") || "none"}. Words added: ${c.words_added.join(" ") || "none"}.`, "");
    if (c.to === "wrong") out.push(`Why wrong now: ${c.reasons_to.join("; ")}`, "");
  }
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [labelA, labelB] = process.argv.slice(2);
  if (!labelA || !labelB) { console.error("usage: ledger.mjs <labelA> <labelB>"); process.exit(2); }
  const read = (x) => JSON.parse(fs.readFileSync(path.join(DIR, `${x}.json`), "utf8"));
  const l = ledger(read(labelA), read(labelB));
  fs.writeFileSync(path.join(DIR, `ledger-${labelA}--${labelB}.md`), renderLedger(labelA, labelB, l));
  console.log(JSON.stringify({ right_to_wrong: l.right_to_wrong, fell: l.fell, rose: l.rose, changed: l.changes.length }));
  for (const c of l.changes.filter((x) => x.kind === "right to wrong")) console.log(`RIGHT TO WRONG ${c.id}`);
  process.exit(l.right_to_wrong ? 1 : 0);
}
