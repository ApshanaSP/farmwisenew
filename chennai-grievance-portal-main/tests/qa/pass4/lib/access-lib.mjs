// QA pass 4: shared by access-matrix.mjs and api-fuzz.mjs. Signs in the test accounts, builds concrete URLs from the route inventory,
// states the designed rule per route as read from the route's own code, and counts durable rows.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { APP_ROOT } from "./env.mjs";
import { inventory } from "./golden-inventory.mjs";
import { accounts } from "../../seed-local-users.mjs";

export const IDS = ["anonymous", "citizenA", "officerA", "officerB", "collector"];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function login(base, key) {
  const a = accounts().find((x) => x.key === key);
  const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, cookie };
}
export async function loginAll(base, keys = IDS) {
  const out = {};
  for (const k of keys) out[k] = k === "anonymous" ? "" : (await login(base, k)).cookie;
  return out;
}

/** The designed rule, read from each route file: which guard the code calls. Returns {rule, guard, note}. */
export function ruleFor(route, methods) {
  const f = path.join(APP_ROOT, "src/app/api", route.slice(5), "route.ts");
  const s = fs.readFileSync(f, "utf8");
  const has = (re) => re.test(s);
  if (route === "/api/auth/logout") return { rule: "public", guard: "none (signing out when not signed in is harmless)" };
  if (route === "/api/auth/confirm" || route === "/api/auth/security") return { rule: "staff", guard: "getSessionFromCookies + isStaff (staff only)" };
  if (has(/collectorSession\(/) && !has(/officerSession\(/) && !has(/assistantSession\(/)) return { rule: "collector", guard: "collectorSession" };
  if (has(/officerSession\(/) && !has(/collectorSession\(/)) return { rule: "officer", guard: "officerSession (dept from DB, never from request)" };
  if (has(/assistantSession\(/)) return { rule: "staff", guard: "assistantSession (collector, or officer locked to own dept)" };
  if (has(/jobKeyOk\(/)) return { rule: "jobkey", guard: "x-job-key header" };
  if (route.startsWith("/api/dev/")) return { rule: "dev", guard: "NODE_ENV production returns 404" };
  if (route === "/api/rehearsal/dev") return { rule: "dev", guard: "NODE_ENV production returns 404" };
  if (route === "/api/rehearsal/route") return { rule: "staff", guard: "getActivePortalSession collector or officer" };
  if (route === "/api/rehearsal/tasks") return { rule: "mixed", guard: "GET and POST use officerSession and collectorSession" };
  if (/\/api\/(complaints\/media\/\[name\]|officer\/photos|rehearsal\/photo|map\/layers)/.test(route)) return { rule: "staff-or-owner", guard: "getActiveSessions, role checks in code" };
  if (has(/role !== "citizen"|role === "citizen"/) && has(/getActiveSession\(|getSessionFromCookies\(/)) return { rule: "citizen", guard: "getSessionFromCookies/getActiveSession, role citizen" };
  if (has(/getSessionFromCookies\(|getSession\(/) && !has(/checkRateLimit/)) return { rule: "anyauth", guard: "getSessionFromCookies (any signed-in user)" };
  if (/^\/api\/auth\/(login|register|logout|forgot|confirm|tab)/.test(route)) return { rule: "public", guard: "none (auth entry point, rate limited)" };
  if (route === "/api/auth/me" || route === "/api/auth/security") return { rule: "anyauth", guard: "getSessionFromCookies" };
  if (route === "/api/i18n") return { rule: "public", guard: "none (owner decision: sign-in on /api/i18n), rate limited" };
  return { rule: "public", guard: "none found in route file" };
}

export function concrete(route, ids = {}) {
  return route.replace(/\[([^\]]+)\]/g, (_, n) => ({ id: ids.id ?? "1", code: ids.code ?? "GC-0001", name: "x.jpg", dir: "d", z: "10", x: "1", y: "1" }[n] ?? "1"));
}

export function allRoutes() { return inventory(APP_ROOT); }

export const durablePath = (port) => path.join(APP_ROOT, "data/aws-cache/qa/srv", String(port), "durable.sqlite");
export function openDurable(port) { return new DatabaseSync(durablePath(port), { readOnly: true }); }
export function counts(db) {
  const out = {};
  for (const t of db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'").all()) {
    try { out[t.name] = db.prepare(`select count(*) c from "${t.name}"`).get().c; } catch { /* skip */ }
  }
  return out;
}
export function diff(a, b) { const d = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) d[k] = [a[k], b[k]]; return d; }

export async function req(base, method, url, { cookie = "", headers = {}, body, timeout = 20000 } = {}) {
  const h = { ...headers }; if (cookie) h.cookie = cookie;
  const t0 = Date.now();
  try {
    const r = await fetch(base + url, { method, headers: h, body: body === undefined || method === "GET" || method === "HEAD" ? undefined : body, redirect: "manual", signal: AbortSignal.timeout(timeout) });
    const text = method === "HEAD" ? "" : await r.text().catch(() => "");
    return { status: r.status, text, ct: r.headers.get("content-type") || "", ms: Date.now() - t0 };
  } catch (e) { return { status: 0, text: "", error: String(e?.cause?.code || e?.message || e), ms: Date.now() - t0 }; }
}
export const STACK = /\n\s+at\s+[\w$.<>\[\] ]+\(.*:\d+:\d+\)|node_modules[\/]|\.next[\/]|webpack-internal|TypeError:|ReferenceError:|SyntaxError: Unexpected|ECONNREFUSED|SQLITE_|bER_[A-Z_]{3,}b(?=[^a-z])|ENOENT/;
