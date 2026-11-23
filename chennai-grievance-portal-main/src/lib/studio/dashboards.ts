/**
 * Named dashboards (workspaces) in the Data Studio, on the server: kept in dashboards.json (store.ts), shaped by the
 * contract in dashtypes.ts. A tile only says what to draw; every figure is computed again from its dataset's latest rows
 * when the dashboard is opened, so a refreshed dataset shows its new numbers. Nothing here asks a model.
 *
 * The older files are moved over the first time the dashboards are read: each dataset the Collector had added as a
 * dashboard of its own becomes a dashboard named after it, and the board of pinned charts becomes "Pinned charts". Both
 * files are copied aside first (*.v1-backup).
 *
 * Every change reads, changes and writes the file in one synchronous step (anything slow, such as working out a
 * dataset's tiles, is done before), so two changes at once cannot undo each other.
 */
import { renderPanel } from "@/lib/studio/chartlint";
import {
  DEFAULT_SIZE, GRID_COLS, MAX_DASHBOARDS, MAX_TILES, MIN_SIZE,
  type Dashboard, type DashboardSummary, type InsightRef, type LayoutItem, type NewTile, type RenderedDashboard, type RenderedTile,
  type Tile, type TileKind, type TileLayout
} from "@/lib/studio/dashtypes";
import type { Names } from "@/lib/studio/engine";
import { HELPS, describePanel, helpsOf } from "@/lib/studio/helps";
import { namesOf, view, type DatasetView } from "@/lib/studio/pipeline";
import { refs } from "@/lib/studio/refs";
import { chartRank, drawable, findingPanel, strongest } from "@/lib/studio/simpledash";
import { backupOldDashboards, getBoard, getDashboards, getMeta, getRows, readDashFile, saveDashboards, validId } from "@/lib/studio/store";
import type { BriefItem, DatasetMeta, Pin, Plan } from "@/lib/studio/types";

/** A refusal the page can show as it is (unknown dashboard, too many tiles), with its HTTP status. */
export class DashError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// ------------------------------------------------------------------ ids --

const DASH_RE = /^dash_[a-z0-9]{4,24}$/;
const TILE_RE = /^tile_[a-z0-9]{4,32}$/;
export const validDashId = (id: string) => DASH_RE.test(id);
export const validTileId = (id: string) => TILE_RE.test(id);

const rand = () => Math.random().toString(36).slice(2, 6).padEnd(4, "0");
function freshId(prefix: "dash" | "tile", taken: Set<string>): string {
  let id: string;
  do id = `${prefix}_${Date.now().toString(36)}${rand()}`; while (taken.has(id));
  taken.add(id);
  return id;
}

// --------------------------------------------------------------- layout --

const MAX_H = 30;
const MAX_Y = 2000;
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.min(hi, Math.max(lo, n));
};

/** A place on the grid made valid for a tile of this kind: whole cells, inside the 12 columns, never under the smallest size. */
export function clampLayout(l: Partial<TileLayout> | null | undefined, kind: TileKind): TileLayout {
  const min = MIN_SIZE[kind], def = DEFAULT_SIZE[kind];
  const w = int(l?.w, min.w, GRID_COLS, def.w);
  const h = int(l?.h, min.h, MAX_H, def.h);
  return { x: int(l?.x, 0, GRID_COLS - w, 0), y: int(l?.y, 0, MAX_Y, 0), w, h };
}

/** The first free row under every tile. */
export const bottomOf = (tiles: { layout: TileLayout }[]) => tiles.reduce((m, t) => Math.max(m, t.layout.y + t.layout.h), 0);

export const overlaps = (a: TileLayout, b: TileLayout) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Sizes laid out left to right from row y0, starting a new row when the next one does not fit. With `even` the tiles of
 * a row are made the same height (a map beside a trend), so the grid reads as neat rows. No two overlap.
 */
function flow(sizes: { w: number; h: number }[], y0: number, even = false): TileLayout[] {
  const out: TileLayout[] = [];
  let row: TileLayout[] = [], x = 0, y = y0;
  const close = () => {
    const h = Math.max(0, ...row.map((r) => r.h));
    if (even) for (const r of row) r.h = h;
    y += h;
    row = [];
    x = 0;
  };
  for (const s of sizes) {
    const w = Math.min(s.w, GRID_COLS);
    if (x + w > GRID_COLS) close();
    const l = { x, y, w, h: s.h };
    row.push(l);
    out.push(l);
    x += w;
  }
  if (row.length) close();
  return out;
}

/** A row of n tiles of one kind, widened to fill the 12 columns when there are fewer of them (never wider than half). */
const spread = (kind: TileKind, n: number) => {
  const def = DEFAULT_SIZE[kind];
  return { w: Math.min(GRID_COLS / 2, Math.max(def.w, Math.floor(GRID_COLS / Math.max(1, n)))), h: def.h };
};

/** The kind of tile a plan draws: a map, a headline number, or a chart. */
export const kindOfPlan = (p: Pick<Plan, "chart">): TileKind => (p.chart === "map" ? "map" : p.chart === "kpi" ? "kpi" : "chart");

/**
 * New tiles given their ids and their places. A block from autoTiles keeps its own arrangement and goes below the lowest
 * tile; a tile that names a free place keeps it; the rest go at the bottom, left to right.
 */
function placeTiles(existing: Tile[], add: NewTile[], at: string, block: boolean): Tile[] {
  const taken = new Set(existing.map((t) => t.id));
  const out: Tile[] = add.map((t) => ({
    id: freshId("tile", taken), kind: t.kind, datasetId: t.datasetId, plan: t.plan ?? null, insight: t.insight ?? null,
    title: cleanTitle(t.title), layout: { x: 0, y: 0, w: 0, h: 0 }, at
  }));
  if (block && add.every((t) => t.layout)) {
    const top = bottomOf(existing);
    add.forEach((t, i) => { out[i].layout = clampLayout({ ...t.layout!, y: t.layout!.y + top }, t.kind); });
    return out;
  }
  const placed = existing.map((t) => t.layout);
  const loose: number[] = [];
  add.forEach((t, i) => {
    if (t.layout) {
      const l = clampLayout(t.layout, t.kind);
      if (!placed.some((p) => overlaps(p, l))) { out[i].layout = l; placed.push(l); return; }
    }
    loose.push(i);
  });
  const spots = flow(loose.map((i) => clampLayout(add[i].layout ?? null, add[i].kind)), bottomOf(placed.map((layout) => ({ layout }))));
  loose.forEach((i, k) => { out[i].layout = spots[k]; });
  return out;
}

// ------------------------------------------------------------ autoTiles --

const MAX_KPIS = 4;
const MAX_FINDINGS = 3;
const MAX_CHARTS = 4;

/** How a finding is found again after the next analysis renumbers it. */
export const refOf = (x: BriefItem): InsightRef => ({ label: x.label, key: x.key ?? null, planId: x.plan?.id ?? null, headline: x.headline || x.title });

/**
 * The tiles "Add to dashboard" makes for a whole dataset, arranged from row 0 on the 12-column grid: the summary across
 * the top, up to four headline numbers side by side, up to three of the strongest findings, then the dataset's own charts
 * the findings do not already show (the map first, then the trend; at most four; a bare table only when there is no
 * other chart). Throws DashError(404) when the dataset is not there.
 */
export async function autoTiles(datasetId: string): Promise<NewTile[]> {
  const v = validId(datasetId) ? await view(datasetId, []) : null;
  if (!v) throw new DashError("Unknown dataset.", 404);
  const kpis = v.panels.filter((p) => p.chart === "kpi" && p.kpi).slice(0, MAX_KPIS);
  const charts = drawable(v.panels);
  const findings = strongest(v.brief.items, MAX_FINDINGS);
  const covered = new Set<string>();
  let findingCharts = 0;
  for (const x of findings) {
    const p = findingPanel(x, charts, v.meta.window.to);
    if (!p) continue;
    findingCharts++;
    if (charts.includes(p)) covered.add(p.id);
  }
  const others = charts.filter((p) => p.chart !== "table").length + findingCharts;
  const rest = charts.filter((p) => !covered.has(p.id) && !(p.chart === "table" && others > 0))
    .sort((a, b) => chartRank(a) - chartRank(b)).slice(0, MAX_CHARTS);

  const groups: NewTile[][] = [
    [{ kind: "brief", datasetId, plan: null, insight: null, title: null }],
    kpis.map((p) => ({ kind: "kpi" as const, datasetId, plan: p.plan, insight: null, title: null })),
    findings.map((x) => ({ kind: "insight" as const, datasetId, plan: null, insight: refOf(x), title: null })),
    // the kind follows what is drawn now: a map the Chart Doctor turned into bars (too few places) is a chart tile
    rest.map((p) => ({ kind: p.chart === "map" ? "map" as const : "chart" as const, datasetId, plan: p.plan, insight: null, title: null }))
  ];
  let y = 0;
  const out: NewTile[] = [];
  for (const g of groups) {
    if (!g.length) continue;
    const sizes = g.map((t) => (t.kind === "kpi" || t.kind === "insight" ? spread(t.kind, g.length) : DEFAULT_SIZE[t.kind]));
    const spots = flow(sizes, y, true);
    g.forEach((t, i) => out.push({ ...t, layout: spots[i] }));
    y = Math.max(y, ...spots.map((s) => s.y + s.h));
  }
  return out;
}

// ------------------------------------------------------------- storage --

declare global {
  // the move under way, shared by every route (each route may load its own copy of this module)
  // eslint-disable-next-line no-var
  var __studioDashMove: Promise<void> | null | undefined;
}

/** Every dashboard, in the order kept (newest first). The older files are moved over first, once. */
export async function loadDashboards(): Promise<Dashboard[]> {
  if (readDashFile().kind === "v2") return getDashboards();
  globalThis.__studioDashMove ??= migrate().finally(() => { globalThis.__studioDashMove = null; });
  await globalThis.__studioDashMove;
  return getDashboards();
}

/** The older dashboards.json (one dashboard per dataset) and board.json (pinned charts) as named dashboards. */
async function migrate(): Promise<void> {
  const f = readDashFile();
  if (f.kind === "v2") return;
  const raw = getBoard() as unknown;
  // a pin the older pages could not have written (no chart, no dataset) is left out rather than stopping the move
  const pins = (Array.isArray(raw) ? (raw as Pin[]) : [])
    .filter((p) => !!p && typeof p.datasetId === "string" && !!p.plan && typeof p.plan === "object" && !!getMeta(p.datasetId));
  // the older list held up to the same number of dashboards: room is kept for the pinned charts (the oldest dataset's
  // dashboard is the one left out; it is in the backup and can be added again in one click)
  const entries = (f.kind === "v1" ? f.entries : []).filter((e) => !!getMeta(e.datasetId)).slice(0, MAX_DASHBOARDS - (pins.length ? 1 : 0));
  // a dataset's tiles need the district's names: when they cannot be loaded (the database is down) the move waits for
  // the next look instead of saving every dashboard empty, and before any backup is made, so none piles up
  if (entries.length) await refs();
  if (entries.length || pins.length || f.kind !== "none") backupOldDashboards();
  const now = new Date().toISOString();
  const taken = new Set<string>();
  const out: Dashboard[] = [];
  // each dashboard made from a dataset, by the dataset it was made from
  const from = new Map<string, string>();
  for (const e of entries) {
    const meta = getMeta(e.datasetId);
    if (!meta) continue;
    let tiles: NewTile[];
    try { tiles = await autoTiles(e.datasetId); } catch (err) {
      // the dataset's own summary at least, drawn once the dataset can be read again (never an empty dashboard)
      console.warn("[studio] dashboard tiles could not be made", e.datasetId, (err as Error).message);
      tiles = [{ kind: "brief", datasetId: e.datasetId, plan: null, insight: null, title: null, layout: { x: 0, y: 0, ...DEFAULT_SIZE.brief } }];
    }
    const at = typeof e.at === "string" && e.at ? e.at : now;
    const d: Dashboard = { id: freshId("dash", taken), name: cleanName(meta.name) || "Dashboard", createdAt: at, updatedAt: at, tiles: placeTiles([], tiles, at, true) };
    from.set(d.id, e.datasetId);
    out.push(d);
  }
  if (pins.length) {
    const tiles = pins.map((p): NewTile => ({ kind: kindOfPlan(p.plan), datasetId: p.datasetId, plan: p.plan, insight: null, title: null }));
    const placed = placeTiles([], tiles, now, false).map((t, i) => ({ ...t, at: pins[i].at || now }));
    out.push({ id: freshId("dash", taken), name: "Pinned charts", createdAt: now, updatedAt: now, tiles: placed });
  }
  // another request may have finished the move while the tiles were worked out: its file is kept
  if (readDashFile().kind === "v2") return;
  // a dataset deleted meanwhile leaves no tile behind, and the dashboard named after it goes too (as does a board left empty)
  saveDashboards(out.flatMap((d) => {
    const src = from.get(d.id);
    if (src && !getMeta(src)) return [];
    const tiles = d.tiles.filter((t) => !!getMeta(t.datasetId));
    return src || tiles.length ? [{ ...d, tiles }] : [];
  }));
}

/** Change one dashboard in a single read-change-write; DashError(404) when it is not there. */
function change<T>(did: string, fn: (d: Dashboard, list: Dashboard[]) => T): T {
  const list = getDashboards();
  const d = validDashId(did) ? list.find((x) => x.id === did) : undefined;
  if (!d) throw new DashError("Unknown dashboard.", 404);
  const r = fn(d, list);
  d.updatedAt = new Date().toISOString();
  saveDashboards(list);
  return r;
}

const cleanName = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
const cleanTitle = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null;
const tooMany = (n: number) =>
  new DashError(`A dashboard holds at most ${MAX_TILES} tiles${n > MAX_TILES ? ` (this would make ${n})` : ""}. Remove some tiles, or start a new dashboard.`);

/** A dashboard in the list: its tile count and the datasets its tiles come from. */
export function summaryOf(d: Dashboard, metas = new Map<string, DatasetMeta | null>()): DashboardSummary {
  const datasets: { id: string; name: string }[] = [];
  for (const t of d.tiles) {
    if (datasets.some((x) => x.id === t.datasetId)) continue;
    if (!metas.has(t.datasetId)) metas.set(t.datasetId, validId(t.datasetId) ? getMeta(t.datasetId) : null);
    const m = metas.get(t.datasetId);
    if (m) datasets.push({ id: m.id, name: m.name });
  }
  return { id: d.id, name: d.name, tiles: d.tiles.length, datasets, updatedAt: d.updatedAt };
}

export async function listSummaries(): Promise<DashboardSummary[]> {
  const metas = new Map<string, DatasetMeta | null>();
  return (await loadDashboards()).map((d) => summaryOf(d, metas));
}

export async function getDashboard(did: string): Promise<Dashboard | null> {
  if (!validDashId(did)) return null;
  return (await loadDashboards()).find((d) => d.id === did) ?? null;
}

/** A new dashboard, filled with a dataset's summary, numbers, findings and charts when one is given. */
export async function createDashboard(name: string | null | undefined, datasetId?: string | null): Promise<Dashboard> {
  await loadDashboards();
  const full = () => { if (getDashboards().length >= MAX_DASHBOARDS) throw new DashError(`You can keep up to ${MAX_DASHBOARDS} dashboards. Delete one you no longer use first.`); };
  full();
  let tiles: NewTile[] = [];
  let fallback = "New dashboard";
  if (datasetId) {
    const meta = validId(datasetId) ? getMeta(datasetId) : null;
    if (!meta) throw new DashError("Unknown dataset.", 404);
    fallback = meta.name;
    tiles = await autoTiles(datasetId);
  }
  full();
  const list = getDashboards();
  const now = new Date().toISOString();
  const d: Dashboard = { id: freshId("dash", new Set(list.map((x) => x.id))), name: cleanName(name) || cleanName(fallback) || "New dashboard", createdAt: now, updatedAt: now, tiles: [] };
  d.tiles = placeTiles([], tiles, now, true);
  saveDashboards([d, ...list]);
  return d;
}

export async function renameDashboard(did: string, name: string): Promise<void> {
  const n = cleanName(name);
  if (!n) throw new DashError("Give the dashboard a name.");
  await loadDashboards();
  change(did, (d) => { d.name = n; });
}

export async function deleteDashboard(did: string): Promise<Dashboard> {
  await loadDashboards();
  const list = getDashboards();
  const d = validDashId(did) ? list.find((x) => x.id === did) : undefined;
  if (!d) throw new DashError("Unknown dashboard.", 404);
  saveDashboards(list.filter((x) => x !== d));
  return d;
}

/**
 * New positions after a drag or resize. Only tiles already on the dashboard move (an unknown id is ignored, a missing
 * one stays where it was); each is kept inside the 12 columns and at least its kind's smallest size. Returns how many moved.
 */
export async function setLayout(did: string, layout: LayoutItem[]): Promise<number> {
  await loadDashboards();
  return change(did, (d) => {
    let n = 0;
    const byId = new Map(layout.map((l) => [l.i, l]));
    for (const t of d.tiles) {
      const l = byId.get(t.id);
      if (!l) continue;
      t.layout = clampLayout(l, t.kind);
      n++;
    }
    return n;
  });
}

/** Tiles added to a dashboard (each must name a dataset that is there); returns the dashboard and the new tiles' ids. */
export async function addTiles(did: string, tiles: NewTile[]): Promise<{ dashboard: Dashboard; added: string[] }> {
  await loadDashboards();
  const ok = new Set<string>();
  for (const t of tiles) {
    if (ok.has(t.datasetId)) continue;
    if (!validId(t.datasetId) || !getMeta(t.datasetId)) throw new DashError("Unknown dataset.", 404);
    ok.add(t.datasetId);
  }
  // the kind follows the plan for the drawn kinds, so a map plan is never squeezed into a chart tile's size
  const norm = tiles.map((t): NewTile => (t.kind === "kpi" || t.kind === "chart" || t.kind === "map")
    ? { ...t, kind: t.plan ? kindOfPlan(t.plan) : t.kind, insight: null }
    : t.kind === "insight" ? { ...t, plan: null } : { ...t, plan: null, insight: null });
  for (const t of norm) {
    if ((t.kind === "kpi" || t.kind === "chart" || t.kind === "map") && !t.plan) throw new DashError("A chart tile needs a chart to draw.");
    if (t.kind === "insight" && !t.insight) throw new DashError("A finding tile needs the finding it shows.");
  }
  return add(did, norm, false);
}

/** A whole dataset added to a dashboard: its summary, numbers, findings and charts, below what is there. */
export async function addDataset(did: string, datasetId: string): Promise<{ dashboard: Dashboard; added: string[] }> {
  await loadDashboards();
  if (!getDashboards().some((d) => d.id === did)) throw new DashError("Unknown dashboard.", 404);
  return add(did, await autoTiles(datasetId), true);
}

function add(did: string, tiles: NewTile[], block: boolean): { dashboard: Dashboard; added: string[] } {
  return change(did, (d) => {
    if (d.tiles.length + tiles.length > MAX_TILES) throw tooMany(d.tiles.length + tiles.length);
    const made = placeTiles(d.tiles, tiles, new Date().toISOString(), block);
    d.tiles.push(...made);
    return { dashboard: d, added: made.map((t) => t.id) };
  });
}

/** A tile's own title; an empty one goes back to the chart's or finding's own. */
export async function renameTile(did: string, tid: string, title: string | null): Promise<void> {
  await loadDashboards();
  change(did, (d) => {
    const t = d.tiles.find((x) => x.id === tid);
    if (!t) throw new DashError("Unknown tile.", 404);
    t.title = cleanTitle(title);
  });
}

export async function removeTile(did: string, tid: string): Promise<Tile> {
  await loadDashboards();
  return change(did, (d) => {
    const i = d.tiles.findIndex((x) => x.id === tid);
    if (i < 0) throw new DashError("Unknown tile.", 404);
    return d.tiles.splice(i, 1)[0];
  });
}

// ------------------------------------------------------------ rendering --

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const sameKey = (a: string | number | null | undefined, b: string | number | null | undefined) => String(a ?? "") === String(b ?? "");

/**
 * The finding an insight tile shows, in the dataset's current brief. Ids change with every analysis, so it is found by
 * kind, subject and the chart it opens; then by its headline; then by kind and subject alone when only one finding fits.
 */
export function matchFinding(items: BriefItem[], ref: InsightRef | null | undefined): BriefItem | null {
  if (!ref) return null;
  const kin = items.filter((x) => x.label === ref.label && sameKey(x.key, ref.key));
  const h = norm(ref.headline);
  return kin.find((x) => (x.plan?.id ?? null) === (ref.planId ?? null))
    ?? (h ? items.find((x) => norm(x.headline) === h || norm(x.title) === h) : undefined)
    ?? (kin.length === 1 ? kin[0] : null);
}

interface Ctx {
  names: Names;
  /** each dataset's meta and rows, read once per render */
  base: Map<string, { meta: DatasetMeta; rows: ReturnType<typeof getRows> } | null>;
  /** each dataset's view (brief and charts), computed once per render */
  views: Map<string, Promise<DatasetView | null>>;
}

const gone = (id: string) => (validId(id) && getMeta(id) ? "This dataset could not be read just now." : "The dataset was deleted.");

function baseOf(ctx: Ctx, id: string) {
  if (!ctx.base.has(id)) {
    let b: { meta: DatasetMeta; rows: ReturnType<typeof getRows> } | null = null;
    try {
      const meta = validId(id) ? getMeta(id) : null;
      if (meta) b = { meta, rows: getRows(id) };
    } catch (err) { console.warn("[studio] dataset could not be read for a dashboard", id, (err as Error).message); }
    ctx.base.set(id, b);
  }
  return ctx.base.get(id)!;
}

function viewOf(ctx: Ctx, id: string): Promise<DatasetView | null> {
  if (!ctx.views.has(id)) {
    ctx.views.set(id, (validId(id) ? view(id, []) : Promise.resolve(null)).catch((err) => {
      console.warn("[studio] dataset view failed for a dashboard", id, (err as Error).message);
      return null;
    }));
  }
  return ctx.views.get(id)!;
}

async function renderTile(t: Tile, ctx: Ctx): Promise<RenderedTile> {
  const own = t.title?.trim() || null;
  const out: RenderedTile = {
    ...t, dataset: null, panel: null, finding: null, brief: null, insightText: null, helps: null, missing: null,
    shown: own ?? t.plan?.title ?? t.insight?.headline ?? "Summary"
  };
  try {
    if (t.kind === "kpi" || t.kind === "chart" || t.kind === "map") {
      const b = baseOf(ctx, t.datasetId);
      if (!b) return { ...out, missing: gone(t.datasetId) };
      out.dataset = { id: b.meta.id, name: b.meta.name };
      if (!t.plan) return { ...out, missing: "Nothing to draw." };
      const p = renderPanel(b.rows, b.meta.spec, t.plan, ctx.names, b.meta.window);
      return {
        ...out, panel: p, shown: own ?? p.title,
        insightText: t.kind === "kpi" ? null : describePanel(p), helps: t.kind === "kpi" ? null : helpsOf(p)
      };
    }
    const v = await viewOf(ctx, t.datasetId);
    if (!v) return { ...out, missing: gone(t.datasetId) };
    out.dataset = { id: v.meta.id, name: v.meta.name };
    const charts = drawable(v.panels);
    if (t.kind === "brief") {
      const verdict = v.brief.items.length || charts.length ? v.brief.verdict : "No insights available";
      return { ...out, shown: own ?? v.meta.name, brief: { verdict, summary: v.brief.summary.slice(0, 3), by: v.brief.by } };
    }
    const x = matchFinding(v.brief.items, t.insight);
    if (!x) return { ...out, missing: "No longer in the latest data." };
    return {
      ...out, finding: x, panel: findingPanel(x, charts, v.meta.window.to), shown: own ?? (x.headline || x.title),
      insightText: x.text, helps: HELPS[x.label] ?? "Shows what needs attention"
    };
  } catch (err) {
    console.warn("[studio] dashboard tile could not be drawn", t.id, (err as Error).message);
    return { ...out, missing: "This tile could not be drawn from the latest data." };
  }
}

/** The dashboard with every tile computed from its dataset's latest rows. A tile that cannot be drawn says why; nothing throws. */
export async function renderDashboard(d: Dashboard): Promise<RenderedDashboard> {
  let names: Names;
  try { names = namesOf(await refs()); }
  catch (err) {
    // without the district's names a zone shows as "Zone 13": the dashboard still opens
    console.warn("[studio] district names unavailable for a dashboard", (err as Error).message);
    names = { zone: (z) => `Zone ${z}`, taluk: (t) => t, zoneOf: (v) => { const n = Number(String(v).match(/\b(\d{1,2})\b/)?.[1]); return n >= 1 && n <= 15 ? n : null; } };
  }
  const ctx: Ctx = { names, base: new Map(), views: new Map() };
  const tiles: RenderedTile[] = [];
  for (const t of d.tiles) tiles.push(await renderTile(t, ctx));
  return { id: d.id, name: d.name, createdAt: d.createdAt, updatedAt: d.updatedAt, tiles };
}
