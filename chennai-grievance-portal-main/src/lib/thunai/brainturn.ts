/**
 * 26 Nov: Jarvis's turn answered by the brain (lib/brain): the sentence goes to Claude with the conversation, the screen and every tool, before any
 * of the word lanes. The result comes back in the shape the console already knows (AgentResult: a screen, steps, a question back, a spoken line),
 * with the checked sentences streamed as they are written. Server only.
 */
import { askBrain, type BrainOut } from "@/lib/brain";
import { figs, stageOf } from "@/lib/brain/render";
import type { BrainUser } from "@/lib/brain/types";
import type { AgentResult, StageOp } from "./agent";
import type { RoundBodyT } from "./round";
import type { StageDocT } from "./stage";
import type { Lang, Step, World } from "./types";

export interface BrainTurnIn {
  body: RoundBodyT; world: World; user: BrainUser; key: string; notes: string[]; signal?: AbortSignal; until: number;
  progress?: (label: { en: string; ta: string }) => void;
  sentence?: (text: string, lang: Lang, figures: number[]) => void;
}
export interface BrainTurnOut { result: AgentResult; out: BrainOut }
/** the brain as the round asks it (a test passes its own) */
export type BrainFn = (i: BrainTurnIn) => Promise<BrainTurnOut | null>;

const base = (lang: Lang, o: BrainOut): AgentResult => ({ kind: "do", lang, reply: null, steps: [], stage: null, stageOp: null, say: null, options: [], rounds: o.rounds, calls: o.evidence.map((e) => e.tool), model: o.model, ms: o.ms, note: "brain" });

export const brainTurn: BrainFn = async (i) => {
  const b = i.body, st = b.state;
  const seed = (b.turns ?? []).filter((t) => t.heard && t.result).slice(-5).map((t) => ({ user: t.heard, assistant: String(t.result) }));
  const o = await askBrain({
    text: b.text, channel: "voice", user: i.user, world: i.world, key: i.key, seed, memory: i.notes, signal: i.signal, until: i.until, progress: i.progress,
    sentence: i.sentence ? (t, l) => i.sentence!(t, l, figs(t)) : undefined,
    console: { page: st.page, period: st.period, zone: st.zone ?? null, dept: st.dept ?? null, cat: st.cat ?? null, taluk: st.taluk ?? null, sev: st.sev ?? null, panel: st.panel ?? null, incident: st.incident ?? null, screen: b.stageDigest ?? null, screenTitle: b.stage?.title ?? null,
      dataset: b.studioOpen?.id ? { id: b.studioOpen.id, name: b.studioOpen.id } : null }
  });
  if (!o) return null;
  return { result: resultOf(o, b, i.world), out: o };
};

/** the answer in the console's own shape */
export function resultOf(o: BrainOut, b: Pick<RoundBodyT, "text" | "state">, w: World): AgentResult {
  const a = o.answer, lang = a.lang, r = base(lang, o);
  const say = (o.spoken.length ? o.spoken.join(" ") : a.say).replace(/\s+/g, " ").trim();
  if (a.kind === "clarify") return { ...r, kind: "clarify", reply: a.say, options: a.options.slice(0, 3).map((x) => ({ label: x.label, request: x.request })) };
  if (a.kind === "refuse") return { ...r, kind: "refuse", reply: a.say };
  const steps = o.steps as unknown as Step[];
  const stageOp = o.stageOp ? ({ op: o.stageOp.op, n: o.stageOp.n, text: o.stageOp.text } as StageOp) : null;
  const read = o.evidence.some((e) => !["console", "open_screen_action", "screen", "workspace"].includes(e.tool));
  if (!read && (steps.length || stageOp)) return { ...r, steps, stageOp, reply: say, say: null };
  if (a.kind === "chat" || (!read && !a.points.length && !a.show.length)) return { ...r, kind: "chat", reply: say };
  const period = (["daily", "weekly", "monthly", "quarterly"] as const).find((p) => p === b.state.period) ?? "daily";
  const stage: StageDocT | null = stageOf(o, b.text, w, { period, zone: b.state.zone ?? null, dept: b.state.dept ?? null, cat: b.state.cat ?? null, taluk: b.state.taluk ?? null });
  if (!stage) return { ...r, kind: steps.length ? "do" : "chat", steps, reply: say };
  return { ...r, steps, stage: { ...stage, say: { ...stage.say, [lang]: say.slice(0, lang === "ta" ? 2390 : 1590) }, voice: { by: "aide7", model: o.model, figures: [...new Set([...(stage.voice?.figures ?? []), ...figs(say)])].slice(0, 200) } }, say, stageOp };
}
