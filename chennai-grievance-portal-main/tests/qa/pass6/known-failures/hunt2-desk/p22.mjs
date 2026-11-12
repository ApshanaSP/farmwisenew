// close and reopen a petition's case as the Collector (step-up confirmed with the test account, never printed), tracking after each
import { call, P, j, upload, file, base, mob, track, repeats } from "./h.mjs";
import { accounts } from "../../../seed-local-users.mjs";
const H = { referer: "http://127.0.0.1:3106/collector" };
async function decide(id, decision, note) {
  const body = { incidentIds: [id], decision, note: note ?? null };
  let r = await call(P, "collector", "POST", "/api/collector/decisions", { body, headers: H });
  if (r.status === 428) {
    const c = j(r).confirm;
    const pw = accounts().find((a) => a.key === "collector").password;
    const g = await call(P, "collector", "POST", "/api/auth/confirm", { body: { step: "check", action: c.action, scope: c.scope, summary: c.summary, method: "password", code: pw }, headers: H });
    const grant = j(g).grant;
    if (!grant) return { status: g.status, err: j(g).error };
    r = await call(P, "collector", "POST", "/api/collector/decisions", { body, headers: { ...H, "x-diq-grant": grant } });
  }
  return { status: r.status, body: r.text.slice(0, 160) };
}
const out = {};
const M = mob();
const A = await upload();
const f = await file(A.id, base({ name: "Reject Probe", mobile: M, problem: "Street light not working near the bus stand", dept: "GCC-ELE", ward: 70 }));
const code = f.body.approved?.code, inc = `INC-W-${code}`; out.code = code;
await new Promise((r) => setTimeout(r, 1500));
out.reject = await decide(inc, "reject", "QA hunt2: rejected, call 98400 22222 Mr Raman at 12 Gandhi St");
out.trackAfterReject = (await track(code, M.slice(-4))).body;
const Q = await upload(); out.Q = Q.id;
out.repAfterReject = (await repeats(Q.id, { mobile: M, name: "Reject Probe", street: "Jawahar Street", ward: 70, dept: "GCC-ELE", problem: "Street light still not working near the bus stand" })).body.repeats;
out.reopen = await decide(inc, "reopen");
out.trackAfterReopen = (await track(code, M.slice(-4))).body;
out.repAfterReopen = (await repeats(Q.id, { mobile: M, name: "Reject Probe", street: "Jawahar Street", ward: 70, dept: "GCC-ELE", problem: "Street light still not working near the bus stand" })).body.repeats;
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
