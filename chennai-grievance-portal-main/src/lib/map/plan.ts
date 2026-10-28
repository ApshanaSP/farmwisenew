/**
 * The typed plan behind every map answer. A question becomes a Plan (by the rules in route.ts, or by an AI model that
 * may only fill this schema); the executor runs it over in-memory features. Nothing in a plan is ever pasted into SQL.
 * Every field is required (nullable where empty), so the same schema works for Groq's strict JSON mode.
 *
 * Differences from the prompt's sketch, each needed by a question shape it lists:
 * - `last_days` carries `offset` (1 = the window before), for "this week vs last week";
 * - `take` has `where.kinds` (hospital, clinic, health centre...), so "hospitals" can leave out private clinics;
 * - `within.near` is a list, so "add hospitals" widens "near schools" to "near schools or hospitals";
 * - `nearest.from` may be `place:<ref>` (a resolved place), for "5 nearest police stations to Marina";
 * - `farthest.beyond_m`, for "areas with no fire station within 3 km".
 */
import { z } from "zod";
import { LAYER_IDS, SEVS } from "./types";

export const LIMITS = { steps: 8, minM: 10, maxM: 5000, k: 20, days: 365, features: 5000 } as const;

export const PeriodSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("last_days"), days: z.number().int(), offset: z.number().int() }),
  z.object({ kind: z.literal("month"), offset: z.number().int() }),
  z.object({ kind: z.literal("range"), from: z.string(), to: z.string() })
]);
export type Period = z.infer<typeof PeriodSchema>;

export const FilterSchema = z.object({
  category: z.array(z.string()).nullable(),
  family: z.array(z.string()).nullable(),
  severity: z.array(z.enum(SEVS as [string, ...string[]])).nullable(),
  status: z.enum(["open", "closed", "any"]),
  dept: z.array(z.string()).nullable(),
  overdue: z.boolean().nullable(),
  citizen: z.boolean().nullable(),
  period: PeriodSchema.nullable(),
  text: z.string().nullable()
});
export type Filter = z.infer<typeof FilterSchema>;

export const AreaRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ward"), id: z.number().int() }),
  z.object({ kind: z.literal("zone"), id: z.number().int() }),
  z.object({ kind: z.literal("taluk"), code: z.string() }),
  z.object({ kind: z.literal("point"), ref: z.string(), radius_m: z.number() }),
  z.object({ kind: z.literal("drawn"), id: z.string() })
]);
export type AreaRef = z.infer<typeof AreaRefSchema>;

const LayerSchema = z.enum(LAYER_IDS);
const name = z.string().min(1).max(24).regex(/^[a-z][a-z0-9_]*$/);

export const StepSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("take"), as: name, layer: LayerSchema, filter: FilterSchema.nullable(),
    where: z.object({ government: z.boolean().nullable(), kinds: z.array(z.string()).nullable() }).nullable() }),
  z.object({ op: z.literal("within"), as: name, of: name, near: z.array(name).min(1).max(4), meters: z.number() }),
  z.object({ op: z.literal("inside"), as: name, of: name, area: AreaRefSchema }),
  z.object({ op: z.literal("along"), as: name, of: name, line: z.string(), meters: z.number() }),
  z.object({ op: z.literal("nearest"), as: name, from: z.string(), to: name, k: z.number().int() }),
  z.object({ op: z.literal("farthest"), as: name, areas: z.enum(["ward", "zone"]), from: name, beyond_m: z.number().nullable() }),
  z.object({ op: z.literal("count_by"), as: name, of: name, by: z.enum(["ward", "zone", "taluk", "hex500"]) }),
  z.object({ op: z.literal("hotspot"), as: name, of: name }),
  z.object({ op: z.literal("compare"), as: name, of: name, a: AreaRefSchema, b: AreaRefSchema }),
  z.object({ op: z.literal("change"), as: name, of: name, now: PeriodSchema, before: PeriodSchema })
]);
export type Step = z.infer<typeof StepSchema>;

export const PlanSchema = z.object({
  steps: z.array(StepSchema).min(1).max(LIMITS.steps),
  show: name,
  language: z.enum(["en", "ta", "tanglish"])
});
export type Plan = z.infer<typeof PlanSchema>;

export const OPEN_FILTER: Filter = { category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: null, text: null };

/** Days a period covers (a month counts 31), for the 365-day limit. */
export function periodDays(p: Period): number {
  if (p.kind === "last_days") return p.days;
  if (p.kind === "month") return 31;
  const a = Date.parse(p.from.replace(" ", "T") + "Z"), b = Date.parse(p.to.replace(" ", "T") + "Z");
  return Number.isFinite(a) && Number.isFinite(b) ? Math.ceil((b - a) / 86_400_000) : Infinity;
}

/** The names a step reads: its collections (and a nearest step's place, which is not a collection). */
function reads(s: Step): string[] {
  switch (s.op) {
    case "take": return [];
    case "within": return [s.of, ...s.near];
    case "nearest": return [s.from.startsWith("place:") ? "" : s.from, s.to].filter(Boolean);
    case "farthest": return [s.from];
    default: return [s.of];
  }
}

/**
 * Parses and checks a plan: the schema, then the limits the prompt sets (8 steps, 10–5,000 m, k ≤ 20, ≤ 365 days),
 * unique names, and every reference to an earlier step. Returns the plan, or the problems in words (for a retry or a
 * clarification); a refused plan is never executed.
 */
export function checkPlan(input: unknown): { ok: true; plan: Plan } | { ok: false; problems: string[] } {
  const parsed = PlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`) };
  const plan = parsed.data;
  const problems: string[] = [];
  const seen = new Set<string>();
  const periods: Period[] = [];
  for (const s of plan.steps) {
    if (seen.has(s.as)) problems.push(`"${s.as}" is named twice`);
    for (const r of reads(s)) if (!seen.has(r)) problems.push(`step "${s.as}" reads "${r}", which no earlier step makes`);
    seen.add(s.as);
    if ((s.op === "within" || s.op === "along") && (s.meters < LIMITS.minM || s.meters > LIMITS.maxM)) problems.push(`${s.meters} m is outside ${LIMITS.minM}–${LIMITS.maxM} m`);
    if ((s.op === "inside" || s.op === "compare") && [s.op === "inside" ? s.area : s.a, s.op === "compare" ? s.b : null].some((a) => a?.kind === "point" && (a.radius_m < LIMITS.minM || a.radius_m > LIMITS.maxM)))
      problems.push(`a radius is outside ${LIMITS.minM}–${LIMITS.maxM} m`);
    if (s.op === "farthest" && s.beyond_m != null && (s.beyond_m < LIMITS.minM || s.beyond_m > 20_000)) problems.push(`${s.beyond_m} m is outside ${LIMITS.minM}–20,000 m`);
    if (s.op === "nearest" && (s.k < 1 || s.k > LIMITS.k)) problems.push(`k = ${s.k} is outside 1–${LIMITS.k}`);
    if (s.op === "take" && s.filter?.period) periods.push(s.filter.period);
    if (s.op === "change") periods.push(s.now, s.before);
  }
  if (!seen.has(plan.show)) problems.push(`show names "${plan.show}", which no step makes`);
  for (const p of periods) {
    const d = periodDays(p);
    if (!(d >= 1 && d <= LIMITS.days)) problems.push(`a period of ${Number.isFinite(d) ? d : "?"} days is outside 1–${LIMITS.days} days`);
    if (p.kind === "last_days" && (p.offset < 0 || (p.offset + 1) * p.days > LIMITS.days * 2)) problems.push("a period reaches too far back");
    if (p.kind === "month" && (p.offset < 0 || p.offset > 12)) problems.push("a month offset is outside 0–12");
  }
  return problems.length ? { ok: false, problems } : { ok: true, plan };
}
