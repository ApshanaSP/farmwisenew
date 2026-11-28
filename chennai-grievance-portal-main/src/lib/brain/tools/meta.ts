/**
 * The brain's knowledge of the console itself (guide), the whole database (schema, sql), arithmetic (calc), and its hands on the console:
 * moving about and pressing (console), opening one of the Stage's own screens (screen), workspaces.
 */
import fs from "fs";
import path from "path";
import { listWorkspaces } from "@/lib/collector/workspaces";
import { AI_ACTIONS, checkPlan } from "@/lib/thunai/plan";
import { PANELS as UI_PANELS, type Step } from "@/lib/thunai/types";
import { STAGE_OPS } from "@/lib/thunai/agent";
import { CASES_COLUMNS, readSchema, readSql, SqlRefused } from "../sql";
import { agoWords, istWords, toPart } from "../format";
import { deptOf, kindsOf, talukOf, zoneOf } from "../names";
import { ToolProblem, type BrainTool, type ToolCtx, type ToolOut } from "../types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

// ------------------------------------------------------------------- guide --

interface Entry { page: string; name: string; body: string; words: Set<string> }
let book: { at: number; entries: Entry[] } | null = null;
const tok = (t: string) => t.toLowerCase().split(/[^a-z0-9஀-௿]+/).filter((w) => w.length >= 2).map((w) => (w.length > 4 ? w.replace(/(?:ing|ies|es|s)$/, "") : w));
const SKIP = new Set("the a an of is are in on to for and or what which why how does do did this that it its show shows shown mean means meaning about tell me explain work worked out tile panel button page where from".split(" ").map((x) => x));
export function guideEntries(): Entry[] {
  const dir = path.join(process.cwd(), "src", "lib", "brain", "knowledge");
  const files = ["dashboard.md", "data.md"].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
  const at = Math.max(0, ...files.map((f) => fs.statSync(f).mtimeMs));
  if (book && book.at === at) return book.entries;
  const entries: Entry[] = [];
  for (const f of files) {
    let page = "";
    for (const block of fs.readFileSync(f, "utf8").split(/\n(?=#{2,3} )/)) {
      const m = block.match(/^(#{2,3}) (.+)\n?([\s\S]*)$/);
      if (!m) continue;
      if (m[1] === "##") { page = m[2].trim(); if (m[3].trim()) entries.push({ page, name: page, body: m[3].trim(), words: new Set(tok(`${page} ${m[3]}`)) }); continue; }
      entries.push({ page, name: m[2].trim(), body: m[3].trim(), words: new Set(tok(`${page} ${m[2]} ${m[3]}`)) });
    }
  }
  book = { at, entries };
  return entries;
}
export function guideFind(q: string, n = 4): { e: Entry; k: number }[] {
  const ws = [...new Set(tok(q).filter((w) => !SKIP.has(w)))];
  return guideEntries().filter((e) => !/Filter issues found/i.test(e.page)).map((e) => {
    const name = new Set(tok(e.name)), page = new Set(tok(e.page));
    let k = 0;
    for (const w of ws) k += (name.has(w) ? 4 : 0) + (page.has(w) ? 1.2 : 0) + (e.words.has(w) ? 1 : 0);
    return { e, k: k / Math.sqrt(1 + e.words.size / 120) };
  }).filter((x) => x.k > 0).sort((a, b) => b.k - a.k).slice(0, n);
}
async function guideRun(input: Record<string, unknown>): Promise<ToolOut> {
  const q = s(input.about).trim();
  if (!q) {
    const pages = [...new Map(guideEntries().map((e) => [e.page, guideEntries().filter((x) => x.page === e.page).map((x) => x.name)])).entries()].filter(([p]) => !/Filter issues/i.test(p));
    return { about: "Every page of the console and what is on it", parts: [], sources: ["the console's own guide"], text: pages.map(([p, xs]) => `${p}: ${xs.filter((x) => x !== p).join("; ")}`).join("\n").slice(0, 8500) };
  }
  const hits = guideFind(q);
  if (!hits.length) throw new ToolProblem(`The guide has nothing under "${q}". Call it with no words for the list of pages and tiles.`);
  return { about: `What the console's guide says about "${q}"`, parts: [], sources: ["the console's own guide (written from its code)"], text: hits.map(({ e }) => `### ${e.name} (page: ${e.page})\n${e.body.replace(/^- (?:Code|API):.*$/gm, "").replace(/\n{2,}/g, "\n").trim()}`).join("\n\n").slice(0, 7500) };
}

// --------------------------------------------------------------- the store --

/** what each table is, in words (the model chooses by these) */
export const TABLE_NOTES: Record<string, string> = {
  mandi_market_prices: "old AGMARKNET rows (to 6 Oct on most copies, some markets misfiled); for market prices use the prices tool, which reads the current Uzhavar Sandhai feed",
  cases: "ONE ROW PER INCIDENT with the effective status the dashboard counts. Use this for anything about incidents.",
  incidents: "the pipeline's incident table (raw; use cases instead, join on incident_id = cases.id for summary, ai_summary, ai_next_step, persons_affected, sla_hours, hours_to_first_action, growth_24h, recurrence_90d, rain_coupled; and for why it is scored so: score_why = JSON text, sev = severity points [what, points, rule], pri = priority terms [key, words, points], sla = deadline hours and its source; sla_source = where the deadline comes from, an official clause or 'District IQ default'; both empty on builds made before 28 Nov)",
  incident_members: "each application record joined to an incident: source (grievance, police, pwd, hospital, news), source_record_id, reported_at, link_prob", incident_timeline: "status steps per incident: at, step, status_std, actor, note", actions: "action list per incident: text, owner, due_at, status",
  documents: "news articles: title, title_en, publisher, published_at, fetched_at, story_id, place_text, category_code, linked_incident_id, summary, body, is_district, is_incident, ai_dead, ai_injured", events: "every source record before joining (source, occurred_at, reported_at, title, category_code, zone_no, dead, injured, status_std)",
  gaps: "in the news with no department record, with the suggested action", alerts: "pipeline alerts", anomalies: "unusual rises: date, category_code, zone_no, observed, expected", hotspots: "clusters of incidents", daily_counts: "incidents per day, zone, category and source", kpis: "pipeline KPI blocks (the dashboard's own figures come from cases)",
  observations: "every reading: metric, value, unit, place_name, observed_at (hospital beds, AQI, rain, lakes, weather, gauges)", observation_signals: "latest reading per place with its 7-day and 28-day means", forecasts: "IMD forecast texts by station", pwd_works: "PWD works: sanctioned and spent lakh, progress, dates, status",
  ref_wards: "200 wards: zone, taluk, area, low-lying index, flood reports, hot ward", ref_zones: "15 zones", ref_taluks: "taluks (code, name)", ref_departments: "departments: code, name, org, head, escalation route", ref_categories: "kinds of incident: code, label, family, lead department, deadlines in hours, playbook", ref_facilities: "places: hospitals, police stations, lakes, bridges...", ref_offices: "PWD offices with officers",
  official_contacts: "GCC officials: name, designation, office, phone, email, dept_code, zone_no", review_queue: "what the pipeline could not decide", source_health: "each feed: last success, newest record, status", sources: "data sources and added links", source_items: "items read from live feeds and added links (headline, url, published_at, fetched_at)", source_runs: "each read of a source",
  collector_decisions: "the Collector's decisions", officer_steps: "what officers did", officer_reports: "completion reports officers sent", dept_assignments: "incidents handed to an officer", action_updates: "actions added or changed by hand", outbound_emails: "e-mails to departments (subject, status, sent_at)", followups: "follow-ups due on e-mails",
  workspaces: "saved views and their versions", briefing_archive: "frozen briefings: briefing_id, period, as_of, markdown", briefings: "the pipeline's briefings by period", briefing_notes: "AI notes of the briefing book", petitions: "paper petitions (Manu): status, area, ward, dept, category, dates", petition_sms: "SMS to petitioners (kind, status)",
  complaints: "citizen portal complaints (code, zone, ward, department, type, title, status, created_at); the dashboard counts them through cases", complaint_status_history: "status steps of portal complaints", police_incident_reports: "police reports: station, category, dates, injured, fatalities, weapon, response_minutes, status", police_stations: "60 stations",
  traffic_days: "roads seen congested per day", traffic_snaps: "the whole city every 10 minutes: how many jams, very congested, closed; delay = the SUM over every jam in the city, never one road's", mandi_prices: "average prices by scope", mandi_weekly: "weekly price changes",
  link_pairs: "pairs of records compared for joining", world_calendar: "days: rain, festivals, protests", data_quality: "checks on the data", agent_runs: "the pipeline's AI agents' runs", audit_log: "who did what on the console (at, actor, action, table_name, record_id)", metrics: "pipeline measures", zones: "zones with their ward range", departments: "portal departments", gcc_streets: "streets", gcc_localities: "localities", gcc_areas: "areas"
};
async function schemaRun(input: Record<string, unknown>): Promise<ToolOut> {
  const want = ((input.tables as string[] | undefined) ?? []).map((x) => x.toLowerCase());
  const all = await readSchema();
  if (want.includes("cases") || !want.length) { /* cases is a temporary table: its columns are kept here */ }
  if (!want.length) return { about: `${all.length + 1} tables may be read`, parts: [], sources: ["the database schema"], text: [`cases: ${TABLE_NOTES.cases}`, ...all.filter((t) => !/^v_/.test(t.name)).map((t) => `${t.name} (${t.rows} rows): ${TABLE_NOTES[t.name] ?? t.columns.slice(0, 8).join(", ")}`)].join("\n") };
  const out: string[] = [];
  for (const w of want.slice(0, 6)) {
    if (w === "cases") { out.push(`cases: ${TABLE_NOTES.cases}\n  ${CASES_COLUMNS.map(([k, d]) => `${k} (${d})`).join("; ")}`); continue; }
    const t = all.find((x) => x.name === w);
    out.push(t ? `${t.name} (${t.rows} rows): ${TABLE_NOTES[t.name] ?? ""}\n  columns: ${t.columns.join(", ")}` : `${w}: no such table`);
  }
  return { about: `Columns of ${want.join(", ")}`, parts: [], sources: ["the database schema"], text: out.join("\n") };
}
async function sqlRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  try {
    const r = await readSql(s(input.sql), [], 120);
    return { about: s(input.why) || `${r.rows.length} rows`, asOf: c.now, sources: [`database table${r.tables.length === 1 ? "" : "s"} ${r.tables.join(", ")}`], parts: [toPart("rows", s(input.why) || "Result", r.rows, r.columns, { total: r.more ? undefined : r.rows.length, note: r.more ? "more rows than shown: add a LIMIT or an aggregate" : null, of: r.columns.includes("id") && r.rows.some((x) => /^INC-/.test(s(x.id))) ? "cases" : "rank" })], limits: r.rows.length ? [] : ["No row matches."] };
  } catch (e) {
    if (e instanceof SqlRefused) throw new ToolProblem(e.message);
    throw e;
  }
}

// -------------------------------------------------------------------- calc --

/** plain arithmetic, nothing else */
export function calc(expr: string): number {
  const t = expr.replace(/(\d),(?=\d{2,3}(?!\d))/g, "$1").replace(/×/g, "*").replace(/÷/g, "/").trim();
  if (!t || t.length > 300 || !/^[\d\s.+\-*/()%a-z,]+$/i.test(t)) throw new ToolProblem("Give plain arithmetic: numbers, + - * / ( ), round(x) or round(x, 1), sum and average are written out.");
  let i = 0;
  const ws = () => { while (t[i] === " ") i++; };
  const prim = (): number => {
    ws();
    if (t[i] === "(") { i++; const v = add(); ws(); if (t[i] !== ")") throw new ToolProblem("A bracket is not closed."); i++; return v; }
    if (t[i] === "-") { i++; return -prim(); }
    if (t[i] === "+") { i++; return prim(); }
    const fn = t.slice(i).match(/^(round|abs)\s*\(/i);
    if (fn) { i += fn[0].length; const v = add(); ws(); let places = 0; if (t[i] === ",") { i++; places = add(); ws(); } if (t[i] !== ")") throw new ToolProblem("A bracket is not closed."); i++; const p = 10 ** Math.min(Math.max(Math.round(places), 0), 6); return /abs/i.test(fn[1]) ? Math.abs(v) : Math.round(v * p) / p; }
    const m = t.slice(i).match(/^\d*\.?\d+/);
    if (!m) throw new ToolProblem(`Cannot read "${t.slice(i, i + 12)}".`);
    i += m[0].length;
    return Number(m[0]);
  };
  const mul = (): number => { let v = prim(); for (;;) { ws(); const o = t[i]; if (o === "*") { i++; v *= prim(); } else if (o === "/") { i++; const d = prim(); if (d === 0) throw new ToolProblem("Division by zero."); v /= d; } else if (o === "%") { i++; v = v / 100; } else return v; } };
  const add = (): number => { let v = mul(); for (;;) { ws(); const o = t[i]; if (o === "+") { i++; v += mul(); } else if (o === "-") { i++; v -= mul(); } else return v; } };
  const v = add(); ws();
  if (i < t.length) throw new ToolProblem(`Cannot read "${t.slice(i, i + 12)}".`);
  return Math.round(v * 100) / 100;
}
async function calcRun(input: Record<string, unknown>): Promise<ToolOut> {
  const xs = (input.sums as { what?: string; expression?: string }[] | undefined) ?? [];
  const rows = xs.slice(0, 12).map((x) => ({ what: s(x.what), expression: s(x.expression), result: calc(s(x.expression)) }));
  return { about: "Worked out", parts: [toPart("calc", "Arithmetic", rows, ["what", "expression", "result"])], sources: ["arithmetic on the results above"] };
}

// ------------------------------------------------------------- the console --

async function consoleRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const w = c.world, acts = (input.actions as Row[] | undefined) ?? [];
  if (!acts.length) throw new ToolProblem("Say what to do on the console.");
  const steps = acts.slice(0, 8).map((a) => {
    const x: Row = { action: a.action, page: a.page ?? null, period: a.period ?? null, zone: null, dept: null, cat: null, taluk: null, sev: a.sev ?? null, panel: a.panel ?? null, mapMode: a.map_mode ?? null, layer: a.layer ?? null, on: a.on ?? null, item: a.item ?? null, which: a.which ?? null, option: a.option ?? null, n: a.n ?? null, text: a.text ?? null, when: a.when ?? null };
    if (a.zone != null && a.zone !== "") x.zone = zoneOf(a.zone, w);
    if (a.dept) x.dept = deptOf(a.dept, w).code;
    if (a.kind) { const k = kindsOf(a.kind, w); if (k.codes.length > 1) throw new ToolProblem("The console filters one kind at a time."); x.cat = k.codes[0]; }
    if (a.taluk) x.taluk = talukOf(a.taluk, w).code;
    return x;
  });
  const said = s(input.said);
  const ck = checkPlan({ kind: "do", lang: "en", reply: null, steps: steps as never, options: [] }, w, said);
  const ok = (ck as { steps?: Step[] }).steps ?? [];
  if (!ok.length) throw new ToolProblem(`The console cannot do that (${steps.map((x) => x.action).join(", ")}). Pages: overview, briefing, trends, environment, studio. Panels: ${UI_PANELS.join(", ")}.`);
  return { about: `Will be done with the answer: ${ok.map((x) => JSON.stringify(x)).join("; ").slice(0, 400)}`, parts: [], sources: ["the console"], steps: ok as unknown as Record<string, unknown>[] };
}
async function stageRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  if (c.channel === "chat") throw new ToolProblem("There is no Jarvis screen in the chat: answer in words and tables, or use console.");
  if (!c.console.screen) throw new ToolProblem("No screen of yours is open: answer from the conversation (\"the next one\", \"read the third\" are about your last answer's list).");
  const op = s(input.op);
  if (!(STAGE_OPS as readonly string[]).includes(op)) throw new ToolProblem(`Operations on the open screen: ${STAGE_OPS.join(", ")}.`);
  return { about: `Will be done on the open screen: ${op}${input.n ? ` ${input.n}` : ""}`, parts: [], sources: ["the open screen"], stageOp: { op, n: input.n == null ? null : Number(input.n), text: s(input.text) || null } };
}
const SCREENS = ["city", "focus", "performance", "map", "nearby", "drafts", "advise", "situation", "dashboard"] as const;
async function screenRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  if (c.channel === "chat") throw new ToolProblem("The chat has no Stage: answer in words and tables.");
  const r = s(input.screen);
  if (!(SCREENS as readonly string[]).includes(r)) throw new ToolProblem(`Screens: ${SCREENS.join(", ")}. For anything else draw the answer itself with show.`);
  const zones = ((input.zones as unknown[] | undefined) ?? []).map((z) => zoneOf(z, c.world));
  const slots: Row = { zones, ...(input.period ? { period: input.period } : {}), ...(input.q ? { q: s(input.q) } : {}), ...(input.dept ? { dept: deptOf(input.dept, c.world).code } : {}), fresh: true };
  return { about: `The ${r} screen opens with the answer`, parts: [], sources: ["the console"], screen: { recipe: r, slots } };
}
async function workspaceRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const name = s(input.save_as).trim(), open = s(input.open).trim(), which = s(input.version).trim().toLowerCase();
  const list = await listWorkspaces(c.user.email);
  const steps: Row[] = [], facts: string[] = [];
  if (name) { steps.push({ a: "workspace", op: "save", name: name.slice(0, 60) }); facts.push(`The console now asks the Collector for a yes to save the present view, filters and briefing as "${name}" (a new version). Answer with kind "answer" and say: it is ready to be saved as "${name}" when they say yes.`); }
  if (open || which) {
    const q = (open || name).toLowerCase();
    const g = list.find((x) => x.name.toLowerCase() === q) ?? list.find((x) => x.name.toLowerCase().includes(q) || (q && q.includes(x.name.toLowerCase())));
    if (!g) facts.push(`There is no saved workspace called "${open || name}" yet, so no earlier version can be opened.${list.length ? ` Saved ones: ${list.map((x) => `${x.name} (${x.versions.length} version${x.versions.length === 1 ? "" : "s"}, newest ${istWords(x.versions[0].created_at)})`).join("; ")}.` : " None has been saved."}`);
    else {
      const vs = g.versions as unknown as { id: number; version: number; created_at: string }[];
      const now = Date.parse(`${c.now.replace(" ", "T")}Z`), at = (v: { created_at: string }) => Date.parse(`${v.created_at.replace(" ", "T")}Z`);
      const today = Math.floor(now / 864e5) * 864e5, dow = (new Date(today).getUTCDay() + 6) % 7, monday = today - dow * 864e5;
      const num = which.match(/\d+/);
      const want = /last\s*week|previous week|week ago|7 days/.test(which) ? vs.find((v) => at(v) >= monday - 7 * 864e5 && at(v) < monday) ?? null
        : /yesterday/.test(which) ? vs.find((v) => at(v) >= today - 864e5 && at(v) < today) ?? null : /previous|before|last|earlier/.test(which) ? vs[1] ?? null : num ? vs.find((v) => v.version === Number(num[0])) ?? null : vs[0];
      if (want) { steps.push({ a: "workspace", op: "open", name: g.name, id: Number(want.id) }); facts.push(`Opens "${g.name}" version ${want.version}, saved ${istWords(want.created_at)} (${agoWords(want.created_at, c.now)}).`); }
      else {
        const near = [...vs].sort((a, b) => Math.abs(at(a) - (now - 7 * 864e5)) - Math.abs(at(b) - (now - 7 * 864e5)))[0];
        facts.push(`"${g.name}" has no version from ${which || "then"}: its versions are ${vs.map((v) => `v${v.version} of ${istWords(v.created_at)}`).join(", ")}.${near ? ` The closest is v${near.version}; offer to open it.` : ""}`);
      }
    }
  }
  if (!name && !open && !which) throw new ToolProblem("Say the name to save as, or the workspace to open.");
  return { about: "Workspaces", parts: [toPart("workspaces", "Saved workspaces", list.flatMap((g) => g.versions.slice(0, 4).map((v) => ({ id: Number(v.id), name: g.name, version: Number((v as Row).version), saved: istWords((v as Row).created_at) }))), ["id", "name", "version", "saved"])], facts, sources: ["saved workspaces"], steps };
}

export const guideTool: BrainTool = {
  name: "guide",
  description: "How the console works: what any page, tile, panel, label, badge, chart or button shows, why it is there, the exact rule behind its figure, its data source, what a click does, and how each data feed is collected. For 'what does this tile mean', 'why is this shown', 'how is priority worked out', 'what is on the second page', 'where do these numbers come from'. No words: the list of every page and tile.",
  doing: { en: "Reading the console's guide", ta: "கன்சோல் விளக்கத்தைப் பார்க்கிறேன்" },
  input: { type: "object", additionalProperties: false, properties: { about: { type: "string", description: "the tile, panel, page, term or feed, in English" } } },
  run: guideRun
};
export const schemaTool: BrainTool = { name: "schema", description: "The whole database: every table in words, or the columns of the tables named. Use before sql when a column is not known.", doing: { en: "Looking up the database", ta: "தரவுத்தளத்தைப் பார்க்கிறேன்" }, collectorOnly: true, input: { type: "object", additionalProperties: false, properties: { tables: { type: "array", items: { type: "string" } } } }, run: schemaRun };
export const sqlTool: BrainTool = {
  name: "sql",
  description: "Any other question of the data: ONE read-only SQLite SELECT over every table (see the list in your instructions; table `cases` for incidents). Times are text 'YYYY-MM-DD HH:MM:SS' in IST; now is datetime('now','+330 minutes'). Aggregate in SQL, name the columns plainly, limit the rows. Prefer the other tools when one fits: they follow the dashboard's rules.",
  doing: { en: "Querying the database", ta: "தரவுத்தளத்தில் கேட்கிறேன்" }, collectorOnly: true,
  input: { type: "object", additionalProperties: false, required: ["sql", "why"], properties: { why: { type: "string", description: "what the result is, in a few words (its title)" }, sql: { type: "string" } } }, run: sqlRun
};
export const calcTool: BrainTool = { name: "calc", description: "Arithmetic on figures from the results (sums, differences, percentages, averages). Use it for every figure you work out yourself.", doing: { en: "Working it out", ta: "கணக்கிடுகிறேன்" }, input: { type: "object", additionalProperties: false, required: ["sums"], properties: { sums: { type: "array", items: { type: "object", additionalProperties: false, required: ["what", "expression"], properties: { what: { type: "string" }, expression: { type: "string" } } } } } }, run: calcRun };
export const consoleTool: BrainTool = {
  name: "console",
  description: `Act on the console for the Collector, done when the answer is given: go to a page (overview, briefing, trends, environment, studio), set the period, filter (zone, dept, kind, taluk, sev), clear filters, open a panel (${UI_PANELS.join(", ")}), map layer or mode, open item n of the list, theme, language, scroll, read aloud, draft an action for the open incident (to the tray, never sent), click a button that is on the screen by its label (text: "Then and now", "Measure and plot", "Full screen", "Export"), remember a note, set a reminder. Only when the Collector asks for it (never as a side effect of a question).`,
  doing: { en: "On the console", ta: "கன்சோலில் செய்கிறேன்" }, collectorOnly: true,
  input: { type: "object", additionalProperties: false, required: ["actions", "said"], properties: { said: { type: "string", description: "the Collector's own words for it" }, actions: { type: "array", items: { type: "object", additionalProperties: false, required: ["action"], properties: {
    action: { type: "string", enum: [...AI_ACTIONS] }, page: { type: "string", enum: ["overview", "briefing", "trends", "environment", "studio"] }, period: { type: "string", enum: ["daily", "weekly", "monthly", "quarterly"] }, zone: { type: ["integer", "string"] }, dept: { type: "string" }, kind: { type: "string" }, taluk: { type: "string" }, sev: { type: "string", enum: ["Severe", "High", "Medium", "Low"] },
    panel: { type: "string", enum: [...UI_PANELS] }, map_mode: { type: "string", enum: ["zones", "taluks"] }, layer: { type: "string", enum: ["severe", "complaint", "other", "added", "stations"] }, on: { type: "boolean" }, item: { type: "integer" }, which: { type: "string", enum: ["next", "prev"] }, option: { type: "string" }, n: { type: "integer" }, text: { type: "string" }, when: { type: "string" } } } } } },
  run: consoleRun
};
export const stageTool: BrainTool = { name: "open_screen_action", description: `Act on the screen Jarvis has open (its items are in SCREEN): ${STAGE_OPS.join(", ")}. n = the item's number. "open the third one", "read it out", "sort by complaints", "export this", "close it", "draft for the second", "pin this".`, doing: { en: "On the screen", ta: "திரையில் செய்கிறேன்" }, collectorOnly: true, input: { type: "object", additionalProperties: false, required: ["op"], properties: { op: { type: "string", enum: [...STAGE_OPS] }, n: { type: "integer" }, text: { type: "string" } } }, run: stageRun };
export const screenTool: BrainTool = { name: "screen", description: "Open one of Jarvis's live screens with the answer: city (live traffic, rain, flood, power, metro on the map; q = the topic), nearby (a map question; q = the whole question), focus (where to concentrate), drafts (the approval tray), advise (what to do first), dashboard, situation (one zone). Only when the Collector asks to SEE it.", doing: { en: "Opening the screen", ta: "திரையைத் திறக்கிறேன்" }, collectorOnly: true, input: { type: "object", additionalProperties: false, required: ["screen"], properties: { screen: { type: "string", enum: [...SCREENS] }, zones: { type: "array", items: { type: ["integer", "string"] } }, q: { type: "string" }, period: { type: "string", enum: ["daily", "weekly", "monthly", "quarterly"] }, dept: { type: "string" } } }, run: screenRun };
export const workspaceTool: BrainTool = { name: "workspace", description: "Save the present view as a named workspace (save_as), and/or open a saved one (open = its name, version = 'last week', 'previous', 'yesterday', or a number). Saving waits for the Collector's yes.", doing: { en: "Looking at the workspaces", ta: "பணியிடங்களைப் பார்க்கிறேன்" }, collectorOnly: true, input: { type: "object", additionalProperties: false, properties: { save_as: { type: "string" }, open: { type: "string" }, version: { type: "string" } } }, run: workspaceRun };
