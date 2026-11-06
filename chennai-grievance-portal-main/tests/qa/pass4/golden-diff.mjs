// QA pass 4: compares two golden-master recordings.
//   node tests/qa/pass4/golden-diff.mjs <labelA> <labelB> [--max-paths 25]
// Prints every changed request with a compact JSON-path diff of its body, and writes docs/qa/pass4/golden/diffs/<A>__<B>.json and .md. Exit code 1 if anything differs.
// Those two files are committed, so personal data is masked in them (see the rule in `mask` below). Bodies stay in the gitignored data/aws-cache/qa/golden/<label>/.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { APP_ROOT, QA_DIR } from "./lib/env.mjs";

const args = process.argv.slice(2);
const [A, B] = args.filter((x, i) => !x.startsWith("--") && args[i - 1] !== "--max-paths");
const maxPaths = Number(args[args.indexOf("--max-paths") + 1]) > 0 && args.includes("--max-paths") ? Number(args[args.indexOf("--max-paths") + 1]) : 25;
if (!A || !B) { console.error("usage: golden-diff.mjs <labelA> <labelB> [--max-paths 25]"); process.exit(2); }

const DOCS = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "golden");
const load = (label) => {
  const f = path.join(DOCS, `${label}.manifest.json`);
  if (!fs.existsSync(f)) { console.error(`no manifest for ${label}: ${f}`); process.exit(2); }
  return JSON.parse(fs.readFileSync(f, "utf8"));
};
const ma = load(A), mb = load(B);
const body = (label, sha) => {
  try { return zlib.gunzipSync(fs.readFileSync(path.join(QA_DIR, "golden", label, "bodies", `${sha}.gz`))); } catch { return null; }
};

// ---- what may go in a committed file
const PERSONAL_KEY = /(^|_)(e?mail|mobile|phone|first_?name|last_?name|full_?name|user_?name|citizen|complainant|reporter|reported_by|created_by|initials|street_?address|address|pincode|password|token|grant|actor|decided_by|owner|sent_by|ua|ip)(_|$|number|name)/i;
const short = (s, n = 140) => (s.length > n ? `${s.slice(0, n)}... (${s.length} chars)` : s);
function mask(key, v) {
  if (v === undefined) return "(absent)";
  if (v === null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") return Array.isArray(v) ? `[array of ${v.length}]` : `{object with ${Object.keys(v).length} keys}`;
  if (PERSONAL_KEY.test(String(key))) return `(masked, ${v.length} chars)`;
  return short(v.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "(email)").replace(/(?<![\d-])[6-9]\d{9}(?!\d)/g, "(mobile)"));
}

// ---- a compact JSON-path diff
function diffValues(a, b, at, key, out) {
  if (a === b || (a && b && typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b))) return;
  const bothArrays = Array.isArray(a) && Array.isArray(b);
  const bothObjects = a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b);
  if (bothArrays) {
    if (a.length !== b.length) out.push({ path: `${at}.length`, a: a.length, b: b.length });
    const sameItems = a.length === b.length && a.length > 1 && JSON.stringify([...a].map((x) => JSON.stringify(x)).sort()) === JSON.stringify([...b].map((x) => JSON.stringify(x)).sort());
    if (sameItems) { out.push({ path: at, a: "(same items)", b: "(in another order)" }); return; }
    for (let i = 0; i < Math.min(a.length, b.length); i++) diffValues(a[i], b[i], `${at}[${i}]`, key, out);
    for (let i = b.length; i < a.length; i++) out.push({ path: `${at}[${i}]`, a: mask(key, a[i]), b: "(absent)" });
    for (let i = a.length; i < b.length; i++) out.push({ path: `${at}[${i}]`, a: "(absent)", b: mask(key, b[i]) });
    return;
  }
  if (bothObjects) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join("\u0000") !== kb.join("\u0000") && [...ka].sort().join("\u0000") === [...kb].sort().join("\u0000")) out.push({ path: at, a: "(same keys)", b: "(in another order)" });
    for (const k of new Set([...ka, ...kb])) diffValues(a[k], b[k], `${at}.${k}`, k, out);
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: at, a: mask(key, a), b: mask(key, b) });
}

/** The text a server-sent stream or an NDJSON answer holds, as a list of parsed events. */
function parseBody(buf, type) {
  const text = buf.toString("utf8");
  if (/json/i.test(type ?? "")) { try { return { kind: "json", value: JSON.parse(text) }; } catch { /* below */ } }
  if (/event-stream/i.test(type ?? "")) {
    const events = text.split(/\n\n+/).filter(Boolean).map((block) => {
      const ev = /^event: (.*)$/m.exec(block)?.[1] ?? "message", data = /^data: (.*)$/m.exec(block)?.[1] ?? "";
      try { return { event: ev, data: JSON.parse(data) }; } catch { return { event: ev, data }; }
    });
    return { kind: "events", value: events };
  }
  const rows = text.split(/\r?\n/);
  if (rows.length > 1 && rows.every((r) => !r || r.startsWith("{"))) { try { return { kind: "ndjson", value: rows.filter(Boolean).map((r) => JSON.parse(r)) }; } catch { /* below */ } }
  return { kind: "lines", value: rows };
}

function bodyDiff(ra, rb) {
  const a = body(A, ra.sha256), b = body(B, rb.sha256);
  if (!a || !b) return { note: `a body is missing (${!a ? A : B}): compared by hash only`, paths: [] };
  if (!/json|text|csv|xml|event-stream|javascript/i.test(rb.type ?? ra.type ?? "")) return { note: `binary, ${a.length} bytes and ${b.length} bytes`, paths: [] };
  const pa = parseBody(a, ra.type), pb = parseBody(b, rb.type);
  const out = [];
  if (pa.kind === "lines" || pb.kind === "lines") {
    // a CSV or plain text: line by line
    const la = a.toString("utf8").split(/\r?\n/), lb = b.toString("utf8").split(/\r?\n/);
    if (la.length !== lb.length) out.push({ path: "$.lines", a: la.length, b: lb.length });
    for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) out.push({ path: `$.line[${i + 1}]`, a: mask("", la[i]), b: mask("", lb[i]) });
  } else diffValues(pa.value, pb.value, "$", "", out);
  return { kind: pb.kind, paths: out };
}

// ---- the comparison
const byId = (m) => new Map(m.requests.map((r) => [r.id, r]));
const ia = byId(ma), ib = byId(mb);
const added = mb.requests.filter((r) => !ia.has(r.id));
const removed = ma.requests.filter((r) => !ib.has(r.id));
const changed = [];
for (const rb of mb.requests) {
  const ra = ia.get(rb.id);
  if (!ra) continue;
  const fields = {};
  for (const k of ["status", "type", "disposition", "cache", "x_rows"]) if (ra[k] !== rb[k]) fields[k] = { a: ra[k] ?? null, b: rb[k] ?? null };
  if (ra.sha256 === rb.sha256 && !Object.keys(fields).length) continue;
  const d = ra.sha256 === rb.sha256 ? { paths: [] } : bodyDiff(ra, rb);
  changed.push({ id: rb.id, session: rb.session, role: rb.role, method: rb.method, url: rb.url, route: rb.route, note: rb.note, fields, bytes: { a: ra.bytes, b: rb.bytes }, body_note: d.note, path_count: d.paths.length, paths: d.paths.slice(0, 500) });
}

// what stayed the same outside the requests: the data, the seeds, the tool
const context = {};
for (const k of ["build_id", "frozen_now", "next_build_id", "fixtures"]) if (JSON.stringify(ma.head[k]) !== JSON.stringify(mb.head[k])) context[k] = { a: ma.head[k], b: mb.head[k] };
const differs = changed.length + added.length + removed.length;

// ---- per route: which paths moved, with the numbers taken out, so a thousand changes read as a few
const shape = (p) => p.replace(/\[\d+\]/g, "[*]");
const routes = new Map();
for (const c of changed) {
  const r = routes.get(c.route) ?? { route: c.route, requests: 0, roles: new Set(), statuses: new Set(), shapes: new Map() };
  r.requests++; r.roles.add(c.role);
  if (c.fields.status) r.statuses.add(`${c.fields.status.a} -> ${c.fields.status.b}`);
  for (const p of c.paths) r.shapes.set(shape(p.path), (r.shapes.get(shape(p.path)) ?? 0) + 1);
  routes.set(c.route, r);
}
const routeRows = [...routes.values()].sort((x, y) => y.requests - x.requests).map((r) => ({
  route: r.route, requests: r.requests, roles: [...r.roles].sort(), status_changes: [...r.statuses],
  top_paths: [...r.shapes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([path, count]) => ({ path, count }))
}));

const summary = {
  a: A, b: B, compared: { a: ma.requests.length, b: mb.requests.length }, changed: changed.length, added: added.length, removed: removed.length, context,
  routes: routeRows,
  added_requests: added.map((r) => ({ id: r.id, role: r.role, method: r.method, url: r.url, status: r.status })),
  removed_requests: removed.map((r) => ({ id: r.id, role: r.role, method: r.method, url: r.url, status: r.status })),
  changes: changed
};

fs.mkdirSync(path.join(DOCS, "diffs"), { recursive: true });
fs.writeFileSync(path.join(DOCS, "diffs", `${A}__${B}.json`), JSON.stringify(summary, null, 1));

const cell = (v) => (typeof v === "string" ? v : JSON.stringify(v)).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const md = [`# Golden-master diff: ${A} to ${B}`, "",
  `Compared ${ma.requests.length} requests with ${mb.requests.length}. **${differs === 0 ? "No differences." : `${changed.length} changed, ${added.length} added, ${removed.length} removed.`}**`, ""];
if (Object.keys(context).length) md.push("## What differs around the requests", "", ...Object.entries(context).map(([k, v]) => `- ${k}: ${cell(v.a)} to ${cell(v.b)}`), "");
if (routeRows.length) {
  md.push("## By route", "", "| Route | Requests changed | Roles | Status changes | Most changed paths |", "|---|---|---|---|---|");
  for (const r of routeRows) md.push(`| ${r.route} | ${r.requests} | ${r.roles.join(", ")} | ${r.status_changes.join(", ") || "none"} | ${cell(r.top_paths.slice(0, 5).map((p) => `${p.path} (${p.count})`).join(", ")) || "none"} |`);
  md.push("");
}
if (added.length) md.push("## Added requests", "", ...added.map((r) => `- ${r.role} ${r.method} ${r.url}: ${r.status}`), "");
if (removed.length) md.push("## Removed requests", "", ...removed.map((r) => `- ${r.role} ${r.method} ${r.url}: ${r.status}`), "");
if (changed.length) {
  md.push("## Each changed request", "");
  for (const c of changed) {
    md.push(`### ${c.role} ${c.method} ${c.url}${c.note ? ` (${c.note})` : ""}`, "", `Session ${c.session}, id ${c.id}, ${c.bytes.a} bytes to ${c.bytes.b} bytes.`);
    for (const [k, v] of Object.entries(c.fields)) md.push(`- ${k}: ${cell(v.a)} to ${cell(v.b)}`);
    if (c.body_note) md.push(`- ${c.body_note}`);
    if (c.paths.length) {
      md.push("", "| Path | A | B |", "|---|---|---|");
      for (const p of c.paths.slice(0, maxPaths)) md.push(`| ${cell(p.path)} | ${cell(p.a)} | ${cell(p.b)} |`);
      if (c.path_count > maxPaths) md.push("", `...and ${c.path_count - maxPaths} more paths (see the JSON file).`);
    }
    md.push("");
  }
}
fs.writeFileSync(path.join(DOCS, "diffs", `${A}__${B}.md`), md.join("\n") + "\n");

// ---- the console
console.log(`${A} to ${B}: ${ma.requests.length} and ${mb.requests.length} requests; ${changed.length} changed, ${added.length} added, ${removed.length} removed`);
for (const [k, v] of Object.entries(context)) console.log(`  around the requests, ${k}: ${JSON.stringify(v.a)} to ${JSON.stringify(v.b)}`);
for (const r of routeRows) console.log(`  route ${r.route}: ${r.requests} changed; roles ${r.roles.join(", ")}${r.status_changes.length ? `; status ${r.status_changes.join(", ")}` : ""}`);
for (const c of changed) {
  console.log(`  ${c.role} ${c.method} ${c.url}${c.note ? ` (${c.note})` : ""}`);
  for (const [k, v] of Object.entries(c.fields)) console.log(`    ${k}: ${v.a} -> ${v.b}`);
  if (c.body_note) console.log(`    ${c.body_note}`);
  for (const p of c.paths.slice(0, 8)) console.log(`    ${p.path}: ${JSON.stringify(p.a)} -> ${JSON.stringify(p.b)}`);
  if (c.path_count > 8) console.log(`    ...and ${c.path_count - 8} more`);
}
for (const r of added) console.log(`  added: ${r.role} ${r.method} ${r.url}`);
for (const r of removed) console.log(`  removed: ${r.role} ${r.method} ${r.url}`);
console.log(`written: docs/qa/pass4/golden/diffs/${A}__${B}.md and .json`);
process.exit(differs ? 1 : 0);
