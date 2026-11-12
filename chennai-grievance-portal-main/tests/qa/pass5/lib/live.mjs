// QA pass 5: signing in to a local test server as a QA account. Never prints a password, cookie or token.
import { accounts } from "../../seed-local-users.mjs";

export const base = (port) => `http://127.0.0.1:${port}`;
const jar = new Map();

/** The cookie header of a signed-in QA account (`collector`, `officerA`, `officerB`, `citizenA`, `manu`, ...), cached per port. */
export async function signIn(port, key) {
  const k = `${port}:${key}`;
  if (jar.has(k)) return jar.get(k);
  const a = accounts().find((x) => x.key === key);
  if (!a) throw new Error(`no QA account ${key}`);
  const r = await fetch(`${base(port)}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: base(port) }, body: JSON.stringify({ email: a.email, password: a.password }) });
  if (r.status !== 200) throw new Error(`sign-in ${key} on ${port}: ${r.status}`);
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  jar.set(k, cookie);
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
