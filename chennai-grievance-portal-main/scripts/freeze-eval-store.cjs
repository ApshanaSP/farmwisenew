/**
 * Freezes the current district data into eval/store/ for the chatbot's golden questions (npm run eval:golden), so the
 * questions run on fixed data and give the same answers every time:
 *   eval/store/manifest.json   the build's tables, views, keys and indexes (no download links)
 *   eval/store/tables/         each table's snapshot, copied from data/aws-cache/ (downloaded when it is not cached)
 *   eval/store/durable.sqlite  the website's own tables (decisions, officer steps, ...) without accounts or personal data
 *
 * Read-only towards AWS: it asks for the build's manifest, as the website does every few minutes. eval/store/ is not
 * committed (.gitignore). Run with DATA_BACKEND=aws configured in .env:
 *   node scripts/freeze-eval-store.cjs
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "data", "aws-cache");
const OUT = path.join(ROOT, "eval", "store");
const API = (process.env.AWS_API_URL || "https://i6q6oi20lb.execute-api.ap-south-1.amazonaws.com").replace(/\/$/, "");
// accounts and residents' details are not needed to answer the Collector's questions
const PERSONAL = ["users", "user_profiles", "password_resets", "assistant_sessions", "assistant_messages", "assistant_feedback", "assistant_pins"];

async function main() {
  const key = (process.env.REFRESH_API_KEY || "").trim();
  if (!key) throw new Error("REFRESH_API_KEY is not set in .env");
  const r = await fetch(`${API}/intel/snapshot`, { method: "POST", headers: { "x-refresh-key": key, "content-type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error(`manifest: HTTP ${r.status}`);
  const m = await r.json();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "tables"), { recursive: true });
  let copied = 0, downloaded = 0;
  for (const [name, t] of Object.entries(m.tables)) {
    const file = `${name}-${t.sha}.json.gz`;
    const cached = path.join(CACHE, file);
    if (fs.existsSync(cached)) { fs.copyFileSync(cached, path.join(OUT, "tables", file)); copied++; continue; }
    const d = await fetch(t.url);
    if (!d.ok) throw new Error(`table ${name}: HTTP ${d.status}`);
    fs.writeFileSync(path.join(OUT, "tables", file), Buffer.from(await d.arrayBuffer()));
    downloaded++;
  }
  const tables = Object.fromEntries(Object.entries(m.tables).map(([n, t]) => [n, { sha: t.sha, rows: t.rows, bytes: t.bytes, key: t.key, url: "" }]));
  // the golden questions run with the clock at this moment ("today" is the day the data was frozen)
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ ...m, tables, frozen_at: new Date().toISOString() }, null, 1));

  const { DatabaseSync } = require("node:sqlite");
  // the running website reloads the durable store into a new file every few minutes (durable-<time>.sqlite): the newest one
  const live = fs.readdirSync(CACHE).filter((f) => /^durable(-\d+)?\.sqlite$/.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(CACHE, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  if (!live) throw new Error("No durable store in data/aws-cache: start the website once with DATA_BACKEND=aws");
  // copied with its write-ahead log, then opened as a copy (the website keeps the original open)
  const dst = path.join(OUT, "durable.sqlite");
  for (const ext of ["", "-wal"]) if (fs.existsSync(path.join(CACHE, live.f + ext))) fs.copyFileSync(path.join(CACHE, live.f + ext), dst + ext);
  const copy = new DatabaseSync(dst);
  copy.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE");
  const have = new Set(copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((x) => x.name));
  for (const t of PERSONAL) if (have.has(t)) copy.exec(`DELETE FROM "${t}"`);
  // complaints keep what the counts need; names, phone numbers and addresses are cleared
  if (have.has("complaints")) copy.exec(`UPDATE complaints SET first_name = 'Resident', last_name = NULL, mobile_number = NULL, phone_number = NULL,
    email = NULL, street_address = '-'`);
  copy.exec("DELETE FROM _changes; VACUUM");
  copy.close();
  console.log(`Frozen build ${m.build_id}: ${copied} tables copied, ${downloaded} downloaded -> ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
