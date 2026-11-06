// QA pass 4 (same number everywhere): the differences that need more than one reading to name, row by row. Reads the running server over HTTP and the oracle.
//   node tests/qa/pass4/same-number-extras.mjs --port 3120      writes docs/qa/pass4/evidence/same-number-extras.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTable } from "../oracle/load.mjs";
import { HOURS, PIN_TABLES, SEVERITIES, fmtWall, loadOracle, wallMs } from "../oracle/pinned.mjs";
import { EVIDENCE_DIR, Http } from "./same-number.mjs";

const uniq = (a) => [...new Set(a)];
const parseCsvIds = (csv) => {
  // the id is the second column; a text cell can hold a line break, so ids are taken by their shape after the list name
  const need = [...csv.matchAll(/(?:^|\n)"?Needs your attention"?,"?(INC-[A-Za-z0-9-]+)"?/g)].map((m) => m[1]);
  const check = [...csv.matchAll(/(?:^|\n)"?Closed work to check"?,"?(INC-[A-Za-z0-9-]+)"?/g)].map((m) => m[1]);
  return { need, check };
};

/** Lists every row a filter of the console's list returns, a page at a time (one row per group). */
async function listRows(h, params, maxPages = 40) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const r = await h.get("collector", `/api/collector/list?${new URLSearchParams({ ...params, page: String(page) })}`);
    const rows = r.json?.rows ?? [];
    out.push(...rows);
    if (rows.length < 12) break;
  }
  return out;
}

export async function extras({ port = 3120, oracle = null } = {}) {
  const o = oracle ?? loadOracle();
  const h = new Http(port);
  const out = {};

  // ---- what "routine" and "needs your attention" count: Briefing, PDF report, CSV
  out.routine = {};
  for (const period of ["daily", "weekly", "monthly", "quarterly"]) {
    const ins = (await h.get("collector", `/api/collector/insights?period=${period}&part=briefing`)).json;
    const rep = (await h.get("collector", `/api/collector/report?period=${period}`)).json;
    const first = await h.get("collector", `/api/collector/export?period=${period}`);
    const g = await h.grant("collector", first.json.confirm.scope);
    const csv = (await h.get("collector", `/api/collector/export?period=${period}`, { "x-diq-grant": g })).json;
    const ids = parseCsvIds(csv.csv);
    const shown = ins.briefing.attention.map((a) => a.id);
    const notShown = ids.need.filter((id) => !shown.includes(id));
    out.routine[period] = {
      still_open: o.value("open", { period }),
      briefing_says_routine: ins.briefing.stats.handledByDepts, briefing_shows_attention: shown.length, pdf_says_attention: rep.report.attentionTotal, pdf_says_routine: rep.report.routine, csv_attention_rows: ids.need.length,
      csv_closed_work_rows: ids.check.length, closed_work_ids: ids.check.slice(0, 40), my_tasks_groups: rep.tasks?.count ?? null,
      on_the_briefing_called_routine_but_on_the_action_list: notShown.length, those_ids: notShown,
      attention_shown_not_in_csv: shown.filter((id) => !ids.need.includes(id))
    };
  }

  // ---- "only in the news": tile, list, the written briefing
  out.news_only = {};
  for (const period of ["daily", "weekly", "monthly", "quarterly"]) {
    const ins = (await h.get("collector", `/api/collector/insights?period=${period}&part=briefing`)).json;
    const want = o.rows({ period }).filter((x) => x.mediaOnly && x.status !== "Lapsed").sort((a, b) => 0);
    const listed = new Set(ins.gaps.map((g) => g.id));
    const md = ins.briefing.md.match(/In the news, not in department records\n- ([\d,]+) incidents?/)?.[1] ?? null;
    out.news_only[period] = {
      tile_news_only: ins.book.glance.tiles.newsOnly, oracle_all: o.value("news_only", { period }), oracle_not_lapsed: want.length, list_count_on_page: ins.gaps.length, written_briefing_says: md,
      lapsed_counted_by_tile_only: o.rows({ period }).filter((x) => x.mediaOnly && x.status === "Lapsed").length,
      not_lapsed_missing_from_list: want.filter((x) => !listed.has(x.id)).map((x) => x.id), listed_not_in_oracle: ins.gaps.filter((g) => !want.some((x) => x.id === g.id)).map((g) => g.id)
    };
  }

  // ---- the three severe numbers, weekly: one row each
  {
    const s = { period: "weekly" };
    const all = o.ids("severe", s), open = o.ids("severe_open", s);
    const by = new Map();
    for (const r of o.rows(s)) { if (!(r.open && !r.routed)) continue; const c = by.get(r.group); if (!c || SEVERITIES.indexOf(r.sev) < SEVERITIES.indexOf(c.sev)) by.set(r.group, r); }
    const heads = [...by.values()].filter((r) => r.sev === "Severe").map((r) => r.id);
    const ov = (await h.get("collector", "/api/collector/overview?period=weekly")).json;
    out.severe_weekly = {
      tile_severe: ov.kpi.cur.severe, tile_under_it_severe_open: ov.kpi.cur.severe_open, severity_panel_and_jarvis: ov.severity.counts.Severe,
      closed_ids: all.filter((id) => !open.includes(id)),
      open_but_inside_another_row: open.filter((id) => !heads.includes(id)).map((id) => ({ id, group: o.groupOf(id), head: by.get(o.groupOf(id))?.id ?? null, head_sev: by.get(o.groupOf(id))?.sev ?? null })),
      panel_rows_listed: ov.severity.rows.filter((r) => r.sev === "Severe").length
    };
    // what Jarvis said about them: the page of 12
    const shown = ov.severity.rows.filter((r) => r.sev === "Severe");
    const lateAll = by.size ? [...by.values()].filter((r) => r.sev === "Severe" && r.breached) : [];
    out.severe_weekly.late = { jarvis_says: shown.filter((r) => Number(r.breached) === 1).length, whole_list: lateAll.length, late_not_on_the_page: lateAll.filter((r) => !shown.some((x) => x.id === r.id)).map((r) => r.id) };
    const pwd = [...by.values()].filter((r) => r.sev === "Severe" && r.dept === "PWD-WRD");
    out.severe_weekly.held_by_pwd_wrd = { jarvis_says: shown.filter((r) => r.dept === "PWD-WRD").length, whole_list: pwd.length, not_on_the_page: pwd.filter((r) => !shown.some((x) => x.id === r.id)).map((r) => r.id) };
  }

  // ---- the list sorted by severity: the order Jarvis gets, and the order it means
  {
    const asJarvis = (await h.get("collector", "/api/collector/list?period=weekly&zone=13&status=open&sort=sev")).json;
    const meant = (await h.get("collector", "/api/collector/list?period=weekly&zone=13&status=open&sort=sev&dir=1")).json;
    const every = await listRows(h, { period: "weekly", zone: "13", status: "open", sort: "sev", dir: "1" });
    out.list_order_adyar_weekly = {
      total_groups: asJarvis.total, incidents: asJarvis.incidents, first_page_as_jarvis_asks: asJarvis.rows.map((r) => ({ id: r.id, sev: r.sev, overdue: Number(r.breached) === 1 })),
      first_page_when_sorted_as_meant: meant.rows.map((r) => ({ id: r.id, sev: r.sev, overdue: Number(r.breached) === 1 })),
      past_deadline_on_jarvis_page: asJarvis.rows.filter((r) => Number(r.breached) === 1).length, past_deadline_group_rows_on_every_page: every.filter((r) => Number(r.breached) === 1).length,
      oracle_past_deadline_incidents: o.value("overdue", { period: "weekly", zone: 13 }),
      oracle_ids: o.ids("overdue", { period: "weekly", zone: 13 })
    };
  }

  // ---- the Trends tool's "last 12 weeks": rows in the total and not in the bars
  {
    const ins = (await h.get("collector", "/api/collector/insights?period=weekly&part=trends")).json;
    const rows = o.rows({ hours: 84 * 24 });
    const monday = (t) => { const x = new Date(t); const day = (x.getUTCDay() + 6) % 7; return fmtWall(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - day * 864e5).slice(0, 10); };
    const keys = new Set(ins.trends.weekly.keys);
    const line = ins.trends.weekly.lines.find((l) => l.cat === "SOLID_WASTE") ?? ins.trends.weekly.lines[0];
    const shown = line.values.reduce((a, x) => a + x, 0);
    const off = rows.filter((r) => r.cat === line.cat && !keys.has(monday(r.t)));
    const others = ins.trends.weekly.lines.find((l) => l.cat === "OTHERS");
    out.trend_total = { line: line.cat, says_last_12_weeks: line.total, bars_add_up_to: shown, rows_in_total_outside_the_12_bars: off.length, sample_ids: off.slice(0, 20).map((r) => `${r.id} ${r.tText}`), first_bar: ins.trends.weekly.keys[0], last_bar: ins.trends.weekly.keys.at(-1),
      others: others ? { total: others.total, bars: others.values.reduce((a, x) => a + x, 0) } : null,
      every_line: ins.trends.weekly.lines.map((l) => ({ cat: l.cat, total: l.total, bars: l.values.reduce((a, x) => a + x, 0) })) };
  }

  // ---- the AI day brief's window: the hour, not the console's now
  out.ai_window = {};
  const end = wallMs(`${o.now.slice(0, 13)}:00:00`);
  for (const p of Object.keys(HOURS)) {
    const hh = HOURS[p] * 3600_000;
    const a = o.effective.filter((r) => r.t > o.nowMs - hh && r.t <= o.nowMs), b = o.effective.filter((r) => r.t > end - hh && r.t <= end);
    const A = new Set(a.map((r) => r.id)), B = new Set(b.map((r) => r.id));
    out.ai_window[p] = { tile: a.length, brief_facts: b.length, tile_open: a.filter((r) => r.open).length, brief_open: b.filter((r) => r.open).length, in_tile_only: a.filter((r) => !B.has(r.id)).map((r) => `${r.id} ${r.tText}`), in_brief_only: b.filter((r) => !A.has(r.id)).map((r) => `${r.id} ${r.tText}`) };
  }

  // ---- durable rows that point at no incident in this build
  out.orphans = { decisions: [], steps: [], routings: [] };
  for (const d of o.durable.decisions) { const id = String(d.incident_id); out.orphans.decisions.push({ id, decision: d.decision, decided_at: d.decided_at, in_raw: !!o.rawRow(id), screen_status: (await h.get("collector", `/api/collector/incidents/${id}`)).status }); }
  for (const d of o.durable.steps) { const id = String(d.incident_id); out.orphans.steps.push({ id, step: d.step, dept: d.dept_code, in_raw: !!o.rawRow(id) }); }
  for (const d of o.durable.assignments) { const id = String(d.incident_id); const r = o.row(id); out.orphans.routings.push({ id, dept: d.dept_code, in_raw: !!o.rawRow(id), open_now: r ? r.open : null, status: r ? r.status : null }); }

  // ---- rows dated after the console's now (OPEN-11)
  out.future_rows = { now: o.now, rows: o.effective.filter((r) => r.t > o.nowMs).map((r) => ({ id: r.id, first_reported_at: r.tText, dept: r.dept, cat: r.cat, open: r.open })) };
  const fu = (await h.post("collector", "/api/collector/assistant/tools", { tool: "dept_backlog", args: { scope: { period: "quarterly" } } })).json?.result?.data?.rows ?? [];
  const dist = o.effective.filter((r) => r.dept === "DIST-DM" && r.open);
  out.future_rows.backlog_for_DIST_DM = { backlog_tool: fu.find((x) => x.code === "DIST-DM")?.n ?? null, oracle_any_date_open: dist.length, oracle_up_to_now: dist.filter((r) => r.t <= o.nowMs).length };

  // ---- OPEN-7: the store's flag against the due time, on the same open rows
  out.deadline_flag = {};
  for (const p of Object.keys(HOURS)) {
    const s = { period: p };
    const flag = new Set(o.ids("overdue_flag", s)), due = new Set(o.ids("overdue_due", s));
    const gap = [...due].filter((x) => !flag.has(x));
    out.deadline_flag[p] = { flag: flag.size, due_passed: due.size, due_passed_no_flag: gap.length, flag_not_due: [...flag].filter((x) => !due.has(x)).length, sample: gap.slice(0, 15).map((id) => { const r = o.row(id); return `${id} due ${r.dueText}`; }) };
  }

  // ---- what the hooks took out: a word on each kind
  const docs = loadTable("documents", PIN_TABLES).objects();
  const pubs = {};
  for (const r of o.hooks.removed) if (r.hook === "news-media-only@1") for (const d of docs) if (d.linked_incident_id === r.id && d.publisher) pubs[d.publisher] = (pubs[d.publisher] ?? 0) + 1;
  out.hooks_removed = { total: o.hooks.removed.length, by_hook: o.hooks.removed.reduce((a, r) => ((a[r.hook] = (a[r.hook] ?? 0) + 1), a), {}), news_media_only_publishers: Object.entries(pubs).sort((a, b) => b[1] - a[1]).slice(0, 30), zone_moves: (o.hooks.zoneMoves ?? []).length };

  // ---- the two pairs from the last report (237 against 240, 12 against 13)
  const lo = Date.parse("2026-11-04T06:00:42Z"), hi = Date.parse("2026-11-05T06:00:42Z");
  const inOld = o.raw.filter((r) => r.t > lo && r.t <= hi);
  const gone = inOld.filter((r) => o.removedBy.has(r.id));
  // the old window replayed on this build: rows reported by the old as-of, open then (open now, or closed after it), and past their due time by then with today's flag
  const oldAsOf = wallMs("2026-11-05 05:02:00");
  const openThen = inOld.filter((r) => r.t <= oldAsOf && (r.rawOpen || (r.closed != null && r.closed > oldAsOf)));
  const lateThen = inOld.filter((r) => r.rawOpen && r.breached && r.due != null && r.due <= oldAsOf);
  const replay = { rows_reported_by_old_as_of: inOld.filter((r) => r.t <= oldAsOf).length, open_then: openThen.length, open_then_after_hooks: openThen.filter((r) => !o.removedBy.has(r.id)).length,
    past_due_then_with_todays_flag: lateThen.length, past_due_then_after_hooks: lateThen.filter((r) => !o.removedBy.has(r.id)).length, past_due_ids: lateThen.map((r) => r.id),
    rows_in_the_old_window_reported_after_old_as_of: inOld.filter((r) => r.t > oldAsOf).map((r) => r.id) };
  out.old_pairs = {
    claim: "docs/qa/evidence/BROWSER.md: ongoing 237 against 240, past deadline 12 against 13, at now = 2026-11-05 06:00:42, build as_of 2026-11-05 05:02. That build is not kept anywhere: the cached builds found are as_of 11-04 12:10, 11-04 16:11, 11-04 19:12 and 11-06 16:04.",
    replay,
    same_window_in_pinned_build: { reported: inOld.length, open: inOld.filter((r) => r.rawOpen).length, overdue: inOld.filter((r) => r.rawOpen && r.breached).length },
    rows_the_hooks_take_out_of_that_window: gone.map((r) => ({ id: r.id, reported: r.tText, hook: o.removedBy.get(r.id), open: r.rawOpen, flag: r.breached, due: r.dueText, title_dept: r.dept })),
    today_equal_figures: Object.fromEntries(Object.keys(HOURS).map((p) => [p, { open_raw: o.value("open", { period: p }, "raw"), open_screen: o.value("open", { period: p }), overdue_raw: o.value("overdue_flag", { period: p }, "raw"), overdue_screen: o.value("overdue_flag", { period: p }) }]))
  };

  // ---- the same kind of pair, today: the raw snapshot against every screen, the daily and weekly tiles
  out.today_pairs = {};
  for (const p of ["daily", "weekly"]) {
    const sc = { period: p };
    const pair = (a) => { const raw = new Set(o.ids(a, sc, "raw")), scr = new Set(o.ids(a, sc)); return { raw: raw.size, screen: scr.size, only_raw: [...raw].filter((x) => !scr.has(x)).map((id) => ({ id, why: o.removedBy.get(id) ?? "see hooks", reported: o.rawRow(id)?.tText, dept: o.rawRow(id)?.dept, flag: o.rawRow(id)?.breached })), only_screen: [...scr].filter((x) => !raw.has(x)) }; };
    out.today_pairs[p] = { open: pair("open"), past_deadline: pair("overdue_flag") };
  }

  // ---- "12 complete weeks": the first bar against that whole week
  {
    const ins = (await h.get("collector", "/api/collector/insights?period=weekly&part=trends")).json;
    const keys = ins.trends.weekly.keys, cut = o.nowMs - 84 * 864e5;
    out.first_bar = keys.slice(0, 2).map((k, j) => {
      const from = k + " 00:00:00", to = fmtWall(wallMs(from) + 7 * 864e5), whole = o.inStretch(from, to);
      const shown = ins.trends.weekly.lines.reduce((a, l) => a + l.values[j], 0), cutOff = whole.filter((r) => r.t <= cut);
      return { week_from: k, app_bar: shown, whole_week_rows: whole.length, rows_cut_off: cutOff.length, rolling_start: fmtWall(cut), cut_off_first_ids: cutOff.slice(0, 15).map((r) => r.id + " " + r.tText) };
    });
    const line = ins.trends.weekly.lines.find((l) => l.cat === "SOLID_WASTE");
    const lastBarEnd = wallMs(keys.at(-1) + " 00:00:00") + 7 * 864e5;
    const after = o.effective.filter((r) => r.cat === "SOLID_WASTE" && r.t >= lastBarEnd && r.t <= o.nowMs);
    out.first_bar_total = { line: line.cat, total_said: line.total, bars: line.values.reduce((a, x) => a + x, 0), rows_after_the_last_bar: after.length, after_first_ids: after.slice(0, 15).map((r) => r.id) };
  }

  // ---- zone performance: the rows with no zone
  out.no_zone = {};
  for (const p of Object.keys(HOURS)) {
    const rows = o.rows({ period: p }).filter((r) => r.zone == null);
    out.no_zone[p] = { rows: rows.length, open: rows.filter((r) => r.open).length, ids_first: rows.slice(0, 20).map((r) => r.id), by_dept: rows.reduce((a, r) => ((a[r.dept] = (a[r.dept] ?? 0) + 1), a), {}) };
  }

  // ---- a figure called cases or incidents that counts groups: the rows inside another row's group
  out.groups_vs_incidents = {};
  for (const p of Object.keys(HOURS)) {
    const on = o.apply("ongoing", o.rows({ period: p })).ids, rep = o.apply("reported", o.rows({ period: p })).ids;
    const headsOf = (ids) => { const by = new Map(); for (const id of ids) { const r = o.row(id); const c = by.get(r.group); if (!c || SEVERITIES.indexOf(r.sev) < SEVERITIES.indexOf(c.sev) || (SEVERITIES.indexOf(r.sev) === SEVERITIES.indexOf(c.sev) && (r.complaints > c.complaints || (r.complaints === c.complaints && r.t > c.t)))) by.set(r.group, r); } return by; };
    const a = headsOf(on), b = headsOf(rep);
    const list = (await h.get("collector", "/api/collector/list?period=" + p)).json, listOpen = (await h.get("collector", "/api/collector/list?period=" + p + "&status=open")).json;
    out.groups_vs_incidents[p] = { reported: rep.length, reported_groups: b.size, list_total: list.total, list_incidents: list.incidents, open_not_routed: on.length, open_groups: a.size, list_open_total: listOpen.total, list_open_incidents: listOpen.incidents,
      open_rows_inside_another_rows_group: on.filter((id) => a.get(o.groupOf(id))?.id !== id).map((id) => ({ id, group: o.groupOf(id), kept_row: a.get(o.groupOf(id))?.id })) };
  }

  // ---- resolved: the tile against closing time
  {
    const s = { period: "weekly" }, tile = o.ids("resolved", s), byClose = o.resolvedByClose(s).map((r) => r.id), T = new Set(tile), C = new Set(byClose);
    out.resolved_weekly = { tile_reported_in_period_and_resolved: tile.length, closed_as_resolved_in_period: byClose.length, on_the_tile_only: tile.filter((id) => !C.has(id)), closed_this_week_reported_before_n: byClose.filter((id) => !T.has(id)).length, closed_this_week_reported_before: byClose.filter((id) => !T.has(id)).slice(0, 60) };
  }

  // ---- the officer's map: the open row with no zone
  {
    const off = (await h.get("officerA", "/api/officer/overview?period=weekly")).json;
    const rows = o.officerRows("GCC-SWM", { period: "weekly" }).filter((r) => ["new", "approved", "action", "sent"].includes(r.stage));
    out.officer_map = { counts_open: off.counts.new + off.counts.action + off.counts.sent, zone_counts_sum: Object.values(off.map.zoneCounts).reduce((a, x) => a + Number(x), 0), no_zone_ids: rows.filter((r) => r.zone == null).map((r) => r.id) };
  }

  // ---- the oracle's list of what the hooks did, against the server itself: a removed row has no screen, a moved row shows its new zone
  {
    const removed = o.hooks.removed.filter((_, k) => k % 6 === 0).map((r) => String(r.id));
    const moved = (o.hooks.zoneMoves ?? []).filter((_, k) => k % 6 === 0);
    const statuses = {};
    for (const id of removed) { const st = (await h.get("collector", "/api/collector/incidents/" + id)).status; statuses[st] = (statuses[st] ?? 0) + 1; }
    let movedOk = 0; const movedBad = [];
    for (const m of moved) { const j = (await h.get("collector", "/api/collector/incidents/" + m.id)).json; const z = j?.incident?.zone ?? j?.zone ?? null; if (Number(z) === Number(m.zone_no?.[1])) movedOk++; else movedBad.push({ id: m.id, app: z, hook: m.zone_no?.[1] }); }
    out.hook_check = { removed_read: removed.length, removed_status: statuses, moved_read: moved.length, moved_shows_new_zone: movedOk, moved_not: movedBad };
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--port");
  const out = await extras({ port: i > 0 ? Number(process.argv[i + 1]) : 3120 });
  fs.writeFileSync(path.join(EVIDENCE_DIR, "same-number-extras.json"), JSON.stringify(out, null, 1));
  console.log(Object.keys(out).join(", "));
}
