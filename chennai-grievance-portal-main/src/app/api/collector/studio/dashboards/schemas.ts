/**
 * What the dashboard routes accept (lib/studio/dashtypes.ts is the contract). The Plan is checked exactly as the
 * dataset route checks a pinned or added chart (studio/[id]/route.ts); sizes are made valid by dashboards.ts.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { failed } from "@/lib/collector/guard";
import { DashError } from "@/lib/studio/dashboards";
import { MAX_TILES } from "@/lib/studio/dashtypes";

const FilterSchema = z.object({ col: z.string().max(10), op: z.enum(["eq", "neq", "in", "contains", "gte", "lte", "open", "closed", "recent_days", "latest"]), values: z.array(z.string().max(80)).max(20) });
export const PlanSchema = z.object({
  id: z.string().max(40), title: z.string().max(120), chart: z.enum(["kpi", "bar", "hbar", "line", "area", "donut", "treemap", "map", "table"]),
  agg: z.enum(["count", "sum", "avg", "max", "min", "distinct"]), col: z.string().max(10).nullable(), by: z.enum(["none", "col", "zone", "ward", "taluk", "place", "time"]),
  byCol: z.string().max(10).nullable(), unit: z.enum(["day", "week", "month", "year"]).nullable(),
  filters: z.array(FilterSchema).max(10),
  sort: z.enum(["desc", "asc", "key"]), limit: z.number().int().min(1).max(300)
});

const Num = z.number().finite();
export const TileLayoutSchema = z.object({ x: Num, y: Num, w: Num, h: Num });
export const LayoutItemSchema = TileLayoutSchema.extend({ i: z.string().max(40) });

const InsightRefSchema = z.object({
  label: z.string().max(40), key: z.union([z.string().max(80), z.number()]).nullable(), planId: z.string().max(40).nullable(), headline: z.string().max(300)
});
export const NewTileSchema = z.object({
  kind: z.enum(["kpi", "chart", "map", "insight", "brief"]),
  datasetId: z.string().max(40),
  plan: PlanSchema.nullable().optional(),
  insight: InsightRefSchema.nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  layout: TileLayoutSchema.nullable().optional()
});
export const TilesBody = z.union([
  z.object({ datasetId: z.string().max(40) }),
  z.object({ tiles: z.array(NewTileSchema).min(1).max(MAX_TILES) })
]);

export const Name = z.string().max(200);

/** A refusal from dashboards.ts in its own words and status; anything else is logged and answered generally. */
export function answerError(err: unknown, what: string) {
  if (err instanceof DashError) return NextResponse.json({ error: err.message }, { status: err.status });
  return failed(err, what);
}
