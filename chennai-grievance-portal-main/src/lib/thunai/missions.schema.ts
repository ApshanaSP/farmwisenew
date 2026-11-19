/**
 * Composable missions, as data (Pillar 4): a plan of steps the planner emits and code runs. A step is one of four kinds, nothing
 * else, so neither the rules nor a model can put a send, an approval or a delete into a mission:
 *   screen   a Stage screen built by code (a recipe and its slots, the same vocabulary as agent.ts)       Level A
 *   console  1-3 console moves of the Level-A kinds only (page, period, view, panel, mapMode, layer)       Level A
 *   focus    the map pointed at a zone or a place (and, on a tour, the code-counted figure for it)        Level A
 *   draft    drafts into the Collector's tray for a named list of incidents; never a send                 Level C
 * Every label is code-written or checked: no figure of any script or spelling survives in one (numbergate.ts figuresIn).
 * Client-safe: no model, no data, no server import.
 */
import { z } from "zod";
import { LAYERS } from "./plan";
import { figuresIn } from "./numbergate";
import { asksForbidden } from "./privacy";
import { planRisk, riskOf, type Risk } from "./risk";
import { RECIPES, type Recipe } from "./stage";
import { PANELS, type Lang, type Step } from "./types";

const PAGES = ["overview", "briefing", "trends", "environment", "studio"] as const;
const PERIODS = ["daily", "weekly", "monthly", "quarterly"] as const;
const SEVS = ["Severe", "High", "Medium", "Low"] as const;

export const MIN_STEPS = 3;
export const MAX_STEPS = 6;
/** drafts one step may put in the tray */
export const MAX_DRAFTS = 5;

const Bi = z.object({ en: z.string().min(1).max(120), ta: z.string().min(1).max(200) });
export type Bilingual = z.infer<typeof Bi>;
const Id = z.string().regex(/^[a-z0-9]{1,12}$/);
const IncId = z.string().regex(/^INC-[A-Za-z0-9_-]{1,60}$/);

/** the console moves a mission may make: Level A only (risk.ts), each the shape of the Step it is */
export const CONSOLE_MOVES = ["page", "period", "view", "panel", "mapMode", "layer"] as const;
const View = z.object({
  zone: z.number().int().min(1).max(15).nullable().optional(), dept: z.string().max(30).nullable().optional(), cat: z.string().max(60).nullable().optional(),
  taluk: z.string().max(20).nullable().optional(), sev: z.enum(SEVS).nullable().optional()
}).strict();
export const ConsoleMove = z.discriminatedUnion("a", [
  z.object({ a: z.literal("page"), page: z.enum(PAGES) }).strict(),
  z.object({ a: z.literal("period"), period: z.enum(PERIODS) }).strict(),
  z.object({ a: z.literal("view"), view: View }).strict(),
  z.object({ a: z.literal("panel"), panel: z.enum(PANELS) }).strict(),
  z.object({ a: z.literal("mapMode"), mode: z.enum(["zones", "taluks"]) }).strict(),
  z.object({ a: z.literal("layer"), layer: z.enum(LAYERS), on: z.boolean().nullable() }).strict()
]);
export type ConsoleMoveT = z.infer<typeof ConsoleMove>;

/** a zone or a place of the district, by the world's own names */
export const MissionPlace = z.object({
  name: z.string().min(1).max(80), ta: z.string().max(80).nullable(), zone: z.number().int().min(1).max(15).nullable(), taluk: z.string().regex(/^TLK-[A-Z]{3}$/).nullable()
});
export type MissionPlaceT = z.infer<typeof MissionPlace>;
/** a tour stop: the zone's rank and its count, both computed by code from the data (never by a model) */
export const TourNote = z.object({ rank: z.number().int().min(1).max(15), n: z.number().int().min(0).max(1_000_000), measure: z.literal("flood_open") });
export type TourNoteT = z.infer<typeof TourNote>;

const MissionRecipe = z.enum(RECIPES).refine((r) => r !== "answer", "an answer screen needs a model's reading: not a mission step");
const common = { id: Id, label: Bi };
export const ScreenStep = z.object({ kind: z.literal("screen"), ...common, risk: z.literal("A"), recipe: MissionRecipe, slots: z.record(z.unknown()) }).strict();
export const ConsoleStep = z.object({ kind: z.literal("console"), ...common, risk: z.literal("A"), moves: z.array(ConsoleMove).min(1).max(3) }).strict();
export const FocusStep = z.object({ kind: z.literal("focus"), ...common, risk: z.literal("A"), place: MissionPlace, tour: TourNote.nullable() }).strict();
/** ids named outright, or the cases a cases screen of this plan showed (`from`, a step id), the overdue ones or all, at most n */
export const DraftStep = z.object({
  kind: z.literal("draft"), ...common, risk: z.literal("C"), ids: z.array(IncId).max(MAX_DRAFTS), from: Id.nullable(), only: z.enum(["overdue", "all"]), n: z.number().int().min(1).max(MAX_DRAFTS)
}).strict();
export const MissionStep = z.discriminatedUnion("kind", [ScreenStep, ConsoleStep, FocusStep, DraftStep]);
export type MissionStepT = z.infer<typeof MissionStep>;
export type ScreenStepT = z.infer<typeof ScreenStep>;
export type DraftStepT = z.infer<typeof DraftStep>;
export type FocusStepT = z.infer<typeof FocusStep>;

const planShape = {
  v: z.literal(1), id: z.string().min(1).max(40), title: Bi, lang: z.enum(["en", "ta"]),
  /** who wrote it: a rules template, the spoken map tour, a model's plan (checked step by step), or a redirect's tail */
  source: z.enum(["rules", "tour", "model"]), risk: z.enum(["A", "C"])
};
/** A new mission: 3 to 6 steps. */
export const MissionPlan = z.object({ ...planShape, steps: z.array(MissionStep).min(MIN_STEPS).max(MAX_STEPS) }).strict();
/** What replaces the rest of a running mission ("instead show me Adyar's drains"), or an edited card: 1 to 6 steps. */
export const MissionTail = z.object({ ...planShape, steps: z.array(MissionStep).min(1).max(MAX_STEPS) }).strict();
export type MissionPlanT = z.infer<typeof MissionTail>;

// ------------------------------------------------------------------ risk --

/** A step's level by risk.ts: screens and a map focus show (A), console moves are their own steps' level, a draft fills the tray (C). */
export function stepRisk(s: MissionStepT): Risk {
  if (s.kind === "console") return planRisk(s.moves as Step[]);
  if (s.kind === "draft") return riskOf({ a: "draft" });
  if (s.kind === "focus") return riskOf({ a: "zoom", target: s.place.name });
  return "A";
}
export const missionRisk = (steps: MissionStepT[]): "A" | "C" => (steps.some((s) => stepRisk(s) === "C") ? "C" : "A");

/** What a mission may never do, as a step's kind or a move's action: send, approve, confirm, delete, or anything else outward but a draft into the tray. */
export const OUTWARD = /(?:^|[^a-z])(?:send|approv|confirm|delet|discard|reject|submit|forward|publish|dispatch|e-?mail|sms|whatsapp|notify|resolv|escalat|sanction)/i;
const KINDS = new Set(["screen", "console", "focus", "draft"]);

/** A step that would act outward, said in any of the step's own words: the whole plan is refused for it. */
export function wouldActOutward(raw: Record<string, unknown>): boolean {
  const kind = String(raw.kind ?? raw.type ?? "");
  if (!KINDS.has(kind) && OUTWARD.test(kind)) return true;
  const moves = Array.isArray(raw.moves) ? (raw.moves as Record<string, unknown>[]) : [];
  for (const m of moves) if (OUTWARD.test(String(m?.action ?? m?.a ?? ""))) return true;
  const words = [raw.label, raw.text, raw.op, ...moves.map((m) => m?.text)].filter((x): x is string => typeof x === "string");
  return words.some((x) => asksForbidden(x));
}

// ------------------------------------------------------------------ labels --

/**
 * A label a model wrote: clipped, and any figure in it (digits of any script, number words in English, Tamil or Tanglish, lakh and
 * crore, a percent) taken out. A label that still holds a figure after that, or is left with no word, or orders something outward,
 * gives way to the code's own label.
 */
export function cleanLabel(raw: unknown, fallback: string, max = 60): string {
  if (typeof raw !== "string") return fallback;
  let s = raw.replace(/\s+/g, " ").trim().slice(0, max);
  for (let k = 0; k < 4; k++) {
    const figs = figuresIn(s);
    if (!figs.length && !/\p{Nd}/u.test(s)) break;
    for (const f of figs) s = s.split(f.raw).join(" ");
    // what a figure leaves behind: its digits in another script, a percent sign or word
    s = s.replace(/\p{Nd}+(?:[.,]\p{Nd}+)*/gu, " ").replace(/%|\bper\s*cent\b|\bpercent\b|சதவீத[஀-௿]*/giu, " ").replace(/\s+([,.;:])/g, "$1").replace(/\s+/g, " ").trim();
  }
  s = s.replace(/^[\s,.;:–-]+|[\s,;:–-]+$/g, "").trim();
  // a word is left: three letters with their vowel signs (Tamil letters carry them as marks)
  if (!s || figuresIn(s).length || /\p{Nd}/u.test(s) || !/(?:\p{L}\p{M}*){3,}/u.test(s) || asksForbidden(s)) return fallback;
  return s;
}

/** true when no figure of any kind is in either language of a label */
export const labelClean = (b: Bilingual): boolean => [b.en, b.ta].every((x) => !figuresIn(x).length && !/\p{Nd}/u.test(x));

// ------------------------------------------------------------------ edits --

/**
 * The Collector's edit of a plan card before Start: the plan's own steps, some left out or put in another order, never a new one
 * (a step that is not one of the plan's, or that was changed, is refused), and a draft only after the screen it drafts from.
 */
export function checkEdit(current: MissionStepT[], edited: unknown): { ok: true; steps: MissionStepT[] } | { ok: false; why: string } {
  if (!Array.isArray(edited) || !edited.length) return { ok: false, why: "empty" };
  if (edited.length > MAX_STEPS) return { ok: false, why: "too many" };
  const byId = new Map(current.map((s) => [s.id, s]));
  const out: MissionStepT[] = [];
  const seen = new Set<string>();
  for (const e of edited) {
    const id = typeof e === "string" ? e : (e as { id?: unknown })?.id;
    const s = typeof id === "string" ? byId.get(id) : undefined;
    if (!s || seen.has(s.id)) return { ok: false, why: "not one of the plan's steps" };
    if (typeof e !== "string" && JSON.stringify(e) !== JSON.stringify(s)) return { ok: false, why: "a step was changed" };
    seen.add(s.id);
    out.push(s);
  }
  const why = refsProblem(out);
  return why ? { ok: false, why } : { ok: true, steps: out };
}

/** A draft step's `from` must name a cases screen before it in the same list. */
export function refsProblem(steps: MissionStepT[]): string | null {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind !== "draft" || !s.from) continue;
    const j = steps.findIndex((x) => x.id === s.from);
    if (j < 0 || j >= i) return "a draft before its list";
    const src = steps[j];
    if (src.kind !== "screen" || src.recipe !== "cases") return "a draft from something that is not a list of cases";
  }
  return null;
}

/** A runnable plan, as the executor accepts it: the closed schema, clean labels, sound references, Level C only as drafts. */
export function checkRunnable(raw: unknown): { ok: true; plan: MissionPlanT } | { ok: false; why: string } {
  const r = MissionTail.safeParse(raw);
  if (!r.success) return { ok: false, why: `${r.error.issues[0]?.path.join(".")}: ${r.error.issues[0]?.message}` };
  const p = r.data;
  if (!labelClean(p.title) || p.steps.some((s) => !labelClean(s.label))) return { ok: false, why: "a figure in a label" };
  if (p.steps.some((s) => stepRisk(s) !== s.risk)) return { ok: false, why: "a step's level is not its own" };
  if (new Set(p.steps.map((s) => s.id)).size !== p.steps.length) return { ok: false, why: "two steps share an id" };
  const why = refsProblem(p.steps);
  return why ? { ok: false, why } : { ok: true, plan: p };
}

export type { Lang, Recipe };
