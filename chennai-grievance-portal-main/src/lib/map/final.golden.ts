/**
 * Ask the Map final on the frozen store (npm run eval:golden): the new kinds of question, asked as the console asks them (askMap, no AI),
 * each answer checked by a brute-force count written here from the raw layer files and the raw incident rows (plain loops, haversine for every
 * pair; no grid index and no shared code but haversineM): rule checks, gaps per neighbourhood, the league table, the Collector's layers in an
 * area and near incidents, and the partial-layer note. Then the meeting packs' numbers against the same counts.
 */
import fs from "fs";
import path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, holder, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import { haversineM } from "./geom";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});

const COLLECTOR = { email: "golden@test", role: "collector" as const, lockDept: null };
const CTX = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
let askMap: typeof import("./ask").askMap;
let rows: Record<string, any>[] = [];
const run = (sql: string) => holder.pool.query(sql).then(([r]: [Record<string, any>[]]) => r);
const wall = (now: string, hours: number) => new Date(Date.parse(now.replace(" ", "T") + "Z") + hours * 3600_000).toISOString().slice(0, 19).replace("T", " ");
type P = { id: string; lat: number; lon: number; kind: string; ward: number | null; name: string | null; in_district: boolean };
const layer = (id: string, kinds?: string[]): P[] => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "layers", `${id}.geojson`), "utf8")).features
  .filter((f: any) => !kinds || kinds.includes(f.properties.kind))
  .map((f: any) => ({ id: f.properties.id, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], kind: f.properties.kind, ward: f.properties.ward ?? null, name: f.properties.name ?? null, in_district: !!f.properties.in_district }));

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  askMap = (await import("./ask")).askMap;
  const { ops } = await import("@/lib/collector/db");
  rows = await run(`SELECT incident_id, category_code, family, ward_no, zone_no, lat, lon, loc_precision_m, is_open, DATE_FORMAT(first_reported_at, '%Y-%m-%d %H:%i:%s') AS first FROM incidents WHERE lat IS NOT NULL`);
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

const ask = (text: string) => askMap({ text, plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });

describe.skipIf(!haveStore())("Ask the Map final on the frozen store", () => {
  it("rule check: wine shops within 100 m of a school, every one found and no other", async () => {
    const r = await ask("wine shops within 100 m of schools");
    expect(r.kind).toBe("answer");
    const shops = layer("liquor", ["wine_shop"]), schools = layer("schools");
    const want = shops.filter((s) => schools.some((c) => haversineM(s, c) <= 100)).map((s) => s.id).sort();
    expect((r.extra.pairs?.items ?? []).map((x) => x.id).sort()).toEqual(want);
    expect(r.answer!.count).toBe(want.length);
    for (const x of r.extra.pairs!.items) expect(Math.abs(x.near.m - Math.min(...schools.map((c) => haversineM(x, c))))).toBeLessThan(1);
    expect(r.answer!.meaning).toMatch(/Excise desk/);
    expect(r.answer!.meaning).toMatch(/not the full list/);
  });
  it("rule check, two centres: bars and wine shops within 200 m of a school or a temple", async () => {
    const r = await ask("liquor shops and bars within 200 m of schools or temples");
    const shops = layer("liquor"), centres = [...layer("schools"), ...layer("worship", ["hindu"])];
    const want = shops.filter((s) => centres.some((c) => haversineM(s, c) <= 200)).map((s) => s.id).sort();
    expect(r.answer!.count, JSON.stringify(r.plan)).toBe(want.length);
  });
  it("gap per neighbourhood: places more than 2 km from a ration shop, by a plain nearest distance", async () => {
    const r = await ask("places more than 2 km from a ration shop");
    const shops = layer("ration_shops"), places = layer("osm_places").filter((p) => p.in_district && p.name);
    const want = places.filter((p) => Math.min(...shops.map((s) => haversineM(p, s))) > 2000).map((p) => p.id).sort();
    expect(r.extra.gap?.by).toBe("place");
    expect((r.extra.areas ?? []).map((a) => a.key).sort()).toEqual(want);
    expect(r.answer!.count).toBe(want.length);
    expect(r.extra.gap?.total).toBe(places.length);
  });
  it("gap per ward: the answer names ward gaps and says the layer is partial (banks)", async () => {
    const r = await ask("wards with no bank within 2 km");
    expect(r.extra.gap?.by).toBe("ward");
    expect(r.answer!.meaning).toMatch(/not the full list/);
  });
  it("the league table: each ward's two windows equal a plain count, the biggest rise first", async () => {
    const r = await ask("which wards got worse for flooding this month");
    const k = r.extra.rank!;
    expect(k.by).toBe("ward");
    const now = r.asOf.now;
    const take = r.plan!.steps.find((s) => s.op === "take")!;
    const fam = take.op === "take" ? take.filter?.family ?? null : null;
    const cats = take.op === "take" ? take.filter?.category ?? null : null;
    const inWin = (x: any, days: number, off: number) => x.first > wall(now, -24 * days * (off + 1)) && x.first <= wall(now, -24 * days * off);
    const ok = (x: any) => (!fam || fam.includes(x.family)) && (!cats || cats.includes(x.category_code)) && x.ward_no != null;
    const chg = r.plan!.steps.find((s) => s.op === "change")!;
    if (chg.op !== "change" || chg.now.kind !== "last_days") throw new Error("not a rolling change");
    const cnt = (off: number) => { const m = new Map<string, number>(); for (const x of rows) if (ok(x) && inWin(x, (chg.now as { days: number }).days, off)) m.set(String(x.ward_no), (m.get(String(x.ward_no)) ?? 0) + 1); return m; };
    const a = cnt(0), b = cnt(1);
    for (const row of k.rows) { expect(row.now, row.key).toBe(a.get(row.key) ?? 0); expect(row.before, row.key).toBe(b.get(row.key) ?? 0); }
    expect(k.rows.length).toBe(new Set([...a.keys(), ...b.keys()]).size);
    for (let i = 1; i < k.rows.length; i++) expect(k.rows[i - 1].delta).toBeGreaterThanOrEqual(k.rows[i].delta);
  });
  it("a Collector layer in an area: ATMs in Zone 13, by their ward", async () => {
    const r = await ask("ATMs in Zone 13");
    const { world } = await import("./world");
    const w = (await world()).world;
    const z13 = new Set(w.wards.filter((x) => x.zone === 13).map((x) => x.ward));
    const want = layer("atms").filter((p) => p.ward != null && z13.has(p.ward)).length;
    expect(r.answer!.count).toBe(want);
  });
  it("incidents near a Collector layer: garbage near markets equals the brute-force count", async () => {
    const r = await ask("garbage complaints near markets");
    const take = r.plan!.steps.find((s) => s.op === "take" && s.layer === "incidents")!;
    const wi = r.plan!.steps.find((s) => s.op === "within")!;
    if (take.op !== "take" || wi.op !== "within") throw new Error("plan");
    const f = take.filter!, now = r.asOf.now, mk = layer("markets");
    const per = f.period?.kind === "last_days" ? f.period : null;
    const want = rows.filter((x) => (!f.category || f.category.includes(x.category_code)) && (f.status !== "open" || (x.eff_open === 1 && !x.routed))
      && (!per || (x.first > wall(now, -24 * per.days) && x.first <= now)) && x.pin && mk.some((m) => haversineM({ lat: Number(x.lat), lon: Number(x.lon) }, m) <= wi.meters));
    // citizen complaints only: the oracle reads the citizen count from the incident rows
    const cit = new Set((await run(`SELECT incident_id FROM incidents WHERE citizen_complaints > 0`)).map((x: any) => String(x.incident_id)));
    expect(r.total).toBe(want.filter((x) => !f.citizen || cit.has(String(x.incident_id))).length);
  });
  it("Tamil: பள்ளிகள் அருகே மதுக்கடைகள் is the same rule check, answered in Tamil", async () => {
    const r = await ask("பள்ளிகளுக்கு 100 மீட்டருக்குள் உள்ள மதுக்கடைகள்");
    expect(r.lang).toBe("ta");
    const shops = layer("liquor", ["wine_shop"]), schools = layer("schools");
    expect(r.answer!.count).toBe(shops.filter((s) => schools.some((c) => haversineM(s, c) <= 100)).length);
  });
  it("accidents near metro stations stay a map question (the baseline's one miss)", async () => {
    const r = await ask("accidents near metro stations");
    expect(r.kind).toBe("answer");
  });
  it("the meeting packs: each number equals the answer the map gives to the same question", async () => {
    const { world } = await import("./world");
    const { placeLookup } = await import("./ask");
    const { buildPack } = await import("./packs");
    const { world: w, resolver } = await world();
    const ctx = { place: placeLookup(w, resolver, null), lang: "en" as const, lockDept: null };
    const bank = buildPack("bank", w, ctx, null);
    expect(bank.numbers.find((x) => /bank branches on the map/.test(x.label))!.value).toBe(layer("banks").filter((p) => p.in_district).length);
    const placeNo = bank.numbers.find((x) => /neighbourhoods more than 2 km from a bank/.test(x.label))!.value;
    const places = layer("osm_places").filter((p) => p.in_district && p.name), banks = layer("banks");
    expect(placeNo).toBe(places.filter((p) => Math.min(...banks.map((b) => haversineM(p, b))) > 2000).length);
    const weekly = buildPack("weekly", w, ctx, null);
    const now = w.now;
    expect(weekly.numbers[0].value).toBe(rows.filter((x) => x.eff_open === 1 && !x.routed && x.first > wall(now, -24 * 7) && x.first <= now).length);
  });
});
