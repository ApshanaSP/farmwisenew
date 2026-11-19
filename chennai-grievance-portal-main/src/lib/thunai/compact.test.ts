/**
 * v5 A7: the compact plan for the Claude rung (JARVIS_PLAN_COMPACT=1; the Groq schemas are untouched). The plan names its recipe and
 * only the slots that have a value; code reads it back to the very Screen the full plan would have given, before the full schema's
 * check and checkScreen. Invented plans only.
 */
import fs from "fs";
import path from "path";
import { zodSchema } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { claudeWire } from "@/lib/ai/claude";
import { Screen } from "./agent";
import { compactPlan } from "./compact";
import { EVERYTHING_SCHEMA, LATER_ACT_SCHEMA, SCHEMAS } from "./round";

type Json = Record<string, any>;
const SLOT_KEYS = Object.keys(Screen.shape).filter((k) => k !== "recipe");
const LISTS = new Set(["zones", "depts"]);
/** a full plan's screen with every slot empty: null, or [] for a list */
const emptyScreen = (recipe: string): Json => ({ recipe, ...Object.fromEntries(SLOT_KEYS.map((k) => [k, LISTS.has(k) ? [] : null])) });
const must = (s: z.ZodTypeAny) => { const c = compactPlan(s); if (!c) throw new Error("no compact form"); return c; };
const shapeOf = (s: z.ZodTypeAny) => (s as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;

describe("which schemas have a compact form", () => {
  it("the planner bundles with a screen: screens, stage, wide, and the everything schema", () => {
    for (const s of [SCHEMAS.screens, SCHEMAS.stage, SCHEMAS.wide, EVERYTHING_SCHEMA]) expect(compactPlan(s as z.ZodTypeAny)).not.toBeNull();
  });

  it("none for a bundle with no screen (console, memory), a lookup round (data and the later rounds: their calls and say are the point), or any other schema", () => {
    for (const s of [SCHEMAS.console, SCHEMAS.memory, SCHEMAS.data, LATER_ACT_SCHEMA]) expect(compactPlan(s as z.ZodTypeAny)).toBeNull();
    expect(compactPlan(z.object({ ok: z.boolean() }))).toBeNull();
    expect(compactPlan(z.string())).toBeNull();
  });

  it("found by its shape, under a preprocess, with or without calls and done (the schema diet may take them out)", () => {
    const base = { kind: z.enum(["do", "chat"]), lang: z.enum(["en", "ta"]), reply: z.string().nullable(), options: z.array(z.object({ label: z.string(), request: z.string() })).max(3), screen: Screen.nullable() };
    expect(compactPlan(z.preprocess((v) => v, z.object(base)))).not.toBeNull();
    expect(compactPlan(z.object({ ...base, calls: z.array(z.object({ tool: z.string() })), done: z.boolean() }))).not.toBeNull();
    // a screen that is not a Screen (no recipe enum) is not a planner bundle
    expect(compactPlan(z.object({ ...base, screen: z.object({ x: z.string() }).nullable() }))).toBeNull();
  });
});

describe("the compact schema", () => {
  it("kind, then recipe (required), then slots, then the bundle's other fields as they are; no screen, calls or done", () => {
    const c = must(SCHEMAS.wide as z.ZodTypeAny);
    const keys = Object.keys(shapeOf(c.schema));
    expect(keys.slice(0, 3)).toEqual(["kind", "recipe", "slots"]);
    expect(keys).toEqual(["kind", "recipe", "slots", "lang", "reply", "options", "steps", "stage"]);
    for (const k of ["screen", "calls", "done"]) expect(keys).not.toContain(k);
    // steps and stage are the bundle's own schemas, untouched
    const wide = (SCHEMAS.wide as unknown as { _def: { schema: z.AnyZodObject } })._def.schema.shape;
    expect(shapeOf(c.schema).steps).toBe(wide.steps);
    expect(shapeOf(c.schema).stage).toBe(wide.stage);
    const js = zodSchema(c.schema as never).jsonSchema as Json;
    expect(Object.keys(js.properties)).toEqual(keys);
    expect(js.required).toEqual(expect.arrayContaining(["kind", "recipe", "slots"]));
    // recipe: the Screen's recipe enum, or null for no screen
    expect(shapeOf(c.schema).recipe.safeParse(null).success).toBe(true);
    expect(shapeOf(c.schema).recipe.safeParse("cases").success).toBe(true);
    expect(shapeOf(c.schema).recipe.safeParse("weather").success).toBe(false);
  });

  it("slots: key is an enum of the Screen's slot keys and value a string; an unknown slot key is rejected", () => {
    const c = must(SCHEMAS.screens as z.ZodTypeAny);
    const ok = { kind: "do", recipe: "cases", slots: [{ key: "zones", value: "13" }], lang: "en", reply: null, options: [] };
    expect(c.schema.safeParse(ok).success).toBe(true);
    expect(c.schema.safeParse({ ...ok, slots: [{ key: "colour", value: "red" }] }).success).toBe(false);
    expect(c.schema.safeParse({ ...ok, slots: [{ key: "recipe", value: "cases" }] }).success).toBe(false);
    expect(c.schema.safeParse({ ...ok, slots: [{ key: "zones", value: 13 }] }).success).toBe(false);
    const wire = claudeWire(c.schema).schema as Json;
    const slot = wire.properties.slots.items;
    expect([...slot.properties.key.enum].sort()).toEqual([...SLOT_KEYS].sort());
    expect(slot.properties.value.type).toBe("string");
    expect(slot.additionalProperties).toBe(false);
  });

  for (const name of ["screens", "stage", "wide"] as const) {
    it(`${name}: within structured outputs' limits (under 16 unions and 24 optional parameters), sent as the format`, () => {
      const w = claudeWire(must(SCHEMAS[name] as z.ZodTypeAny).schema);
      expect(w.path).toBe("format");
      expect(w.unions).toBeLessThan(16);
      expect(w.optionals).toBeLessThan(24);
    });
  }
});

describe("a compact reply read back to the full plan", () => {
  const screens = () => must(SCHEMAS.screens as z.ZodTypeAny);
  const reply = (recipe: string | null, slots: { key: string; value: string }[], over: Json = {}) => ({ kind: "do", recipe, slots, lang: "en", reply: null, options: [], ...over });

  it("three slots give the same Screen as the full plan with the other slots null", () => {
    const full = SCHEMAS.screens.parse(screens().toFull(reply("cases", [{ key: "zones", value: "13,7" }, { key: "sev", value: "Severe" }, { key: "period", value: "weekly" }])));
    const want = { ...emptyScreen("cases"), zones: [13, 7], sev: "Severe", period: "weekly" };
    expect(full.screen).toEqual(Screen.parse(want));
    expect(full).toEqual(SCHEMAS.screens.parse({ kind: "do", lang: "en", reply: null, options: [], screen: want, calls: [], done: true }));
    expect(full).toMatchObject({ calls: [], done: true });
  });

  it("numbers and lists are read by the Screen's own types", () => {
    const s = screens().toFull(reply("compare", [{ key: "zones", value: "[13, 7]" }, { key: "n", value: "5" }, { key: "depts", value: "PWD, GCC" }, { key: "item", value: " 2 " }])) as Json;
    expect(s.screen).toMatchObject({ zones: [13, 7], n: 5, depts: ["PWD", "GCC"], item: 2 });
    expect(Screen.safeParse(s.screen).success).toBe(true);
  });

  it("no recipe: no screen (the slots are not used)", () => {
    const full = SCHEMAS.screens.parse(screens().toFull(reply(null, [{ key: "zones", value: "4" }], { kind: "chat", reply: "Hello." })));
    expect(full.screen).toBeNull();
    expect(full.kind).toBe("chat");
  });

  it("an empty or \"null\" value is an absent slot; a list given twice is joined; a repeated single value keeps the first", () => {
    const s = screens().toFull(reply("cases", [{ key: "q", value: "" }, { key: "cat", value: "null" }, { key: "zones", value: "3" }, { key: "zones", value: "9" }, { key: "sev", value: "High" }, { key: "sev", value: "Low" }])) as Json;
    expect(s.screen).toMatchObject({ q: null, cat: null, zones: [3, 9], sev: "High" });
  });

  it("a value the Screen does not take is still refused by the full schema (its check, and checkScreen after it, decide)", () => {
    expect(SCHEMAS.screens.safeParse(screens().toFull(reply("cases", [{ key: "sev", value: "Huge" }]))).success).toBe(false);
    expect(SCHEMAS.screens.safeParse(screens().toFull(reply("cases", [{ key: "n", value: "five" }]))).success).toBe(false);
  });

  it("wide: steps and stage pass through as they came", () => {
    const steps = [{ action: "page", page: "trends", period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, mapMode: null, layer: null, on: null }];
    const c = must(SCHEMAS.wide as z.ZodTypeAny);
    const out = c.toFull({ kind: "do", recipe: null, slots: [], lang: "ta", reply: null, options: [], steps, stage: null }) as Json;
    expect(out.steps).toBe(steps);
    expect(out.stage).toBeNull();
    expect(out.screen).toBeNull();
  });
});

it("compact.ts imports zod only: no round.ts or agent.ts (claude.ts imports it, and agent.ts reaches the gateway, which imports claude.ts)", () => {
  const src = fs.readFileSync(path.join(__dirname, "compact.ts"), "utf8");
  const from = [...src.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
  expect(from).toEqual(["zod"]);
});
