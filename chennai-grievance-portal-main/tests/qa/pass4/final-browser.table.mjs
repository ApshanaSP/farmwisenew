// Builds the page-by-role-by-language table (markdown) from docs/qa/pass4/evidence/final-browser/pages.json.
//   node tests/qa/pass4/final-browser.table.mjs  -> prints the markdown tables and a JSON of the counts
import fs from "node:fs";
import path from "node:path";
import { EV, ROLES } from "./final-browser.lib.mjs";

const d = JSON.parse(fs.readFileSync(path.join(EV, "pages.json"), "utf8"));
const roleName = (r) => r ?? "signedOut";
const problems = (r) => {
  const p = [];
  if (r.error) p.push("error: " + r.error.slice(0, 40));
  if (r.clickErr) p.push("tab not clickable");
  if (r.landed !== r.expect) p.push(`landed ${r.landed}, wanted ${r.expect}`);
  if (r.console?.length) p.push(`console x${r.console.length}`);
  if (r.failed?.length) p.push(`failed request x${r.failed.length}`);
  if (r.sideways) p.push("sideways scroll");
  for (const a of r.axeRules || []) if (a.impact === "critical" || a.impact === "serious") p.push(`axe ${a.impact} ${a.id} x${a.nodes}`);
  if (r.lang === "ta" && r.landed === "ok" && r.tamilChars === 0 && r.latinChars > 20) p.push("no Tamil text");
  return p;
};
const pages = [...new Set(d.rows.map((r) => r.page))];
const meaning = { login: "sign-in page", register: "register", forgot: "forgot password", root: "/ (goes home)", citizen: "citizen home", "citizen-file": "file a complaint", "citizen-track": "track complaints", officer: "officer overview", collector: "collector overview", profile: "profile" };
const out = [];
const counts = { rows: d.rows.length, pass: 0, fail: 0, byRule: {} };
for (const r of d.rows) { const p = problems(r); if (p.length) counts.fail++; else counts.pass++; for (const a of r.axeRules || []) if (a.impact === "critical" || a.impact === "serious") counts.byRule[a.id] = (counts.byRule[a.id] || 0) + 1; }
for (const lang of ["en", "ta"]) {
  out.push(`\n### ${lang === "en" ? "English" : "Tamil"}: each cell is 1440 px / 360 px\n`);
  out.push("| Page | " + ROLES.map(roleName).join(" | ") + " |");
  out.push("|---|" + ROLES.map(() => "---").join("|") + "|");
  for (const pg of pages) {
    const cells = ROLES.map((role) => {
      const two = [1440, 360].map((vp) => d.rows.find((r) => r.page === pg && r.role === role && r.lang === lang && r.vp === vp));
      if (two.every((x) => !x)) return "n/a";
      const marks = two.map((x) => (!x ? "-" : problems(x).length ? problems(x).join("; ") : "pass"));
      const exp = two.find((x) => x)?.expect;
      const tag = exp === "login" ? " (sent to sign-in)" : exp === "citizen" ? " (sent home)" : exp === "404" ? " (404)" : exp === "home" ? " (redirect)" : "";
      return marks[0] === marks[1] ? marks[0] + (marks[0] === "pass" ? tag : "") : marks.join(" / ");
    });
    out.push(`| ${meaning[pg] || pg} | ${cells.join(" | ")} |`);
  }
}
console.log(out.join("\n"));
console.error(JSON.stringify(counts));
fs.writeFileSync(path.join(EV, "pages-table.md"), out.join("\n"));
