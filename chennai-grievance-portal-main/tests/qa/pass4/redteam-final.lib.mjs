// QA pass 4, final red team: shared helpers. Accounts are read from the gitignored test-collector.txt in code and never printed.
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/env.mjs";
import { accounts } from "../seed-local-users.mjs";

export const BASE = process.env.RT_BASE || "http://127.0.0.1:3230";
export const EVID = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "redteam-final");
export const KEYS = ["collector", "officerA", "officerB", "officerC", "citizenA", "citizenB"];
const ACC = Object.fromEntries(accounts().map((a) => [a.key, a]));
export const acct = (k) => ACC[k];
/** every secret value, so a log line can be checked before it is written */
export const SECRETS = Object.values(ACC).map((a) => a.password).filter(Boolean);

export async function login(key, base = BASE) {
  const a = ACC[key];
  const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, cookie };
}
/**
 * Every account signed in. Each sign-in counts against the 8-a-quarter-hour limit per email (redteam-final-3), so with RT_COOKIES=<file in the
 * scratchpad> the session cookies of a run are kept there (never in the repo) and reused by the next run for 50 minutes.
 */
export async function loginAll(base = BASE) {
  const file = process.env.RT_COOKIES;
  if (file && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 50 * 60_000) {
    const kept = JSON.parse(fs.readFileSync(file, "utf8"));
    if (kept.base === base) return kept.cookies;
  }
  const out = { anonymous: "" };
  for (const k of KEYS) out[k] = (await login(k, base)).cookie;
  if (file && KEYS.every((k) => out[k])) fs.writeFileSync(file, JSON.stringify({ base, cookies: out }));
  return out;
}
/** one request; the body is read as text (capped) */
export async function req(method, url, { cookie = "", body, headers = {}, raw = false, base = BASE, cap = 400_000 } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  let b = body;
  if (body !== undefined && !raw) { b = JSON.stringify(body); h["content-type"] ??= "application/json"; }
  const t0 = Date.now();
  try {
    const r = await fetch(base + url, { method, headers: h, body: b, redirect: "manual" });
    const text = (await r.text()).slice(0, cap);
    return { status: r.status, text, ms: Date.now() - t0, headers: Object.fromEntries(r.headers) };
  } catch (e) {
    return { status: 0, text: String(e.message), ms: Date.now() - t0, headers: {} };
  }
}
export function save(name, data) {
  fs.mkdirSync(EVID, { recursive: true });
  const s = JSON.stringify(data, null, 1);
  for (const sec of SECRETS) if (s.includes(sec)) throw new Error("a secret would be written to the evidence; refusing");
  fs.writeFileSync(path.join(EVID, name), s);
}
export const sseAnswer = (text) => {
  const ev = [];
  for (const blk of text.split(/\n\n/)) { const e = blk.match(/^event: (\w+)/m)?.[1]; const d = blk.match(/^data: (.*)$/m)?.[1]; if (e) { try { ev.push({ e, d: JSON.parse(d) }); } catch { ev.push({ e, d }); } } }
  return ev;
};
