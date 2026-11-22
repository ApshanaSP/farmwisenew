/**
 * The plan as a flat form for AI models. Groq's and Gemini's strict JSON modes refuse a schema with one-of-several
 * shapes (the plan's steps, areas and periods), so the model fills one flat object per step, every field present and
 * null where unused; code turns it into the typed Plan (fromWire) and checks it like any other plan. toWire writes a
 * plan in the same form, for the examples, the rules' hint and the current plan of a follow-up. Pure.
 */
import { z } from "zod";
import { CALENDAR, isCalendar, type AreaRef, type CalendarKind, type Filter, type Period, type Plan, type Step } from "./plan";
import { LAYER_IDS, SEVS } from "./types";

const AreaW = { kind: z.enum(["ward", "zone", "taluk", "point"]).nullable(), id: z.number().nullable(), code: z.string().nullable(), ref: z.string().nullable(), radius_m: z.number().nullable() };
export const WireStep = z.object({
  op: z.enum(["take", "within", "inside", "along", "nearest", "farthest", "count_by", "hotspot", "compare", "change", "rank", "speed"]),
  as: z.string(),
  layer: z.enum(LAYER_IDS).nullable(),
  category: z.array(z.string()).nullable(), family: z.array(z.string()).nullable(), severity: z.array(z.enum(SEVS as [string, ...string[]])).nullable(),
  status: z.enum(["open", "closed", "any"]).nullable(), dept: z.array(z.string()).nullable(), overdue: z.boolean().nullable(), citizen: z.boolean().nullable(),
  news: z.boolean().nullable().describe("true = only incidents a news outlet reported"),
  period_days: z.number().nullable().describe("last N days; null = any time"), period_offset: z.number().nullable().describe("0 = ending now, 1 = the window before"),
  period_calendar: z.enum(["day", "week", "month", "quarter"]).nullable()
    .describe("a calendar day (from midnight), week (Monday to Sunday), month or quarter, with period_offset (0 = the current one up to now, 1 = the one before) and period_days null; null = period_days counts back from now"),
  government: z.boolean().nullable(), kinds: z.array(z.string()).nullable(),
  of: z.string().nullable(), near: z.array(z.string()).nullable(), meters: z.number().nullable(), line: z.string().nullable(),
  from: z.string().nullable(), to: z.string().nullable(), k: z.number().nullable(), areas: z.enum(["ward", "zone", "place"]).nullable(), beyond_m: z.number().nullable(),
  by: z.enum(["ward", "zone", "taluk", "hex500", "near", "category", "dept"]).nullable(),
  area_kind: AreaW.kind, area_id: AreaW.id, area_code: AreaW.code, area_ref: AreaW.ref, area_radius_m: AreaW.radius_m,
  b_kind: AreaW.kind, b_id: AreaW.id, b_code: AreaW.code, b_ref: AreaW.ref, b_radius_m: AreaW.radius_m,
  before_days: z.number().nullable(), before_offset: z.number().nullable(),
  /** rank: the biggest rise first, or the biggest fall */
  order: z.enum(["rise", "fall", "fast", "slow"]).nullable(),
  /** v3: count_by with the fewest first */
  fewest_first: z.boolean().nullable().describe("count_by only: true ONLY when the question asks for the least, fewest or lowest (least complaints zone); false or null for most, highest, worst, top, which has the most"),
  /** v3: count_by ward/zone/taluk ranked by cases for every 10,000 people living there (population: Kontur, 2023) */
  per_people: z.boolean().nullable().describe("count_by ward, zone or taluk only: true when the question asks per person, per head, per capita, for its population or 'relative to how many people live there'; else null")
});
export type WireStep = z.infer<typeof WireStep>;
export const WirePlan = z.object({
  /** false when the text is not a question about incidents, places or facilities in Chennai (gibberish, chit-chat): no plan is run */
  understood: z.boolean().describe("true for every question about Chennai places, problems, facilities or areas, however short or loosely typed (one word too); false only when intent is not_map"),
  /** v2 (AI only): what kind of answer the question needs; the plan's steps serve it (brief and scorecard: the area of an inside step) */
  /** v2: what the question names, written before the steps: the steps must use them */
  named_categories: z.array(z.string()).describe("the category codes (or family codes for broad words such as flooding, crime) of the kinds of problem the question names (from WORDS PEOPLE USE, misspelt or not); [] if none"),
  named_layers: z.array(z.enum(LAYER_IDS)).describe("the facility layers the question names (schools, liquor, atms...), not incidents; [] if none"),
  named_places: z.array(z.string()).describe("the place refs (from the prompt's list) of the places the question names, as the question means them (in X: its zone or taluk ref; near X: its point ref); [] if none"),
  named_zone: z.number().describe("the zone number the question names (1-15), or -1"),
  named_ward: z.number().describe("the ward number the question names (1-200), or -1"),
  every_kind: z.boolean().describe("FOLLOW-UPS ONLY. True when the follow-up leaves the current plan's kind of problem to ask about all kinds together (after garbage in zone 9: 'all incidents in zone 9', 'total complaints', 'everything there'). False on a first question, and false whenever this question names a kind of problem itself (accidents, suicide, dogs, flooding, trees, police)."),
  points_at_previous: z.boolean().describe("true only when a follow-up points at a place of the previous answer in words (there, that place, that school, the first, the second one, number 2); false otherwise, also for follow-ups that only change the problem, time, status or distance"),
  intent: z.enum(["plan", "brief", "scorecard", "city", "not_map"]).describe("plan: a map answer; brief: what is happening in one area; scorecard: a ward's scorecard; city: the live state of the city now; not_map: not a map question"),
  city: z.enum(["traffic", "rain", "forecast", "flood", "power", "metro", "none"]).describe("for intent city: live traffic, the rain now, the rain forecast (will it rain, tomorrow, next hours, where will it rain most), streets that flood, power cuts, trains running; else none"),
  steps: z.array(WireStep), show: z.string(), language: z.enum(["en", "ta", "tanglish"])
});
export type WirePlan = z.infer<typeof WirePlan>;

const EMPTY: Omit<WireStep, "op" | "as"> = {
  layer: null, category: null, family: null, severity: null, status: null, dept: null, overdue: null, citizen: null, news: null, period_days: null, period_offset: null, period_calendar: null,
  government: null, kinds: null, of: null, near: null, meters: null, line: null, from: null, to: null, k: null, areas: null, beyond_m: null, by: null,
  area_kind: null, area_id: null, area_code: null, area_ref: null, area_radius_m: null, b_kind: null, b_id: null, b_code: null, b_ref: null, b_radius_m: null,
  before_days: null, before_offset: null, order: null, per_people: null, fewest_first: null
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
// a calendar period ("today", "last week") travels as period_calendar, so a follow-up's current plan keeps it (fixall3-map-today)
const periodOut = (p: Period | null) => (p && p.kind === "last_days" ? { period_days: p.days, period_offset: p.offset }
  : isCalendar(p) ? { period_calendar: p.kind, period_offset: p.offset } : {});
type CalendarPeriod = Extract<Period, { kind: CalendarKind }>;
const calendarIn = (k: WireStep["period_calendar"], offset: number | null | undefined): CalendarPeriod | null =>
  k && Object.prototype.hasOwnProperty.call(CALENDAR, k) ? ({ kind: k, offset: Math.round(offset ?? 0) } as CalendarPeriod) : null;

export function toWire(plan: Plan): WirePlan {
  return {
    understood: true, named_categories: [], named_layers: [], named_places: [], named_zone: -1, named_ward: -1, every_kind: false, points_at_previous: false, intent: "plan", city: "none", show: plan.show, language: plan.language,
    steps: plan.steps.map((s: Step): WireStep => {
      const base = { ...EMPTY, op: s.op, as: s.as } as WireStep;
      switch (s.op) {
        case "take": {
          const f = s.filter;
          return { ...base, layer: s.layer, ...(f ? { category: f.category, family: f.family, severity: f.severity, status: f.status, dept: f.dept, overdue: f.overdue, citizen: f.citizen, news: f.news ?? null, ...periodOut(f.period) } : {}),
            government: s.where?.government ?? null, kinds: s.where?.kinds ?? null };
        }
        case "within": return { ...base, of: s.of, near: s.near, meters: s.meters };
        case "inside": return { ...base, of: s.of, ...areaOut(s.area, "area") } as WireStep;
        case "along": return { ...base, of: s.of, line: s.line, meters: s.meters };
        case "nearest": return { ...base, from: s.from, to: s.to, k: s.k };
        case "farthest": return { ...base, areas: s.areas, from: s.from, beyond_m: s.beyond_m };
        case "count_by": return { ...base, of: s.of, by: s.by, per_people: s.per === "people" ? true : null, fewest_first: s.fewest ? true : null };
        case "hotspot": return { ...base, of: s.of };
        case "compare": return { ...base, of: s.of, ...areaOut(s.a, "area"), ...areaOut(s.b, "b") } as WireStep;
        case "change": return { ...base, of: s.of, ...periodOut(s.now), before_days: s.before.kind === "last_days" ? s.before.days : null,
          before_offset: s.before.kind === "last_days" || isCalendar(s.before) ? s.before.offset : null };
        case "rank": return { ...base, of: s.of, by: s.by, order: s.order };
        case "speed": return { ...base, of: s.of, by: s.by, order: s.order };
      }
    })
  };
}

/** The typed plan from the form (unchecked: the caller runs checkPlan on it). */
export function fromWire(w: WirePlan): Plan {
  const steps = w.steps.map((s): Step => {
    const cal = calendarIn(s.period_calendar, s.period_offset);
    const period: Period | null = cal ?? (s.period_days != null ? { kind: "last_days", days: Math.round(s.period_days), offset: Math.round(s.period_offset ?? 0) } : null);
    switch (s.op) {
      case "take": {
        const layer = s.layer ?? "incidents";
        const filter: Filter | null = layer === "incidents" ? { category: s.category, family: s.family, severity: s.severity as Filter["severity"], status: s.status ?? "open", dept: s.dept,
          overdue: s.overdue, citizen: s.citizen, ...(s.news != null ? { news: s.news } : {}), period, text: null } : null;
        return { op: "take", as: s.as, layer, filter, where: layer === "incidents" || (s.government == null && !s.kinds) ? null : { government: s.government, kinds: s.kinds } };
      }
      case "within": return { op: "within", as: s.as, of: s.of ?? "", near: s.near ?? [], meters: s.meters ?? 500 };
      case "inside": return { op: "inside", as: s.as, of: s.of ?? "", area: areaIn(s, "area") ?? { kind: "zone", id: 0 } };
      case "along": return { op: "along", as: s.as, of: s.of ?? "", line: s.line ?? "", meters: s.meters ?? 75 };
      case "nearest": return { op: "nearest", as: s.as, from: s.from ?? "", to: s.to ?? "", k: Math.round(s.k ?? 1) };
      case "farthest": return { op: "farthest", as: s.as, areas: s.areas ?? "ward", from: s.from ?? "", beyond_m: s.beyond_m };
      case "count_by": return { op: "count_by", as: s.as, of: s.of ?? "", by: s.by ?? "ward", ...(s.per_people && (s.by === "ward" || s.by === "zone" || s.by === "taluk") ? { per: "people" as const } : {}), ...(s.fewest_first === true ? { fewest: true } : {}) };
      case "hotspot": return { op: "hotspot", as: s.as, of: s.of ?? "" };
      case "compare": return { op: "compare", as: s.as, of: s.of ?? "", a: areaIn(s, "area") ?? { kind: "zone", id: 0 }, b: areaIn(s, "b") ?? { kind: "zone", id: 0 } };
      case "change": return { op: "change", as: s.as, of: s.of ?? "", now: period ?? { kind: "last_days", days: 7, offset: 0 },
        before: cal ? ({ kind: cal.kind, offset: Math.round(s.before_offset ?? cal.offset + 1) } as CalendarPeriod)
          : { kind: "last_days", days: Math.round(s.before_days ?? s.period_days ?? 7), offset: Math.round(s.before_offset ?? 1) } };
      case "rank": return { op: "rank", as: s.as, of: s.of ?? "", by: s.by === "zone" || s.by === "taluk" ? s.by : "ward", order: s.order === "fall" ? "fall" : "rise" };
      case "speed": return { op: "speed", as: s.as, of: s.of ?? "", by: s.by === "zone" || s.by === "taluk" || s.by === "category" || s.by === "dept" ? s.by : "ward", order: s.order === "slow" ? "slow" : "fast" };
    }
  });
  // a model sometimes names the first step as the answer: the answer is the last step unless that one only takes a layer
  const last = steps[steps.length - 1];
  const show = steps.some((s) => s.as === w.show) && (w.show === last?.as || last?.op === "take") ? w.show : last?.as ?? w.show;
  return { steps, show, language: w.language };
}
