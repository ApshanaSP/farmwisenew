// QA pass 4: downloads one read-only copy of the store (POST /intel/snapshot and POST /store/load, the same reads a server makes
// at start) into the gitignored data/aws-cache/qa/pinned, so every later run sees the same build. Nothing is written to AWS.
// Run once. Prints the build id and row counts, never a key.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { APP_ROOT, PIN_DIR } from "./lib/env.mjs";

const env = dotenv.parse(fs.readFileSync(path.join(APP_ROOT, ".env")));
const API = (env.AWS_API_URL || "https://i6q6oi20lb.execute-api.ap-south-1.amazonaws.com").replace(/\/$/, "");
const post = async (route) => {
  const r = await fetch(`${API}${route}`, { method: "POST", headers: { "x-refresh-key": env.REFRESH_API_KEY, "content-type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error(`${route}: HTTP ${r.status}`);
  return r.json();
};
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`download: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

fs.mkdirSync(path.join(PIN_DIR, "tables"), { recursive: true });
const m = await post("/intel/snapshot");
const hashes = {};
for (const [name, t] of Object.entries(m.tables)) {
  const buf = await get(t.url);
  fs.writeFileSync(path.join(PIN_DIR, "tables", `${name}.json.gz`), buf);
  hashes[name] = sha(buf);
  t.url = `PIN:/t/${name}`;
}
fs.writeFileSync(path.join(PIN_DIR, "manifest.json"), JSON.stringify(m));
const load = await post("/store/load");
const rows = await get(load.rows);
fs.writeFileSync(path.join(PIN_DIR, "rows.json.gz"), rows);
let refSha = null;
if (load.reference) { const ref = await get(load.reference); fs.writeFileSync(path.join(PIN_DIR, "reference.json.gz"), ref); refSha = sha(ref); }
fs.writeFileSync(path.join(PIN_DIR, "load.json"), JSON.stringify({ ...load, rows: "PIN:/rows", reference: load.reference ? "PIN:/reference" : null }));
const info = { build_id: m.build_id, built_at: m.built_at, exported_at: m.exported_at, pinned_at: new Date().toISOString(), tables: Object.keys(m.tables).length,
  table_rows: Object.fromEntries(Object.entries(m.tables).map(([n, t]) => [n, t.rows])), durable_tables: load.tables, durable_rows: load.row_count, sha256: { ...hashes, "store/load rows": sha(rows), "store/load reference": refSha } };
fs.writeFileSync(path.join(PIN_DIR, "info.json"), JSON.stringify(info, null, 1));
console.log(JSON.stringify({ build_id: info.build_id, built_at: info.built_at, tables: info.tables, durable_tables: info.durable_tables, durable_rows: info.durable_rows }));
