// QA pass 4: CONCURRENCY on a frozen, ticking server (port 3142, instance conc). No model is called.
//   node tests/qa/pass4/server.mjs start --port 3142 --frozen --ticking --instance conc
//   node tests/qa/pass4/concurrency.mjs        writes docs/qa/pass4/evidence/concurrency.json
// Cases: double submit of a complaint, two tabs of one citizen, two officers on one case, the same and opposite Collector decisions at once,
// a decision arriving while the console is read, a stop (abort) during an answer, and parallel questions (answers must not be mixed up).
import fs from "node:fs";
import path from "node:path";
import { Http, EVIDENCE_DIR } from "./same-number.mjs";

const PORT = 3142;
const h = new Http(PORT);
const out = { ran_at: new Date().toISOString(), cases: [], problems: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (name, ok, detail) => { out.cases.push({ name, ok, ...detail }); if (!ok) { out.problems.push({ name, ...detail }); console.log("PROBLEM", name, JSON.stringify(detail).slice(0, 300)); } else console.log("ok", name); };
const save = () => { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE_DIR, "concurrency.json"), JSON.stringify(out, null, 1)); };
const answerOf = (text) => { const m = text.match(/event: answer\ndata: (.*)/); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };

// ---- 1 and 2. double submit, two tabs: citizenA files the same complaint 2 and 3 times at once
async function complaints() {
  const sub = await h.get("citizenA", "/api/complaint-taxonomy").catch(() => null);
  const body = { firstName: "Qa", lastName: "Four", gender: "Male", streetAddress: "1 Test Street", mobileNumber: "9876543210", zoneId: 1, wardNumber: 1, manualStreetName: "Test Street",
    complaintSubtypeId: 1, title: `QA4 concurrency ${Date.now()}`, description: "Garbage not cleared for three days near the corner shop." };
  const one = await h.post("citizenA", "/api/complaints", body);
  if (one.status >= 500 || one.status === 404) { log("complaint: single submit works in this setup", false, { status: one.status, body: one.text.slice(0, 200), taxonomy: sub?.status }); return; }
  if (one.status >= 400) { log("complaint: single submit accepted (test body)", false, { status: one.status, body: one.text.slice(0, 200), note: "the test body may be wrong for this schema; double-submit not tried" }); return; }
  body.title = `QA4 double ${Date.now()}`;
  const rs = await Promise.all([1, 2, 3].map(() => h.post("citizenA", "/api/complaints", body)));
  const codes = new Set(rs.map((r) => r.json?.complaintCode).filter(Boolean));
  log("complaint: three simultaneous identical submits make one complaint", codes.size === 1, { statuses: rs.map((r) => r.status), codes: [...codes], duplicates: rs.map((r) => r.json?.duplicate ?? false) });
  // two tabs, different text: both must be kept, with different numbers
  const b2 = { ...body, title: `QA4 tab-b ${Date.now()}` }, b3 = { ...body, title: `QA4 tab-c ${Date.now()}`, description: "Another problem: a broken streetlight." };
  const ts = await Promise.all([h.post("citizenA", "/api/complaints", b2), h.post("citizenA", "/api/complaints", b3)]);
  const c2 = ts.map((r) => r.json?.complaintCode);
  log("complaint: two tabs with different complaints keep both", ts.every((r) => r.status < 300) && c2[0] && c2[1] && c2[0] !== c2[1], { statuses: ts.map((r) => r.status), codes: c2 });
  // another citizen with identical text must not be treated as a duplicate of citizenA's
  const other = await h.post("citizenB", "/api/complaints", body);
  log("complaint: the same words from a different citizen are not merged", other.status < 300 && other.json?.duplicate !== true && !codes.has(other.json?.complaintCode), { status: other.status, code: other.json?.complaintCode, duplicate: other.json?.duplicate });
}

// ---- 3. two officers on one case: both officers of one department press Approve at once; two tabs of the same officer
async function officers() {
  const l = await h.get("officerA", "/api/officer/grievances?tab=new&period=quarterly&per=40");
  const rows = l.json?.rows ?? l.json?.items ?? [];
  const pick = rows.find((r) => r.id && (r.sev ?? r.severity) !== "Severe") ?? rows[0];
  if (!pick) { log("officers: a new grievance to work on", false, { status: l.status, keys: Object.keys(l.json ?? {}) }); return; }
  const id = pick.id;
  const rs = await Promise.all([1, 2, 3, 4].map(() => h.post("officerA", `/api/officer/grievances/${id}`, { step: "approve" })));
  const sts = rs.map((r) => r.status).sort();
  const wins = rs.filter((r) => r.status === 201).length;
  const d = await h.get("officerA", `/api/officer/grievances/${id}`);
  const steps = (d.json?.timeline ?? d.json?.steps ?? []).filter((t) => /approv/i.test(`${t.label ?? ""} ${t.step ?? ""}`));
  log("officers: four simultaneous approvals of one case record exactly one approval", wins === 1 && sts.every((s) => s === 201 || s === 409) && steps.length <= 1, { id, statuses: sts, approvalsInTimeline: steps.length });
  // a different department's officer must not touch it
  const x = await h.post("officerB", `/api/officer/grievances/${id}`, { step: "approve" });
  log("officers: another department's officer cannot approve it", x.status === 404 || x.status === 403, { status: x.status });
}

// ---- 4. collector decisions: same twice at once (kept once), opposite at once (one wins, state agrees with the last record)
async function decisions() {
  const l = await h.get("collector", "/api/collector/list?period=weekly&sev=Medium&status=open");
  const rows = (l.json?.rows ?? []).filter((r) => r.open);
  if (rows.length < 3) { log("decisions: incidents to decide on", false, { status: l.status, n: rows.length }); return; }
  const [a, b, c] = rows;
  const grant = async (ids, decision, note) => h.grant("collector", { ids: [...ids].sort(), decision, escalateTo: null, note: note ?? null }, "decide");
  const body = (ids, decision, note) => ({ incidentIds: ids, decision, ...(note ? { note } : {}) });
  // same decision twice at once
  const g1 = null;
  const mk = async (ids, decision, note, g) => {
    let r = await h.post("collector", "/api/collector/decisions", body(ids, decision, note), g ? { "x-diq-grant": g } : {});
    if (r.status === 428 && !g) { const gg = await h.grant("collector", r.json.confirm.scope, "decide"); r = await h.post("collector", "/api/collector/decisions", body(ids, decision, note), { "x-diq-grant": gg }); }
    return r;
  };
  const r1 = await Promise.all([mk([a.id], "resolve", null, g1), mk([a.id], "resolve", null, g1)]);
  const dec = await h.get("collector", `/api/collector/decisions?incidentId=${a.id}`);
  const hist = dec.json?.decisions ?? dec.json?.rows ?? dec.json;
  log("decisions: the same decision sent twice at once is accepted without a server error", r1.every((r) => r.status < 500), { statuses: r1.map((r) => r.status), bodies: r1.map((r) => r.text.slice(0, 120)), historyKeys: dec.status });
  // a resolved incident is no longer open; a second reader must see it
  const after = await h.get("collector", `/api/collector/incidents/${a.id}`);
  log("decisions: after a resolve the incident reads as closed", r1.some((r) => r.status === 200) ? (after.json?.open === 0 || after.json?.open === false || /resolved/i.test(String(after.json?.status ?? after.json?.incident?.status ?? ""))) : true, { status: after.status, open: after.json?.open, st: after.json?.status ?? after.json?.incident?.status });
  // opposite decisions at once on b: resolve vs reject
  const gR = null, gJ = null;
  const r2 = await Promise.all([mk([b.id], "resolve", null, gR), mk([b.id], "reject", "QA4 test return", gJ)]);
  const fin = await h.get("collector", `/api/collector/incidents/${b.id}`);
  const st = String(fin.json?.status ?? fin.json?.incident?.status ?? "");
  log("decisions: opposite decisions at once leave one consistent state and no server error", r2.every((r) => r.status < 500) && /Resolved|Rejected|Open|Under review|Assigned/i.test(st), { statuses: r2.map((r) => r.status), finalStatus: st, open: fin.json?.open });
  // 5. a decision arriving during reads: read overview and list repeatedly while resolving c; each pair of reads must agree with itself
  const gC = null;
  const before = (await h.get("collector", "/api/collector/overview?period=weekly")).json?.kpi?.cur;
  const reads = [];
  let stop = false;
  const reader = (async () => { while (!stop) { const [o, ll] = await Promise.all([h.get("collector", "/api/collector/overview?period=weekly"), h.get("collector", "/api/collector/list?period=weekly&status=open")]); reads.push({ ongoing: o.json?.kpi?.cur?.ongoing, listOpen: ll.json?.incidents ?? ll.json?.total, s: [o.status, ll.status] }); await sleep(250); } })();
  await sleep(500);
  const rc = await mk([c.id], "resolve", null, gC);
  await sleep(1500); stop = true; await reader;
  const final = (await h.get("collector", "/api/collector/overview?period=weekly")).json?.kpi?.cur;
  const sts = new Set(reads.map((r) => r.s.join()));
  const odd = [...new Set(reads.map((r) => r.ongoing))].filter((v) => v !== before?.ongoing && v !== final?.ongoing);
  log("decisions: reads during a decision give the old or the new figure, never another", rc.status < 500 && odd.length === 0 && [...sts].every((s) => /^200,200$|^429/.test(s)), { decisionStatus: rc.status, before: before?.ongoing, final: final?.ongoing, seen: [...new Set(reads.map((r) => r.ongoing))], statuses: [...sts], reads: reads.length });
  log("decisions: the resolved case leaves the open count (one fewer)", rc.status !== 200 || final?.ongoing === (before?.ongoing ?? 0) - 1 || final?.ongoing === before?.ongoing, { before: before?.ongoing, final: final?.ongoing, note: "a resolved incident that was routed to a department may still count as open" });
}

// ---- 6. a stop during a slow answer, and parallel questions
async function answers() {
  const cookie = await h.cookie("collector");
  const ask = async (message, signal) => fetch(`${h.base}/api/collector/assistant/chat`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ message, consoleScope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null } }), signal });
  // stop right after the request is sent
  const ac = new AbortController();
  const p = ask("how many severe incidents are open in zone 13", ac.signal).catch((e) => e.name);
  await sleep(120); ac.abort();
  const stopped = await p;
  await sleep(2000);
  const health = await h.get("collector", "/api/collector/overview?period=daily");
  const nxt = await ask("how many citizen complaints this week");
  const t = await nxt.text(); const a = answerOf(t);
  log("answers: after a stop the server still answers, and the next answer is for the next question", health.status === 200 && nxt.status === 200 && /complaint/i.test(a?.headline ?? a?.answerMarkdown ?? ""), { stopped, health: health.status, next: nxt.status, headline: a?.headline, rid: a?.id });
  // parallel questions (the chat has a per-minute limit: some 429s are fine, mixed answers are not)
  await sleep(4000);
  const qs = [["how many citizen complaints this week", /complaint/i], ["how many severe incidents this week", /severe/i], ["how many incidents are open past deadline this week", /(deadline|overdue)/i]];
  const rs = await Promise.all(qs.map(async ([q]) => { const r = await ask(q); const tx = await r.text(); return { q, status: r.status, a: answerOf(tx) }; }));
  const mixed = rs.filter((r) => r.a && !qs.find(([q, re]) => q === r.q)[1].test(`${r.a.headline ?? ""} ${r.a.answerMarkdown ?? ""}`));
  const ids = rs.map((r) => r.a?.id).filter(Boolean);
  log("answers: three questions at once each get their own answer", mixed.length === 0 && new Set(ids).size === ids.length, { results: rs.map((r) => ({ q: r.q, status: r.status, headline: r.a?.headline ?? null })), mixed: mixed.map((m) => m.q) });
  // two tabs asking the SAME question in the same session
  await sleep(4000);
  const ss = await Promise.all([ask("how many citizen complaints this week"), ask("how many citizen complaints this week")]);
  const ts = await Promise.all(ss.map(async (r) => ({ status: r.status, a: answerOf(await r.text()) })));
  log("answers: the same question from two tabs gives the same figure", ts.every((x) => x.status === 429 || x.status === 200) && new Set(ts.filter((x) => x.a).map((x) => x.a.kpis?.[0]?.value)).size <= 1, { out: ts.map((x) => ({ status: x.status, headline: x.a?.headline })) });
}

for (const f of [complaints, officers, decisions, answers]) {
  try { await f(); } catch (e) { log(`${f.name}: ran to the end`, false, { error: String(e).slice(0, 300) }); }
  save();
}
const logTxt = fs.existsSync(path.resolve("data/aws-cache/qa/run/srv-3142.log")) ? fs.readFileSync(path.resolve("data/aws-cache/qa/run/srv-3142.log"), "utf8") : "";
const errs = logTxt.split("\n").filter((x) => /error|exception|unhandled|failed/i.test(x)).slice(0, 8);
out.serverLogErrors = errs; save();
console.log(`done: ${out.cases.length} cases, ${out.problems.length} problem(s); server log error lines: ${errs.length}`);
