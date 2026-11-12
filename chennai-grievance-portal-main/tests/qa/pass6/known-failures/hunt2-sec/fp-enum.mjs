// Does forgot-password tell a registered e-mail from an unknown one? Two requests each; never prints the address.
import { accounts } from "../../../seed-local-users.mjs";
const B = "http://127.0.0.1:3106";
const known = accounts().find((x) => x.key === "citizenB").email;
const unknown = `nobody.${Date.now()}@example.test`;
for (const [label, email] of [["registered", known], ["unknown", unknown]]) for (const i of [1, 2]) {
  const t0 = Date.now();
  const r = await fetch(B + "/api/auth/forgot-password/request-otp", { method: "POST", headers: { "content-type": "application/json", origin: B, referer: B + "/forgot-password" }, body: JSON.stringify({ email }) });
  console.log(label, i, r.status, Date.now() - t0, "ms", (await r.text()).slice(0, 140));
}
