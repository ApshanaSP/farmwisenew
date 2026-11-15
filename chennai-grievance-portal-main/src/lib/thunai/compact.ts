/**
 * v5 A7: the compact plan for the Claude rung (JARVIS_PLAN_COMPACT=1, default off; wired in claude.ts only, so the Groq schemas are
 * untouched). A planner bundle's Screen has 20 slots, each written out (null or []) on every plan; output tokens set Haiku's time, so
 * the compact plan names its recipe and only the slots that have a value:
 *
 *   kind, recipe (the Screen's recipe enum, or null for no screen), slots [{ key, value }] (key: a Screen slot key; value: a string,
 *   a list comma-separated), then the bundle's other fields as they are (lang, reply, options, steps, stage). calls and done are left
 *   out and filled in code as [] and true (a lookup round, data or later, keeps its full schema: its calls and say are its point).
 *
 * toFull reads a compact reply back to the very plan the full schema describes: the same Screen, absent slots null (a list []), each
 * value read by the Screen's own zod type (zones "13,7" -> [13, 7], n "5" -> 5). The full schema's check (and checkScreen after it)
 * still decides. Pure. Imports zod only: claude.ts imports this file, and agent.ts and round.ts reach the gateway, which imports
 * claude.ts, so the bundle is recognised by its shape, never by importing them.
 */
import { z } from "zod";

type Shape = Record<string, z.ZodTypeAny>;
type Json = Record<string, unknown>;
export interface CompactPlan {
  /** what the Claude rung is asked for */
  schema: z.ZodTypeAny;
  /** a compact reply (after the wire's own nulls are put back) as the full plan; anything that is not an object is returned as is */
  toFull: (v: unknown) => unknown;
}

const typeName = (s: z.ZodTypeAny): string => (s as unknown as { _def: { typeName?: string } })._def?.typeName ?? "";

/** the object a schema checks, under any preprocess, refine or transform (round.ts's withLook wraps each bundle in z.preprocess) */
function objectIn(s: z.ZodTypeAny): z.AnyZodObject | null {
  let x = s;
  for (let i = 0; i < 6 && x; i++) {
    if (typeName(x) === "ZodObject") return x as z.AnyZodObject;
    if (typeName(x) !== "ZodEffects") return null;
    x = (x as z.ZodEffects<z.ZodTypeAny>).innerType();
  }
  return null;
}

/** the type under nullable, optional, default and effects */
function base(s: z.ZodTypeAny): z.ZodTypeAny {
  let x = s;
  for (let i = 0; i < 8; i++) {
    const t = typeName(x);
    if (t === "ZodNullable" || t === "ZodOptional") x = (x as z.ZodNullable<z.ZodTypeAny>).unwrap();
    else if (t === "ZodDefault") x = (x as z.ZodDefault<z.ZodTypeAny>).removeDefault();
    else if (t === "ZodEffects") x = (x as z.ZodEffects<z.ZodTypeAny>).innerType();
    else break;
  }
  return x;
}

/** what an absent slot is in the full plan: null where the slot takes null, [] for a list, else left out */
function absent(s: z.ZodTypeAny): unknown {
  if (s.safeParse(null).success) return null;
  if (typeName(base(s)) === "ZodArray") return [];
  return undefined;
}

/** one value as the slot's own type reads it; an unreadable number stays NaN, so the full schema refuses it */
function cast(t: z.ZodTypeAny, text: string): unknown {
  const v = text.trim().replace(/^["']|["']$/g, "");
  switch (typeName(t)) {
    case "ZodNumber": return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : Number.NaN;
    case "ZodBoolean": return v === "true" ? true : v === "false" ? false : v;
    default: return v;
  }
}

/** a list's parts: "13,7", "13, 7", "[13, 7]" or (numbers) "13 7" */
function parts(t: z.ZodTypeAny, text: string): unknown[] {
  const inner = text.trim().replace(/^\[|\]$/g, "");
  const numbers = typeName(t) === "ZodNumber";
  return inner.split(numbers ? /[\s,;]+/ : /\s*[,;]\s*/).map((p) => p.trim()).filter(Boolean).map((p) => cast(t, p));
}

/** a planner bundle: an object with kind, lang, reply, options and a screen that is a Screen (an object with a recipe enum), and no say */
function bundleOf(s: z.ZodTypeAny): { shape: Shape; screen: Shape } | null {
  const obj = objectIn(s);
  if (!obj) return null;
  const shape = obj.shape as Shape;
  if (!["kind", "lang", "reply", "options", "screen"].every((k) => k in shape) || "say" in shape) return null;
  const screen = objectIn(base(shape.screen));
  if (!screen || typeName((screen.shape as Shape).recipe ?? z.never()) !== "ZodEnum") return null;
  return { shape, screen: screen.shape as Shape };
}

function build(s: z.ZodTypeAny): CompactPlan | null {
  const b = bundleOf(s);
  if (!b) return null;
  const keys = Object.keys(b.screen).filter((k) => k !== "recipe");
  if (!keys.length) return null;
  const recipe = b.screen.recipe as z.ZodEnum<[string, ...string[]]>;
  const slot = z.object({ key: z.enum(keys as [string, ...string[]]), value: z.string() });
  const rest = Object.fromEntries(Object.entries(b.shape).filter(([k]) => !["kind", "screen", "calls", "done"].includes(k)));
  const schema = z.object({
    kind: b.shape.kind,
    recipe: recipe.nullable().describe("the screen to show (its recipe), or null for no screen"),
    slots: z.array(slot).max(keys.length).describe("only the screen's slots that have a value, one {key, value} each; a list comma-separated, e.g. zones \"13,7\""),
    ...rest
  });
  const fill = { ...("calls" in b.shape ? { calls: [] as unknown[] } : {}), ...("done" in b.shape ? { done: true } : {}) };

  const screenOf = (r: string, slots: unknown): Json => {
    const out: Json = { recipe: r };
    for (const k of keys) { const a = absent(b.screen[k]); if (a !== undefined) out[k] = a; }
    const seen = new Set<string>();
    for (const x of Array.isArray(slots) ? slots : []) {
      if (!x || typeof x !== "object") continue;
      const { key, value } = x as { key?: unknown; value?: unknown };
      // a key the Screen does not have is not a slot (the compact schema refuses it before this)
      if (typeof key !== "string" || !keys.includes(key)) continue;
      const text = value == null ? "" : Array.isArray(value) ? value.join(",") : String(value).trim();
      if (!text || text.toLowerCase() === "null") continue;
      const t = base(b.screen[key]);
      if (typeName(t) === "ZodArray") {
        const got = parts(base((t as z.ZodArray<z.ZodTypeAny>).element), text);
        out[key] = seen.has(key) && Array.isArray(out[key]) ? [...(out[key] as unknown[]), ...got] : got;
      } else if (!seen.has(key)) out[key] = cast(t, text);
      seen.add(key);
    }
    return out;
  };

  const toFull = (v: unknown): unknown => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const { recipe: r, slots, ...others } = v as Json;
    return { ...others, screen: typeof r === "string" && r ? screenOf(r, slots) : null, ...fill };
  };
  return { schema, toFull };
}

const cache = new WeakMap<object, CompactPlan | null>();
/** The compact form of a planner bundle schema, or null when the schema is not one (cached per schema). */
export function compactPlan(s: z.ZodTypeAny): CompactPlan | null {
  if (!s || typeof s !== "object") return null;
  if (!cache.has(s)) cache.set(s, build(s));
  return cache.get(s) ?? null;
}
