/**
 * The plan as a flat form for AI models. Groq's and Gemini's strict JSON modes refuse a schema with one-of-several
 * shapes (the plan's steps, areas and periods), so the model fills one flat object per step, every field present and
 * null where unused; code turns it into the typed Plan (fromWire) and checks it like any other plan. toWire writes a
 * plan in the same form, for the examples, the rules' hint and the current plan of a follow-up. Pure.
 */
import { z } from "zod";
import type { AreaRef, Filter, Period, Plan, Step } from "./plan";
import { LAYER_IDS, SEVS } from "./types";

const AreaW = { kind: z.enum(["ward", "zone", "taluk", "point"]).nullable(), id: z.number().nullable(), code: z.string().nullable(), ref: z.string().nullable(), radius_m: z.number().nullable() };
export const WireStep = z.object({
  op: z.enum(["take", "within", "inside", "along", "nearest", "farthest", "count_by", "hotspot", "compare", "change"]),
  as: z.string(),
  layer: z.enum(LAYER_IDS).nullable(),
  category: z.array(z.string()).nullable(), family: z.array(z.string()).nullable(), severity: z.array(z.enum(SEVS as [string, ...string[]])).nullable(),
  status: z.enum(["open", "closed", "any"]).nullable(), dept: z.array(z.string()).nullable(), overdue: z.boolean().nullable(), citizen: z.boolean().nullable(),
  period_days: z.number().nullable().describe("last N days; null = any time"), period_offset: z.number().nullable().describe("0 = ending now, 1 = the window before"),
  government: z.boolean().nullable(), kinds: z.array(z.string()).nullable(),
  of: z.string().nullable(), near: z.array(z.string()).nullable(), meters: z.number().nullable(), line: z.string().nullable(),
  from: z.string().nullable(), to: z.string().nullable(), k: z.number().nullable(), areas: z.enum(["ward", "zone"]).nullable(), beyond_m: z.number().nullable(),
  by: z.enum(["ward", "zone", "taluk", "hex500"]).nullable(),
  area_kind: AreaW.kind, area_id: AreaW.id, area_code: AreaW.code, area_ref: AreaW.ref, area_radius_m: AreaW.radius_m,
  b_kind: AreaW.kind, b_id: AreaW.id, b_code: AreaW.code, b_ref: AreaW.ref, b_radius_m: AreaW.radius_m,
  before_days: z.number().nullable(), before_offset: z.number().nullable()
});
export type WireStep = z.infer<typeof WireStep>;
export const WirePlan = z.object({ steps: z.array(WireStep), show: z.string(), language: z.enum(["en", "ta", "tanglish"]) });
export type WirePlan = z.infer<typeof WirePlan>;

const EMPTY: Omit<WireStep, "op" | "as"> = {
  layer: null, category: null, family: null, severity: null, status: null, dept: null, overdue: null, citizen: null, period_days: null, period_offset: null,
  government: null, kinds: null, of: null, near: null, meters: null, line: null, from: null, to: null, k: null, areas: null, beyond_m: null, by: null,
  area_kind: null, area_id: null, area_code: null, area_ref: null, area_radius_m: null, b_kind: null, b_id: null, b_code: null, b_ref: null, b_radius_m: null,
  before_days: null, before_offset: null
};

const areaOut = (a: AreaRef, p: "area" | "b") => a.kind === "ward" || a.kind === "zone" ? { [`${p}_kind`]: a.kind, [`${p}_id`]: a.id }
  : a.kind === "taluk" ? { [`${p}_kind`]: "taluk", [`${p}_code`]: a.code } : a.kind === "point" ? { [`${p}_kind`]: "point", [`${p}_ref`]: a.ref, [`${p}_radius_m`]: a.radius_m } : {};
function areaIn(s: WireStep, p: "area" | "b"): AreaRef | null {
  const k = s[`${p}_kind`];
  if (k === "ward" || k === "zone") return s[`${p}_id`] != null ? { kind: k, id: Math.round(s[`${p}_id`]!) } : null;
  if (k === "taluk") return s[`${p}_code`] ? { kind: "taluk", code: s[`${p}_code`]! } : null;
  if (k === "point") return s[`${p}_ref`] ? { kind: "point", ref: s[`${p}_ref`]!, radius_m: s[`${p}_radius_m`] ?? 1000 } : null;
  return null;
}
const periodOut = (p: Period | null) => (p && p.kind === "last_days" ? { period_days: p.days, period_offset: p.offset } : {});

export function toWire(plan: Plan): WirePlan {
  return {
    show: plan.show, language: plan.language,
    steps: plan.steps.map((s: Step): WireStep => {
      const base = { ...EMPTY, op: s.op, as: s.as } as WireStep;
      switch (s.op) {
        case "take": {
          const f = s.filter;
          return { ...base, layer: s.layer, ...(f ? { category: f.category, family: f.family, severity: f.severity, status: f.status, dept: f.dept, overdue: f.overdue, citizen: f.citizen, ...periodOut(f.period) } : {}),
            government: s.where?.government ?? null, kinds: s.where?.kinds ?? null };
        }
        case "within": return { ...base, of: s.of, near: s.near, meters: s.meters };
        case "inside": return { ...base, of: s.of, ...areaOut(s.area, "area") } as WireStep;
        case "along": return { ...base, of: s.of, line: s.line, meters: s.meters };
        case "nearest": return { ...base, from: s.from, to: s.to, k: s.k };
        case "farthest": return { ...base, areas: s.areas, from: s.from, beyond_m: s.beyond_m };
        case "count_by": return { ...base, of: s.of, by: s.by };
        case "hotspot": return { ...base, of: s.of };
        case "compare": return { ...base, of: s.of, ...areaOut(s.a, "area"), ...areaOut(s.b, "b") } as WireStep;
        case "change": return { ...base, of: s.of, ...periodOut(s.now), before_days: s.before.kind === "last_days" ? s.before.days : null, before_offset: s.before.kind === "last_days" ? s.before.offset : null };
      }
    })
  };
}

/** The typed plan from the form (unchecked: the caller runs checkPlan on it). */
export function fromWire(w: WirePlan): Plan {
  const steps = w.steps.map((s): Step => {
    const period: Period | null = s.period_days != null ? { kind: "last_days", days: Math.round(s.period_days), offset: Math.round(s.period_offset ?? 0) } : null;
    switch (s.op) {
      case "take": {
        const layer = s.layer ?? "incidents";
        const filter: Filter | null = layer === "incidents" ? { category: s.category, family: s.family, severity: s.severity as Filter["severity"], status: s.status ?? "open", dept: s.dept,
          overdue: s.overdue, citizen: s.citizen, period, text: null } : null;
        return { op: "take", as: s.as, layer, filter, where: layer === "incidents" || (s.government == null && !s.kinds) ? null : { government: s.government, kinds: s.kinds } };
      }
      case "within": return { op: "within", as: s.as, of: s.of ?? "", near: s.near ?? [], meters: s.meters ?? 500 };
      case "inside": return { op: "inside", as: s.as, of: s.of ?? "", area: areaIn(s, "area") ?? { kind: "zone", id: 0 } };
      case "along": return { op: "along", as: s.as, of: s.of ?? "", line: s.line ?? "", meters: s.meters ?? 75 };
      case "nearest": return { op: "nearest", as: s.as, from: s.from ?? "", to: s.to ?? "", k: Math.round(s.k ?? 1) };
      case "farthest": return { op: "farthest", as: s.as, areas: s.areas ?? "ward", from: s.from ?? "", beyond_m: s.beyond_m };
      case "count_by": return { op: "count_by", as: s.as, of: s.of ?? "", by: s.by ?? "ward" };
      case "hotspot": return { op: "hotspot", as: s.as, of: s.of ?? "" };
      case "compare": return { op: "compare", as: s.as, of: s.of ?? "", a: areaIn(s, "area") ?? { kind: "zone", id: 0 }, b: areaIn(s, "b") ?? { kind: "zone", id: 0 } };
      case "change": return { op: "change", as: s.as, of: s.of ?? "", now: period ?? { kind: "last_days", days: 7, offset: 0 },
        before: { kind: "last_days", days: Math.round(s.before_days ?? s.period_days ?? 7), offset: Math.round(s.before_offset ?? 1) } };
    }
  });
  // a model sometimes names the first step as the answer: the answer is the last step unless that one only takes a layer
  const last = steps[steps.length - 1];
  const show = steps.some((s) => s.as === w.show) && (w.show === last?.as || last?.op === "take") ? w.show : last?.as ?? w.show;
  return { steps, show, language: w.language };
}
