// QA pass 4: SAME NUMBER EVERYWHERE, as a permanent test. It starts from the same harness as the first run: the frozen server (server.mjs) on the pinned
// snapshot, the real HTTP routes as the right role, and the independent oracle (tests/qa/oracle/pinned.mjs). The pairs that agree now are plain it(...); an
// open finding is it.fails(...) with its finding id first (docs/qa/pass4/findings/same-number.json), so the fixer turns it into it(...).
//
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/same-number.test.ts
//
// No model: the server has no key, so Jarvis and Ask District IQ answer through their code lanes. This file owns its port: a server found there is stopped, and each part
// starts a new one with its own empty data folder (the first reads the pinned durable rows; the second makes decisions on its own local copy, never saved).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error a plain .mjs harness, no types
import { classify, collect, CORE_SCOPES, Http, scopeLabel } from "./same-number.mjs";

const PORT = Number(process.env.QA_SAME_NUMBER_PORT ?? 3120);
const ROOT = path.resolve(__dirname, "..", "..", "..");
const childEnv = () => { const e: NodeJS.ProcessEnv = { ...process.env }; for (const k of Object.keys(e)) if (k === "NODE_ENV" || k.startsWith("VITEST") || k === "AWS_DURABLE_FILE" || k === "THUNAI_DIR" || k === "NODE_OPTIONS") delete e[k]; return e; };
const server = (...a: string[]) => execFileSync(process.execPath, ["tests/qa/pass4/server.mjs", ...a], { cwd: ROOT, env: childEnv(), encoding: "utf8", timeout: 240_000 });

type Reading = { scope: string; surface: string; figure: string; def: string; label: string; value: number | null; oracle: number; diff: number | null; missing?: boolean; role: string };
type Scope = { period: string; zone: number | null; dept: string | null };
let readings: Reading[] = [];
let lines: { scope: string; surface: string; asked: string; say: string | null; headline?: string | null }[] = [];
let idChecks: { scope: string; surface: string; figure: string; ok: boolean; only_in_app: string[]; only_in_oracle: string[] }[] = [];
let notes: { scope: string; surface: string; kind: string; [k: string]: unknown }[] = [];
let unavailable: { scope: string; surface: string }[] = [];
let oracle: any;
let http: any;
const startFresh = (instance: string) => {
  server("stop", "--port", String(PORT));
  // --ticking: the per-minute rate limits never reset on a clock that does not move. The console's now stays the store's as-of, 18:08, for six hours.
  server("start", "--port", String(PORT), "--frozen", "--ticking", "--instance", instance, "--env", "ASSISTANT_TOOLS_API=1");
};
const stopAndClear = (instance: string) => {
  server("stop", "--port", String(PORT));
  try { fs.rmSync(path.join(ROOT, "data", "aws-cache", "qa", "srv", instance), { recursive: true, force: true }); } catch { /* the file may still be held for a moment: it is in the gitignored QA folder */ }
};
const INSTANCE = `sn-${process.pid}`, INSTANCE_OVERLAY = `sn-overlay-${process.pid}`;

const in_ = (scope: Scope) => readings.filter((r) => r.scope === scopeLabel(scope));
const get = (scope: Scope, surface: string, figure: string | RegExp) =>
  in_(scope).find((r) => r.surface === surface && (typeof figure === "string" ? r.figure === figure : figure.test(r.figure)));
const isKnown = (r: Reading) => classify(r).class !== "UNEXPLAINED";

const DISTRICT_D: Scope = { period: "daily", zone: null, dept: null }, DISTRICT_W: Scope = { period: "weekly", zone: null, dept: null }, ADYAR_W: Scope = { period: "weekly", zone: 13, dept: null },
  SWM_W: Scope = { period: "weekly", zone: null, dept: "GCC-SWM" }, MIX_W: Scope = { period: "weekly", zone: 13, dept: "GCC-SWM" };

const ROUND_STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0 };
const saidToJarvis = async (text: string) => (await http.post("collector", "/api/collector/thunai/agent/round", { turnId: `same-test-${Date.now()}`, round: 0, state: ROUND_STATE, text }, {}, ["round", 720])).json;
const askDistrictIq = async (message: string) => {
  const r = await http.post("collector", "/api/collector/assistant/chat", { message, consoleScope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null } }, {}, ["chat", 3300]);
  const m = String(r.text).match(/event: answer\ndata: (.*)\n/);
  return m ? JSON.parse(m[1]) : null;
};

describe("same number everywhere", () => {
  beforeAll(async () => {
    startFresh(INSTANCE);
    const r = await collect({ port: PORT, instance: INSTANCE, scopes: CORE_SCOPES });
    readings = r.b.readings; lines = r.b.lines; idChecks = r.b.idChecks; notes = r.b.notes; unavailable = r.b.unavailable; oracle = r.o; http = r.h ?? new Http(PORT);
  }, 1_500_000);
  afterAll(() => stopAndClear(INSTANCE));

  it("reads every surface: no figure is missing and no route failed", () => {
    expect(readings.length).toBeGreaterThan(2000);
    expect(readings.filter((r) => r.missing && !isKnown(r)).map((r) => `${r.scope} ${r.surface} ${r.figure}`)).toEqual([]);
    expect(unavailable).toEqual([]);
  });

  for (const surface of ["collector/overview", "collector/list", "collector/insights?part=briefing", "collector/insights?part=trends", "collector/report", "officer/overview", "officer/grievances", "officer/insights", "map/ask", "map/export", "collector/export", "assistant/chat", "assistant/tools", "thunai/round"]) {
    it(`${surface}: every figure equals the oracle, on all core scopes, or is a difference named in same-number.md`, () => {
      const wrong = readings.filter((r) => r.surface.split(":")[0] === surface && r.diff !== 0 && !r.missing && !isKnown(r)).map((r) => `${r.scope} | ${r.surface} | ${r.figure}: app ${r.value}, oracle ${r.oracle}`);
      expect(wrong).toEqual([]);
    });
  }

  const LABELS: [string, string[]][] = [["reported", ["reported", "has_point"]], ["still open", ["open", "ongoing"]], ["past deadline", ["overdue", "overdue_flag"]], ["severe", ["severe"]], ["complaints", ["complaints_open"]]];
  for (const [label, defs] of LABELS) {
    it(`pairs: "${label}" is one number across every surface, in each scope`, () => {
      for (const s of CORE_SCOPES) {
        const vals = in_(s).filter((r) => r.label === label && defs.includes(r.def) && !r.missing && !isKnown(r) && !/zone|taluk|by|dept/i.test(r.figure.split(".")[0]));
        expect(vals.length).toBeGreaterThan(1);
        const distinct = [...new Set(vals.map((r) => r.value))];
        expect({ scope: scopeLabel(s), label, distinct, surfaces: distinct.length > 1 ? vals.map((r) => `${r.surface} ${r.figure}=${r.value}`) : [] }).toEqual({ scope: scopeLabel(s), label, distinct: [vals[0].value], surfaces: [] });
      }
    });
  }

  it("id by id: Ask the Map's rows and the officer's grievances are exactly the oracle's rows", () => {
    expect(idChecks.length).toBeGreaterThan(3);
    expect(idChecks.filter((c) => !c.ok).map((c) => `${c.scope} ${c.surface} ${c.figure}: only app ${c.only_in_app.slice(0, 5)}, only oracle ${c.only_in_oracle.slice(0, 5)}`)).toEqual([]);
  });

  it("the Collector's and the officer's boards give the same figures for one department", () => {
    for (const [f, g] of [["kpi.cur.reported", "kpi.cur.reported"], ["kpi.cur.ongoing", "kpi.cur.ongoing"], ["kpi.cur.severe", "kpi.cur.severe"]]) {
      const col = get(SWM_W, "collector/overview", f), off = get(SWM_W, "officer/overview:board", g);
      expect(col?.value).toBeDefined();
      expect(off?.value).toBe(col?.value);
    }
  });

  it("the officer's own counts add up to the board's open figure", () => {
    expect(get(SWM_W, "officer/overview", "counts.new+action+sent")?.value).toBe(get(SWM_W, "officer/overview:board", "snapshot.open")?.value);
  });

  // ---------------------------------------------------------------- open findings --

  it.fails("same-number-1 Jarvis's dashboard list, headed 'most serious first', starts with the most serious case", () => {
    const r = get(ADYAR_W, "thunai/round:dashboard", /first row's severity rank/);
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-1 Jarvis's past-deadline list for the district this week gives the same count as the tile, not 'no cases'", () => {
    const r = get(DISTRICT_W, "thunai/round:cases(overdue)", "total"), tile = get(DISTRICT_W, "collector/overview", "snapshot.overdue");
    expect(r?.value).toBe(tile?.value);
  });
  it.fails("same-number-1 the same list reached by words: 'cases past deadline this week'", () => {
    const r = get(DISTRICT_W, "thunai/round:text", /cases past deadline this week/), tile = get(DISTRICT_W, "collector/overview", "snapshot.overdue");
    expect(r?.value).toBe(tile?.value);
  });
  it.fails("same-number-2 'Past their deadline' beside 'Severe cases, this week' counts the whole list, not the rows on screen", () => {
    const r = get(DISTRICT_W, "thunai/round:cases(severe)", "kpi.late");
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-2 'Past their deadline' beside 'All cases, this week' counts the whole list, not the rows on screen", () => {
    const r = get(SWM_W, "thunai/round:cases(open)", "kpi.late");
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-3 Jarvis's department performance for Solid Waste shows Solid Waste's open count, not the district's", () => {
    const r = get(SWM_W, "thunai/round:performance", "kpi.open");
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-4 zone_profile with a department filter gives the zone's open figure, not 0", () => {
    const r = get(MIX_W, "assistant/tools:zone_profile", "zone.13.active");
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-5 a dashboard for one zone does not say 'Most in' another zone", () => {
    expect(notes.filter((n) => n.kind === "wrong-place").map((n) => `${n.scope}: ${n.say}`)).toEqual([]);
  });
  it.fails("same-number-6 the Briefing's 'routine, nothing to do' figure is the PDF's routine figure", () => {
    const r = get(DISTRICT_W, "collector/insights?part=briefing", /handledByDepts/);
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-8 the written briefing's 'in the news, not in department records' says how many there are, not the length of a list cut at 60", () => {
    const r = get(DISTRICT_W, "collector/insights?part=briefing", /^md\.In the news/);
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-8 the Briefing's news-only list holds as many rows as its figure", () => {
    const r = get(DISTRICT_W, "collector/insights?part=briefing", "gaps.rows on the page");
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-9 Ask District IQ's 'Incidents matching' with no filter is the reported figure", () => {
    const r = get(DISTRICT_W, "assistant/chat:list", /Incidents matching/);
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-9 Jarvis's 'All cases, this week' is the tile's still-open figure", () => {
    expect(get(DISTRICT_W, "thunai/round:cases(open)", "kpi.total(groups)")?.value).toBe(get(DISTRICT_W, "collector/overview", "kpi.cur.ongoing")?.value);
  });
  it.fails("same-number-10 the first of the '12 complete weeks' holds that whole week", () => {
    const r = in_(DISTRICT_W).filter((x) => x.surface === "collector/insights?part=trends" && /\.bar\[/.test(x.figure))[0];
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-11 zone performance's 'Reported' is the reported figure on the same screen's trend", () => {
    const r = get(DISTRICT_W, "thunai/round:performance(zone)", "kpi.n");
    expect(r?.value).toBe(get(DISTRICT_W, "thunai/round:performance(zone)", "Trend.values.sum")?.value);
  });
  it.fails("same-number-13 a card's tile named 'Reported' holds the reported figure", () => {
    const r = get(DISTRICT_W, "assistant/chat:card label", /past-deadline card/);
    expect(r?.value).toBe(r?.oracle);
  });
  it.fails("same-number-14 'this quarter' said with a body or a zone brief is the quarter", async () => {
    const r = await saidToJarvis("give me the briefing for Adyar this quarter");
    expect(r?.result?.stage?.scope?.period).toBe("quarterly");
  });
  it.fails("same-number-15 the store's past-deadline flag covers every open incident whose due time has passed (OPEN-7, the pipeline's)", () => {
    expect(oracle.value("overdue_flag", { period: "weekly" })).toBe(oracle.value("overdue_due", { period: "weekly" }));
  });
  it.fails("same-number-16 the backlog counts no incident dated after the console's now (OPEN-11, the pipeline's)", () => {
    expect(notes.filter((n) => n.kind === "dated-after-now")).toEqual([]);
  });
  it.fails("same-number-17 every Collector decision points at an incident in this build", () => {
    expect(oracle.durable.decisions.filter((d: any) => !oracle.rawRow(String(d.incident_id))).map((d: any) => d.incident_id)).toEqual([]);
  });
  it("same-number-18 a workspace saved on a copy that does not save to AWS can be opened", () => {
    expect(notes.filter((n) => n.kind === "workspace-not-openable")).toEqual([]);
  });
  it.fails("same-number-19 no news-only incident with a recorded death is left out as 'not news media' (owner's decision)", () => {
    const out = oracle.hooks.removed.filter((r: any) => r.hook === "news-media-only@1" && oracle.rawRow(String(r.id))?.dead > 0).map((r: any) => r.id);
    expect(out).toEqual([]);
  });
  it.fails("same-number-20 'past deadline by department' is not answered with 'no incidents match'", async () => {
    const c = await askDistrictIq("past deadline by department this week");
    expect(String(c?.headline)).not.toMatch(/^No incidents/);
  });
  it.fails("same-number-20 'complaints by department' answers about complaints, not open incidents", async () => {
    const c = await askDistrictIq("complaints by department this week");
    expect(String(c?.headline)).not.toMatch(/open incidents/);
  });
  it.fails("same-number-21 Jarvis's spoken lines read as sentences", () => {
    expect(lines.filter((l) => /incidents reports|incidents of incidents/.test(String(l.say))).map((l) => l.say)).toEqual([]);
  });
  it.fails("same-number-22 'Resolved this week' on the tile is the count resolved this week", () => {
    expect(get(DISTRICT_W, "collector/overview", "kpi.cur.resolved")?.value).toBe(get(DISTRICT_W, "assistant/chat:resolved", "Resolved")?.value);
  });
  it.fails("same-number-23 Jarvis's 'severe cases this week' is the severe tile's figure or the open severe figure under it", () => {
    const r = get(DISTRICT_W, "thunai/round:cases(severe)", "kpi.total")?.value;
    expect([get(DISTRICT_W, "collector/overview", "kpi.cur.severe")?.value, get(DISTRICT_W, "collector/overview", "kpi.cur.severe_open")?.value]).toContain(r);
  });

  // the daily window is small enough to name by hand: the same pair as last time's 237 against 240
  it("the daily open figure, raw against every screen, differs only by rows the build hooks took out, by id", () => {
    const raw = new Set(oracle.ids("open", { period: "daily" }, "raw")), scr = new Set(oracle.ids("open", { period: "daily" }));
    const gone = [...raw].filter((id) => !scr.has(id));
    expect(gone.every((id) => oracle.removedBy.has(id))).toBe(true);
    expect(get(DISTRICT_D, "collector/overview", "kpi.cur.ongoing")?.value).toBe(scr.size);
  });
});

// A second server, with real decisions and the real routing job on its own local copy: every figure must follow them, and the oracle reads the same local rows.
describe("same number everywhere, with decisions and routings on top", () => {
  const SCOPES: Scope[] = [{ period: "weekly", zone: null, dept: null }, { period: "weekly", zone: 13, dept: null }, { period: "weekly", zone: null, dept: "GCC-SWM" }];
  let rs: Reading[] = [];
  let o: any;
  let done: any;
  beforeAll(async () => {
    startFresh(INSTANCE_OVERLAY);
    const r = await collect({ port: PORT, instance: INSTANCE_OVERLAY, scopes: SCOPES, overlay: true, only: "overlay" });
    rs = r.b.readings; o = r.o; done = r.b.overlayDone;
  }, 900_000);
  afterAll(() => stopAndClear(INSTANCE_OVERLAY));

  it("the decisions went through and the routing job ran", () => {
    expect(done.decisions.filter((d: any) => d.status === 201).length).toBeGreaterThanOrEqual(3);
    expect(o.routed.size).toBeGreaterThan(7);
  });
  it("every figure read follows the decisions and routings, or is a difference named in same-number.md", () => {
    expect(rs.length).toBeGreaterThan(500);
    expect(rs.filter((r) => r.diff !== 0 && !r.missing && !isKnown(r)).map((r) => `${r.scope} | ${r.surface} | ${r.figure}: app ${r.value}, oracle ${r.oracle}`)).toEqual([]);
  });
});
