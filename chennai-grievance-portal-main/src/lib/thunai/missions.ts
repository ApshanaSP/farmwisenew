/**
 * Composable missions, planned (Pillar 4; server side). One sentence in ("build me a water-crisis board for Velachery"), one plan
 * out: 3 to 6 steps as data (missions.schema.ts) that the browser shows as a card and runs only after the Collector's Start
 * (missions.run.ts). The planner emits the plan; code executes it.
 *
 * In order, as the round does: the code-level refusals (privacy, never send / approve / delete: router.ts routeByRules), then the
 * rules templates for the common missions (a water-crisis or flood board for a place, the morning brief, monsoon readiness, the
 * spoken flood-risk tour), then, for a redirect ("instead show me Adyar's drains"), the fast lane's reading of it; only then one
 * model call (callLlm) with the mission schema, checked step by step: an unknown recipe or slot is dropped (agent.ts checkScreen),
 * a console move that is not Level A is dropped, a step that would send, approve or delete refuses the whole plan, and a figure
 * in a model's label is taken out. Every label the plan carries is code-written or checked, and every sentence said while it runs
 * is a code template (missions.words.ts): no model figure reaches speech.
 */
import { z } from "zod";
import type { ToolResult } from "@/lib/assistant/types";
import { checkScreen, Screen } from "./agent";
import { callLlm, type LlmDeps } from "./llm";
import { detectLang } from "./normalise";
import { AiStep, checkPlan, type AiPlan, type AiStepT } from "./plan";
import { NEVER_REPLY, PRIVACY_REPLY } from "./privacy";
import { quickScreen } from "./quick";
import { riskOf } from "./risk";
import { routeByRules } from "./router";
import { emptySlots } from "./screens";
import { RECIPES, type Recipe } from "./stage";
import {
  cleanLabel, ConsoleMove, CONSOLE_MOVES, MAX_STEPS, MIN_STEPS, MissionPlan, MissionTail, missionRisk, refsProblem, wouldActOutward,
  type Bilingual, type ConsoleMoveT, type MissionPlaceT, type MissionPlanT, type MissionStepT
} from "./missions.schema";
import { consoleLabel, draftLabel, focusLabel, missionIntent, placeIn, placeSlots, screenLabel, TITLES, zonePlace, type MissionTemplate } from "./missions.words";
import type { Lang, ScreenState, Step, World } from "./types";

export const MISSION_V = "thunai-mission-v1";
const FLOOD = "FLOOD_WATERLOGGING";
const DRAINS = "GCC-SWD";
/** the budget of the one planning call (a command's 8 s; the run itself is the browser's) */
export const PLAN_MS = 8000;

export const MissionBody = z.object({
  text: z.string().min(1).max(300),
  lang: z.enum(["en", "ta"]).optional(),
  /** the open Stage, as the round takes it: read for nothing but its presence here */
  stage: z.unknown().optional(),
  state: z.record(z.unknown()).nullable().optional(),
  /** "instead X" during a run: a plan for the rest, which may be a single step */
  redirect: z.boolean().optional()
});
export type MissionBodyT = z.infer<typeof MissionBody>;

export interface MissionCtx { world: World; lang?: Lang; state?: Partial<ScreenState> | null; redirect?: boolean }
export interface MissionDeps {
  /** who is asking, for the ledger */
  user: string;
  llm?: LlmDeps;
  signal?: AbortSignal;
  /** when the planning call must have answered (ms since the epoch) */
  until?: number;
  /** the read-only tools, redacted (the tour counts zones with them) */
  tool?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  now?: () => number;
}
export type Planned =
  | { kind: "plan"; plan: MissionPlanT; via: "rules" | "tour" | "quick" | "model"; model: string | null }
  | { kind: "refuse"; why: string; reply: Bilingual }
  | { kind: "none"; why: string; reply: Bilingual };

const NONE_REPLY: Bilingual = { en: "I couldn't make a plan of that. Ask me for one screen at a time, or say it another way.", ta: "அதற்குத் திட்டம் போட முடியவில்லை. ஒவ்வொரு திரையாகக் கேளுங்கள், அல்லது வேறு மாதிரி சொல்லுங்கள்." };
const NO_MODEL_REPLY: Bilingual = { en: "I can't plan that right now. The ready-made missions still work: a flood board for a place, monsoon readiness, the morning brief.", ta: "இப்போது அதைத் திட்டமிட முடியவில்லை. தயாரான பணிகள் வேலை செய்யும்: ஒரு இடத்துக்கான வெள்ளப் பலகை, பருவமழைத் தயார்நிலை, காலைச் சுருக்கம்." };
const NO_DATA_REPLY: Bilingual = { en: "I can't read the zones' figures right now, so there's no tour to give.", ta: "மண்டலங்களின் தரவை இப்போது படிக்க முடியவில்லை, அதனால் சுற்றிக் காட்ட முடியாது." };

// ------------------------------------------------------------------ steps, built by code --

/** the slots a screen keeps: what was set, nothing empty (the Stage's own defaults fill the rest) */
function compact(s: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(s).filter(([k, v]) => v != null && v !== false && !(Array.isArray(v) && !v.length) && !(k === "order" && v === "top")));
}

/** A screen step, its slots checked against the world as a model's would be (agent.ts checkScreen); null when nothing usable is left. */
export function screenStep(id: string, recipe: Recipe, raw: Record<string, unknown>, w: World): MissionStepT | null {
  if (recipe === "answer") return null;
  const sc = checkScreen({ ...emptySlots(), ...raw, recipe }, w, null);
  const checked = sc?.recipe;
  if (!sc || !checked || checked === "answer") return null;
  const slots = compact(sc.slots as unknown as Record<string, unknown>);
  return { kind: "screen", id, label: screenLabel(checked, slots, w), risk: "A", recipe: checked, slots };
}
const focusStep = (id: string, place: MissionPlaceT): MissionStepT => ({ kind: "focus", id, label: focusLabel(place), risk: "A", place, tour: null });
const draftStep = (id: string, from: string, only: "overdue" | "all", n = 3): MissionStepT => ({ kind: "draft", id, label: draftLabel(only), risk: riskOf({ a: "draft" }) as "C", ids: [], from, only, n });
function consoleStep(id: string, moves: ConsoleMoveT[], w: World): MissionStepT | null {
  const ok = moves.filter((m) => ConsoleMove.safeParse(m).success && riskOf(m as Step) === "A").slice(0, 3);
  return ok.length ? { kind: "console", id, label: consoleLabel(ok, w), risk: "A", moves: ok } : null;
}

/** numbered s1, s2, ... in order, with every draft still pointing at its own list */
function ordered(steps: (MissionStepT | null)[]): MissionStepT[] {
  const kept = steps.filter((s): s is MissionStepT => !!s);
  const id = new Map(kept.map((s, i) => [s.id, `s${i + 1}`]));
  return kept.map((s) => (s.kind === "draft" ? { ...s, id: id.get(s.id) as string, from: s.from ? id.get(s.from) ?? null : null } : { ...s, id: id.get(s.id) as string }))
    .filter((s) => s.kind !== "draft" || !!s.from || s.ids.length > 0);
}

const planId = (now: number) => `ms-${now.toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;

function wrap(title: Bilingual, steps: MissionStepT[], lang: Lang, source: MissionPlanT["source"], now: number, tail: boolean): MissionPlanT | null {
  const plan = { v: 1 as const, id: planId(now), title, lang, source, risk: missionRisk(steps), steps };
  const r = (tail ? MissionTail : MissionPlan).safeParse(plan);
  if (!r.success || refsProblem(r.data.steps)) {
    console.error(`[jarvis mission] a plan failed its own schema: ${r.success ? refsProblem(r.data.steps) : r.error.issues[0]?.message}`);
    return null;
  }
  return r.data;
}

// ------------------------------------------------------------------ the templates --

/**
 * The ready-made missions, written as data. A water-crisis board for a place: its flooding cases, how the drains team is doing, the
 * reservoirs, the rain, the map on the place, and drafts for the overdue ones. Monsoon readiness: the rain, the reservoirs, the console
 * on today's flooding, the flood hotspots, the overdue flooding cases and drafts for them. The morning brief: the day's brief, today's
 * severe cases, the overdue ones, the zones that need attention, the day's news.
 */
export function templatePlan(template: Exclude<MissionTemplate, "tour">, place: MissionPlaceT | null, w: World, lang: Lang, now = Date.now()): MissionPlanT | null {
  const at = placeSlots(place);
  const drains = w.depts.some((d) => d.code === DRAINS);
  let title: Bilingual;
  let steps: (MissionStepT | null)[];
  if (template === "flood") {
    title = TITLES.flood(place);
    steps = [
      screenStep("a", "cases", { cat: FLOOD, status: "open", period: "weekly", sort: "priority", n: 20, fresh: true, ...at }, w),
      screenStep("b", "performance", { by: "dept", period: "weekly", ...(drains ? { dept: DRAINS } : {}) }, w),
      screenStep("c", "readings", { metric: "lakes" }, w),
      screenStep("d", "readings", { metric: "rain", ...(place?.zone ? { zones: [place.zone] } : {}) }, w),
      place ? focusStep("e", place) : screenStep("e", "map", { what: "hotspots", cat: FLOOD, period: "weekly" }, w),
      draftStep("f", "a", "overdue")
    ];
  } else if (template === "monsoon") {
    title = TITLES.monsoon();
    steps = [
      screenStep("a", "readings", { metric: "rain", ...(place?.zone ? { zones: [place.zone] } : {}) }, w),
      screenStep("b", "readings", { metric: "lakes" }, w),
      consoleStep("c", [{ a: "page", page: "overview" }, { a: "view", view: { cat: FLOOD, ...(place?.zone ? { zone: place.zone } : place?.taluk ? { taluk: place.taluk } : {}) } }, { a: "period", period: "daily" }], w),
      screenStep("d", "map", { what: "hotspots", cat: FLOOD, period: "weekly", ...(place?.zone ? { zones: [place.zone] } : {}) }, w),
      screenStep("e", "cases", { cat: FLOOD, status: "overdue", period: "weekly", sort: "priority", n: 20, fresh: true, ...at }, w),
      draftStep("f", "e", "overdue")
    ];
  } else {
    title = TITLES.brief();
    steps = [
      screenStep("a", "brief", { period: "daily" }, w),
      screenStep("b", "cases", { sev: "Severe", period: "daily", sort: "priority", n: 20, fresh: true, ...at }, w),
      screenStep("c", "cases", { status: "overdue", period: "weekly", sort: "priority", n: 20, fresh: true, ...at }, w),
      screenStep("d", "ranking", { measure: "zone_attention", n: 5, period: "daily" }, w),
      screenStep("e", "news", { period: "daily", ...(place?.zone ? { zones: [place.zone] } : {}) }, w)
    ];
  }
  return wrap(title, ordered(steps), lang, "rules", now, false);
}

/**
 * The spoken map tour of the flood risk: the zones ranked by a measure code computes (open flooding and waterlogging incidents reported
 * this week, from the zones tool), worst first, one map stop per zone, at most five. null when the figures cannot be read.
 */
export async function tourPlan(w: World, lang: Lang, tool: MissionDeps["tool"], now = Date.now()): Promise<MissionPlanT | null> {
  if (!tool) return null;
  let r: ToolResult;
  try { r = await tool("zones", { scope: { period: "weekly", zone: null, dept: null, cat: FLOOD, taluk: null } }); } catch { return null; }
  const rows = ((r?.data as { rows?: unknown[] } | undefined)?.rows ?? []) as Record<string, unknown>[];
  const seen = new Set<number>();
  const counts = rows.map((x) => ({ zone: Number(x.zone), n: Math.round(Number(x.open)) }))
    .filter((x) => Number.isInteger(x.zone) && w.zones.some((z) => z.n === x.zone) && Number.isFinite(x.n) && x.n >= 0 && !seen.has(x.zone) && (seen.add(x.zone), true))
    .sort((a, b) => b.n - a.n || a.zone - b.zone)
    .slice(0, 5);
  if (counts.length < MIN_STEPS) return null;
  const steps: MissionStepT[] = counts.map((c, k) => {
    const place = zonePlace(w, c.zone);
    return { kind: "focus", id: `s${k + 1}`, label: focusLabel(place), risk: "A", place, tour: { rank: k + 1, n: c.n, measure: "flood_open" } };
  });
  return wrap(TITLES.tour(), steps, lang, "tour", now, false);
}

/** A redirect the fast lane can read ("show me Adyar's drains"): its one screen, and the map on its place. */
function quickTail(text: string, w: World, lang: Lang, now: number): MissionPlanT | null {
  const plain = text.replace(/(\p{L})['’]s(?![\p{L}])/gu, "$1");
  const q = quickScreen(plain, w, { noBail: true });
  if (!q || !(RECIPES as readonly string[]).includes(q.recipe)) return null;
  // the span a request named is a rules-lane slot the checker does not keep: the screen keeps its window
  const s = screenStep("a", q.recipe, q.slots, w);
  if (!s) return null;
  const place = placeIn(plain, w);
  const steps = ordered([s, place ? focusStep("b", place) : null]);
  const lbl = s.label;
  return wrap(lbl, steps, lang, "rules", now, true);
}

// ------------------------------------------------------------------ the model --

const ModelStep = z.object({
  kind: z.enum(["screen", "console", "focus", "draft"]),
  label: z.string().nullable().describe("2-6 words saying what the step shows, in the Collector's language; never a figure"),
  screen: Screen.nullable().describe("kind screen: the recipe and only the slots it uses"),
  moves: z.array(AiStep).max(3).describe("kind console: 1-3 console moves; else []"),
  place: z.string().nullable().describe("kind focus: a zone name or a locality"),
  draftOf: z.number().int().nullable().describe("kind draft: the number (1-based) of the earlier cases step whose cases get drafts"),
  only: z.enum(["overdue", "all"]).nullable().describe("kind draft: overdue ones only, or all")
});
export const ModelPlan = z.object({
  kind: z.enum(["plan", "refuse"]),
  title: z.string().nullable().describe("2-6 words, never a figure"),
  steps: z.array(ModelStep).max(MAX_STEPS)
});
export type ModelPlanT = z.infer<typeof ModelPlan>;
const ModelPlanLenient = z.object({ kind: z.string(), title: z.string().nullish(), steps: z.array(z.record(z.unknown())).nullish() }).transform((p) => p as unknown as ModelPlanT);

export function missionSystem(w: World): string {
  return `You plan a mission for Jarvis, the voice aide of the Chennai District Collector's console: ${MIN_STEPS} to ${MAX_STEPS} steps that code runs in order after the Collector says start. Code fetches every figure: you never write a number in a label or title.
Step kinds:
- screen: a screen code builds. screen.recipe and only its slots: cases[sev,status open|overdue,q,zones,dept,cat,taluk,period,sort,n] | readings[metric rain|aqi|lakes|temp|humidity,name] | ranking[measure,n,order,period] measure zone_attention|zone_severe|zone_open|rain|lakes|dept_open|dept_overdue|hotspots | compare[zones 2-4,period] | trend[cat,zones,period] | why[zones,cat,period] | performance[by dept|zone,dept,period] | dashboard[cat,zones,period] | map[what severe|hotspots|cases,cat,zones,period] | news[q,period] | brief[period] | advise[zones,cat,period] | insight[zones,period].
- console: 1-3 moves on the console, only page, period, view (zone,dept,cat,taluk,sev), panel, mapMode, layer.
- focus: point the map at a place: place = a zone name or a locality.
- draft: drafts into the Collector's tray for the cases of an earlier cases step: draftOf = that step's number, only overdue|all. A draft is never sent.
A request to send, approve, delete, close or change records -> kind refuse. Use only the codes below; every other field null or [].
Zones: ${w.zones.map((z) => `${z.n} ${z.name}`).join(", ")}.
Departments: ${w.depts.map((d) => d.code).join(", ")}.
Categories: ${w.cats.map((c) => c.code).join(", ")}.
Example: "set up a dengue war room for Adyar" -> title "Dengue watch for Adyar"; steps: screen cases{cat VECTOR_DISEASE, zones [13], status open}; screen trend{cat VECTOR_DISEASE, zones [13], period monthly}; focus{place "Adyar"}; draft{draftOf 1, only overdue}.`;
}

const PAGE_KEYS = ["overview", "briefing", "trends", "environment", "studio"];
const PERIOD_KEYS = ["daily", "weekly", "monthly", "quarterly"];
function missionPrompt(text: string, lang: Lang, state: Partial<ScreenState> | null | undefined, place: MissionPlaceT | null): string {
  // the browser's state is read for its page and period only, and only when they are the console's own words
  const page = PAGE_KEYS.includes(String(state?.page)) ? state?.page : null, period = PERIOD_KEYS.includes(String(state?.period)) ? state?.period : "daily";
  return [
    page ? `Console: page ${page}, period ${period}.` : "",
    place ? `Code read the place: ${place.name}${place.zone ? ` (zone ${place.zone})` : place.taluk ? ` (taluk ${place.taluk})` : ""}.` : "",
    `Labels and title in ${lang === "ta" ? "Tamil script" : "English"}.`,
    `Said: ${JSON.stringify(text)}`
  ].filter(Boolean).join("\n");
}

/** A console step's moves from the model, through v1's checker (plan.ts checkPlan): only Level-A moves of the mission kinds survive. */
function modelMoves(raw: unknown, w: World, heard: string): ConsoleMoveT[] {
  const list = (Array.isArray(raw) ? raw : []).slice(0, 3) as AiStepT[];
  if (!list.length) return [];
  const c = checkPlan({ kind: "do", lang: "en", reply: null, steps: list, options: [] } as AiPlan, w, heard);
  if (c.kind !== "do") return [];
  return c.steps.filter((s) => (CONSOLE_MOVES as readonly string[]).includes(s.a) && riskOf(s) === "A")
    .map((s) => ConsoleMove.safeParse(s)).filter((r) => r.success).map((r) => (r as { data: ConsoleMoveT }).data).slice(0, 3);
}

/**
 * The model's plan, checked step by step: unknown recipes and slots dropped, console moves to Level A, a focus only on a place of the
 * world, a draft only from an earlier list of cases; a figure in a label taken out; at most six steps. A step that would act outward
 * refuses the whole plan.
 */
export function checkModelPlan(raw: ModelPlanT, w: World, lang: Lang, heard: string, o: { redirect?: boolean; now?: number } = {}): Planned {
  if (raw?.kind === "refuse") return { kind: "refuse", why: "model", reply: NEVER_REPLY };
  const rawSteps = (Array.isArray(raw?.steps) ? raw.steps : []) as unknown as Record<string, unknown>[];
  if (rawSteps.some((s) => s && typeof s === "object" && wouldActOutward(s))) return { kind: "refuse", why: "outward", reply: NEVER_REPLY };
  const out: MissionStepT[] = [];
  const byNumber = new Map<number, string>();
  for (const [k, s] of rawSteps.slice(0, MAX_STEPS + 2).entries()) {
    if (!s || typeof s !== "object" || out.length >= MAX_STEPS) continue;
    const id = `s${out.length + 1}`;
    const own = (code: Bilingual): Bilingual => ({ ...code, [lang]: cleanLabel(s.label, code[lang]) });
    let step: MissionStepT | null = null;
    if (s.kind === "screen" && s.screen && typeof s.screen === "object") {
      const sc = s.screen as Record<string, unknown>;
      const built = typeof sc.recipe === "string" && (RECIPES as readonly string[]).includes(sc.recipe) ? screenStep(id, sc.recipe as Recipe, sc, w) : null;
      step = built ? { ...built, label: own(built.label) } : null;
    } else if (s.kind === "console") {
      const built = consoleStep(id, modelMoves(s.moves, w, heard), w);
      step = built ? { ...built, label: own(built.label) } : null;
    } else if (s.kind === "focus" && typeof s.place === "string") {
      const place = placeIn(s.place.slice(0, 80), w);
      step = place ? { ...focusStep(id, place), label: own(focusLabel(place)) } : null;
    } else if (s.kind === "draft") {
      const lists = out.filter((x) => x.kind === "screen" && x.recipe === "cases");
      const from = typeof s.draftOf === "number" ? byNumber.get(s.draftOf) : lists[lists.length - 1]?.id;
      const only = s.only === "all" ? "all" : "overdue";
      step = from && lists.some((x) => x.id === from) ? { ...draftStep(id, from, only), label: own(draftLabel(only)) } : null;
    }
    if (step) { out.push(step); byNumber.set(k + 1, step.id); }
  }
  if (out.length < (o.redirect ? 1 : MIN_STEPS)) return { kind: "none", why: "thin", reply: NONE_REPLY };
  const title = { ...TITLES.model(), [lang]: cleanLabel(raw.title, TITLES.model()[lang]) } as Bilingual;
  const plan = wrap(title, out, lang, "model", o.now ?? Date.now(), !!o.redirect);
  return plan ? { kind: "plan", plan, via: "model", model: null } : { kind: "none", why: "schema", reply: NONE_REPLY };
}

// ------------------------------------------------------------------ the planner --

/** One sentence to a mission plan: refusals in code, then the templates, then (for a redirect) the fast lane, then one model call. */
export async function planMission(text: string, ctx: MissionCtx, deps: MissionDeps): Promise<Planned> {
  const w = ctx.world;
  const said = text.replace(/\s+/g, " ").trim().slice(0, 300);
  const lang: Lang = ctx.lang ?? (detectLang(said) === "ta" ? "ta" : "en");
  const now = (deps.now ?? Date.now)();
  // 1. refused in code, before anything else (the round's own first step)
  const route = routeByRules(said, w, false);
  if (route.lane === "refuse") return { kind: "refuse", why: route.why, reply: route.why === "privacy" ? PRIVACY_REPLY : NEVER_REPLY };
  if (!said) return { kind: "none", why: "empty", reply: NONE_REPLY };
  // 2. the templates
  const intent = missionIntent(said, w);
  if (intent?.template === "tour") {
    const p = await tourPlan(w, lang, deps.tool, now);
    return p ? { kind: "plan", plan: p, via: "tour", model: null } : { kind: "none", why: "tour-data", reply: NO_DATA_REPLY };
  }
  if (intent && intent.template !== "model") {
    const p = templatePlan(intent.template, intent.place, w, lang, now);
    if (p) return { kind: "plan", plan: p, via: "rules", model: null };
  }
  // 3. a redirect the fast lane reads
  if (ctx.redirect) {
    const p = quickTail(said, w, lang, now);
    if (p) return { kind: "plan", plan: p, via: "quick", model: null };
  }
  // 4. one model call, checked step by step
  const r = await callLlm({
    name: "jarvis_mission", system: missionSystem(w), prompt: missionPrompt(said, lang, ctx.state, intent?.place ?? null), schema: ModelPlan, lenient: ModelPlanLenient,
    maxOutputTokens: 700, user: deps.user, lane: "planner", until: deps.until ?? now + PLAN_MS, signal: deps.signal
  }, deps.llm).catch((e) => { if ((e as Error).name === "AbortError") throw e; return null; });
  if (!r) return { kind: "none", why: "no-model", reply: NO_MODEL_REPLY };
  const c = checkModelPlan(r.object, w, lang, said, { redirect: ctx.redirect, now });
  return c.kind === "plan" ? { ...c, model: r.model } : c;
}
