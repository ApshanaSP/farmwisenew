// QA pass 6: signing in to a local test server as a QA account. Never prints a password, cookie or token.
// Pass 6: cookies are also kept in the gitignored data/aws-cache/qa/run/cookies-<port>.json, so several processes share one sign-in per account
// (the sign-in route allows 8 tries per e-mail in 15 minutes). signIn(port, key, { fresh: true }) signs in again.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accounts } from "../../seed-local-users.mjs";

export const base = (port) => `http://127.0.0.1:${port}`;
const jar = new Map();
const RUN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "data", "aws-cache", "qa", "run");
const cacheFile = (port) => path.join(RUN, `cookies-${port}.json`);
const readCache = (port) => { try { return JSON.parse(fs.readFileSync(cacheFile(port), "utf8")); } catch { return {}; } };

/** The cookie header of a signed-in QA account (`collector`, `officerA`, `officerB`, `citizenA`, `manu`, ...), cached per port. */
export async function signIn(port, key, { fresh = false } = {}) {
  const k = `${port}:${key}`;
  if (!fresh && jar.has(k)) return jar.get(k);
  if (!fresh) { const c = readCache(port)[key]; if (c) { jar.set(k, c); return c; } }
  const a = accounts().find((x) => x.key === key);
  if (!a) throw new Error(`no QA account ${key}`);
  const r = await fetch(`${base(port)}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: base(port) }, body: JSON.stringify({ email: a.email, password: a.password }) });
  if (r.status !== 200) throw new Error(`sign-in ${key} on ${port}: ${r.status}`);
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  jar.set(k, cookie);
  try { fs.mkdirSync(RUN, { recursive: true }); const all = readCache(port); all[key] = cookie; fs.writeFileSync(cacheFile(port), JSON.stringify(all)); } catch { /* cache is best effort */ }
  return cookie;
}

/** A request as that account (or anonymous when key is null), with the same-origin headers the app's CSRF check wants. */
export async function call(port, key, method, url, { body, headers = {}, raw = false } = {}) {
  const h = { origin: base(port), referer: `${base(port)}/officer`, ...headers };
  if (key) h.cookie = await signIn(port, key);
  if (body !== undefined && !raw && !h["content-type"]) h["content-type"] = "application/json";
  const r = await fetch(base(port) + url, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(120_000) });
  const text = await r.text().catch(() => "");
  return { status: r.status, text, headers: r.headers };
}
