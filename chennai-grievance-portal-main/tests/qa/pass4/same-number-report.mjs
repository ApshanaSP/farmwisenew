// QA pass 4 (same number everywhere): turns the raw runs into the two evidence files. Every difference is given a class and either a finding id or the rows that explain it.
// A difference nothing here explains stays marked UNEXPLAINED, and the report says so at the top.
//   node tests/qa/pass4/same-number-report.mjs      reads same-number[-more|-overlay].raw.json and same-number-extras.json, writes same-number.json and same-number.md
// No server is needed. No model. Ids only: no complaint text.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./same-number.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.resolve(here, "..", "..", "..", "..", "docs", "qa", "pass4", "evidence");
const readJson = (f) => (fs.existsSync(path.join(EVIDENCE, f)) ? JSON.parse(fs.readFileSync(path.join(EVIDENCE, f), "utf8")) : null);

const runs = { plain: readJson("same-number.raw.json"), more: readJson("same-number-more.raw.json"), chat: readJson("same-number-chat.raw.json"), overlay: readJson("same-number-overlay.raw.json") };
const extras = readJson("same-number-extras.json");
const hooks = readJson("same-number-hooks.json");
const cap = readJson("same-number-exportcap.json");
const hand = readJson("same-number-reconciled.json"); // the rows named by hand-run checks, see same-number-reconcile.mjs

const all = [];
for (const [run, j] of Object.entries(runs)) if (j) for (const r of j.readings) all.push({ run, ...r });
// a reading is kept once per scope, surface and figure and run; the "more" run repeats the console and trends with its added figures, so its repeats are dropped
const seen = new Set();
const readings = [];
for (const r of all) {
  const k = `${r.run === "overlay" ? "overlay" : "x"}|${r.scope}|${r.surface}|${r.figure}|${r.role}`;
  if (seen.has(k)) continue;
  seen.add(k);
  const d = r.diff === 0 ? null : classify(r);
  readings.push(d ? { ...r, ...d } : r);
}
const differences = readings.filter((r) => r.diff !== 0);

const bySurface = {};
for (const r of readings) {
  const k = r.surface.split(":")[0];
  bySurface[k] ??= { readings: 0, agree: 0, differ: 0, missing: 0, scopes: new Set() };
  bySurface[k].readings++;
  bySurface[k].scopes.add(r.scope);
  if (r.missing) bySurface[k].missing++; else if (r.diff === 0) bySurface[k].agree++; else bySurface[k].differ++;
}
for (const k of Object.keys(bySurface)) bySurface[k].scopes = bySurface[k].scopes.size;

const byFinding = {};
for (const r of differences) { const k = r.finding ?? r.class; byFinding[k] ??= { n: 0, examples: [] }; byFinding[k].n++; if (byFinding[k].examples.length < 4) byFinding[k].examples.push(`${r.scope} | ${r.surface} | ${r.figure}: app ${r.value}, oracle ${r.oracle}`); }

const first = runs.plain ?? runs.more ?? runs.overlay;
const out = {
  generated_at: new Date().toISOString(), build: first?.build, now: first?.now, server_now: first?.server_now,
  server: "node tests/qa/pass4/server.mjs start --port 3120 --frozen --ticking --env ASSISTANT_TOOLS_API=1",
  why_ticking: "lib/rate-limit.ts resets a bucket when Date.now() passes its end. With a clock that never moves the per-minute limits never reset and the routes answer 429. The clock starts at 12:00 and runs on, the store's as-of (18:08) is later, so the console's now stays 18:08 for the whole run and no window moves.",
  no_model: "The server has no model key. Jarvis and Ask District IQ answered through their code lanes. collector/brief needs a model and returns no write-up here; the facts it would write from are checked with a fake model at the boundary (same-number-brief.test.ts).",
  method: "Every figure read over HTTP from the frozen server, as the role that sees it. oracle = tests/qa/oracle/pinned.mjs over the raw snapshot, after the rows the app's own build hooks remove or move (same-number-hooks.json); oracle_raw = the same figure over the raw snapshot with no hooks.",
  scopes: [...new Set(readings.map((r) => r.scope))],
  counts: { readings: readings.length, agree: readings.filter((r) => r.diff === 0).length, differ: readings.filter((r) => r.diff !== 0 && !r.missing).length, missing: readings.filter((r) => r.missing).length, unexplained: differences.filter((r) => r.class === "UNEXPLAINED").length },
  by_surface: bySurface, by_finding: byFinding,
  http: Object.fromEntries(Object.entries(runs).filter(([, j]) => j).map(([k, j]) => [k, j.http])),
  unavailable: Object.fromEntries(Object.entries(runs).filter(([, j]) => j).map(([k, j]) => [k, j.unavailable])),
  overlay: runs.overlay ? { what_was_done: runs.overlay.overlay, routed_ids: runs.overlay.routed_ids, decided: runs.overlay.decided } : null,
  differences,
  raw_vs_screen: runs.plain?.raw_vs_screen ?? [], same_label: runs.plain?.same_label ?? [], same_label_overlay: runs.overlay?.same_label ?? [],
  reconciled: hand, extras, action_list_cap: cap,
  hooks_summary: hooks ? { after_hooks: hooks.incidents_after_hooks, removed: hooks.removed.length, moved_zone: hooks.zoneMoves.length, groups: Object.keys(hooks.clusters ?? {}).length } : null,
  id_checks: Object.fromEntries(Object.entries(runs).filter(([, j]) => j).map(([k, j]) => [k, j.id_checks])),
  lines: Object.fromEntries(Object.entries(runs).filter(([, j]) => j).map(([k, j]) => [k, j.lines])),
  notes: Object.fromEntries(Object.entries(runs).filter(([, j]) => j).map(([k, j]) => [k, j.notes])),
  readings
};
fs.writeFileSync(path.join(EVIDENCE, "same-number.json"), JSON.stringify(out));

// ------------------------------------------------------------------- same-number.md --

const findings = fs.existsSync(path.resolve(EVIDENCE, "..", "findings", "same-number.json")) ? JSON.parse(fs.readFileSync(path.resolve(EVIDENCE, "..", "findings", "same-number.json"), "utf8")) : [];
const ids = (a, n = 30) => (a?.length ? a.slice(0, n).join(", ") + (a.length > n ? " and " + (a.length - n) + " more (all in same-number.json)" : "") : "none");
const L = [];
const P = (x = "") => L.push(x);
const tbl = (head, rows) => { P("| " + head.join(" | ") + " |"); P("|" + head.map(() => "---").join("|") + "|"); for (const r of rows) P("| " + r.map((c) => String(c ?? "").replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ") + " |"); P(); };
const plainReadings = readings.filter((r) => r.run !== "overlay");

P("# Same number everywhere (QA pass 4)");
P();
P("One question: does the same scope give the same figure on every screen? Each figure was read over HTTP from a running server, as the role that sees it, and compared with an independent count of the raw rows and with every other screen. Every difference is named row by row below, or it is a finding.");
P();
P("- **Build:** " + out.build + ". **The console's now:** " + out.now + ", the store's as-of, which is later than the frozen clock.");
P("- **Server:** " + out.server + ". " + out.why_ticking);
P("- **Oracle:** tests/qa/oracle/pinned.mjs, no app code. Its effective layer takes the rows the app's own build hooks remove or change from same-number-hooks.json, written by the real hooks on this build, so that a hook's work can be named by id.");
P("- **Models:** " + out.no_model);
P("- **Scopes (" + out.scopes.length + "):** " + out.scopes.join("; ") + ".");
P("- **Evidence:** docs/qa/pass4/evidence/same-number.json holds every scope, surface, figure, oracle value and difference. **Test:** tests/qa/pass4/same-number.test.ts and same-number-brief.test.ts.");
P();
P("## Result");
P();
const C = out.counts;
P(C.readings + " readings. " + C.agree + " equal the oracle. " + C.differ + " differ, and each of those is classed below (" + C.unexplained + " unexplained). " + C.missing + " missing.");
P();
tbl(["Surface", "Scopes", "Readings", "Equal", "Differ", "Missing"], Object.entries(out.by_surface).map(([k, v]) => [k, v.scopes, v.readings, v.agree, v.differ, v.missing]));

P("## The two from last time: 237 against 240, 12 against 13");
P();
const op = extras?.old_pairs;
if (op) {
  P("Last report (docs/qa/evidence/BROWSER.md, build as-of 2026-11-05 05:02, now 06:00:42): ongoing 237 on the console against 240 from the oracle, past deadline 12 against 13. It explained them by the build hooks and named no rows.");
  P();
  P("**That build is gone.** The cached builds on this machine are as-of 11-04 12:10, 11-04 16:11, 11-04 19:12, 11-06 16:04 and 11-06 18:08; none is 11-05 05:02. So the old figures cannot be read again. What can be done is to replay the same window on the pinned build. The hooks' code has not changed since 27 Oct, so the same rules ran on the old build.");
  P();
  P("**237 against 240: three rows.** In that same window the hooks take out exactly three open rows, and three is the old difference:");
  P();
  tbl(["Incident", "Reported", "Taken out by", "Past deadline flag on this build", "Due"], op.rows_the_hooks_take_out_of_that_window.map((r) => [r.id, r.reported, r.hook, r.flag ? "yes" : "no", r.due]));
  P("All three have no complaints and none is Severe, which fits the two figures that did agree last time (severe 17, complaints 128). The replay (rows reported by the old as-of, open then) gives " + op.replay?.open_then + " raw and " + op.replay?.open_then_after_hooks + " after the hooks: the same gap of 3. The window's count moved since then because rows closed and late rows arrived.");
  P();
  P("**12 against 13: one row, and which one cannot be proved.** Only two of the three were past their due time by the old as-of: INC-20261104-0CD3CA and INC-20261104-2F77E5. Every kept build later than the old one flags both, and the old difference was 1, so on the old build one of them still had the flag at 0. No kept build shows which. The store's flag lags the due time (same-number-15): replayed with today's flags the window gives " + op.replay?.past_due_then_with_todays_flag + " against the old 13, so the flags moved. This is the honest limit: the pair is reconciled to these two ids, not to one.");
  P();
  P("**Is it a bug?** No: a definition difference. The rows are news-only rows the build takes out everywhere, so no screen disagrees with another. The oracle of last time read the raw table and could not see the hooks. Whether two of the rules go too far is a separate matter (same-number-19).");
  P();
  const tp = extras.today_pairs;
  if (tp) {
    P("**Does the same pair still appear?** Yes, in the same form, and now it is named:");
    P();
    tbl(["Scope", "Figure", "Raw", "Every screen", "Rows in raw only"], [
      ["daily", "still open", tp.daily.open.raw, tp.daily.open.screen, tp.daily.open.only_raw.map((x) => x.id + " (" + x.why + ")").join("; ") || "none"],
      ["daily", "past deadline", tp.daily.past_deadline.raw, tp.daily.past_deadline.screen, tp.daily.past_deadline.only_raw.map((x) => x.id + " (" + x.why + ")").join("; ") || "none"],
      ["weekly", "still open", tp.weekly.open.raw, tp.weekly.open.screen, tp.weekly.open.only_raw.map((x) => x.id + " (" + x.why + ")").join("; ") || "none"],
      ["weekly", "past deadline", tp.weekly.past_deadline.raw, tp.weekly.past_deadline.screen, tp.weekly.past_deadline.only_raw.map((x) => x.id + " (" + x.why + ")").join("; ") || "none"]
    ]);
  }
}

P("## One scope, every surface");
P();
P("The figure each surface gives under one name, whole-scope figures only (per-zone, per-department and per-category figures are in same-number.json and agree unless listed under Every difference). Each entry ends with the oracle definition it was checked against: complaints_all adds up closed incidents too, complaint_inc counts incidents, severe_open is open only, groups is one row per group. A value with a finding id beside it is that finding. The rows behind the other differences are in the next sections.");
P();
for (const scope of ["daily · district", "weekly · district", "weekly · zone 13", "weekly · GCC-SWM", "weekly · zone 13 · GCC-SWM"]) {
  const PART = /severityMix|^mix\.|category|ward\.|map\.layer|bottom|book\.citizens|byType|trend\.sum|Ranking|trends|taluk|zone\.|deptNav|deptActions|book\.departments|book\.where|zoneTable|map\.zoneCounts|series|severity\.counts\.(High|Medium|Low)|open\.(High|Medium|Low)/;
  const rs = plainReadings.filter((r) => r.scope === scope && !r.over && !r.missing && !PART.test(r.figure));
  if (!rs.length) continue;
  P("### " + scope);
  P();
  const rows = [];
  for (const label of ["reported", "still open", "past deadline", "severe", "complaints", "serious", "news only", "resolved"]) {
    const hit = rs.filter((r) => r.label === label);
    if (!hit.length) continue;
    const by = new Map();
    for (const r of hit) { const k = r.value; if (!by.has(k)) by.set(k, new Set()); by.get(k).add(r.surface.split(":")[0] + (r.diff !== 0 ? " (" + (r.finding ?? r.class) + ")" : "") + " " + r.def); }
    rows.push([label, [...by.entries()].sort((a, b) => b[1].size - a[1].size).map(([v, ss]) => "**" + v + "**: " + [...ss].slice(0, 9).join(", ") + (ss.size > 9 ? " and " + (ss.size - 9) + " more" : "")).join("<br>")]);
  }
  tbl(["Name", "Value: where"], rows);
}

P("## Every difference, by what it is");
P();
tbl(["What", "Class", "Readings", "Example"], Object.entries(byFinding).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => { const r = differences.find((x) => (x.finding ?? x.class) === k); return [k, r?.class, v.n, v.examples[0]]; }));

const rs = out.raw_vs_screen;
P("## Raw snapshot against every screen, row by row");
P();
if (hooks) P("The app's build hooks (lib/collector/derive.ts) change this build before any screen reads it: " + hooks.removed.length + " incidents taken out (" + Object.entries(hooks.removed.reduce((a, r) => ((a[r.hook] = (a[r.hook] ?? 0) + 1), a), {})).map(([k, n]) => k + ": " + n).join(", ") + "), " + hooks.zoneMoves.length + " given a zone from their reports. Every screen reads the changed build, so these differ only from the raw table. The rows of each figure are below for the district; every scope is in same-number.json.");
P();
tbl(["Scope", "Figure", "Raw", "Screens", "Rows in raw only", "Rows on screen only"], rs.filter((x) => /· district$/.test(x.scope)).map((x) => [x.scope, x.figure, x.oracle_raw, x.every_screen, x.in_raw_not_on_screen.length ? x.in_raw_not_on_screen.length + ": " + ids(x.in_raw_not_on_screen.map((y) => y.id), 6) : "none", x.on_screen_not_in_raw.length ? x.on_screen_not_in_raw.length + ": " + ids(x.on_screen_not_in_raw.map((y) => y.id), 6) : "none"]));

P("## Same name, different count: the rows");
P();
P("Two figures on screen with close names. Each pair below is named by id, for the weekly district. Every scope is in same-number.json.");
P();
const sl = out.same_label.filter((x) => x.scope === "weekly · district");
tbl(["First figure", "Second figure", "Only in the first", "Only in the second", "Why"], sl.map((x) => [x.a + " " + x.value_a, x.c + " " + x.value_c, x.only_in_a_n + ": " + ids(x.only_in_a.map((y) => y.id ?? y), 12), x.only_in_c_n + ": " + ids(x.only_in_c, 12), x.why]));
const ex = extras;
if (ex?.routine?.weekly) {
  const w = ex.routine.weekly;
  P("**Needs you, or routine (same-number-6, same-number-7), weekly district:** still open " + w.still_open + ". The Briefing shows " + w.briefing_shows_attention + " and calls " + w.briefing_says_routine + " routine, nothing to do. The PDF says " + w.pdf_says_attention + " need attention and " + w.pdf_says_routine + " are routine. The CSV has " + w.csv_attention_rows + " rows. By the app's own rule over every open incident, " + (cap?.weekly?.need_all ?? "?") + " need attention. Called routine on the Briefing but on the action list: " + w.on_the_briefing_called_routine_but_on_the_action_list + " rows, " + ids(w.those_ids, 12) + ". Past the top 400 the list reads: " + ids(cap?.weekly?.beyond_cap, 12) + ".");
  P();
}
if (ex?.news_only?.weekly) {
  const w = ex.news_only.weekly, m = ex.news_only.monthly;
  P("**Only in the news (same-number-8):** weekly, the figure says " + w.tile_news_only + ", the written line says " + w.written_briefing_says + ", the list holds " + w.list_count_on_page + ". Not on the list: " + ids(w.not_lapsed_missing_from_list, 25) + ". Monthly: the figure says " + m.tile_news_only + ", of which " + m.lapsed_counted_by_tile_only + " are lapsed and left out of the list; " + m.oracle_not_lapsed + " are not; the written line says " + m.written_briefing_says + ", the list holds " + m.list_count_on_page + ".");
  P();
}
if (ex?.severe_weekly) {
  const w = ex.severe_weekly;
  P("**Severe, weekly district:** the tile says " + w.tile_severe + " (open or closed), under it " + w.tile_under_it_severe_open + " open, and the panel and Jarvis say " + w.severity_panel_and_jarvis + ". The " + w.closed_ids.length + " closed: " + ids(w.closed_ids, 12) + ". The open ones inside another row's group: " + w.open_but_inside_another_row.map((x) => x.id + " (in the row of " + x.head + ")").join("; ") + ". Jarvis's page: 12 rows of " + w.severity_panel_and_jarvis + "; it says " + w.late?.jarvis_says + " past deadline, the whole list has " + w.late?.whole_list + "; the ones not on the page: " + ids(w.late?.late_not_on_the_page, 25) + ".");
  P();
}
if (ex?.first_bar?.length) {
  const a = ex.first_bar[0];
  P("**The first of the 12 complete weeks (same-number-10):** the bar for the week of " + a.week_from + " says " + a.app_bar + ". That whole week has " + a.whole_week_rows + " incidents. The " + a.rows_cut_off + " missing are those before the rolling window's start, " + a.rolling_start + "; the first of them: " + ids(a.cut_off_first_ids, 8) + ".");
  P();
  if (ex.first_bar_total) { const t = ex.first_bar_total; P("**A line's total against its bars (a definition, not shown on the Trends page):** " + t.line + " says " + t.total_said + ", its bars add up to " + t.bars + ". The total is the rolling 84 days; the bars are calendar weeks. In the total only: " + t.rows_after_the_last_bar + " rows after the last bar, first " + ids(t.after_first_ids, 8) + ". On the monthly lines the same is true of rows from before the first month shown. Ask District IQ's fact 'last 12 weeks' carries the total, so a written answer can differ from its chart by these rows."); P(); }
}
if (ex?.no_zone?.weekly) {
  const w = ex.no_zone.weekly;
  P("**Rows with no zone (same-number-11), weekly district:** " + w.rows + " rows, " + w.open + " open, by department " + JSON.stringify(w.by_dept) + ". First of them: " + ids(w.ids_first, 10) + ". The console's zone table shows them as a separate line; Jarvis's zone performance drops them from 'Reported' and 'Open'.");
  P();
}
if (ex?.officer_map) {
  P("**The officer's map (weekly Solid Waste):** " + ex.officer_map.counts_open + " still open on the officer's counts, " + ex.officer_map.zone_counts_sum + " on the map's zone counts. The difference is the row with no zone: " + ids(ex.officer_map.no_zone_ids) + ". The map has no zone to draw it in; not a bug.");
  P();
}
if (ex?.groups_vs_incidents?.weekly) {
  const w = ex.groups_vs_incidents.weekly;
  P("**Counted by group (same-number-9), weekly district:** open, not routed " + w.open_not_routed + "; groups " + w.open_groups + " (the list route gives both: total " + w.list_open_total + ", incidents " + w.list_open_incidents + "). The " + w.open_rows_inside_another_rows_group.length + " rows inside another row's group: " + ids(w.open_rows_inside_another_rows_group.map((x) => x.id + " in " + x.kept_row), 15) + ". Monthly, all rows: reported " + ex.groups_vs_incidents.monthly.reported + ", groups " + ex.groups_vs_incidents.monthly.reported_groups + ".");
  P();
}
if (ex?.resolved_weekly) {
  const w = ex.resolved_weekly;
  P("**Resolved, weekly district (same-number-22):** the tile says " + w.tile_reported_in_period_and_resolved + ": reported this week and resolved since. By closing time it is " + w.closed_as_resolved_in_period + ". All the tile's rows are in the second count (" + w.on_the_tile_only.length + " are not). The other " + w.closed_this_week_reported_before_n + " were reported before this week; the first of them: " + ids(w.closed_this_week_reported_before, 10) + ".");
  P();
}
if (ex?.hook_check) {
  const w = ex.hook_check;
  P("**The hook list against the server:** of " + w.removed_read + " removed rows read back, " + (w.removed_status[404] ?? 0) + " answer 404. Of " + w.moved_read + " rows moved to a zone, " + w.moved_shows_new_zone + " show that zone on their own screen. So the oracle's list of what the hooks did is what the server has.");
  P();
}
if (ex?.ai_window?.weekly) {
  const w = ex.ai_window.weekly;
  P("**The AI brief's window (same-number-12):** the brief's facts end at the top of the hour, the tile at the console's now. Weekly: tile " + w.tile + ", brief " + w.brief_facts + ". In the tile only: " + ids(w.in_tile_only, 10) + ". In the brief only: " + ids(w.in_brief_only, 10) + ".");
  P();
}
if (ex?.deadline_flag?.weekly) {
  const w = ex.deadline_flag.weekly;
  P("**The past-deadline flag against the due time (same-number-15, OPEN-7):** weekly, the flag says " + w.flag + " and " + w.due_passed + " have a due time that has passed, " + w.due_passed_no_flag + " with no flag. Not one flagged row is still inside its due time. Sample: " + ids(w.sample, 8) + ".");
  P();
}
if (ex?.future_rows) {
  P("**Rows dated after the console's now (same-number-16, OPEN-11):** " + ex.future_rows.rows.map((r) => r.id).join(", ") + ", all " + ex.future_rows.rows[0]?.first_reported_at + ". No window counts them. The backlog has no date filter, so DIST-DM reads " + ex.future_rows.backlog_for_DIST_DM?.backlog_tool + " there against " + ex.future_rows.backlog_for_DIST_DM?.oracle_up_to_now + " up to now.");
  P();
}
if (ex?.orphans) {
  P("**Durable rows pointing at no incident (same-number-17):** decisions on " + ids(ex.orphans.decisions.filter((d) => !d.in_raw).map((d) => d.id + " (" + d.decision + ")")) + "; officer steps on " + ids(ex.orphans.steps.filter((d) => !d.in_raw).map((d) => d.id + " (" + d.step + ")")) + ". These incidents are not in this build and their screens answer 404, so these decisions lay on nothing.");
  P();
}

P("## Decisions and routings on top");
P();
if (runs.overlay) {
  const ov = runs.overlay.overlay;
  P("The pinned durable rows touch almost nothing in this build, so a second run made real decisions and ran the real routing job, through the real routes, on that server's own local copy only (nothing saved). Then it read every surface for the core scopes, and the oracle read the same local rows.");
  P();
  tbl(["Why", "Incident", "Decision", "HTTP"], (ov?.decisions ?? []).map((d) => [d.why, d.id ?? "", d.decision ?? "", d.status ?? d.skipped ?? ""]));
  const ovr = readings.filter((r) => r.run === "overlay");
  const bad = ovr.filter((r) => r.diff !== 0 && !r.missing);
  P("Routing job: " + JSON.stringify(ov?.routed ?? null).slice(0, 300) + ". Routed rows now: " + (runs.overlay.routed_ids ?? []).length + ". Readings: " + ovr.length + ", equal " + ovr.filter((r) => r.diff === 0).length + ", differ " + bad.length + " (" + bad.filter((r) => r.class === "UNEXPLAINED").length + " unexplained), each with the same classes as above.");
  P();
  const ol = (runs.overlay.same_label ?? []).filter((x) => /open|overdue_flag/.test(x.a) && /ongoing|^overdue$/.test(x.c));
  if (ol.length) { P("Rows in one count and not the other because of these decisions and routings:"); P(); tbl(["Scope", "First", "Second", "Only in the first", "Why"], ol.map((x) => [x.scope, x.a + " " + x.value_a, x.c + " " + x.value_c, x.only_in_a_n + ": " + ids(x.only_in_a, 10), x.why])); }
} else P("Not run yet.");

P("## Findings");
P();
tbl(["Id", "Severity", "Title", "Class"], findings.map((x) => [x.id, x.severity, x.title, x.class]));

P("## What could not be run, and limits");
P();
P("- The old build behind 237 against 240 is not kept, so that pair is reconciled on a replay (above), and 12 against 13 only to two ids.");
P("- No model ran. collector/brief returned no write-up: its facts were checked with a fake model at the boundary. Figures a model would write in its own words were not read. Two sentences asked of Jarvis fell through to the planner and got no answer: 'street lighting and electrical report this week' and 'how is street lighting and electrical doing this week'. A model might read words differently from the code lanes, so findings marked as code-lane ones (same-number-14, same-number-20) are about what answers when no model does, or before one is asked.");
P("- The server's log has no error on a route. It repeats 'search index sync failed' and 'embedding index' lines because in this worktree .cache/models/.../model_quantized.onnx is a 134-byte Git LFS pointer: an environment matter, already in the other findings files. No figure here uses it. It has one effect here: meaning search stays off.");
P("- Trends: the page reads the whole district whatever the zone or department, so the trends readings for a zone or department scope are read with the scope sent; the console itself does not send them on that page.");
fs.writeFileSync(path.join(EVIDENCE, "same-number.md"), L.join("\n") + "\n");
console.log(JSON.stringify({ counts: out.counts, by_finding: Object.fromEntries(Object.entries(byFinding).map(([k, v]) => [k, v.n])) }, null, 1));
if (out.counts.unexplained) for (const r of differences.filter((x) => x.class === "UNEXPLAINED").slice(0, 60)) console.log("UNEXPLAINED", r.run, r.scope, "|", r.surface, "|", r.figure, r.value, r.oracle);
