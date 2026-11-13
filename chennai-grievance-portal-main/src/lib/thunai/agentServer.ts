/**
 * The agent's request handling, shared by the console's route (/api/collector/thunai/agent) and the dev test console's
 * twin: the body check, the model call (THUNAI_PROVIDER as the v1 brain), and the run. Server only.
 */
import { asksForbidden, asksPrivate, NEVER_REPLY, PRIVACY_REPLY, redactHands } from "./privacy";
import { z } from "zod";
import { generateJson } from "@/lib/ai/gateway";
import { AgentPlanLenient, AgentPlanSchema, directScreen, runThunaiAgent, type AgentResult } from "./agent";
import { PlanBody, screenOf } from "./brain";
import type { Hands } from "./screens";
import { checkStage, RECIPES, type StageContext } from "./stage";
import { asksCount, offTopic, quickScreen } from "./quick";
import { spanScreen } from "./spanned";
import type { Lang, World } from "./types";

const provider = () => ((process.env.THUNAI_PROVIDER ?? "").trim() === "bedrock" ? "bedrock" : "groq");

export const AgentBody = PlanBody.extend({
  stage: z.object({
    recipe: z.enum(RECIPES), title: z.string().max(200),
    blocks: z.array(z.object({ kind: z.string().max(20), ids: z.array(z.string().max(120)).max(30) })).max(6),
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
  return { ...r, kind: r.steps.length ? "do" : "none", stage: null, say: null, note: process.env.NODE_ENV !== "production" ? `catalog: ${c.why}`.slice(0, 200) : "catalog" };
}

export async function handleAgent(b: AgentBodyT, world: World, rawHands: Hands, user: string, mem: { notes: string[]; habits: Record<string, string> } = { notes: [], habits: {} }): Promise<AgentResult> {
  // the same privacy and safety as the round route: refused in code before anything, and every tool result redacted (BUG-009)
  const hands = redactHands(rawHands);
  const plang: Lang = /[஀-௿]/.test(b.text) ? "ta" : "en";
  if (asksPrivate(b.text)) return { kind: "refuse", lang: plang, reply: PRIVACY_REPLY[plang], steps: [], stage: null, stageOp: null, say: null, options: [], rounds: 0, calls: [], model: null, ms: 0, note: "privacy" };
  if (asksForbidden(b.text)) return { kind: "refuse", lang: plang, reply: NEVER_REPLY[plang], steps: [], stage: null, stageOp: null, say: null, options: [], rounds: 0, calls: [], model: null, ms: 0, note: "never" };
  const state = screenOf(b.state);
  if (b.direct) return served(await spanScreen(b.direct.recipe, b.direct.slots, state, world, hands, b.text, b.direct.lang as Lang));
  // the everyday questions (severe cases, a place's news, prices, air, rain, lakes, why, where) are answered from the data
  // at once by rules, in the language they were asked in; the model is asked only when the rules are not sure
  // Jarvis answers only about the district: anything else gets a polite "ask me about the district" and no model call
  if (offTopic(b.text, world)) {
    const lang: Lang = /[\u0B80-\u0BFF]/.test(b.text) ? "ta" : "en";
    const reply = lang === "ta"
      ? "மன்னிக்கவும், சென்னை மாவட்டத்தின் தரவு பற்றி மட்டுமே என்னால் பதில் சொல்ல முடியும்: புகார்கள், சம்பவங்கள், செய்திகள், மழை மற்றும் வெள்ளம், காற்றின் தரம், ஏரிகள், சந்தை விலைகள், துறைகள். இவற்றைப் பற்றிக் கேளுங்கள்."
      : "Sorry, I can only answer questions about Chennai district's data on this console: complaints and incidents, news, rain and flooding, air quality, reservoirs, market prices and departments. Please ask me about those.";
    return { kind: "refuse", lang, reply, steps: [], stage: null, stageOp: null, say: null, options: [], rounds: 0, calls: [], model: null, ms: 0, note: "off-topic" };
  }
  const quick = quickScreen(b.text, world);
  if (quick) {
    const lang: Lang = /[஀-௿]/.test(b.text) ? "ta" : "en";
    let r = served(await spanScreen(quick.recipe, quick.slots, state, world, hands, b.text, lang));
    // nothing today ("where did the fire happen today", no fire today): the last 7 days instead, and Jarvis says so
    const empty = (x: AgentResult) => !!x.stage && x.stage.blocks.every((bl) => bl.kind === "Note");
    // a count, or a span the request named with its own dates, is answered for that period, never widened to another (P6-022)
    if (empty(r) && quick.recipe === "cases" && !quick.slots.span && !asksCount(b.text) && (quick.slots.period === "daily" || quick.slots.period === "weekly")) {
      const tries: ["weekly" | "monthly", string, string][] = quick.slots.period === "daily"
        ? [["weekly", "None today. ", "இன்று எதுவும் இல்லை. "], ["monthly", "None today or this week. ", "இன்றும் இந்த வாரமும் இல்லை. "]]
        : [["monthly", "None this week. ", "இந்த வாரம் இல்லை. "]];
      for (const [period, en, ta] of tries) {
        const wk = served(await spanScreen("cases", { ...quick.slots, period }, state, world, hands, b.text, lang));
        if (!wk.stage || empty(wk)) continue;
        r = { ...wk, say: `${lang === "ta" ? ta : en}${wk.say ?? ""}`, stage: { ...wk.stage, say: { en: `${en}${wk.stage.say.en}`, ta: `${ta}${wk.stage.say.ta}` } } };
        break;
      }
    }
    if (r.kind === "do" && r.stage) return { ...r, note: "quick" };
  }
  return served(await runThunaiAgent({ text: b.text, state, ctx: { turns: b.turns, notes: mem.notes, habits: mem.habits, now: Date.now() }, stage: (b.stage ?? null) as StageContext | null }, {
    world, hands,
    llm: async (system, prompt, round, timeoutMs) => {
      // Jarvis must not wait on one slow free tier: when the main provider has not answered in 3.5 s, a second provider
      // (Gemini) is asked too, and the first good answer is used (the other call is cancelled)
      const ask = (prefer: "groq" | "bedrock" | "gemini", signal: AbortSignal) => generateJson({
        role: prefer === "groq" ? "reasoning" : "fast", name: `thunai_agent${round}`, schema: AgentPlanSchema, lenient: AgentPlanLenient, system, prompt,
        temperature: 0, maxOutputTokens: 1100, user, prefer, timeoutMs, abortSignal: signal,
        // Groq: qwen answers a Jarvis plan in about a second; gpt-oss-120b takes longer and has only 8,000 tokens a minute
        first: (process.env.JARVIS_MODELS_FIRST ?? "qwen/qwen3.8-27b,openai/gpt-oss-20b").split(",").map((x) => x.trim()).filter(Boolean)
      });
      const a = new AbortController(), b2 = new AbortController();
      const main = ask(provider(), a.signal);
      if (!process.env.GEMINI_API_KEY) return { plan: (await main).object, model: (await main).info.model };
      const backup = new Promise<Awaited<typeof main>>((res, rej) => {
        const t = setTimeout(() => ask("gemini", b2.signal).then(res, rej), 3500);
        main.then(() => clearTimeout(t), () => { clearTimeout(t); ask("gemini", b2.signal).then(res, rej); });
      });
      const r = await Promise.any([main, backup]);
      a.abort(); b2.abort();
      return { plan: r.object, model: r.info.model };
    },
    log: (m) => console.info(`[thunai agent] ${m}`)
  }));
}
