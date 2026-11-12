// QA pass 6, redsec2: session revocation on sign-out, with citizenB's OWN cookie (a raw sign-in, never the shared one).
// Prints statuses only: never the password, the cookie or a token.
import { accounts } from "../../../seed-local-users.mjs";

const B = "http://127.0.0.1:3106";
const a = accounts().find((x) => x.key === "citizenB");
const H = (cookie, page = "/citizen") => ({ origin: B, referer: `${B}${page}`, cookie, "content-type": "application/json" });

const r = await fetch(`${B}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ email: a.email, password: a.password }) });
console.log("login", r.status);
if (r.status !== 200) process.exit(1);
const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
console.log("cookie names", cookie.split("; ").map((c) => c.split("=")[0]).join(","));

const me = async (label) => {
  const m = await fetch(`${B}/api/auth/me`, { headers: H(cookie) });
  const l = await fetch(`${B}/api/complaints`, { headers: H(cookie) });
  const lt = await l.text();
  console.log(label, "me", m.status, "complaints", l.status, "items", (() => { try { const j = JSON.parse(lt); return Array.isArray(j.complaints) ? j.complaints.length : Object.keys(j).join("|"); } catch { return "?"; } })());
};
await me("before sign-out:");
const out = await fetch(`${B}/api/auth/logout`, { method: "POST", headers: H(cookie) });
console.log("logout", out.status, "set-cookie clears", (out.headers.getSetCookie?.() ?? []).map((c) => `${c.split("=")[0]}${/max-age=0|expires=thu, 01 jan 1970/i.test(c) ? "(cleared)" : ""}`).join(","));
await me("same cookie after sign-out:");
