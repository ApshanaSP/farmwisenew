/**
 * v7: the answer writer's way to a model, streamed. The rungs are the planner's ladder (llm.ts: Claude Haiku 5.5 first when a working key
 * is set and Claude is on, then the Groq model with the most room, then Gemini 3.5 flash-lite), each under the quota ledger, Claude under
 * the owner's spend ceiling. JARVIS_AIDE_LEAD=groq (or the planner's JARVIS_PLANNER_LEAD=groq) puts Claude after Groq for the writer.
 * A rung that sends no text within its first-text time is stopped and the next one asked (writer.ts runs the walk; this file opens one).
 */
import { claudeConfigured, claudeStreamText } from "@/lib/ai/claude";
import { streamPlainText } from "@/lib/ai/gateway";
import { ladder, plannerLead, type Rung } from "../llm";
import { ledger, type Ledger } from "../ledger";

export interface RungCall { name: string; system: string; prompt: string; maxOutputTokens: number; user: string; signal: AbortSignal; timeoutMs: number }
export interface RungDone { provider: string; model: string; tokens: number; firstMs: number | null; ms: number; stop: string | null }
export type OpenRung = (rung: Rung, c: RungCall, onText: (t: string) => void) => Promise<RungDone>;

/** Who leads the writer: as the planner unless JARVIS_AIDE_LEAD says otherwise. */
export const aideLead = (): "haiku" | "groq" => {
  const v = (process.env.JARVIS_AIDE_LEAD ?? "").trim().toLowerCase();
  return v === "groq" ? "groq" : v === "haiku" ? "haiku" : plannerLead();
};

/** The writer's rungs for a call of `need` tokens, in order. */
export function writerRungs(need: number, o: { ledger?: Ledger; claude?: boolean } = {}): Rung[] {
  const claude = o.claude ?? claudeConfigured();
  const rungs = ladder(need, o.ledger ?? ledger(), false, claude);
  if (aideLead() === "groq") return [...rungs.filter((r) => r.provider !== "anthropic"), ...rungs.filter((r) => r.provider === "anthropic")];
  // the planner's ladder puts a non-Haiku Claude after Groq; the writer follows it. With the lead "haiku" a Haiku rung is first already.
  return rungs;
}

/** How long a rung may take to send its first text before the next is asked. */
export const firstTextMs = (provider: string): number => (provider === "groq" ? 2500 : 4000);

/** Open one rung and stream its text. */
export const openRung: OpenRung = async (rung, c, onText) => {
  const t0 = Date.now();
  if (rung.provider === "anthropic") {
    const r = await claudeStreamText({ name: c.name, system: c.system, prompt: c.prompt, maxOutputTokens: c.maxOutputTokens, model: rung.model, timeoutMs: c.timeoutMs, abortSignal: c.signal }, onText);
    ledger().record("anthropic", r.model, { tokens: r.inputTokens + r.outputTokens, lane: "aide" });
    return { provider: "anthropic", model: r.model, tokens: r.inputTokens + r.outputTokens, firstMs: r.firstMs, ms: Date.now() - t0, stop: r.stopReason };
  }
  if (rung.provider === "groq" || rung.provider === "gemini") {
    const r = await streamPlainText({ provider: rung.provider, model: rung.model, name: c.name, system: c.system, prompt: c.prompt, maxOutputTokens: c.maxOutputTokens, abortSignal: c.signal, lane: "aide", user: c.user }, onText);
    return { provider: rung.provider, model: r.model, tokens: r.inputTokens + r.outputTokens, firstMs: r.firstMs, ms: Date.now() - t0, stop: null };
  }
  throw new Error(`no writer for ${rung.provider}`);
};
