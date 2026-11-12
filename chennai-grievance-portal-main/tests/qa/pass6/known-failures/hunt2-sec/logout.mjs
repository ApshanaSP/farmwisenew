// citizenB fresh sign-in (raw fetch), sign out, then reuse the old cookie. Never prints the password or the cookie.
import { accounts } from "../../../seed-local-users.mjs";
const B = "http://127.0.0.1:3106";
const a = accounts().find((x) => x.key === "citizenB");
const h = { "content-type": "application/json", origin: B, referer: B + "/login" };
const r = await fetch(B + "/api/auth/login", { method: "POST", headers: h, body: JSON.stringify({ email: a.email, password: a.password }) });
console.log("login", r.status, r.headers.getSetCookie().map((c) => c.split("=")[0] + " " + (c.match(/Max-Age=\d+/)?.[0] ?? "") + " " + (/HttpOnly/i.test(c) ? "HttpOnly" : "") + " " + (c.match(/SameSite=\w+/i)?.[0] ?? "") + " " + (/Secure/i.test(c) ? "Secure" : "")));
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const me = async (label) => { const m = await fetch(B + "/api/auth/me", { headers: { cookie, referer: B + "/citizen" } }); console.log(label, m.status); };
await me("me before");
const lo = await fetch(B + "/api/auth/logout", { method: "POST", headers: { cookie, origin: B, referer: B + "/citizen" } });
console.log("logout", lo.status, lo.headers.getSetCookie().map((c) => c.split("=")[0] + " " + (c.match(/Max-Age=\d+/)?.[0] ?? "")));
await me("me after logout with old cookie");
const page = await fetch(B + "/citizen/track-complaints", { headers: { cookie }, redirect: "manual" });
console.log("page after", page.status);
