// QA pass 6, console-sync: which views follow a Collector decision on one incident. Writes go to the dry-run store on 3106 only.
//   node tests/qa/pass6/probes/console-sync/decide.mjs <incidentId> <period> <decision>[:note] [<decision> ...]
// The step-up confirm uses the collector QA account's password from the seed file (never printed).
import { call } from "../../lib/live.mjs";
import { accounts } from "../../../seed-local-users.mjs";

const PORT = 3106;
const J = (r) => { try { return JSON.parse(r.text); } catch { return null; } };
const get = async (u) => { const r = await call(PORT, "collector", "GET", u); return { status: r.status, j: J(r) }; };

/** A step-up grant for `act` on the scope hash a 428 named. */
async function grant(act, conf) {
  const pw = accounts().find((a) => a.key === "collector")?.password;
  const r = await call(PORT, "collector", "POST", "/api/auth/confirm", { body: { step: "check", action: act, scope: conf.scope, summary: conf.summary ?? "", method: "password", code: pw } });
  const j = J(r);
  if (r.status !== 200 || !j?.grant) throw new Error(`confirm ${act}: ${r.status} ${j?.error ?? ""}`);
  return j.grant;
}

/** POST a decision, confirming it when the route asks. */
export async function decide(ids, decision, note = null) {
  const body = { incidentIds: ids, decision, note };
  let r = await call(PORT, "collector", "POST", "/api/collector/decisions", { body });
  let j = J(r);
  if (r.status === 428 && j?.confirm) {
    const g = await grant("decide", j.confirm);
    r = await call(PORT, "collector", "POST", "/api/collector/decisions", { body, headers: { "x-diq-grant": g } });
    j = J(r);
  }
  return { status: r.status, j };
}

/** The CSV export (confirmed), as the console downloads it. */
export async function exportCsv(qs) {
  let r = await call(PORT, "collector", "GET", `/api/collector/export?${qs}`);
  let j = J(r);
  if (r.status === 428 && j?.confirm) {
    const g = await grant("export", j.confirm);
    r = await call(PORT, "collector", "GET", `/api/collector/export?${qs}`, { headers: { "x-diq-grant": g } });
    j = J(r);
  }
  return { status: r.status, count: j?.count, csv: j?.csv ?? null, err: j?.error };
}

/** Every view of one incident and of the period's counts, at one moment. */
export async function views(id, period, { csv = false } = {}) {
  const qs = `period=${period}`;
  const seq = async (xs) => { const out = []; for (const u of xs) out.push(await get(u)); return out; };
  const [ov, inc, lOpen, lRes, lAll, lUnv, lVer, lAw, lCrit, srch, rep, ins] = await seq([
    `/api/collector/overview?${qs}`, `/api/collector/incidents/${id}`,
    `/api/collector/list?${qs}&status=open&q=${id}`, `/api/collector/list?${qs}&status=Resolved&q=${id}`,
    `/api/collector/list?${qs}&q=${id}`, `/api/collector/list?${qs}&status=unverified&q=${id}`, `/api/collector/list?${qs}&status=verified&q=${id}`,
    `/api/collector/list?${qs}&status=awaiting`, `/api/collector/list?${qs}&status=critical&scope=all&q=${id}`,
    `/api/collector/search?q=${id}`, `/api/collector/report?${qs}`, `/api/collector/insights?${qs}&part=briefing`
  ]);
  const [cOpen, cRes] = await seq([`/api/collector/list?${qs}&status=open`, `/api/collector/list?${qs}&status=Resolved`]);
  const o = ov.j, I = inc.j?.incident;
  const row = (l) => l.j?.rows?.find((r) => r.id === id) ?? null;
  const inAny = (rows) => (rows ?? []).some((r) => r.id === id);
  const ex = csv ? await exportCsv(qs) : null;
  return {
    now: o?.now,
    kpi: o && { ongoing: o.kpi.cur.ongoing, resolved: o.kpi.cur.resolved, complaints: o.kpi.cur.complaints, severe_open: o.kpi.cur.severe_open, urgent: o.kpi.cur.urgent,
      resolvedSeries: o.kpi.series.resolved, ongoingSeriesSum: o.kpi.series.ongoing.reduce((a, b) => a + b, 0) },
    sevCounts: o?.severity.counts, tasks: o?.tasks.count, critical: o?.snapshot?.critical, overdue: o?.snapshot?.overdue,
    onPage1: o && { pins: o.map.pins.find((p) => p.id === id) ?? null, sevRow: o.severity.rows.find((r) => r.id === id) ?? null,
      task: o.tasks.rows.find((r) => r.id === id) ? true : false, bell: inAny(o.bell), news: inAny(o.news) },
    zoneRow: o && I ? o.zoneTable.find((z) => z.zone === I.zone) : null,
    detail: I && { status: I.status, open: I.open, verified: I.verified, closed_at: I.closed_at, decision: I.decision, decided_at: I.decided_at,
      decisions: (inc.j.decisions ?? []).map((d) => `${d.decision}@${d.t}`) },
    lists: { open: row(lOpen) && [row(lOpen).status, row(lOpen).open], resolved: row(lRes) && [row(lRes).status, row(lRes).open], any: row(lAll) && [row(lAll).status, row(lAll).open],
      unverified: !!row(lUnv), verified: !!row(lVer), critical: !!row(lCrit), awaitingIn: inAny(lAw.j?.rows), awaitingTotal: lAw.j?.total,
      openInc: cOpen.j?.incidents, resolvedInc: cRes.j?.incidents },
    search: (srch.j?.incidents ?? []).filter((r) => r.id === id).map((r) => [r.status, r.open])[0] ?? null,
    report: rep.j && { attentionTotal: rep.j.report.attentionTotal, routine: rep.j.report.routine, inAttention: inAny(rep.j.report.attention) },
    briefing: ins.j && { open: ins.j.briefing?.stats?.open, handled: ins.j.briefing?.stats?.handledByDepts, inAttention: (ins.j.briefing?.attention ?? []).some((a) => a.id === id),
      bookResolved: ins.j.book?.good?.resolved, bookAwaiting: ins.j.book?.glance?.tiles?.awaiting, bookCritical: (ins.j.book?.critical ?? []).some((c) => c.id === id) },
    export: ex && { status: ex.status, count: ex.count, hasId: ex.csv ? ex.csv.includes(id) : null, checks: ex.csv ? ex.csv.split("\n").filter((l) => l.startsWith("Closed work")).length : null,
      need: ex.csv ? ex.csv.split("\n").filter((l) => l.startsWith("Needs your")).length : null }
  };
}

if (process.argv[1]?.endsWith("decide.mjs")) {
  const [id, period, ...steps] = process.argv.slice(2);
  const csv = process.env.CSV === "1";
  console.log(JSON.stringify({ step: "before", at: new Date().toISOString(), ...(await views(id, period, { csv })) }));
  for (const s of steps) {
    const [decision, note] = s.split(":");
    const r = await decide([id], decision, note ?? null);
    console.log(JSON.stringify({ step: s, post: r.status, saved: r.j?.saved ?? r.j?.error }));
    console.log(JSON.stringify({ step: `after ${s}`, at: new Date().toISOString(), ...(await views(id, period, { csv })) }));
  }
}
