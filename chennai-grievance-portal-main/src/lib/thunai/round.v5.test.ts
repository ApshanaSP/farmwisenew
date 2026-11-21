import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { schemaText } from "@/lib/ai/gateway";
import { WORLD } from "./fixture";
import { PERSONA_LINE } from "./persona";
import { buildRegister } from "./register";
import { firstPrompt, plannerWarm, RoundBody, SCHEMAS, schemaFor, systemFor } from "./round";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld() };
const h = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
// v4's system prompt and schema per bundle, hashed at START (f830efbd) before any v5 change to round.ts; the screens, stage, data and wide schemas again on
// 19 Nov 2026, when the "city" recipe (lib/city: live traffic, rain, flood streets, power, trains) joined RECIPES
// and on 20 Nov 2026 (v11), when "city_now" joined the agent's tools (the Call enum in every schema, and the data bundle's tool list)
// and on 21 Nov 2026 (v12), when the Screen schema gained the city screen's focus and rain (the screens, stage, data and wide schemas) and the
// screens bundle the city entry with its examples (the screens prompt only: SCREENS itself, so the data and wide prompts, are unchanged)
// and again on 21 Nov 2026 (v13, the review's findings 0 10 and 1 5): the wide system prompt only, which gained the city entry (CITY_WIDE)
// and two Tamil city lines in TAMIL_B; its schema and every other bundle are unchanged (wide was 9d3efac15c674dd9)
// and again on 21 Nov 2026 (v14, the review of v13, routing 7): the wide system prompt only, its CITY_WIDE line cut to the recipe and its q
// values and the two Tamil city lines taken out (193 characters: ordinary wide prompts with the live lists fell to SHRINK's last row); its
// schema and every other bundle are unchanged (wide was dedbcd59767b9ad9)
const V4: Record<string, [string, string]> = {
  screens: ["7e0e03294f56a2a2", "355ed987fad5ecfc"], console: ["3a3ccf5e6053428a", "d0f369394d1048a0"], stage: ["aa88ea1e48e54905", "d2971630576f21a9"],
  data: ["a7d340f79deb22e4", "6aa3ffb3f069bceb"], memory: ["f24163327f5f6aa9", "66cc9d15538469d4"], wide: ["3254755c082a9d6c", "2397c0edb401b19a"]
};
const BUNDLES = ["screens", "console", "stage", "data", "memory", "wide"] as const;
const LOOKUP_TEXT = "A fact no screen or step shows";
const body = (text: string) => RoundBody.parse({ turnId: "t5-diet", round: 0, text, turns: [{ heard: "severe cases in Adyar", did: "showed a screen" }], lastText: "severe cases in Adyar", stage: null, direct: null,
  state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false } });
const reg = buildRegister({ recipe: "cases", title: "Severe cases in Adyar", focus: null, slots: { zones: [13] }, blocks: [{ kind: "CaseList", ids: ["INC-1", "INC-2", "INC-3"] }] } as never, [{ heard: "severe cases in Adyar", did: "showed a screen" }], null);
const mem = { notes: ["I follow Adyar closely"], habits: {} };

describe("A1 and A1b: the schema diet and the conditional context (JARVIS_PLANNER_DIET)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: every bundle's system prompt and schema are v4's, byte for byte", () => {
    vi.stubEnv("JARVIS_PLANNER_DIET", "0");
    // (the warm-up's v4 prefix: THE DISTRICT NOW off; v11 appends its rules to it when on, v11.test.ts)
    vi.stubEnv("JARVIS_SNAPSHOT", "0");
    for (const b of BUNDLES) {
      expect(h(systemFor(b, world)), b).toBe(V4[b][0]);
      expect(h(schemaText(schemaFor(b) as never)), b).toBe(V4[b][1]);
      expect(schemaFor(b)).toBe(SCHEMAS[b]);
    }
    // (v12: the warm-up writes the wide bundle's prefix, the one Claude asks round 0 with: round.ts leadBundle; v13: re-pinned with it above)
    expect(h(plannerWarm(world).system)).toBe(V4.wide[0]);
  });

  it("on: calls, done and the lookup line only in the data bundle (and in wide, which Tamil lookups reach), the persona line out of the core", () => {
    vi.stubEnv("JARVIS_PLANNER_DIET", "1");
    vi.stubEnv("JARVIS_SNAPSHOT", "0");
    for (const b of ["screens", "console", "stage", "memory"] as const) {
      const js = schemaText(schemaFor(b) as never);
      expect(js, b).not.toContain("\"calls\"");
      expect(js, b).not.toContain("\"done\"");
      expect(systemFor(b, world), b).not.toContain(LOOKUP_TEXT);
    }
    expect(schemaText(schemaFor("data") as never)).toContain("\"calls\"");
    expect(schemaText(schemaFor("wide") as never)).toContain("\"calls\"");
    expect(systemFor("wide", world)).toContain(LOOKUP_TEXT);
    for (const b of BUNDLES) expect(systemFor(b, world), b).not.toContain(PERSONA_LINE);
    // the warm-up writes the very prefix and format the real call sends (v12: Claude's round 0 asks with the wide bundle)
    expect(plannerWarm(world).system).toBe(systemFor("wide", world));
    expect(plannerWarm(world).schema).toBe(schemaFor("wide"));
  });

  it("on: the register line only for an elliptical sentence or a this/that word; memory lines only in the memory bundle", () => {
    vi.stubEnv("JARVIS_PLANNER_DIET", "1");
    const sys = systemFor("screens", world).length;
    const plain = firstPrompt(body("show the flooding complaints in Velachery this week"), world, "en", mem, sys, { reg: reg as never, bundle: "screens" });
    expect(plain).not.toContain("INC-1");
    expect(plain).not.toContain("I follow Adyar closely");
    const that = firstPrompt(body("open that one"), world, "en", mem, sys, { reg: reg as never, bundle: "screens" });
    expect(that).toContain("INC-1");
    const memory = firstPrompt(body("what do you remember about me"), world, "en", mem, sys, { reg: null, bundle: "memory" });
    expect(memory).toContain("Adyar closely");
  });

  it("off: the first prompt is v4's (register and memory as before)", () => {
    vi.stubEnv("JARVIS_PLANNER_DIET", "0");
    const sys = systemFor("screens", world).length;
    const plain = firstPrompt(body("show the flooding complaints in Velachery this week"), world, "en", mem, sys, { reg: reg as never, bundle: "screens" });
    expect(plain).toContain("INC-1");
    expect(plain).toContain("Adyar closely");
  });
});
