/**
 * Thunai's Stage: the full-screen answer it builds for the Collector (A2UI pattern: a flat list of blocks, each one
 * component from this closed catalog, with its data). The model never writes a block: it names a screen recipe and its
 * slots (agent.ts); code fetches the data with Ask District IQ's tools and fills the blocks (screens.ts). The client
 * renders only these kinds (components/collector/app/thunai/Stage.tsx), so a reply can never carry UI code or a number
 * the data does not hold.
 */
import { z } from "zod";

const num = z.number().finite();
const str = (n = 300) => z.string().max(n);
const Bi = z.object({ en: str(600), ta: str(900) });
export type Bilingual = z.infer<typeof Bi>;

export const CaseRow = z.object({
  id: str(80), title: str(240), sev: str(12).nullable(), status: str(40).nullable(), zone: num.nullable(), zoneName: str(60).nullable(),
  place: str(120).nullable(), ward: num.nullable(), dept: str(30).nullable(), deptName: str(80).nullable(), complaints: num, t: str(30).nullable(),
  overdue: z.boolean(), lat: num.nullable(), lon: num.nullable(), why: str(300).nullable(), cat: str(60).nullable()
});
export type CaseRowT = z.infer<typeof CaseRow>;

const Point = z.object({ n: num.nullable(), id: str(120), lat: num, lon: num, label: str(160), sev: str(12).nullable(), value: num.nullable(), hot: z.boolean() });
export type PointT = z.infer<typeof Point>;

export const Block = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Kpis"), id: str(40), title: str(120), items: z.array(z.object({
    key: str(40), label: str(80), value: num, unit: str(20).nullable(), prev: num.nullable(), delta: num.nullable(), tone: z.enum(["bad", "good", "neutral"]), spark: z.array(num).max(60),
    /** the change in percent, shown on the tile when Thunai says it */
    pct: num.nullable().optional()
  })).min(1).max(6) }),
  z.object({ kind: z.literal("CaseList"), id: str(40), title: str(160), source: z.enum(["console-severity", "list", "search", "map"]), sev: str(12).nullable(),
    total: num, rows: z.array(CaseRow).max(60) }),
  z.object({ kind: z.literal("CaseDetail"), id: str(40), incident: CaseRow.extend({ what: z.array(str(300)).max(6), why: str(300).nullable(), next: str(300).nullable(),
    deadline: str(40).nullable(), officials: z.array(z.object({ name: str(80), role: str(120) })).max(4) }),
    timeline: z.array(z.object({ t: str(30), source: str(60), text: str(300) })).max(20) }),
  z.object({ kind: z.literal("NewsReader"), id: str(40), title: str(160), total: num, items: z.array(z.object({
    id: str(120), title: str(300), source: str(80).nullable(), t: str(30).nullable(), place: str(120).nullable(), incidentId: str(80).nullable(), url: str(2000).nullable()
  })).max(30) }),
  z.object({ kind: z.literal("Readings"), id: str(40), title: str(160), metric: str(40), unit: str(20), items: z.array(z.object({
    id: str(80), name: str(120), value: num, t: str(30).nullable(), mean28: num.nullable(), z: num.nullable(), anomaly: z.boolean(), detail: str(200).nullable()
  })).max(20) }),
  z.object({ kind: z.literal("Ranking"), id: str(40), title: str(160), unit: str(30).nullable(), method: str(240), order: z.enum(["top", "bottom"]),
    items: z.array(z.object({ key: str(60), label: str(120), value: num, rank: num, sub: str(160).nullable(), zone: num.nullable(), lat: num.nullable(), lon: num.nullable(), action: z.enum(["zone", "dept", "station", "none"]) })).max(25) }),
  z.object({ kind: z.literal("MapView"), id: str(40), title: str(160), rule: str(240).nullable(),
    shade: z.object({ geo: z.enum(["zone", "taluk"]), label: str(80), values: z.array(z.object({ key: z.union([num, str(20)]), value: num })).max(60) }).nullable(),
    points: z.array(Point).max(200), outline: z.array(num).max(15) }),
  z.object({ kind: z.literal("Compare"), id: str(40), title: str(160), metrics: z.array(z.object({ key: str(30), label: str(60) })).max(8),
    sides: z.array(z.object({ key: str(40), label: str(80), zone: num.nullable(), values: z.record(num), cats: z.array(z.object({ code: str(40), label: str(80), n: num })).max(8),
      series: z.array(num).max(60) })).min(2).max(4),
    seriesLabels: z.array(str(40)).max(60),
    diffs: z.array(z.object({ metric: str(30), label: str(60), hi: str(80), lo: str(80), ratio: num.nullable(), gap: num })).max(8) }),
  z.object({ kind: z.literal("Trend"), id: str(40), title: str(160), unit: str(30), labels: z.array(str(40)).max(120), values: z.array(num).max(120),
    marks: z.array(z.object({ i: num, why: str(160) })).max(12), normal: z.object({ lo: num, hi: num }).nullable() }),
  z.object({ kind: z.literal("Chart"), id: str(40), title: str(160), chart: z.enum(["bar", "hbar", "line", "donut"]), unit: str(30).nullable(),
    labels: z.array(str(80)).max(40), values: z.array(num).max(40) }),
  z.object({ kind: z.literal("Heat"), id: str(40), title: str(160), rows: z.array(str(80)).max(12), cols: z.array(str(80)).max(10), cells: z.array(z.array(num)).max(12) }),
  z.object({ kind: z.literal("Brief"), id: str(40), title: str(160), points: z.array(z.object({ text: str(400), incidentId: str(80).nullable() })).max(10) }),
  z.object({ kind: z.literal("Answer"), id: str(40), title: str(160), text: str(900), facts: z.array(z.object({ label: str(160), value: num, unit: str(20).nullable() })).max(12) }),
  z.object({ kind: z.literal("Drafts"), id: str(40), title: str(120) }),
  z.object({ kind: z.literal("Note"), id: str(40), text: str(400) })
]);
export type BlockT = z.infer<typeof Block>;
export type BlockKind = BlockT["kind"];
export const BLOCK_KINDS = Block.options.map((o) => o.shape.kind.value) as BlockKind[];

export const RECIPES = ["cases", "case", "news", "readings", "ranking", "compare", "trend", "why", "performance", "dashboard", "map", "nearby", "brief", "drafts", "answer"] as const;
export type Recipe = (typeof RECIPES)[number];

export const Scope = z.object({ period: z.enum(["daily", "weekly", "monthly", "quarterly"]), zone: num.nullable(), dept: str(30).nullable(), cat: str(60).nullable(),
  taluk: str(20).nullable(), sev: z.enum(["Severe", "High", "Medium", "Low"]).nullable() });
export type ScopeT = z.infer<typeof Scope>;

/** A next step Thunai suggests on a screen (next.ts): a screen built directly, a draft into the tray, or a sentence. */
export const NextStep = z.object({
  label: Bi, kind: z.enum(["direct", "draft", "ask"]), recipe: z.enum(RECIPES).nullable(), slots: z.record(z.unknown()).nullable(), ids: z.array(str(80)).max(10), text: str(200).nullable()
});
export type NextStepT = z.infer<typeof NextStep>;

export const StageDoc = z.object({
  v: z.literal(1),
  id: str(40),
  recipe: z.enum(RECIPES),
  /** the question, restated (the screen's title) */
  title: str(200),
  /** the one finding that matters, computed by code */
  takeaway: Bi.nullable(),
  /** what Thunai says, every figure from the blocks */
  say: Bi,
  blocks: z.array(Block).min(1).max(6),
  /** the scope the screen covers, mirrored on the console when it opens */
  scope: Scope,
  /** the slots that built it, so a refinement ("add Perungudi", "make it monthly") rebuilds it */
  slots: z.record(z.unknown()),
  sources: z.array(str(80)).max(10),
  asOf: str(40).nullable(),
  /** honest limits ("no history before the dataset starts") */
  notes: z.array(str(300)).max(4),
  /** what Thunai suggests next, computed by code */
  next: z.array(NextStep).max(3).optional()
});
export type StageDocT = z.infer<typeof StageDoc>;

/** A Stage document as it should be: bad blocks are reported, not silently drawn. */
export function checkStage(d: unknown): { ok: true; doc: StageDocT } | { ok: false; why: string } {
  const r = StageDoc.safeParse(d);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, why: `${i.path.join(".")}: ${i.message}` };
  }
  return { ok: true, doc: r.data };
}

/** The open Stage as the agent sees it with the next sentence (Tambo's "interactable"): kind, ids, nothing else. */
export interface StageContext { recipe: Recipe; title: string; blocks: { kind: BlockKind; ids: string[] }[]; slots: Record<string, unknown>; focus: number | null }

export function stageContext(d: StageDocT, focus: number | null = null): StageContext {
  return {
    recipe: d.recipe, title: d.title, focus, slots: d.slots,
    blocks: d.blocks.map((b) => ({ kind: b.kind, ids: idsOf(b).slice(0, 30) }))
  };
}

export function idsOf(b: BlockT): string[] {
  switch (b.kind) {
    case "CaseList": return b.rows.map((r) => r.id);
    case "NewsReader": return b.items.map((x) => x.id);
    case "Readings": return b.items.map((x) => x.name);
    case "Ranking": return b.items.map((x) => x.label);
    case "Compare": return b.sides.map((s) => s.label);
    case "CaseDetail": return [b.incident.id];
    case "MapView": return b.points.map((p) => p.id);
    default: return [];
  }
}

/** Every figure a Stage holds (rounded the ways a sentence may say it), for the spoken-figure check. */
export function figuresOf(d: Pick<StageDocT, "blocks">): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    for (const x of [v, Math.round(v), Math.round(v * 10) / 10, Math.abs(v), Math.round(Math.abs(v)), Math.round(Math.abs(v) * 10) / 10]) out.add(String(x));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") add(v);
    else if (typeof v === "string") for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) out.add(String(Number(m)));
    // a list of numbered cards shows how many there are
    else if (Array.isArray(v)) { if (v.length) out.add(String(v.length)); v.forEach(walk); }
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(d.blocks);
  return out;
}

/** True when every figure in `text` is one the Stage holds (or the Collector said). */
export function figuresOk(text: string, allowed: Set<string>, heard = ""): boolean {
  const norm = (x: string) => String(Number(x.replace(/,/g, "")));
  const own = new Set((heard.match(/\d+(?:\.\d+)?/g) ?? []).map(norm));
  return (text.match(/\d+(?:,\d{2,3})*(?:\.\d+)?/g) ?? []).map(norm).every((x) => allowed.has(x) || own.has(x));
}
