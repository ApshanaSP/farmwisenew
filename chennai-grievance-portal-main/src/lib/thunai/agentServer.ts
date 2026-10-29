/**
 * The agent's request handling, shared by the console's route (/api/collector/thunai/agent) and the dev test console's
 * twin: the body check, the model call (THUNAI_PROVIDER as the v1 brain), and the run. Server only.
 */
import { z } from "zod";
import { generateJson } from "@/lib/ai/gateway";
import { AgentPlanLenient, AgentPlanSchema, directScreen, runThunaiAgent, type AgentResult } from "./agent";
import { PlanBody, screenOf } from "./brain";
import type { Hands } from "./screens";
import { checkStage, RECIPES, type StageContext } from "./stage";
import type { Lang, World } from "./types";

const provider = () => ((process.env.THUNAI_PROVIDER ?? "").trim() === "bedrock" ? "bedrock" : "groq");

export const AgentBody = PlanBody.extend({
  stage: z.object({
    recipe: z.enum(RECIPES), title: z.string().max(200),
    blocks: z.array(z.object({ kind: z.string().max(20), ids: z.array(z.string().max(120)).max(20) })).max(6),
    slots: z.record(z.unknown()), focus: z.number().int().nullable()
  }).nullable().optional(),
  /** a screen asked for by a Stage control (filter chip, refinement, mission): built by code, no model */
  direct: z.object({ recipe: z.enum(RECIPES), slots: z.record(z.unknown()), lang: z.enum(["en", "ta"]) }).nullable().optional()
});
export type AgentBodyT = z.infer<typeof AgentBody>;

/** 15: what is served is checked against the catalog (lengths, finite numbers); a bad screen is not shown. */
function served(r: AgentResult): AgentResult {
  if (!r.stage) return r;
  const c = checkStage(r.stage);
  if (c.ok) return r;
  console.error(`[thunai agent] screen refused by the catalog: ${c.why}`);
  return { ...r, kind: r.steps.length ? "do" : "none", stage: null, say: null, note: "catalog" };
}

export async function handleAgent(b: AgentBodyT, world: World, hands: Hands, user: string, mem: { notes: string[]; habits: Record<string, string> } = { notes: [], habits: {} }): Promise<AgentResult> {
  const state = screenOf(b.state);
  if (b.direct) return served(await directScreen(b.direct.recipe, b.direct.slots, state, world, hands, b.text, b.direct.lang as Lang));
  return served(await runThunaiAgent({ text: b.text, state, ctx: { turns: b.turns, notes: mem.notes, habits: mem.habits, now: Date.now() }, stage: (b.stage ?? null) as StageContext | null }, {
    world, hands,
    llm: async (system, prompt, round, timeoutMs) => {
      const r = await generateJson({
        role: provider() === "groq" ? "reasoning" : "fast", name: `thunai_agent${round}`, schema: AgentPlanSchema, lenient: AgentPlanLenient, system, prompt,
        temperature: 0, maxOutputTokens: 1100, user, prefer: provider(), timeoutMs
      });
      return { plan: r.object, model: r.info.model };
    },
    log: (m) => console.info(`[thunai agent] ${m}`)
  }));
}
