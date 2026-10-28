/**
 * Ask the Map on the frozen store (npm run eval:golden): 30 questions in English, Tamil and Tanglish, each answer checked
 * against an independent brute-force oracle written here (plain loops over every row, haversine for every pair, segment
 * sampling for roads; no grid index and no shared code but haversineM), and 10 questions whose Map count must equal the
 * console's own incident list for the same filters. Also: the Area brief's counts equal their lists, and the answer's
 * count equals its rows. No AI (AI_PROVIDER=none): the rules answer.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, holder, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import { haversineM } from "./geom";
import type { Filter, Plan, Step } from "./plan";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});

const COLLECTOR = { email: "golden@test", role: "collector" as const, lockDept: null };
const CTX = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
type AskMap = typeof import("./ask").askMap;
let askMap: AskMap;
let rows: Record<string, any>[] = [];
const run = (sql: string) => holder.pool.query(sql).then(([r]: [Record<string, any>[]]) => r);

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  askMap = (await import("./ask")).askMap;
  const { ops } = await import("@/lib/collector/db");
  // the oracle's own copy of every incident, with the Collector's decisions and the department routing laid on top
  rows = await run(`SELECT incident_id, category_code, family, lead_dept, ward_no, zone_no, taluk_code, lat, lon, loc_precision_m, is_open, severity_level, sla_breached,
    DATE_FORMAT(first_reported_at, '%Y-%m-%d %H:%i:%s') AS first, citizen_complaints, place_text FROM incidents WHERE lat IS NOT NULL`);
  const dec = await run(`SELECT incident_id, decision FROM ${ops("collector_decisions")} WHERE decision <> 'note' ORDER BY decision_id`).catch(() => []);
  const last = new Map<string, string>(dec.map((d: any) => [String(d.incident_id), String(d.decision)]));
  const routed = new Set((await run(`SELECT incident_id FROM ${ops("dept_assignments")}`).catch(() => [])).map((r: any) => String(r.incident_id)));
  for (const r of rows) {
    const d = last.get(String(r.incident_id));
    r.eff_open = d === "resolve" || d === "reject" ? 0 : d === "reopen" ? 1 : Number(r.is_open);
    r.routed = routed.has(String(r.incident_id));
    r.pin = r.loc_precision_m == null || Number(r.loc_precision_m) <= 2000;
  }
}, 300_000);
afterAll(() => vi.useRealTimers());

// ------------------------------------------------------------------ oracle --

const wall = (now: string, hours: number) => new Date(Date.parse(now.replace(" ", "T") + "Z") + hours * 3600_000).toISOString().slice(0, 19).replace("T", " ");
function oFilter(r: Record<string, any>, f: Filter | null, now: string): boolean {
  if (!f) return true;
  if (f.category && !f.category.includes(r.category_code)) return false;
  if (f.family && !f.family.includes(r.family)) return false;
  if (f.severity && !f.severity.includes(r.severity_level)) return false;
  if (f.status === "open" && !(r.eff_open === 1 && !r.routed)) return false;
  if (f.status === "closed" && r.eff_open !== 0) return false;
  if (f.dept && !f.dept.includes(r.lead_dept)) return false;
  if (f.overdue && Number(r.sla_breached) !== 1) return false;
  if (f.citizen && !(Number(r.citizen_complaints) > 0)) return false;
  if (f.period?.kind === "last_days") {
    const from = wall(now, -24 * f.period.days * (f.period.offset + 1)), to = wall(now, -24 * f.period.days * f.period.offset);
    if (!(r.first > from && r.first <= to)) return false;
  }
  return true;
}
function layerPoints(layer: string, where: { government: boolean | null; kinds: string[] | null } | null): { lat: number; lon: number }[] {
  if (layer === "police") return policeRows;
  const feats = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "layers", `${layer}.geojson`), "utf8")).features;
  return feats.filter((f: any) => (!where?.kinds?.length || where.kinds.includes(f.properties.kind)) && (where?.government == null || (f.properties.government === true) === where.government))
    .map((f: any) => ({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
}
let policeRows: { lat: number; lon: number }[] = [];
/** distance to a polyline by sampling each segment every ~2 m (no projection, no shared code) */
function lineDist(p: { lat: number; lon: number }, lines: number[][][]): number {
  let best = Infinity;
  for (const l of lines) for (let i = 1; i < l.length; i++) {
    const [a, b] = [l[i - 1], l[i]];
    const n = Math.max(1, Math.ceil(haversineM({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }) / 2));
    for (let k = 0; k <= n; k++) best = Math.min(best, haversineM(p, { lat: a[0] + ((b[0] - a[0]) * k) / n, lon: a[1] + ((b[1] - a[1]) * k) / n }));
  }
  return best;
}
/** the ids a plan's shown collection holds, computed the slow way */
function oracle(plan: Plan, now: string, lines: Record<string, number[][][]>): string[] {
  const env = new Map<string, any>();
  for (const s of plan.steps as Step[]) {
    if (s.op === "take") env.set(s.as, s.layer === "incidents" ? rows.filter((r) => oFilter(r, s.filter, now)) : layerPoints(s.layer, s.where));
    else if (s.op === "within") {
      const fac = s.near.flatMap((n) => env.get(n));
      env.set(s.as, env.get(s.of).filter((r: any) => r.pin && fac.some((f: any) => haversineM({ lat: Number(r.lat), lon: Number(r.lon) }, f) <= s.meters)));
    } else if (s.op === "inside") {
      const a = s.area;
      env.set(s.as, env.get(s.of).filter((r: any) => a.kind === "ward" ? Number(r.ward_no) === a.id : a.kind === "zone" ? Number(r.zone_no) === a.id : a.kind === "taluk" ? r.taluk_code === a.code : false));
    } else if (s.op === "along") {
      const l = lines[s.line];
      env.set(s.as, env.get(s.of).filter((r: any) => r.pin && lineDist({ lat: Number(r.lat), lon: Number(r.lon) }, l) <= s.meters));
    } else if (s.op === "count_by" || s.op === "hotspot") env.set(s.as, env.get(s.of));
    else if (s.op === "compare") {
      const inA = (r: any, a: any) => a.kind === "ward" ? Number(r.ward_no) === a.id : a.kind === "zone" ? Number(r.zone_no) === a.id : a.kind === "taluk" ? r.taluk_code === a.code : false;
      env.set(s.as, env.get(s.of).filter((r: any) => inA(r, s.a) || inA(r, s.b)));
    } else throw new Error(`no oracle for ${s.op}`);
  }
  return env.get(plan.show).map((r: any) => String(r.incident_id)).sort();
}

// --------------------------------------------------------------- questions --

const QUESTIONS = [
  "waterlogging within 300 m of schools", "garbage near hospitals", "open complaints near schools", "flooding in Zone 13 this week", "streetlight problems in ward 178",
  "Velachery taluk severe incidents", "thefts along Anna Salai this month", "potholes on OMR", "accidents on GST Road", "garbage complaints by ward",
  "flooding zone wise this month", "road accidents by zone", "where are garbage complaints clustering", "Zone 10 vs Zone 13 open cases", "dengue cases near schools",
  "accidents near metro stations", "garbage near schools and colleges", "waterlogging within half a km of government hospitals", "past-deadline cases near hospitals",
  "drainage complaints near fire stations",
  "பள்ளிகள் அருகே மழைநீர் தேக்கம்", "மண்டலம் 13 இல் இந்த வாரம் வெள்ளம்", "வார்டு வாரியாக குப்பை புகார்கள்", "அண்ணா சாலையில் திருட்டு", "காவல் நிலையங்கள் அருகே திருட்டு",
  "school pakkathula water stagnation", "zone 13 la indha vaaram vellam", "hospital kitta kuppai", "ward wise kuppai complaints", "police station kitta thiruttu"
];

describe.skipIf(!haveStore())("Ask the Map on the frozen store", () => {
  it("30 questions: every answer equals the brute-force oracle (count and ids), with no AI", async () => {
    policeRows = (await run(`SELECT lat, lon FROM ref_facilities WHERE type = 'police_station' AND lat IS NOT NULL`)).map((r: any) => ({ lat: Number(r.lat), lon: Number(r.lon) }));
    const { world } = await import("./world");
    const lines: Record<string, number[][][]> = {};
    for (const l of [...(await world()).world.lines.roads, ...(await world()).world.lines.waterways]) lines[l.id] = l.lines;
    const report: string[] = [];
    for (const q of QUESTIONS) {
      const r = await askMap({ text: q, plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });
      expect(r.kind, q).toBe("answer");
      expect(r.ai_used, q).toBe(false);
      const want = oracle(r.plan!, r.asOf.now, lines);
      const got = r.plan!.steps.at(-1)!.op === "hotspot" || r.plan!.steps.at(-1)!.op === "count_by" || r.plan!.steps.at(-1)!.op === "compare"
        ? [...new Set(r.trace.find((t) => t.as === r.plan!.steps.at(-1)!.as)!.ids)].sort() : [...r.features.map((x) => x.id), ...r.unplaced].sort();
      expect(r.total, q).toBe(want.length);
      expect(got, q).toEqual(want);
      // count = list = pins + no exact place
      expect(r.features.length + r.hidden + r.unplaced.length, q).toBe(r.total);
      report.push(`${q} -> ${r.total}`);
    }
    console.log(report.join("\n"));
  }, 600_000);

  it("10 questions: the Map's count equals the console's incident list for the same filters", async () => {
    const { list } = await import("@/lib/collector/intel");
    const pairs: [string, Parameters<typeof list>[0]][] = [
      ["open incidents in Zone 13 this week", { period: "weekly", zone: 13, dept: null, sev: null, status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["open waterlogging in zone 5 this month", { period: "monthly", zone: 5, dept: null, sev: null, cat: "FLOOD_WATERLOGGING", status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["severe incidents in zone 9 today", { period: "daily", zone: 9, dept: null, sev: "Severe", status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["open incidents in Velachery taluk this week", { period: "weekly", zone: null, dept: null, sev: null, taluk: "TLK-VLC", status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["open garbage in zone 10 this month", { period: "monthly", zone: 10, dept: null, sev: null, cat: "SOLID_WASTE", status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["open road accidents in zone 3 this week", { period: "weekly", zone: 3, dept: null, sev: null, cat: "ROAD_ACCIDENT", status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["open streetlight problems in zone 7 this month", { period: "monthly", zone: 7, dept: null, sev: null, cat: "STREETLIGHT_ELECTRICAL", status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["open incidents in zone 1 today", { period: "daily", zone: 1, dept: null, sev: null, status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["open drainage in zone 12 this month", { period: "monthly", zone: 12, dept: null, sev: null, cat: "DRAINAGE_SEWAGE", status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }],
      ["severe incidents in zone 13 this month", { period: "monthly", zone: 13, dept: null, sev: "Severe", status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" }]
    ];
    for (const [q, f] of pairs) {
      const r = await askMap({ text: q, plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });
      const l = await list(f);
      expect(r.total, q).toBe(l.incidents);
    }
  }, 300_000);

  it("the Area brief: every count equals its list", async () => {
    for (const q of ["what is happening in Saidapet?", "ward 170 summary", "zone 13 summary"]) {
      const r = await askMap({ text: q, plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });
      expect(r.kind, q).toBe("brief");
      const b = r.brief!;
      expect(b.open.ids.length).toBe(b.open.n);
      expect(b.byType.reduce((s, t) => s + t.n, 0)).toBe(b.open.n);
      for (const t of b.byType) expect(t.ids.length).toBe(t.n);
      expect(b.depts.reduce((s, d) => s + d.open, 0)).toBe(b.open.n);
      for (const d of b.depts) { expect(d.ids.length).toBe(d.open); expect(d.overdueIds.length).toBe(d.overdue); }
      expect(b.citizen.ids.length).toBe(b.citizen.n);
      expect(b.change.nowIds.length).toBe(b.change.now);
    }
  }, 120_000);

  it("an officer is locked to their department, whatever they ask", async () => {
    const r = await askMap({ text: "garbage complaints near schools", plan: null, prev: null, context: CTX, user: { email: "o@test", role: "department_officer", lockDept: "GCC-SWD" }, reword: false });
    expect(r.rows.every((x) => x.dept === "GCC-SWD")).toBe(true);
    const swm = await askMap({ text: "SWM open cases near schools", plan: null, prev: null, context: CTX, user: { email: "o@test", role: "department_officer", lockDept: "GCC-SWD" }, reword: false });
    expect(swm.trace.some((t) => /Your department only/.test(t.note_en))).toBe(true);
  }, 120_000);

  it("300 random plans: no throw; count = list = export = pins + no exact place; every row meets its filters; under 300 ms", async () => {
    const { exportAnswer } = await import("./ask");
    const { matches } = await import("./execute");
    const { world } = await import("./world");
    const { world: w } = await world();
    let seed = 20261028;
    const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
    const cats = [...new Set(w.incidents.map((i) => i.cat))].sort();
    const roads = w.lines.roads.filter((l) => l.in_district && l.length_m > 2000).map((l) => l.id).sort();
    const times: number[] = [];
    const failures: string[] = [];
    for (let n = 0; n < 300; n++) {
      const f: Filter = {
        category: rnd() < 0.6 ? [pick(cats)] : null, family: null, severity: rnd() < 0.3 ? [pick(["Severe", "High", "Medium", "Low"] as const)] : null,
        status: pick(["open", "closed", "any"] as const), dept: null, overdue: rnd() < 0.1 ? true : null, citizen: rnd() < 0.3 ? true : null,
        period: rnd() < 0.85 ? { kind: "last_days", days: pick([1, 7, 30, 90, 180]), offset: rnd() < 0.15 ? 1 : 0 } : null, text: null
      };
      const steps: Step[] = [{ op: "take", as: "a", layer: "incidents", filter: f, where: null }];
      const shape = pick(["take", "within", "inside_zone", "inside_ward", "inside_point", "along", "count_by", "compare"]);
      if (shape === "within") {
        steps.push({ op: "take", as: "f1", layer: pick(["schools", "hospitals", "colleges", "fire_stations", "police", "rail_metro", "water_bodies"] as const), filter: null, where: null });
        steps.push({ op: "within", as: "near", of: "a", near: ["f1"], meters: pick([50, 100, 300, 500, 1000, 2500]) });
      } else if (shape === "inside_zone") steps.push({ op: "inside", as: "in", of: "a", area: { kind: "zone", id: 1 + Math.floor(rnd() * 15) } });
      else if (shape === "inside_ward") steps.push({ op: "inside", as: "in", of: "a", area: { kind: "ward", id: 1 + Math.floor(rnd() * 200) } });
      else if (shape === "inside_point") {
        const i = pick(w.incidents.filter((x) => x.pinnable));
        steps.push({ op: "inside", as: "in", of: "a", area: { kind: "point", ref: `ll:${i.lat},${i.lon}`, radius_m: pick([200, 500, 1000, 3000]) } });
      } else if (shape === "along" && roads.length) steps.push({ op: "along", as: "l", of: "a", line: pick(roads), meters: pick([30, 75, 150]) });
      else if (shape === "count_by") steps.push({ op: "count_by", as: "by", of: "a", by: pick(["ward", "zone", "taluk"] as const) });
      else if (shape === "compare") steps.push({ op: "compare", as: "cmp", of: "a", a: { kind: "zone", id: 1 + Math.floor(rnd() * 15) }, b: { kind: "zone", id: 1 + Math.floor(rnd() * 15) } });
      const plan: Plan = { steps, show: steps[steps.length - 1].as, language: "en" };
      try {
        const t = performance.now();
        const r = await askMap({ text: null, plan, prev: null, context: CTX, user: COLLECTOR, reword: false });
        times.push(performance.now() - t);
        if (r.kind !== "answer") { failures.push(`#${n} ${shape}: ${r.say?.en ?? r.kind} ${JSON.stringify(plan.steps.at(-1)).slice(0, 200)}`); continue; }
        // count = list = pins + no exact place
        // pins drawn + beyond the 5,000 the map draws + no exact place = the headline
        expect(r.features.length, `#${n}`).toBeLessThanOrEqual(5000);
        expect(r.features.every((x) => x.pinnable), `#${n}`).toBe(true);
        expect(r.features.length + r.hidden + r.unplaced.length, `#${n}`).toBe(r.total);
        // (a count by area is itself the summary: its bubbles hold every row)
        if (r.hidden && shape !== "count_by") expect(r.answer!.meaning, `#${n}`).toMatch(/draws the 5,000 highest-priority places/);
        expect(r.rows.length, `#${n}`).toBe(Math.min(r.total, 200));
        // every row meets every filter of its plan, re-checked here; point rules keep only exact places
        const byId = new Map(w.incidents.map((i) => [i.id, i]));
        for (const x of r.features) {
          const inc = byId.get(x.id)!;
          expect(matches(inc, f, w.now), `#${n} ${x.id} filter`).toBe(true);
          if (shape === "within" || shape === "inside_point" || shape === "along") expect(inc.pinnable, `#${n} ${x.id} pinnable`).toBe(true);
        }
        // the export holds exactly the answer's rows (every 10th plan: it re-runs the plan)
        if (n % 10 === 0) {
          const csv = await exportAnswer(r.plan!, null, COLLECTOR, "csv");
          expect(csv.rows, `#${n} export`).toBe(r.total);
        }
      } catch (e) {
        failures.push(`#${n} ${shape}: ${(e as Error).message.slice(0, 160)}`);
      }
    }
    times.sort((a, b) => a - b);
    console.log(`property: 300 plans, p50 ${times[Math.floor(times.length * 0.5)].toFixed(0)} ms, p90 ${times[Math.floor(times.length * 0.9)].toFixed(0)} ms, max ${times[times.length - 1].toFixed(0)} ms`);
    expect(failures).toEqual([]);
    expect(times[Math.floor(times.length * 0.9)]).toBeLessThan(300);
  }, 600_000);

  it("Gi* in TypeScript equals the pipeline's stored ward Gi* (same counts, same contiguity)", async () => {
    const { giStar } = await import("./execute");
    const wards: Record<string, any>[] = await run(`SELECT ward_no, incidents_30d, adjacent_wards, gi_star_z_30d FROM ref_wards ORDER BY ward_no`);
    const z = giStar(new Map(wards.map((w) => [Number(w.ward_no), Number(w.incidents_30d)])),
      new Map(wards.map((w) => [Number(w.ward_no), String(w.adjacent_wards ?? "").split("|").filter(Boolean).map(Number)])));
    // numpy rounds half to even and Math.round half up: they may differ by 0.01 on an exact tie
    const off = wards.filter((w) => Math.abs((z.get(Number(w.ward_no)) ?? NaN) - Number(w.gi_star_z_30d)) > 0.011);
    expect(off.map((w) => `ward ${w.ward_no}: ${z.get(Number(w.ward_no))} vs ${w.gi_star_z_30d}`)).toEqual([]);
    expect(wards.length).toBe(200);
  }, 60_000);

  it("Ask District IQ hands over distance, road and nearest questions only, and its card equals the map's answer", async () => {
    const { isMapQuestion, mapCard } = await import("./assistant");
    for (const q of ["waterlogging within 300 m of schools", "thefts along Anna Salai this month", "nearest hospital to each open severe flooding case", "பள்ளிகள் அருகே மழைநீர் தேக்கம்"])
      expect(await isMapQuestion(q), q).toBe(true);
    for (const q of ["why is Teynampet high?", "lake levels now", "which hospitals are overloaded?", "onion price in Koyambedu", "what about Anna Nagar?",
      "Adyar la evlo complaints iruku", "Anna Nagar la flooding issues how many this week", "hospital beds by zone", "how many road accidents this week", "open complaints in Adyar"])
      expect(await isMapQuestion(q), q).toBe(false);
    const base = { sources: { tools: [], sql: [], plan: null, refs: [], rows: 0, incidentIds: [], models: [], verifier: { checked: 0, unmatched: [], regenerated: false, template: false }, assumptions: [], limits: [] } };
    const card = await mapCard(base as never, "waterlogging within 300 m of schools", "golden@test", null);
    const r = await askMap({ text: "waterlogging within 300 m of schools", plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });
    expect(card!.headline).toBe(r.answer!.headline);
    expect(card!.kpis[0].value).toBe(r.total);
    expect(card!.consoleActions[0]).toMatchObject({ action: "show_on_map" });
  }, 120_000);

  it("the same question twice gives the same answer, byte for byte (but the timing)", async () => {
    const a = await askMap({ text: "waterlogging within 300 m of schools", plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });
    const b = await askMap({ text: "waterlogging within 300 m of schools", plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });
    expect(JSON.stringify({ ...a, ms: 0 })).toBe(JSON.stringify({ ...b, ms: 0 }));
  }, 120_000);
});
