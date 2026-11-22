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
import { lineProblem, safeOptions, turnRecords } from "./exitgate";
import { stepsAskedFor } from "./injection";
import { asksPrivate, NEVER_REPLY, PRIVACY_REPLY } from "./privacy";
import { asksForbiddenOrder } from "./router";
import { RECIPES } from "./stage";

const provider = () => ((process.env.THUNAI_PROVIDER ?? "").trim() === "bedrock" ? "bedrock" : "groq");

export interface BrainResult { plan: Checked; ms: number; model: string | null; error?: string }

/** The older /plan route has the same gates as /round and /agent: the model's plan goes through the one exit gate (exitgate.ts) and the asked-for-steps gate (BUG-009 class, RC-19). */
function vet(plan: Checked, text: string, ctx: Context): Checked {
  const records = turnRecords(ctx.turns);
  const bad = (s: string | null | undefined, refusal = false) => !!s && !!lineProblem(s, { records, refusal });
  switch (plan.kind) {
    case "chat": return bad(plan.reply) ? { kind: "none", lang: plan.lang } : plan;
    case "refuse": return bad(plan.reply, true) ? { ...plan, reply: plan.lang === "ta" ? NEVER_REPLY.ta : NEVER_REPLY.en } : plan;
    case "clarify": {
      const options = safeOptions(plan.options, { records });
      if (options.length < 2) return { kind: "none", lang: plan.lang };
      return { ...plan, question: bad(plan.question) ? (plan.lang === "ta" ? "எதைச் சொல்கிறீர்கள்?" : "Which one do you mean?") : plan.question, options };
    }
    case "do": {
      const steps = stepsAskedFor(plan.steps, text);
      const reply = bad(plan.reply) ? null : plan.reply;
      return steps.length || reply ? { ...plan, steps, reply, dropped: plan.dropped + (plan.steps.length - steps.length) } : { kind: "none", lang: plan.lang };
    }
    default: return plan;
  }
}

export async function think(text: string, state: ScreenState, world: World, ctx: Context, user: string, timeoutMs = 4000): Promise<BrainResult> {
  const t0 = Date.now();
  const lang = /[஀-௿]/.test(text) ? "ta" : "en";
  // refused in code before any model, as on /round and /agent
  if (asksPrivate(text)) return { plan: { kind: "refuse", reply: PRIVACY_REPLY[lang], lang }, ms: 0, model: null };
  if (asksForbiddenOrder(text)) return { plan: { kind: "refuse", reply: NEVER_REPLY[lang], lang }, ms: 0, model: null };
  try {
    const r = await generateJson({
      // on Groq the "reasoning" list starts with gpt-oss-120b; Nova Lite is the "fast" model on Bedrock
      role: provider() === "groq" ? "reasoning" : "fast", name: "thunai_plan", schema: AiPlanSchema, lenient: AiPlanLenient, system: systemPrompt(world),
      prompt: userPrompt(text, state, world, ctx), temperature: 0, maxOutputTokens: 900, user, prefer: provider(), timeoutMs
    });
    return { plan: vet(checkPlan(r.object, world, text, ctx.now ?? Date.now()), text, ctx), ms: Date.now() - t0, model: r.info.model };
  } catch (e) {
    return { plan: { kind: "none", lang: /[஀-௿]/.test(text) ? "ta" : "en" }, ms: Date.now() - t0, model: null, error: (e as Error).message.slice(0, 200) };
  }
}

/** a turn's slots, kept small on the way in: only what is set, strings to 60 characters, lists to 6 items, about 300 characters in all */
const compactSlots = (s: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined => {
  if (!s) return undefined;
  const out: Record<string, unknown> = {};
  let size = 2;
  for (const [k, v] of Object.entries(s)) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length) || typeof v === "object" && !Array.isArray(v)) continue;
    const val = typeof v === "string" ? v.slice(0, 60) : Array.isArray(v) ? v.filter((x) => typeof x === "string" || typeof x === "number").slice(0, 6).map((x) => (typeof x === "string" ? x.slice(0, 40) : x)) : typeof v === "number" || typeof v === "boolean" ? v : null;
    if (val == null) continue;
    const add = JSON.stringify(k).length + JSON.stringify(val).length + 2;
    if (size + add > 300) break;
    out[k] = val; size += add;
  }
  return out;
};

/**
 * One earlier turn as the browser sends it (v4): what was heard and done, and when a screen answered, its recipe, its slots and a one-line
 * result. Tight limits: the planner reads all four.
 */
export const TurnBody = z.object({
  heard: z.string().max(300), did: z.string().max(300),
  recipe: z.enum(RECIPES).nullish(),
  slots: z.record(z.string().max(24), z.unknown()).nullish().transform(compactSlots),
  result: z.string().max(200).nullish()
});

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
  turns: z.array(TurnBody).max(6).optional()
});

export function screenOf(state: z.infer<typeof PlanBody>["state"]): ScreenState {
  return { ...state, list: new Array(state.listLength).fill(""), lastFilter: null, lastPlace: state.lastPlace ?? null, now: Date.now() } as ScreenState;
}
