import { call } from "../../lib/live.mjs";
import { accounts } from "../../../seed-local-users.mjs";
// POST with the "Confirm it's you" step: first try, then the password check, then again with the grant. Never prints the password.
export async function confirmed(key, method, url, body, headers = {}, raw = false) {
  const r1 = await call(3106, key, method, url, { body, headers, raw });
  if (r1.status !== 428) return { first: r1.status, r: r1 };
  const c = JSON.parse(r1.text).confirm;
  const pw = accounts().find((a) => a.key === key).password;
  const g = await call(3106, key, "POST", "/api/auth/confirm", { headers, body: { step: "check", action: c.action, scope: c.scope, summary: c.summary, method: "password", code: pw } });
  if (g.status !== 200) return { first: 428, confirm: g.status, r: g };
  const grant = JSON.parse(g.text).grant;
  const r2 = await call(3106, key, method, url, { body: typeof body === "function" ? body() : body, headers: { ...headers, "x-diq-grant": grant }, raw });
  return { first: 428, confirm: 200, r: r2 };
}
