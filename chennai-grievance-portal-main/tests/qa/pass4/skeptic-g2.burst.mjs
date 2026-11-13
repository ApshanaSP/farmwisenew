// Skeptic 2: re-run of hunt-redsec2-1 on the real build: a burst of parallel wrong passwords to the step-up check, then one more single guess.
//   node tests/qa/pass4/skeptic-g2.burst.mjs [port] [account] -> prints the status counts (use an account with no wrong tries in the last 15 minutes)
import { login } from "./lib/access-lib.mjs";
const base = `http://127.0.0.1:${Number(process.argv[2] || 3216)}`, who = process.argv[3] || "officerA";
const { cookie, status } = await login(base, who);
const post = (code) => fetch(`${base}/api/auth/confirm`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ step: "check", action: "export", scope: "a".repeat(32), method: "password", code }) });
const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => post(`guess-${i}`)));
const n = {}; for (const r of rs) n[r.status] = (n[r.status] || 0) + 1;
const one = await post("guess-after");
console.log(JSON.stringify({ account: who, login: status, burstOf20: n, nextSingleGuess: one.status, body: (await one.text()).slice(0, 80) }));
