// QA pass 6: puts every agent finding (docs/qa/pass6/findings/*.json) into docs/qa/pass6/BUGS.json. A finding a P6 row fixed is not added
// again: its id is listed in that row's found_by. A finding the owner must decide gets status "owner". Every other finding becomes an open row
// with its own id; `verified` is false (the agent's own probe or code reading, not re-run by the lead) unless listed in VERIFIED.
//   node tests/qa/pass6/import-findings.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const P6 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "docs", "qa", "pass6");
const bugs = JSON.parse(fs.readFileSync(path.join(P6, "BUGS.json"), "utf8"));

/** finding id -> the P6 row that fixed it */
export const FIXED = {
  "redsec2-02": "P6-006", "redsec2-06": "P6-009", "redsec2-03": "P6-014", "redsec2-09": "P6-012", "redsec2-10": "P6-016", "redsec2-14": "P6-017",
  "officer-day-21": "P6-015", "officer-day-27": "P6-003", "pass4-open-04": "P6-008",
  "reviewer1-01": "P6-010", "reviewer1-02": "P6-010", "reviewer1-04": "P6-007", "reviewer1-05": "P6-007", "reviewer1-10": "P6-007",
  "reviewer2-01": "P6-012", "reviewer2-03": "P6-011", "reviewer2-04": "P6-011", "reviewer2-05": "P6-011", "reviewer2-06": "P6-011", "reviewer2-07": "P6-011",
  "reviewer2-08": "P6-011", "reviewer2-09": "P6-011", "reviewer2-10": "P6-011", "reviewer2-11": "P6-013", "reviewer2-12": "P6-013", "reviewer2-14": "P6-013",
  "reviewer3-01": "P6-018", "reviewer3-12": "P6-018", "reviewer3-02": "P6-019", "reviewer3-03": "P6-019", "reviewer3-04": "P6-019", "reviewer3-06": "P6-021",
  "reviewer3-07": "P6-020", "reviewer3-08": "P6-020", "reviewer3-10": "P6-026",
  "reviewer5-01": "P6-029", "reviewer5-02": "P6-029", "reviewer5-03": "P6-029", "reviewer5-13": "P6-030", "hunt2-desk-05": "P6-027", "hunt2-ops-06": "P6-028", "console-sync-05": "P6-028"
};
/** finding id -> why it is the owner's to decide */
export const OWNER = {
  "redsec2-04": "Sign-out ends only this tab's cookie by design (Apshana's per-tab sessions, f49b4ec; her version is final). Revoking the one token needs a server-side list of signed-out tokens: a change to that design.",
  "redsec2-05": "Sign-in on /api/i18n is an owner's decision (pass 5 brief, section 4); the batch poisoning goes with it.",
  "officer-day-01": "The officer console deliberately uses the Collector's reporting windows (officer/data.ts windowWhere); showing all open work whatever the period is a design change.",
  "officer-day-03": "Whether the Collector may verify, resolve or reject at any stage is the Collector's authority: a design question.",
  "hunt2-sec-08": "The petition desk password (P5-006) is the owner's decision; a ready patch is in docs/qa/pass5/patches/.",
  "hunt2-sec-01": "The same as redsec2-04: sign-out ends only the tab's cookie by design (per-tab sessions, f49b4ec).",
  "hunt2-desk-01": "Joining another department's case (P5-021) is the owner's decision; the desk no longer offers it (P6-011), the route still accepts it.",
  "reviewer3-09": "Joining another department's case (P5-021) is the owner's decision; the desk no longer offers it, the route still accepts it."
};
/** findings the lead re-ran */
export const VERIFIED = new Set([]);

const fixedSet = new Map();
for (const [f, p] of Object.entries(FIXED)) fixedSet.set(f, p);
let added = 0, linked = 0;
for (const file of fs.readdirSync(path.join(P6, "findings")).filter((f) => f.endsWith(".json")).sort()) {
  const rows = JSON.parse(fs.readFileSync(path.join(P6, "findings", file), "utf8"));
  if (!Array.isArray(rows)) continue;
  for (const x of rows) {
    if (!x?.id || !/^P[0-3]$/.test(String(x.severity))) continue;
    const fixedBy = fixedSet.get(x.id);
    if (fixedBy) {
      const b = bugs.find((r) => r.id === fixedBy);
      if (b && !String(b.found_by ?? "").includes(x.id)) b.found_by = `${b.found_by ?? ""}${b.found_by ? "; " : ""}${x.id}`;
      linked++;
      continue;
    }
    const row = { id: x.id, severity: x.severity, area: x.area ?? null, title: x.title, found_by: file.replace(/\.json$/, ""), repro: x.repro ?? null, failing_test: null,
      root_cause: x.cause ?? null, fix_commit: null, revert_check: null, status: OWNER[x.id] ? "owner" : "open", reviewer: null, where: x.where ?? null,
      confidence: x.confidence ?? null, verified: VERIFIED.has(x.id), ...(OWNER[x.id] ? { owner_reason: OWNER[x.id] } : {}) };
    const i = bugs.findIndex((r) => r.id === x.id);
    if (i < 0) { bugs.push(row); added++; } else bugs[i] = { ...bugs[i], ...row };
  }
}
bugs.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
fs.writeFileSync(path.join(P6, "BUGS.json"), JSON.stringify(bugs, null, 2) + "\n");
console.log(`${bugs.length} rows; ${added} findings added, ${linked} linked to the P6 row that fixed them`);
