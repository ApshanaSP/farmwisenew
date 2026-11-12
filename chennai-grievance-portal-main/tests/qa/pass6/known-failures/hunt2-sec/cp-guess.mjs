// Twelve wrong current passwords on change-password with one session: is there any limit? (Random guesses: nothing changes.)
import { call } from "../../lib/live.mjs";
const ref = { headers: { referer: "http://127.0.0.1:3106/profile" } };
const out = [];
const t0 = Date.now();
for (let i = 0; i < 12; i++) {
  const r = await call(3106, "citizenB", "POST", "/api/profile/change-password", { ...ref, body: { currentPassword: `wrong-${Math.random().toString(36).slice(2)}-${i}`, newPassword: "Zq9!probe-never-applied-" + i, confirmPassword: "Zq9!probe-never-applied-" + i } });
  out.push(r.status);
  if (i === 0) console.log("first answer", r.status, r.text.slice(0, 100));
}
console.log("statuses", out.join(","), "in", Date.now() - t0, "ms");
