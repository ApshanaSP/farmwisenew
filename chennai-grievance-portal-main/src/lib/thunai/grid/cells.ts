/**
 * The diagnosis grid's cells (v5 build, section 7.3): the first planner call for one sentence, as each cell sends it. Imported ONLY by
 * the grid runner (grid.live.ts) and its test.
 *
 *   A  v3 prose, v3 schema (control)            E  v3 prose, v4 schema (H2: the schema and label set)
 *   B  v4 prose, v4 schema (today)              F  v4 prose + a first `why` field (H2: the missing reasoning step)
 *   C  v3 prose + ~900 tokens of neutral filler  G  route-then-fill: the rules, 5 shortlisted recipes with their slots, the other
 *      (H1: length alone)                          recipe names, 8 retrieved examples (least similar first), SCHEMAS.screens (v4)
 *   D  v4 prose, v3 schema (H1: the added instructions)
 *
 * The bundle is the one the rules pick (routeByRules, unchanged since v3) for every cell; G applies only when that bundle is screens
 * or wide, and otherwise sends cell B's call unchanged.
 */
import { z } from "zod";
import { CORE, firstPrompt, RoundBody, SCHEMAS, SCREENS, systemFor, type RoundBodyT } from "../round";
import { routeByRules, type Bundle } from "../router";
import { intentMarker } from "../quick";
import { replyLang } from "../round";
import { catIn, periodIn, placesIn, reservoirIn, sevIn, zonesIn } from "../quick";
import { gloss } from "../gloss";
import { RECIPES, type Recipe } from "../stage";
import type { World } from "../types";
import type { Shortlister } from "../shortlist";
import { firstPromptV3, RECIPES_V3, SCHEMAS_V3, systemV3 } from "./v3";

export type CellId = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export interface TuningItem { id: string; lang: "en" | "ta" | "tanglish"; text: string; gold: { kind: string; recipe: string | null; slots: Record<string, unknown>; step?: string }; src: string }
export interface CellCall { cell: CellId; bundle: Bundle; system: string; schema: z.ZodTypeAny; prompt: string; via: "cell" | "v4-path" }

/** ~900 tokens (at 4 characters a token) of plain prose about nothing in the task (cell C) */
export const FILLER = `A note on the building, kept for the record. The office stands on a quiet road lined with old rain trees. Its walls were last painted in a pale cream colour, and the window frames are a darker green. A small garden runs along the front, with a low hedge, two benches and a water tap near the gate. In the mornings the light comes in from the east side and falls across the long corridor on the first floor. The corridor has a row of wooden doors, each with a brass handle and a small card holder beside it. At the far end there is a staircase with a wide landing and a window that looks out over the garden. On the landing there is a potted plant that someone waters every few days. The ground floor has a reception counter made of polished wood, a waiting area with plastic chairs, and a notice board that is mostly empty. The ceiling fans turn slowly and make a soft sound. The floor tiles are a mix of grey and white squares, worn smooth near the entrance. Behind the building there is a parking area with a tin roof over part of it, and a row of bicycles that belong to the staff. A tea stall stands outside the gate during the day and closes in the evening. The canteen on the ground floor serves lunch at a fixed hour, and the smell of cooking drifts up the stairs around noon. In the afternoons the corridor is cooler, and the light turns softer as it moves to the west side. There is a clock in the reception area that runs a few minutes fast. The library room on the second floor has tall shelves, a long table and a few reading lamps with green shades. Its shelves hold bound volumes in faded covers, arranged by colour more than by subject. The room is usually quiet, apart from the hum of the lights and the occasional turning of a page. Near the library there is a store room with spare chairs, a broken printer and boxes of paper. The terrace above is used to dry cloth and to keep a few water tanks. From the terrace one can see the tops of other buildings, a temple tower in the distance and the line of trees along the road. Birds sit on the parapet in the early morning and leave when the sun gets strong. On some evenings the terrace door is left open and a breeze comes down the stairwell. The building was put up many years ago and has been repaired more than once; the newer parts can be told apart by their brighter paint. None of this has any bearing on any request; it is here only as a description of a place, and it should be read and set aside. The garden has a mango tree in one corner that gives fruit in the summer months, and a jasmine creeper that climbs the fence near the gate. A watchman sits on a stool by the gate and reads a newspaper between visitors. His radio plays old songs at a low volume. Every few weeks a gardener comes to trim the hedge and sweep the leaves into small heaps. The heaps are carried away in a cart with one squeaky wheel. When it rains, water collects briefly in a shallow dip near the benches and then drains away into the soil. The benches are made of stone and stay cool even on warm days. A stray cat sleeps under one of them most afternoons. Nobody has given it a name, though the staff leave it scraps from the canteen. That is all there is to say about the building.`;

const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false };
/** the request body a bare spoken sentence makes (no screen, no recent turns): as the harness's planner2 builds it */
export const bodyOf = (text: string): RoundBodyT => RoundBody.parse({ turnId: "grid", round: 0, text: text.slice(0, 300), turns: [], lastText: null, stage: null, direct: null, state: STATE });

/** the recipe entries of the screens text ("cases[sev,...] list incidents", ...), by recipe (for cell G's shortlist) */
export const RECIPE_LINES: Record<string, string> = Object.fromEntries(SCREENS.split("\n")[1].split(" | ").map((e) => [e.match(/^[a-z]+/)?.[0] ?? e, e.trim()]));

/** the v4 schema with a first `why` field (cell F): at most 12 words, never shown, never spoken, never passed to the number gate */
function withWhy(schema: z.ZodTypeAny): z.ZodTypeAny {
  const inner = (schema as unknown as { _def: { schema?: z.AnyZodObject } })._def.schema ?? (schema as z.AnyZodObject);
  return z.object({ why: z.string().describe("first: at most 12 words on what the Collector wants; never shown or spoken"), ...inner.shape });
}
const WHY_LINE = "why: write it first, at most 12 words: what the Collector wants. It is never shown or spoken.";

const slotText = (slots: Record<string, unknown>) => Object.entries(slots).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k} ${Array.isArray(v) ? `[${v.join(",")}]` : String(v)}`).join(", ");

/** cell G's system: the static rules only (CORE and the screens instruction), byte-identical for every sentence */
export const systemG = (w: World) => `${CORE(w)}\n${SCREENS.split("\n")[0]}\nSlots hold only what the sentence names. calls: [] and done: true.`;

/** cell G's user message: console, code hints, gloss, the 5 shortlisted recipes, the other names, 8 examples (closest last), the sentence */
export function promptG(b: RoundBodyT, w: World, lang: "en" | "ta", sl: Shortlister): string {
  const t = ` ${b.text.toLowerCase().replace(/[^a-z0-9஀-௿]+/g, " ").trim()} `;
  const places = placesIn(t, w), reservoir = reservoirIn(t);
  const hints = [zonesIn(t, w).length ? `zones ${zonesIn(t, w).join(",")}` : "", places.length ? `places ${places.join(", ")}` : "", reservoir ? `reservoir ${reservoir}` : "", catIn(t) ? `cat ${catIn(t)}` : "", sevIn(t) ? `sev ${sevIn(t)}` : "", periodIn(t) ? `period ${periodIn(t)}` : ""].filter(Boolean).join("; ");
  const g = gloss(b.text);
  const s = sl.shortlist(b.text, 5, 8);
  const others = RECIPES.filter((r) => !s.recipes.includes(r));
  return [
    "Console: page overview, period daily.",
    hints ? `Code read: ${hints}.` : "",
    g ? `Gloss: ${g}` : "",
    `Screens that may fit:\n${s.recipes.map((r) => RECIPE_LINES[r] ?? r).join("\n")}`,
    `Other screens: ${others.join(", ")}.`,
    `Examples, closest last:\n${s.examples.map((x) => `${JSON.stringify(x.text)} -> ${x.recipe}${slotText(x.slots) ? ` ${slotText(x.slots)}` : ""}`).join("\n")}`,
    `Reply in ${lang === "ta" ? "Tamil script (lang ta)" : "English (lang en)"}.`,
    `Said: ${JSON.stringify(b.text)}`
  ].filter(Boolean).join("\n");
}

/** The first planner call for one sentence in one cell. `sl` is needed for G. */
export function cellCall(cell: CellId, text: string, w: World, sl?: Shortlister): CellCall {
  const b = bodyOf(text);
  const lang = replyLang(b.text, b.heard);
  const bundle: Bundle = routeByRules(b.text, w, false).bundle ?? "screens";
  const marker = intentMarker(b.text);
  const mem = { notes: [] as string[], habits: {} as Record<string, string> };
  const v4sys = systemFor(bundle, w);
  const v4prompt = firstPrompt(b, w, lang, mem, v4sys.length, { reg: null, bundle, marker });
  const v3sys = systemV3(bundle, w), v3prompt = firstPromptV3(b, w, lang);
  switch (cell) {
    case "A": return { cell, bundle, system: v3sys, schema: SCHEMAS_V3[bundle], prompt: v3prompt, via: "cell" };
    case "B": return { cell, bundle, system: v4sys, schema: SCHEMAS[bundle] as z.ZodTypeAny, prompt: v4prompt, via: "cell" };
    case "C": return { cell, bundle, system: `${v3sys}\n${FILLER}`, schema: SCHEMAS_V3[bundle], prompt: v3prompt, via: "cell" };
    case "D": return { cell, bundle, system: v4sys, schema: SCHEMAS_V3[bundle], prompt: v4prompt, via: "cell" };
    case "E": return { cell, bundle, system: v3sys, schema: SCHEMAS[bundle] as z.ZodTypeAny, prompt: v3prompt, via: "cell" };
    case "F": return { cell, bundle, system: `${v4sys}\n${WHY_LINE}`, schema: withWhy(SCHEMAS[bundle] as z.ZodTypeAny), prompt: v4prompt, via: "cell" };
    case "G": {
      if (!sl) throw new Error("cell G needs the bank's shortlister");
      if (bundle !== "screens" && bundle !== "wide") return { cell, bundle, system: v4sys, schema: SCHEMAS[bundle] as z.ZodTypeAny, prompt: v4prompt, via: "v4-path" };
      return { cell, bundle, system: systemG(w), schema: SCHEMAS.screens as z.ZodTypeAny, prompt: promptG(b, w, lang, sl), via: "cell" };
    }
  }
}

/** May this sentence be paired between these two cells? Cells A, C, D, E only on gold recipes present in both schemas. */
export function pairable(x: TuningItem, cells: CellId[]): boolean {
  const v3Only = cells.some((c) => c === "A" || c === "C" || c === "D" || c === "E");
  if (!v3Only) return true;
  return !!x.gold.recipe && (RECIPES_V3 as readonly string[]).includes(x.gold.recipe) && (RECIPES as readonly string[]).includes(x.gold.recipe as Recipe);
}

/** Right when kind and recipe match the gold (a gold with no recipe: kind matches and the plan holds the gold step). */
export function scorePlan(x: TuningItem, plan: Record<string, unknown> | null): { ok: boolean; slotsOk: boolean; kind: string | null; recipe: string | null } {
  if (!plan) return { ok: false, slotsOk: false, kind: null, recipe: null };
  const kind = typeof plan.kind === "string" ? plan.kind : null;
  const screen = (plan.screen ?? null) as Record<string, unknown> | null;
  const recipe = screen && typeof screen.recipe === "string" ? screen.recipe : null;
  const steps = Array.isArray(plan.steps) ? (plan.steps as { action?: string }[]) : [];
  const kindOk = kind === x.gold.kind;
  const ok = kindOk && (x.gold.recipe ? recipe === x.gold.recipe : x.gold.step ? steps.some((s) => s?.action === x.gold.step) : !recipe);
  const same = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? [...a].map(Number).sort().join(",") === [...b].map(Number).sort().join(",") : String(a) === String(b));
  const slotsOk = ok && !!screen === !!x.gold.recipe && Object.entries(x.gold.slots).every(([k, v]) => same((screen ?? {})[k], v));
  return { ok, slotsOk, kind, recipe };
}

/** a small seeded generator (mulberry32) */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** shuffled within each language form, then interleaved en, ta, tanglish: the first N keep the three forms balanced */
export function balancedOrder<T extends { lang: string }>(xs: T[], seed: number): T[] {
  const r = rng(seed);
  const by = ["en", "ta", "tanglish"].map((l) => { const a = xs.filter((x) => x.lang === l); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });
  const out: T[] = [];
  for (let i = 0; out.length < xs.length; i++) for (const a of by) if (a[i]) out.push(a[i]);
  return out;
}
