// Turns docs/qa/pass4/mutation/<label>.json into <label>.md: score per module and the survivors that matter most.
import fs from "fs";
const label = process.argv[2] || "baseline";
const dir = "../docs/qa/pass4/mutation";
const rep = JSON.parse(fs.readFileSync(`${dir}/${label}.json`, "utf8"));
const weight = { ConditionalExpression: 5, EqualityOperator: 5, LogicalOperator: 5, BooleanLiteral: 4, ArithmeticOperator: 4, UnaryOperator: 3, MethodExpression: 3, ArrayDeclaration: 3, ObjectLiteral: 3, BlockStatement: 3, OptionalChaining: 2, AssignmentOperator: 2, UpdateOperator: 2, Regex: 2, StringLiteral: 1 };
const rows = [], surv = [];
for (const [f, d] of Object.entries(rep.files)) {
  const c = { Killed: 0, Survived: 0, NoCoverage: 0, Timeout: 0, other: 0 };
  for (const m of d.mutants) {
    c[m.status] !== undefined ? c[m.status]++ : c.other++;
    if (m.status === "Survived" || m.status === "NoCoverage") {
      const lines = d.source.split("\n"); const ln = m.location.start.line;
      surv.push({ f, ln, m, w: (weight[m.mutatorName] ?? 1) + (m.status === "Survived" ? 2 : 0), code: (lines[ln - 1] || "").trim().slice(0, 90) });
    }
  }
  const det = c.Killed + c.Timeout, tot = det + c.Survived + c.NoCoverage;
  rows.push({ f, ...c, tot, score: tot ? (100 * det / tot).toFixed(1) : "-" });
}
// spread: at most 4 per file, highest weight first
const per = {}, top = [];
for (const s of surv.sort((a, b) => b.w - a.w)) { per[s.f] = (per[s.f] || 0) + 1; if (per[s.f] <= 4 && top.length < 30) top.push(s); }
let md = `# Mutation testing: ${label}\n\nStryker, perTest coverage, sandboxed copy. Score = (killed + timeout) / all mutants. NoCoverage = no test reaches the line.\n\n| module | score % | killed | survived | no coverage | timeout |\n|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.f} | ${r.score} | ${r.Killed} | ${r.Survived} | ${r.NoCoverage} | ${r.Timeout} |\n`;
md += `\n## 30 survivors that matter most (logic changes first, at most 4 per file)\n\n`;
top.forEach((s, i) => { md += `${i + 1}. ${s.f}:${s.ln} [${s.m.status}] ${s.m.mutatorName} -> \`${String(s.m.replacement ?? "").slice(0, 60).replace(/\n/g, " ")}\`  (code: \`${s.code}\`)\n`; });
fs.writeFileSync(`${dir}/${label}.md`, md);
console.log(md.slice(0, 1500));
