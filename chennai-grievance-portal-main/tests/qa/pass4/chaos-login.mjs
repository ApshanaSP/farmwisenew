// QA pass 4 chaos: with the store down, a wrong password and an unknown email must not read as "your password is wrong" when the truth is "we cannot check".
//   node tests/qa/pass4/chaos-login.mjs <port>
import { accounts } from "../seed-local-users.mjs";
const port = process.argv[2];
const a = accounts().find((x) => x.key === "citizenA");
const res = [];
for (const [n, email, password] of [["right password", a.email, a.password], ["wrong password", a.email, "wrong-pass-xyz-1"], ["unknown email", "nobody.at.all@example.com", "whatever-12345"]]) {
  const r = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }).catch((e) => ({ status: 0, text: async () => String(e.cause?.code || e.message) }));
  res.push({ n, status: r.status, body: (await r.text()).slice(0, 120) });
}
console.log(JSON.stringify({ port, res }, null, 1));
