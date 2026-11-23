/**
 * Named dashboards (dashtypes.ts) on the server: the move from the older files, the layout "Add to dashboard" makes,
 * changes to dashboards and tiles, and tiles drawn again from the latest data. Two samples are read the way the Studio
 * reads them, with the rules only (no AI model, no database: the district's names are given).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Refs } from "@/lib/studio/refs";
import type { DatasetMeta, Pin, Plan } from "@/lib/studio/types";
import type { Dashboard, NewTile, TileLayout } from "@/lib/studio/dashtypes";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-dash-"));
process.env.STUDIO_DIR = dir;

const refs: Refs = {
  wards: new Map(), zones: new Map([[13, { zone: 13, name: "Adyar", lat: 13, lon: 80.2 }], [9, { zone: 9, name: "Teynampet", lat: 13, lon: 80.2 }], [10, { zone: 10, name: "Kodambakkam", lat: 13, lon: 80.2 }]]),
  taluks: new Map(), categories: [{ code: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", family: "FLOOD", lead: "GCC-SWD" }],
  depts: [{ code: "GCC-SWD", name: "Storm Water Drain", org: "GCC" }], families: new Map([["FLOOD", "Flooding & waterlogging"]])
} as unknown as Refs;
// the district's names come from the database in the app; here they are given, so nothing connects to it
(globalThis as { __studioRefs?: unknown }).__studioRefs = { at: Date.now() + 365 * 86400_000, refs };

const SAMPLES = path.join(process.cwd(), "data", "studio-samples");
const SWD = path.join(SAMPLES, "GCC_SWD_Desilting_Register_Sep2026.xlsx");
const PDS = path.join(SAMPLES, "PDS_Ration_Shop_Stock_Oct2026.csv");

let store: typeof import("./store");
let dash: typeof import("./dashboards");
let T: typeof import("./dashtypes");

const A = "ds_dashswd0001", B = "ds_dashpds0001", C = "ds_dashswd0002", GONE = "ds_gone0000001";

/** A sample read as the Studio reads it, by the rules, and saved as a dataset. */
async function makeDataset(id: string, file: string, name: string) {
  const { parseFile } = await import("./parse");
  const { profileTable } = await import("./profile");
  const { rulesSpec } = await import("./spec");
  const { clean } = await import("./clean");
  const { designDashboard } = await import("./dashboard");
  const { computeInsights } = await import("./insights");
  const { rulesBrief } = await import("./brief");
  const { namesOf } = await import("./pipeline");
  const { sameValue } = await import("./values");
  const t = parseFile(fs.readFileSync(file), path.basename(file));
  const profile = profileTable(t);
  const spec = rulesSpec(profile, path.basename(file), t.caption, refs);
  const c = clean(t, spec);
  const names = namesOf(refs);
  // placed by the zone column only (no gazetteer in a unit test), as studio.test.ts does
  const zone = spec.columns.find((x) => x.role === "zone")?.key;
  const status = spec.columns.find((x) => x.role === "status")?.key;
  const date = spec.columns.find((x) => x.role === "date")?.key;
  for (const r of c.rows) {
    if (zone) r._z = names.zoneOf(String(r[zone] ?? "")) ?? (Number(String(r[zone]).match(/\d+/)?.[0]) || null);
    if (status) r._o = spec.openValues.some((o) => sameValue(o, String(r[status]))) ? 1 : 0;
    if (date) r._d = typeof r[date] === "string" ? String(r[date]).slice(0, 10) : null;
  }
  const panels = designDashboard(c.rows, spec, c.window);
  const brief = rulesBrief(computeInsights(c.rows, spec, c.detective, null, c.window, names), spec);
  const now = new Date().toISOString();
  const meta = {
    id, name, source: { kind: "sample", file: path.basename(file), url: null }, createdAt: now, updatedAt: now, rows: c.rows.length, cols: t.headers.length,
    window: c.window, spec, profile, detective: c.detective, panels, link: null, linkVersion: 999, story: null, brief, relevance: null, rules: [], steps: [], sample: true
  } as unknown as DatasetMeta;
  store.saveDataset(meta, c.rows);
  return meta;
}

const files = ["dashboards.json", "board.json"];
function resetDashboards() {
  for (const f of fs.readdirSync(dir)) if (files.some((x) => f.startsWith(x))) fs.rmSync(path.join(dir, f), { force: true });
}

function expectNeat(layouts: TileLayout[], kinds: (keyof typeof T.MIN_SIZE)[]) {
  layouts.forEach((l, i) => {
    expect(l.x).toBeGreaterThanOrEqual(0);
    expect(l.y).toBeGreaterThanOrEqual(0);
    expect(l.x + l.w).toBeLessThanOrEqual(T.GRID_COLS);
    expect(l.w).toBeGreaterThanOrEqual(T.MIN_SIZE[kinds[i]].w);
    expect(l.h).toBeGreaterThanOrEqual(T.MIN_SIZE[kinds[i]].h);
    for (let j = i + 1; j < layouts.length; j++) expect(dash.overlaps(l, layouts[j]), `tiles ${i} and ${j} overlap`).toBe(false);
  });
}

beforeAll(async () => {
  store = await import("./store");
  dash = await import("./dashboards");
  T = await import("./dashtypes");
  await makeDataset(A, SWD, "SWD desilting register");
  await makeDataset(B, PDS, "Ration shop stock");
  await makeDataset(C, SWD, "SWD desilting register (copy)");
}, 60_000);
beforeEach(() => resetDashboards());

describe("the layout Add to dashboard makes", () => {
  it("puts the summary on top, numbers side by side, then findings and charts, with no overlaps inside 12 columns", async () => {
    for (const id of [A, B]) {
      const tiles = await dash.autoTiles(id);
      const kinds = tiles.map((t) => t.kind);
      expect(kinds[0]).toBe("brief");
      expect(tiles[0].layout).toEqual({ x: 0, y: 0, w: 12, h: T.DEFAULT_SIZE.brief.h });
      expectNeat(tiles.map((t) => t.layout!), kinds);
      const kpis = tiles.filter((t) => t.kind === "kpi");
      expect(kpis.length).toBeGreaterThan(0);
      expect(kpis.length).toBeLessThanOrEqual(4);
      expect(new Set(kpis.map((t) => t.layout!.y)).size).toBe(1);
      expect(tiles.filter((t) => t.kind === "insight").length).toBeLessThanOrEqual(3);
      const charts = tiles.filter((t) => t.kind === "chart" || t.kind === "map");
      expect(charts.length).toBeLessThanOrEqual(4);
      // the groups come in order down the page
      const firstY = (k: string) => Math.min(...tiles.filter((t) => t.kind === k).map((t) => t.layout!.y));
      expect(firstY("kpi")).toBeGreaterThan(0);
      if (tiles.some((t) => t.kind === "insight")) expect(firstY("insight")).toBeGreaterThan(firstY("kpi"));
      if (charts.some((t) => t.kind === "map")) expect(charts[0].kind).toBe("map");
    }
    // the register has findings, a map and a trend (studio.test.ts)
    const swd = await dash.autoTiles(A);
    expect(swd.some((t) => t.kind === "insight")).toBe(true);
    expect(swd.every((t) => t.kind !== "insight" || (t.insight && t.insight.label))).toBe(true);
  });

  it("refuses a dataset that is not there", async () => {
    await expect(dash.autoTiles(GONE)).rejects.toMatchObject({ status: 404 });
  });
});

describe("moving the older files over", () => {
  const mapPlan: Plan = { id: "map", title: "Pending works by zone", chart: "map", agg: "count", col: null, by: "zone", byCol: null, unit: null, filters: [], sort: "desc", limit: 15 };
  const kpiPlan: Plan = { id: "k1", title: "Works", chart: "kpi", agg: "count", col: null, by: "none", byCol: null, unit: null, filters: [], sort: "desc", limit: 1 };
  const barPlan: Plan = { id: "zone", title: "Shops by zone", chart: "hbar", agg: "count", col: null, by: "zone", byCol: null, unit: null, filters: [], sort: "desc", limit: 8 };

  it("turns each added dataset into a dashboard of its own and the pinned charts into one, keeping copies of both files", async () => {
    const oldDash = JSON.stringify([{ datasetId: B, at: "2026-11-20T10:00:00.000Z" }, { datasetId: A, at: "2026-11-19T10:00:00.000Z" }, { datasetId: GONE, at: "2026-11-18T10:00:00.000Z" }]);
    const pins: Pin[] = [
      { id: "pin1", datasetId: A, datasetName: "SWD", plan: mapPlan, at: "2026-11-01T10:00:00.000Z" },
      { id: "pin2", datasetId: A, datasetName: "SWD", plan: kpiPlan, at: "2026-11-02T10:00:00.000Z" },
      { id: "pin3", datasetId: B, datasetName: "PDS", plan: barPlan, at: "2026-11-03T10:00:00.000Z" }
    ];
    fs.writeFileSync(path.join(dir, "dashboards.json"), oldDash);
    fs.writeFileSync(path.join(dir, "board.json"), JSON.stringify(pins));

    const list = await dash.loadDashboards();
    expect(list.map((d) => d.name)).toEqual(["Ration shop stock", "SWD desilting register", "Pinned charts"]);
    expect(list[0].createdAt).toBe("2026-11-20T10:00:00.000Z");
    expect(list[0].tiles[0].kind).toBe("brief");
    expect(list[1].tiles.every((t) => t.datasetId === A)).toBe(true);
    const pinned = list[2];
    expect(pinned.tiles.map((t) => t.kind)).toEqual(["map", "kpi", "chart"]);
    expect(pinned.tiles.map((t) => t.plan?.id)).toEqual(["map", "k1", "zone"]);
    expect(pinned.tiles[0].at).toBe("2026-11-01T10:00:00.000Z");
    expectNeat(pinned.tiles.map((t) => t.layout), pinned.tiles.map((t) => t.kind));
    for (const d of list) {
      expect(d.id).toMatch(/^dash_[a-z0-9]+$/);
      expect(d.tiles.every((t) => /^tile_[a-z0-9]+$/.test(t.id))).toBe(true);
    }

    // the old files, exactly as they were
    expect(fs.readFileSync(path.join(dir, "dashboards.json.v1-backup"), "utf8")).toBe(oldDash);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "board.json.v1-backup"), "utf8"))).toEqual(pins);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "dashboards.json"), "utf8")).v).toBe(2);
    // the board itself is left for the pages that still read it
    expect(store.getBoard()).toHaveLength(3);

    // once only: a second look changes nothing
    const again = await dash.loadDashboards();
    expect(again.map((d) => d.id)).toEqual(list.map((d) => d.id));
    expect(fs.readdirSync(dir).filter((f) => f.includes("v1-backup"))).toHaveLength(2);
  });

  it("moves a board on its own (no older dashboards file), and starts empty when there is nothing", async () => {
    fs.writeFileSync(path.join(dir, "board.json"), JSON.stringify([{ id: "pin1", datasetId: B, datasetName: "PDS", plan: barPlan, at: "2026-11-03T10:00:00.000Z" }]));
    expect((await dash.loadDashboards()).map((d) => [d.name, d.tiles.length])).toEqual([["Pinned charts", 1]]);
    resetDashboards();
    expect(await dash.loadDashboards()).toEqual([]);
    expect(store.readDashFile().kind).toBe("v2");
  });

  it("waits for the district's names rather than saving the older dashboards empty", async () => {
    const oldDash = JSON.stringify([{ datasetId: A, at: "2026-11-19T10:00:00.000Z" }]);
    fs.writeFileSync(path.join(dir, "dashboards.json"), oldDash);
    const g = globalThis as { __studioRefs?: unknown };
    const kept = g.__studioRefs;
    // the database is down: the names cannot be loaded
    g.__studioRefs = { at: Date.now() + 365 * 86400_000, get refs() { throw new Error("database down"); } };
    try {
      await expect(dash.loadDashboards()).rejects.toThrow(/database down/);
      expect(store.readDashFile().kind).toBe("v1");
      expect(fs.readFileSync(path.join(dir, "dashboards.json"), "utf8")).toBe(oldDash);
      expect(fs.readdirSync(dir).filter((f) => f.includes("v1-backup"))).toHaveLength(0);
    } finally { g.__studioRefs = kept; }
    // back up: the move happens in full
    const list = await dash.loadDashboards();
    expect(list.map((d) => d.name)).toEqual(["SWD desilting register"]);
    expect(list[0].tiles.length).toBeGreaterThan(3);
  });

  it("leaves out a pin with no chart, and keeps room for the pinned charts when the older list was full", async () => {
    const meta = store.getMeta(A)!, rows = store.getRows(A);
    const ids = Array.from({ length: T.MAX_DASHBOARDS }, (_, i) => `ds_dashfull${String(i).padStart(3, "0")}`);
    ids.forEach((id, i) => store.saveDataset({ ...meta, id, name: `Register ${i}` }, rows));
    fs.writeFileSync(path.join(dir, "dashboards.json"), JSON.stringify(ids.map((datasetId) => ({ datasetId, at: "2026-11-19T10:00:00.000Z" }))));
    fs.writeFileSync(path.join(dir, "board.json"), JSON.stringify([{ id: "pin0", datasetId: A }, { id: "pin1", datasetId: B, datasetName: "PDS", plan: barPlan, at: "2026-11-03T10:00:00.000Z" }]));
    const list = await dash.loadDashboards();
    expect(list).toHaveLength(T.MAX_DASHBOARDS);
    expect(list.at(-1)!.name).toBe("Pinned charts");
    expect(list.at(-1)!.tiles.map((t) => t.plan?.id)).toEqual(["zone"]);
    // the oldest dataset's dashboard is the one left out
    expect(list.at(-2)!.name).toBe(`Register ${T.MAX_DASHBOARDS - 2}`);
    resetDashboards();
    for (const id of ids) store.deleteDataset(id);
  }, 120_000);

  it("never takes a dashboards file that cannot be read for no file", async () => {
    const f = path.join(dir, "dashboards.json");
    // a folder in its place: it is there, but reading it fails
    fs.mkdirSync(f);
    try {
      expect(() => store.readDashFile()).toThrow();
      await expect(dash.loadDashboards()).rejects.toThrow();
      expect(fs.statSync(f).isDirectory()).toBe(true);
      // deleting a dataset still works (its tiles show as deleted)
      store.saveDataset({ ...store.getMeta(A)!, id: "ds_dashlock0001" }, store.getRows(A));
      expect(() => store.deleteDataset("ds_dashlock0001")).not.toThrow();
      expect(store.getMeta("ds_dashlock0001")).toBeNull();
    } finally { fs.rmSync(f, { recursive: true, force: true }); }
  });

  it("two first looks at once move the files over once", async () => {
    fs.writeFileSync(path.join(dir, "dashboards.json"), JSON.stringify([{ datasetId: A, at: "2026-11-19T10:00:00.000Z" }]));
    const [x, y] = await Promise.all([dash.loadDashboards(), dash.listSummaries()]);
    expect(x).toHaveLength(1);
    expect(y.map((d) => d.id)).toEqual(x.map((d) => d.id));
  });
});

describe("changing dashboards and tiles", () => {
  it("creates, fills, appends below, renames and deletes", async () => {
    const empty = await dash.createDashboard("  Monsoon   review ");
    expect(empty.name).toBe("Monsoon review");
    expect(empty.tiles).toEqual([]);
    const filled = await dash.createDashboard("", A);
    expect(filled.name).toBe("SWD desilting register");
    expect(filled.tiles.length).toBeGreaterThan(3);
    // newest first
    expect((await dash.listSummaries()).map((d) => d.id)).toEqual([filled.id, empty.id]);

    const first = await dash.addDataset(empty.id, A);
    const bottom = dash.bottomOf(first.dashboard.tiles);
    const second = await dash.addDataset(empty.id, B);
    const added = second.dashboard.tiles.filter((t) => second.added.includes(t.id));
    expect(added.length).toBe(second.added.length);
    expect(Math.min(...added.map((t) => t.layout.y))).toBeGreaterThanOrEqual(bottom);
    expectNeat(second.dashboard.tiles.map((t) => t.layout), second.dashboard.tiles.map((t) => t.kind));
    const sum = (await dash.listSummaries()).find((d) => d.id === empty.id)!;
    expect(sum.datasets).toEqual([{ id: A, name: "SWD desilting register" }, { id: B, name: "Ration shop stock" }]);

    // a single chart with no place given goes at the bottom; a map plan sent as a "chart" tile is a map tile
    const plan = store.getMeta(A)!.panels.find((p) => p.chart === "map")!;
    const one = await dash.addTiles(empty.id, [{ kind: "chart", datasetId: A, plan } as NewTile]);
    const t = one.dashboard.tiles.find((x) => x.id === one.added[0])!;
    expect(t.kind).toBe("map");
    expect(t.layout.y).toBeGreaterThanOrEqual(dash.bottomOf(second.dashboard.tiles));
    await expect(dash.addTiles(empty.id, [{ kind: "kpi", datasetId: GONE, plan } as NewTile])).rejects.toMatchObject({ status: 404 });
    await expect(dash.addTiles(empty.id, [{ kind: "insight", datasetId: A } as NewTile])).rejects.toThrow(/finding/);

    await dash.renameDashboard(empty.id, "Monsoon desk");
    expect((await dash.getDashboard(empty.id))!.name).toBe("Monsoon desk");
    await expect(dash.renameDashboard(empty.id, "   ")).rejects.toThrow(/name/);
    await expect(dash.renameDashboard("dash_nothere1", "x")).rejects.toMatchObject({ status: 404 });

    await dash.renameTile(empty.id, t.id, "  Where the works are ");
    expect((await dash.getDashboard(empty.id))!.tiles.find((x) => x.id === t.id)!.title).toBe("Where the works are");
    await dash.renameTile(empty.id, t.id, "");
    expect((await dash.getDashboard(empty.id))!.tiles.find((x) => x.id === t.id)!.title).toBeNull();
    const n = (await dash.getDashboard(empty.id))!.tiles.length;
    await dash.removeTile(empty.id, t.id);
    expect((await dash.getDashboard(empty.id))!.tiles).toHaveLength(n - 1);
    await expect(dash.removeTile(empty.id, t.id)).rejects.toMatchObject({ status: 404 });

    await dash.deleteDashboard(filled.id);
    expect((await dash.loadDashboards()).map((d) => d.id)).toEqual([empty.id]);
    // the dataset stays
    expect(store.getMeta(A)).not.toBeNull();
  });

  it("saves a drag or resize for existing tiles only, inside 12 columns and never under the smallest size", async () => {
    const d = await dash.createDashboard("Layout", A);
    const [brief, kpi] = d.tiles;
    const before = d.tiles.map((t) => t.id);
    const moved = await dash.setLayout(d.id, [
      { i: brief.id, x: 11, y: -3, w: 20, h: 1 },
      { i: kpi.id, x: 10, y: 6.4, w: 4, h: 0 },
      { i: "tile_unknown01", x: 0, y: 0, w: 4, h: 4 }
    ]);
    expect(moved).toBe(2);
    const after = (await dash.getDashboard(d.id))!;
    expect(after.tiles.map((t) => t.id)).toEqual(before);
    expect(after.tiles[0].layout).toEqual({ x: 0, y: 0, w: 12, h: T.MIN_SIZE.brief.h });
    expect(after.tiles[1].layout).toEqual({ x: 8, y: 6, w: 4, h: T.MIN_SIZE.kpi.h });
    // the others did not move
    expect(after.tiles.slice(2).map((t) => t.layout)).toEqual(d.tiles.slice(2).map((t) => t.layout));
  });

  it("holds the caps with a clear message", async () => {
    const d = await dash.createDashboard("Full");
    const plan = store.getMeta(A)!.panels.find((p) => p.chart === "kpi")!;
    const many = Array.from({ length: T.MAX_TILES }, () => ({ kind: "kpi", datasetId: A, plan }) as NewTile);
    await dash.addTiles(d.id, many);
    await expect(dash.addTiles(d.id, many.slice(0, 1))).rejects.toThrow(/at most 40 tiles/);
    await expect(dash.addDataset(d.id, A)).rejects.toThrow(/at most 40 tiles/);
    while ((await dash.loadDashboards()).length < T.MAX_DASHBOARDS) await dash.createDashboard("More");
    await expect(dash.createDashboard("One too many")).rejects.toThrow(/up to 40 dashboards/);
  });
});

describe("drawing tiles from the latest data", () => {
  it("draws every kind of tile", async () => {
    const d = await dash.createDashboard("Draw", A);
    const r = await dash.renderDashboard(d);
    expect(r.tiles).toHaveLength(d.tiles.length);
    for (const t of r.tiles) {
      expect(t.missing, `${t.kind} ${t.shown}`).toBeNull();
      expect(t.dataset).toEqual({ id: A, name: "SWD desilting register" });
      expect(t.shown.length).toBeGreaterThan(0);
    }
    const brief = r.tiles.find((t) => t.kind === "brief")!;
    expect(brief.brief!.verdict.length).toBeGreaterThan(0);
    expect(brief.brief!.summary.length).toBeLessThanOrEqual(3);
    expect(brief.brief!.by).toBe("rules");
    const kpi = r.tiles.find((t) => t.kind === "kpi")!;
    expect(kpi.panel?.kpi).toBeTruthy();
    const ins = r.tiles.find((t) => t.kind === "insight")!;
    expect(ins.finding).toBeTruthy();
    expect(ins.insightText).toBe(ins.finding!.text);
    expect(ins.helps).toBeTruthy();
    for (const t of r.tiles.filter((x) => x.kind === "chart" || x.kind === "map")) {
      expect(t.panel).toBeTruthy();
      expect(t.insightText).toBeTruthy();
      expect(t.helps).toBeTruthy();
    }
  });

  it("an insight tile finds its finding again after a new analysis renumbers it", async () => {
    const d = await dash.createDashboard("Findings", C);
    const tiles = d.tiles.filter((t) => t.kind === "insight");
    expect(tiles.length).toBeGreaterThan(0);
    const was = (await dash.renderDashboard(d)).tiles.filter((t) => t.kind === "insight").map((t) => t.finding!);

    // the next analysis: new ids, another order, the same findings
    const meta = store.getMeta(C)!;
    const items = [...meta.brief!.items].reverse().map((x, i) => ({ ...x, id: `re${i}` }));
    store.saveMeta({ ...meta, brief: { ...meta.brief!, items } });
    const now = (await dash.renderDashboard(d)).tiles.filter((t) => t.kind === "insight");
    now.forEach((t, i) => {
      expect(t.missing).toBeNull();
      expect(t.finding!.id).toMatch(/^re\d+$/);
      expect([t.finding!.label, t.finding!.key, t.finding!.text]).toEqual([was[i].label, was[i].key, was[i].text]);
    });

    // a finding that is no longer there says so
    store.saveMeta({ ...meta, brief: { ...meta.brief!, items: [] } });
    const gone = (await dash.renderDashboard(d)).tiles.filter((t) => t.kind === "insight");
    expect(gone.every((t) => t.missing === "No longer in the latest data." && t.finding === null)).toBe(true);
    store.saveMeta(meta);
  });

  it("matches a finding by kind, subject and chart, then by headline, then by kind and subject alone", () => {
    const item = (id: string, label: string, key: string | number | null, planId: string | null, headline: string) =>
      ({ id, label, key, plan: planId ? { id: planId } : null, headline, title: headline }) as unknown as import("./types").BriefItem;
    const items = [item("a", "Hotspot", 13, "map", "Adyar carries most"), item("b", "Hotspot", 9, "zone", "Teynampet lags"), item("c", "Rising", null, null, "Rising fast")];
    const ref = (label: string, key: string | number | null, planId: string | null, headline: string) => ({ label, key, planId, headline }) as import("./dashtypes").InsightRef;
    expect(dash.matchFinding(items, ref("Hotspot", "13", "map", "old words"))?.id).toBe("a");
    expect(dash.matchFinding(items, ref("Hotspot", 5, "map", "teynampet  LAGS"))?.id).toBe("b");
    expect(dash.matchFinding(items, ref("Rising", null, "trend", "Rising slowly"))?.id).toBe("c");
    expect(dash.matchFinding(items, ref("Delay", null, null, "nothing like it"))).toBeNull();
    expect(dash.matchFinding(items, null)).toBeNull();
  });

  it("a deleted dataset renders as missing, never an error", async () => {
    const plan = store.getMeta(A)!.panels.find((p) => p.chart !== "kpi")!;
    const now = new Date().toISOString();
    const lay = { x: 0, y: 0, w: 6, h: 9 };
    const d: Dashboard = {
      id: "dash_gonetest1", name: "Gone", createdAt: now, updatedAt: now, tiles: [
        { id: "tile_a0001", kind: "chart", datasetId: GONE, plan, layout: lay, at: now },
        { id: "tile_a0002", kind: "insight", datasetId: GONE, insight: { label: "Hotspot", key: 13, planId: "map", headline: "x" }, layout: lay, at: now },
        { id: "tile_a0003", kind: "brief", datasetId: GONE, layout: lay, at: now },
        { id: "tile_a0004", kind: "kpi", datasetId: "not-an-id", plan, layout: lay, at: now },
        // a chart its dataset can no longer draw (a column that is not there)
        { id: "tile_a0005", kind: "chart", datasetId: A, plan: { ...plan, col: "zz", agg: "sum", by: "col", byCol: "zz" }, layout: lay, at: now }
      ]
    };
    const r = await dash.renderDashboard(d);
    expect(r.tiles.slice(0, 4).map((t) => [t.missing, t.dataset])).toEqual(Array(4).fill(["The dataset was deleted.", null]));
    expect(r.tiles[4].dataset?.id).toBe(A);
  });

  it("deleting a dataset takes its tiles off every dashboard", async () => {
    await makeDataset("ds_dashdel0001", PDS, "Ration shop stock (to delete)");
    const d1 = await dash.createDashboard("One", A);
    await dash.addDataset(d1.id, "ds_dashdel0001");
    const d2 = await dash.createDashboard("Two", "ds_dashdel0001");
    store.deleteDataset("ds_dashdel0001");
    const list = await dash.loadDashboards();
    const one = list.find((d) => d.id === d1.id)!, two = list.find((d) => d.id === d2.id)!;
    expect(one.tiles.length).toBe(d1.tiles.length);
    expect(one.tiles.every((t) => t.datasetId === A)).toBe(true);
    // the dashboard stays, emptied
    expect(two.tiles).toEqual([]);

    // before the move: the older list loses the dataset too
    resetDashboards();
    await makeDataset("ds_dashdel0002", PDS, "Ration shop stock (to delete)");
    fs.writeFileSync(path.join(dir, "dashboards.json"), JSON.stringify([{ datasetId: "ds_dashdel0002", at: now() }, { datasetId: A, at: now() }]));
    store.deleteDataset("ds_dashdel0002");
    expect((await dash.loadDashboards()).map((d) => d.name)).toEqual(["SWD desilting register"]);
  }, 30_000);
});

function now() { return new Date().toISOString(); }
