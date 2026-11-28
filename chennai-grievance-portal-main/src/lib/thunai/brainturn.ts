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
import { MAX_BLOCKS, checkStage, type BlockT, type StageDocT } from "./stage";
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

/**
 * 28 Nov (the owner: "the dashboard should be created with the AI summary plus the visualization"): a dashboard built by code with the brain's
 * checked words above it, its points under them for a comparison (a summary keeps its own key points), said in the turn's language. Null when
 * the result does not fit a screen (the answer is then drawn the usual way).
 */
export function withAiSummary(doc: StageDocT, say: string, points: string[], lang: Lang, model: string | null): StageDocT | null {
  if (!say.trim()) return null;
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const ai: BlockT = { kind: "Answer", id: "ai", title: L("AI summary", "AI சுருக்கம்"), text: clip(say, 2390), facts: [],
    about: L("Written by AI from the figures on this dashboard; every figure in it was checked against them.", "இந்தத் திரையின் எண்களிலிருந்து AI எழுதியது; ஒவ்வொரு எண்ணும் சரிபார்க்கப்பட்டது.") };
  const extra: BlockT[] = doc.recipe === "compare" && points.length ? [{ kind: "Brief", id: "ai-points", title: L("Key differences", "முக்கிய வேறுபாடுகள்"), points: points.slice(0, 8).map((t) => ({ text: clip(t, 395), ...(lang === "ta" ? { ta: clip(t, 395) } : {}), incidentId: null })) }] : [];
  const rest = doc.blocks.filter((b) => b.id !== "ai" && b.id !== "ai-points");
  // (the comparison's table first, then the differences; a summary's tiles stay right under the words)
  const blocks = doc.recipe === "compare" ? [ai, ...rest.slice(0, 1), ...extra, ...rest.slice(1)] : [ai, ...rest];
  const next: StageDocT = { ...doc, blocks: blocks.slice(0, MAX_BLOCKS), say: { ...doc.say, [lang]: clip(say, lang === "ta" ? 2390 : 1590) }, lang: doc.lang ?? lang,
    voice: { by: "aide7", model, figures: [...new Set([...(doc.voice?.figures ?? []), ...figs(say), ...points.flatMap(figs)])].slice(0, 200) } };
  const ok = checkStage(next);
  return ok.ok ? ok.doc : null;
}

/** the answer in the console's own shape */
export function resultOf(o: BrainOut, b: Pick<RoundBodyT, "text" | "state">, w: World): AgentResult {
  const a = o.answer, lang = a.lang, r = base(lang, o);
  const say = (o.spoken.length ? o.spoken.join(" ") : a.say).replace(/\s+/g, " ").trim();
  // (27 Nov) outside District IQ: the fixed decline, said as a plain reply. Never "refuse", which plays the blocked sound (Thunai.tsx)
  if (a.kind === "offtopic") return { ...r, kind: "chat", reply: a.say, note: "offtopic" };
  if (a.kind === "clarify") return { ...r, kind: "clarify", reply: a.say, options: a.options.slice(0, 3).map((x) => ({ label: x.label, request: x.request })) };
  if (a.kind === "refuse") return { ...r, kind: "refuse", reply: a.say };
  const steps = o.steps as unknown as Step[];
  const stageOp = o.stageOp ? ({ op: o.stageOp.op, n: o.stageOp.n, text: o.stageOp.text } as StageOp) : null;
  // 28 Nov: a dashboard (the board tool): the dashboard itself, with the brain's checked words on top as its AI summary
  const board = o.screen?.doc;
  if (board && a.kind === "answer") {
    const stage = withAiSummary(board, say, a.points, lang, o.model);
    if (stage) return { ...r, steps, stage, say, stageOp };
  }
  const read = o.evidence.some((e) => !["console", "open_screen_action", "screen", "workspace"].includes(e.tool));
  if (!read && (steps.length || stageOp)) return { ...r, steps, stageOp, reply: say, say: null };
  if (a.kind === "chat" || (!read && !a.points.length && !a.show.length)) return { ...r, kind: "chat", reply: say };
  const period = (["daily", "weekly", "monthly", "quarterly"] as const).find((p) => p === b.state.period) ?? "daily";
  const stage: StageDocT | null = stageOf(o, b.text, w, { period, zone: b.state.zone ?? null, dept: b.state.dept ?? null, cat: b.state.cat ?? null, taluk: b.state.taluk ?? null });
  if (!stage) return { ...r, kind: steps.length ? "do" : "chat", steps, reply: say };
  return { ...r, steps, stage: { ...stage, say: { ...stage.say, [lang]: say.slice(0, lang === "ta" ? 2390 : 1590) }, voice: { by: "aide7", model: o.model, figures: [...new Set([...(stage.voice?.figures ?? []), ...figs(say)])].slice(0, 200) } }, say, stageOp };
}
