// Compare figures the app showed against the independent oracle. No app code is imported.
//
//   node tests/qa/oracle/compare.mjs <app-figures.json> [--oracle <oracle.json>] [--now "YYYY-MM-DD HH:MM:SS" | --now wall]
//
// app-figures.json: [{ scope: { period, zone, dept }, figures: { reported, open, severe, overdue, ... } }, ...]
//   period: daily | weekly | monthly | quarterly; zone: null (district), a zone number, or "none" (no zone);
//   dept: null (all) or a lead_dept code. Extra figure keys are compared when the oracle has them
//   (multi_source/multi, news_only/newsOnly, news_only_open, severe_open, complaints, complaints_open).
// With --now the oracle is recomputed for that "now" (use the as-of the console showed); otherwise the figures in
// oracle.json are used. Exit code 1 when anything differs or a scope cannot be found.
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./load.mjs";
import { compute, figures, inWindow, resolveNow } from "./oracle.mjs";

const ALIAS = { multi: "multi_source", multiSource: "multi_source", newsOnly: "news_only", newsOnlyOpen: "news_only_open",
  severeOpen: "severe_open", complaintsOpen: "complaints_open", past_deadline: "overdue", pastDeadline: "overdue", n: "reported" };

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const appFile = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!appFile) {
  console.error("usage: node tests/qa/oracle/compare.mjs <app-figures.json> [--oracle oracle.json] [--now <as-of>|wall]");
  process.exit(2);
}
const app = JSON.parse(fs.readFileSync(appFile, "utf8"));
if (!Array.isArray(app)) { console.error("app figures must be a JSON array"); process.exit(2); }

let lookup, now;
if (get("--now")) {
  now = resolveNow(get("--now"));
  const { nowMs, inc } = compute(now);
  lookup = (s) => {
    let w = inWindow(inc, s.period, nowMs);
    if (s.zone === "none") w = w.filter((i) => i.zone == null);
    else if (s.zone != null) w = w.filter((i) => i.zone === Number(s.zone));
    if (s.dept != null) w = w.filter((i) => i.dept === s.dept);
    return figures(w);
  };
} else {
  const file = get("--oracle") ?? path.join(APP_ROOT, "..", "docs", "qa", "evidence", "oracle.json");
  const o = JSON.parse(fs.readFileSync(file, "utf8"));
  now = o.now;
  lookup = (s) => {
    const p = o.periods[s.period];
    if (!p) return null;
    if (s.zone != null && s.dept != null) return null; // zone x dept needs --now (recompute)
    if (s.zone === "none") return p.no_zone;
    if (s.zone != null) return p.zones[String(s.zone)] ?? null;
    if (s.dept != null) return p.depts[s.dept] ?? null;
    return p.district;
  };
}

let bad = 0, checked = 0;
const label = (s) => `${s.period}/zone=${s.zone ?? "all"}/dept=${s.dept ?? "all"}`;
for (const row of app) {
  const s = { period: row.scope?.period, zone: row.scope?.zone ?? null, dept: row.scope?.dept ?? null };
  const want = s.period ? lookup(s) : null;
  if (!want) { bad++; console.log(`MISSING  ${label(s)}: no oracle figures for this scope${s.zone != null && s.dept != null ? " (pass --now to recompute zone x dept)" : ""}`); continue; }
  for (const [k0, v] of Object.entries(row.figures ?? {})) {
    const k = ALIAS[k0] ?? k0;
    if (!(k in want)) { console.log(`SKIP     ${label(s)} ${k0}: the oracle has no such figure`); continue; }
    checked++;
    if (Number(v) !== want[k]) { bad++; console.log(`MISMATCH ${label(s)} ${k0}: app=${v} oracle=${want[k]} (diff ${Number(v) - want[k]})`); }
  }
}
console.log(`now=${now}: ${checked} figures checked, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
