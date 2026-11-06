// QA pass 4: the local test accounts. Starting a server replaces the local store, so these must be added after each load.
//   node tests/qa/seed-local-users.mjs --pinned          adds them to the pinned snapshot's rows, so every load already has them (the normal way)
//   node tests/qa/seed-local-users.mjs --file <sqlite>   adds them directly to a durable file that is already loaded
// In dry-run these rows never reach AWS (store.ts line 378), and on the pinned API a write is refused as well.
// Their details live only in the gitignored data/aws-cache/qa/test-collector.txt, one JSON object per line. Passwords are never printed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, "..", "..");
const QA_DIR = path.join(APP_ROOT, "data", "aws-cache", "qa");
const FILE = path.join(QA_DIR, "test-collector.txt");
const PIN_DIR = path.join(QA_DIR, "pinned");

const WANT = [
  { key: "collector", id: 1000000001, email: "qa.collector@example.test", role: "collector" },
  { key: "officerA", id: 1000000002, email: "qa.officer.swm@example.test", role: "department_officer", department_id: 4, dept_code: "GCC-SWM" },
  { key: "officerB", id: 1000000003, email: "qa.officer.ele@example.test", role: "department_officer", department_id: 3, dept_code: "GCC-ELE" },
  { key: "officerC", id: 1000000004, email: "qa.officer.cmw@example.test", role: "department_officer", dept_code: "CMWSSB" },
  { key: "citizenA", id: 1000000005, email: "qa.citizen.a@example.test", role: "citizen", first: "Qa", last: "CitizenA", mobile: "9000000001" },
  { key: "citizenB", id: 1000000006, email: "qa.citizen.b@example.test", role: "citizen", first: "Qa", last: "CitizenB", mobile: "9000000002" },
];

/** The test accounts, creating a password for any that has none. */
export function accounts() {
  fs.mkdirSync(QA_DIR, { recursive: true });
  const have = new Map();
  if (fs.existsSync(FILE)) for (const l of fs.readFileSync(FILE, "utf8").split(/\r?\n/)) { try { const j = JSON.parse(l); if (j.key) have.set(j.key, j); } catch { /* an old line */ } }
  let changed = false;
  const out = WANT.map((w) => {
    const h = have.get(w.key);
    if (h?.password) return { ...w, password: h.password };
    changed = true;
    return { ...w, password: `Qa-${crypto.randomBytes(12).toString("base64url")}9!` };
  });
  if (changed || !fs.existsSync(FILE)) fs.writeFileSync(FILE, ["# QA-only local test accounts (local durable copy, never synced). One JSON object per line. Never print or commit.", ...out.map((a) => JSON.stringify(a))].join("\n") + "\n");
  return out;
}

const STAMP = "2026-11-01 09:00:00";
function userRows() {
  const bcrypt = require("bcryptjs");
  return accounts().map((a) => ({
    user: { id: a.id, email: a.email, password_hash: bcrypt.hashSync(a.password, 8), role: a.role, department_id: a.department_id ?? null, dept_code: a.dept_code ?? null, is_active: 1,
      created_at: STAMP, updated_at: STAMP, email_verified_at: STAMP, email_verification_exempt: 1, token_version: null },
    profile: a.role === "citizen" ? { id: a.id, user_id: a.id, first_name: a.first, last_name: a.last, mobile_number: a.mobile, mobile_verified: 0, created_at: STAMP, updated_at: STAMP } : null,
  }));
}

export function seedPinned() {
  const doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, "rows.json.gz"))).toString("utf8"));
  const us = doc.rows.users ?? [], ps = doc.rows.user_profiles ?? [];
  for (const { user, profile } of userRows()) {
    const i = us.findIndex((r) => r.id === user.id || r.email === user.email);
    if (i >= 0) us[i] = { ...us[i], ...user }; else us.push(user);
    if (profile) { const j = ps.findIndex((r) => r.user_id === profile.user_id); if (j >= 0) ps[j] = { ...ps[j], ...profile }; else ps.push(profile); }
  }
  doc.rows.users = us; doc.rows.user_profiles = ps;
  fs.writeFileSync(path.join(PIN_DIR, "rows.seeded.json.gz"), zlib.gzipSync(JSON.stringify(doc)));
  console.log(`seeded ${WANT.length} accounts into the pinned rows`);
}

export function seedFile(file) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000");
  const cols = (t) => new Set(db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map((c) => c.name));
  const put = (t, row) => {
    const have = cols(t); const keys = Object.keys(row).filter((k) => have.has(k));
    db.prepare(`INSERT OR REPLACE INTO "${t}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((k) => row[k]));
  };
  for (const { user, profile } of userRows()) { put("users", user); if (profile) put("user_profiles", profile); }
  db.close();
  console.log(`seeded ${WANT.length} accounts into ${path.basename(file)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--file");
  if (process.argv.includes("--pinned")) seedPinned();
  else if (i > 0) seedFile(process.argv[i + 1]);
  else { accounts(); console.log("usage: --pinned | --file <sqlite>"); }
}
