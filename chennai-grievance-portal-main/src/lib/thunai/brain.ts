/**
 * One sentence through the model (server side): the prompt from plan.ts, one structured call, the plan checked against
 * the world. Shared by the console's plan route, the dev test console and the live check (brain.live.ts).
 *
 * THUNAI_PROVIDER picks the brain: groq (default: gpt-oss-120b, the strongest free model, then the other Groq models)
 * or bedrock (Nova Lite). The gateway's other configured providers back it up.
 */
import { z } from "zod";
import { generateJson } from "@/lib/ai/gateway";
import { AiPlanLenient, AiPlanSchema, checkPlan, systemPrompt, userPrompt, type Checked, type Context } from "./plan";
import type { ScreenState, World } from "./types";

const provider = () => ((process.env.THUNAI_PROVIDER ?? "").trim() === "bedrock" ? "bedrock" : "groq");

export interface BrainResult { plan: Checked; ms: number; model: string | null; error?: string }

export async function think(text: string, state: ScreenState, world: World, ctx: Context, user: string, timeoutMs = 4000): Promise<BrainResult> {
  const t0 = Date.now();
  try {
    const r = await generateJson({
      // on Groq the "reasoning" list starts with gpt-oss-120b; Nova Lite is the "fast" model on Bedrock
      role: provider() === "groq" ? "reasoning" : "fast", name: "thunai_plan", schema: AiPlanSchema, lenient: AiPlanLenient, system: systemPrompt(world),
      prompt: userPrompt(text, state, world, ctx), temperature: 0, maxOutputTokens: 900, user, prefer: provider(), timeoutMs
    });
    return { plan: checkPlan(r.object, world, text, ctx.now ?? Date.now()), ms: Date.now() - t0, model: r.info.model };
  } catch (e) {
    return { plan: { kind: "none", lang: /[஀-௿]/.test(text) ? "ta" : "en" }, ms: Date.now() - t0, model: null, error: (e as Error).message.slice(0, 200) };
  }
}

/** What the console posts: the sentence, the screen (ids and codes only) and the last few turns. */
export const PlanBody = z.object({
  text: z.string().trim().min(1).max(300),
  state: z.object({
    page: z.enum(["overview", "briefing", "trends", "environment", "studio"]),
    period: z.enum(["daily", "weekly", "monthly", "quarterly"]),
    zone: z.number().int().min(1).max(15).nullable(),
    dept: z.string().max(40).nullable(), cat: z.string().max(60).nullable(), taluk: z.string().max(20).nullable(),
    sev: z.enum(["Severe", "High", "Medium", "Low"]).nullable(),
    mapMode: z.enum(["zones", "taluks"]),
    panel: z.string().max(40).nullable(), incident: z.string().max(80).nullable(),
    listLength: z.number().int().min(0).max(1000),
    lastPlace: z.string().max(80).nullable().optional(),
    numbers: z.boolean().optional()
  }),
  turns: z.array(z.object({ heard: z.string().max(300), did: z.string().max(300) })).max(4).optional()
});

export function screenOf(state: z.infer<typeof PlanBody>["state"]): ScreenState {
  return { ...state, list: new Array(state.listLength).fill(""), lastFilter: null, lastPlace: state.lastPlace ?? null, now: Date.now() } as ScreenState;
}
