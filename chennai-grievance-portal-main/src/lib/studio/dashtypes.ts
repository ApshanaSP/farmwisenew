/**
 * Named dashboards (workspaces) in the Data Studio: the shared contract between the store and API (server) and the
 * Studio page (client). A dashboard is a name and a grid of tiles; each tile points at one dataset and says what to draw
 * from it: a headline number (kpi), a chart or map (a Plan computed from the latest rows), one finding of its AI brief
 * (insight), or the brief's summary itself (brief). Tiles are placed on a 12-column grid and can be dragged and resized;
 * the layout is saved per dashboard. Nothing here asks a model: every figure is recomputed from the rows when shown.
 *
 * API (all Collector only):
 *   GET    /api/collector/studio/dashboards                      -> { dashboards: DashboardSummary[] }
 *   POST   /api/collector/studio/dashboards        { name, datasetId? } -> { dashboard: DashboardSummary }
 *          (with datasetId the new dashboard is filled with that dataset's summary, numbers, findings and charts)
 *   GET    /api/collector/studio/dashboards/[did]                -> { dashboard: RenderedDashboard }
 *   PATCH  /api/collector/studio/dashboards/[did]  { name }      -> { ok: true }   rename
 *   PATCH  /api/collector/studio/dashboards/[did]  { layout: LayoutItem[] } -> { ok: true }   positions of existing tiles only
 *   DELETE /api/collector/studio/dashboards/[did]                -> { ok: true }   the datasets are kept
 *   POST   /api/collector/studio/dashboards/[did]/tiles { tiles: NewTile[] } | { datasetId } -> { dashboard: DashboardSummary, added: string[] }
 *          ({ datasetId } adds the whole dataset: summary, numbers, findings, charts)
 *   PATCH  /api/collector/studio/dashboards/[did]/tiles/[tid] { title } -> { ok: true }
 *   DELETE /api/collector/studio/dashboards/[did]/tiles/[tid]    -> { ok: true }
 * GET /api/collector/studio (the Studio list) also returns `dashboards: DashboardSummary[]`.
 */
import type { BriefItem, InsightLabel, PanelData, Plan } from "@/lib/studio/types";

export type TileKind = "kpi" | "chart" | "map" | "insight" | "brief";

export interface TileLayout { x: number; y: number; w: number; h: number }
export interface LayoutItem extends TileLayout { i: string }

/**
 * Which finding of a dataset's brief an insight tile shows. Finding ids are renumbered on every analysis, so a tile
 * finds its finding again by kind and subject (label + key + the plan it opens), keeping the headline as a fallback.
 */
export interface InsightRef { label: InsightLabel; key: string | number | null; planId: string | null; headline: string }

export interface Tile {
  id: string;
  kind: TileKind;
  datasetId: string;
  /** kpi, chart, map: what to compute */
  plan?: Plan | null;
  /** insight: which finding */
  insight?: InsightRef | null;
  /** a title the Collector typed (else the chart's or finding's own) */
  title?: string | null;
  layout: TileLayout;
  at: string;
}

/** A tile to add: the server places it at the bottom of the grid when no layout is given. */
export type NewTile = Omit<Tile, "id" | "at" | "layout"> & { layout?: TileLayout | null };

export interface Dashboard { id: string; name: string; createdAt: string; updatedAt: string; tiles: Tile[] }

export interface DashboardSummary {
  id: string;
  name: string;
  tiles: number;
  /** the datasets its tiles come from */
  datasets: { id: string; name: string }[];
  updatedAt: string;
}

/** A tile with what to draw, computed from the dataset's latest rows. */
export interface RenderedTile extends Tile {
  dataset: { id: string; name: string } | null;
  /** kpi / chart / map; an insight that has evidence to draw also carries its chart here */
  panel?: PanelData | null;
  /** insight: the finding as it reads now */
  finding?: BriefItem | null;
  /** brief: the dataset's summary */
  brief?: { verdict: string; summary: string[]; by: "ai" | "rules" } | null;
  /** the title to show */
  shown: string;
  /** one sentence on what the tile shows (computed), and what it helps with */
  insightText?: string | null;
  helps?: string | null;
  /** why nothing can be drawn ("The dataset was deleted", "No longer in the latest data") */
  missing?: string | null;
}

export interface RenderedDashboard extends Omit<Dashboard, "tiles"> { tiles: RenderedTile[] }

export const GRID_COLS = 12;
/** grid row height in px and the gap between tiles */
export const GRID_ROW = 40;
export const GRID_GAP = 12;

export const MIN_SIZE: Record<TileKind, { w: number; h: number }> = {
  kpi: { w: 2, h: 2 }, chart: { w: 3, h: 4 }, map: { w: 4, h: 6 }, insight: { w: 3, h: 5 }, brief: { w: 4, h: 3 }
};
export const DEFAULT_SIZE: Record<TileKind, { w: number; h: number }> = {
  kpi: { w: 3, h: 2 }, chart: { w: 6, h: 7 }, map: { w: 6, h: 9 }, insight: { w: 4, h: 7 }, brief: { w: 12, h: 4 }
};
export const MAX_DASHBOARDS = 40;
export const MAX_TILES = 40;
