// officer-day probe helpers: calls as an account with the right portal Referer, the step-up grant, and a small evidence log.
// Never prints a password, cookie or grant.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { call, base } from "../../lib/live.mjs";
import { accounts } from "../../../seed-local-users.mjs";

export const PORT = 3106;
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EVID = path.resolve(HERE, "..", "..", "..", "..", "..", "..", "docs", "qa", "pass6", "evidence", "officer-day");

const PORTAL = { citizenA: "citizen", citizenB: "citizen", collector: "collector" };
/** A request as `key`, with the Referer of that account's own portal (the app picks the session by it). */
export async function as(key, method, url, opts = {}) {
  const portal = PORTAL[key] ?? "officer";
  const headers = { referer: `${base(PORT)}/${portal}`, ...(opts.headers ?? {}) };
  const r = await call(PORT, key, method, url, { ...opts, headers });
  let json = null;
  try { json = JSON.parse(r.text); } catch { /* not json */ }
  return { ...r, json };
}

/** The account's step-up grant for this 428 answer (password read here, never printed). */
export async function grantFor(key, confirm) {
  const pw = accounts().find((a) => a.key === key)?.password;
  if (!pw) throw new Error(`no password for ${key}`);
  const r = await as(key, "POST", "/api/auth/confirm", { body: { step: "check", action: confirm.action, scope: confirm.scope, summary: confirm.summary ?? "", method: "password", code: pw } });
  if (r.status !== 200 || !r.json?.grant) throw new Error(`confirm for ${key}: ${r.status} ${String(r.json?.error ?? "").slice(0, 80)}`);
  return r.json.grant;
}

/** A tiny valid JPEG (1x1). */
export const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64"
);

export function form(fields, photos = [JPEG]) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  photos.forEach((b, k) => fd.append("photos", new Blob([b], { type: "image/jpeg" }), `p${k + 1}.jpg`));
  return fd;
}

export function log(name, data) {
  fs.mkdirSync(EVID, { recursive: true });
  const line = typeof data === "string" ? data : JSON.stringify(data, null, 1);
  fs.appendFileSync(path.join(EVID, `${name}.log`), `[${new Date().toISOString()}] ${line}\n`);
  console.log(name, line.length > 1500 ? line.slice(0, 1500) + " …" : line);
}
export const short = (r) => ({ status: r.status, body: (r.text ?? "").slice(0, 400) });
