// QA pass 4: PAIRWISE combinations of zone, department, taluk, category, severity, status and period over the Collector list and export,
// each count checked against the independent oracle (tests/qa/oracle/pinned.mjs). Every pair of values of any two filters appears in at least one case.
//   node tests/qa/pass4/server.mjs start --port 3142 --frozen --ticking --instance conc
//   node tests/qa/pass4/pairwise.mjs [--port 3142]      writes docs/qa/pass4/evidence/pairwise.json
// The oracle reads the server's own local copy of decisions (data/aws-cache/qa/srv/<instance>/durable.sqlite) so decisions made on it count.
import fs from "node:fs";
import path from "node:path";
import { Http, EVIDENCE_DIR } from "./same-number.mjs";
import { loadOracle } from "../oracle/pinned.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const PORT = Number(arg("port", 3142)), INSTANCE = arg("instance", "conc");
const DIMS = {
  period: ["daily", "weekly", "monthly", "quarterly"],
  zone: [null, 13, 5, 9],
  dept: [null, "GCC-SWM", "GCC-ELE", "CMWSSB"],
  taluk: [null, "TLK-MYL", "TLK-ALD", "TLK-TBM"],
  cat: [null, "SOLID_WASTE", "STREETLIGHT_ELECTRICAL", "DRAINAGE_SEWAGE"],
  sev: [null, "Severe", "High", "Low"],
  status: [null, "open", "Resolved", "Rejected"]
};
const names = Object.keys(DIMS);

/** Greedy all-pairs: keep adding the candidate case that covers the most uncovered pairs. */
function pairwise() {
  const key = (a, va, b, vb) => `${a}=${va}|${b}=${vb}`;
  const need = new Set();
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++)
    for (const va of DIMS[names[i]]) for (const vb of DIMS[names[j]]) need.add(key(names[i], va, names[j], vb));
  const total = need.size, cases = [];
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const covers = (c) => { const s = []; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) s.push(key(names[i], c[names[i]], names[j], c[names[j]])); return s; };
  while (need.size) {
    let best = null, bestN = -1;
    for (let t = 0; t < 400; t++) {
      const c = Object.fromEntries(names.map((n) => [n, DIMS[n][Math.floor(rnd() * DIMS[n].length)]]));
      const n = covers(c).filter((k) => need.has(k)).length;
      if (n > bestN) { bestN = n; best = c; }
    }
    covers(best).forEach((k) => need.delete(k));
    cases.push(best);
  }
  return { cases, pairs: total };
}

const { cases, pairs } = pairwise();
const o = loadOracle({ durableFile: path.resolve(`data/aws-cache/qa/srv/${INSTANCE}/durable.sqlite`) });
const h = new Http(PORT);
const qs = (c) => Object.entries(c).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
// Resolved is closed in the window by its closing time, as the Resolved tile counts it (PB-214, RC-29; the oracle's resolvedByClose). Every other status keeps the reported-in-window rule.
const oracleRows = (c) => (c.status === "Resolved"
  ? o.resolvedByClose({ period: c.period, zone: c.zone, dept: c.dept }).filter((r) => (c.taluk == null || r.taluk === c.taluk) && (c.cat == null || r.cat === c.cat))
  : o.rows({ period: c.period, zone: c.zone, dept: c.dept, taluk: c.taluk, cat: c.cat }).filter((r) => c.status == null || (c.status === "open" ? r.open : r.effStatus === c.status)))
  .filter((r) => c.sev == null || r.sev === c.sev);
const out = { ran_at: new Date().toISOString(), oracleNow: o.now, pairs, cases: cases.length, results: [], problems: [], notReached: ["map layers/ask/export (the plan format was not driven in this run)"] };
const label = (c) => names.map((n) => `${n}=${c[n] ?? "any"}`).join(" ");

let exportBudget = 20; // each export asks for a confirm grant; the first cases that have no sev/status filter are tried
for (const c of cases) {
  const want = oracleRows(c);
  const r = await h.get("collector", `/api/collector/list?${qs(c)}`);
  const app = r.json?.incidents ?? null;
  const rec = { case: label(c), surface: "collector/list", status: r.status, app, oracle: want.length, ok: app === want.length };
  const wantC = want.reduce((a, x) => a + (Number(x.complaints) || 0), 0);
  if (r.json && r.json.complaints != null) { rec.appComplaints = r.json.complaints; rec.oracleComplaints = wantC; rec.ok = rec.ok && r.json.complaints === wantC; }
  out.results.push(rec);
  if (!rec.ok) { out.problems.push(rec); console.log("PROBLEM", rec.case, "app", app, "oracle", want.length, "complaints", rec.appComplaints, wantC); }
  if (c.sev == null && c.status == null && exportBudget > 0) {
    exportBudget--;
    const url = `/api/collector/export?${qs({ period: c.period, zone: c.zone, dept: c.dept, cat: c.cat, taluk: c.taluk })}`;
    let e = await h.get("collector", url);
    if (e.status === 428) { const g = await h.grant("collector", e.json.confirm.scope); e = await h.get("collector", url, { "x-diq-grant": g }); }
    const er = { case: label(c), surface: "collector/export", status: e.status, app: e.json?.count ?? null, oracle: want.length, ok: e.status === 200 && e.json?.count === want.length };
    out.results.push(er);
    if (!er.ok) { out.problems.push(er); console.log("PROBLEM export", er.case, "app", er.app, "oracle", want.length, "status", er.status); }
  }
}
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(path.join(EVIDENCE_DIR, "pairwise.json"), JSON.stringify(out, null, 1));
console.log(`done: ${pairs} pairs in ${cases.length} cases, ${out.results.length} reads, ${out.problems.length} problem(s)`);
