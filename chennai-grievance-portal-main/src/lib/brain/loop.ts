/**
 * One turn of the brain: Claude reads the request with the conversation and the screen, calls the tools it needs (several at once), reads their
 * results, and ends with one `answer`, which code checks against the results before a word of it is said (ground.ts). Haiku 5.5 does the work;
 * Sonnet 5.5 takes over for a hard turn (the model asks for it, an answer fails the check twice, or the turn goes on too long).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { claudeConfigured, claudeTools } from "@/lib/ai/claude";
import { ledger, type Lane } from "@/lib/thunai/ledger";
import { detectLang } from "@/lib/thunai/normalise";
import { telemetry } from "@/lib/thunai/telemetry";
import type { World } from "@/lib/thunai/types";
import { digestOf, outText } from "./format";
import { fitInput, whenFit } from "./fit";
import type { WhenIn } from "./when";
import { SLIP, checkAnswer, keepSound, knownOf, sentences, strayFigures, strayNames } from "./ground";
import { contextText, systemText } from "./prompt";
import { TOOLS } from "./tools";
import { ToolProblem, type BrainTool, type BrainUser, type ConsoleNow, type Evidence, type FinalAnswer, type Lang, type Show, type ToolCtx, type ToolOut } from "./types";

export const FAST = (): string => (process.env.JARVIS_BRAIN_MODEL ?? "").trim() || "claude-haiku-5-5";
export const DEEP = (): string => (process.env.JARVIS_BRAIN_DEEP ?? "").trim() || "claude-sonnet-5-5";
/** on unless JARVIS_BRAIN=0, and only while Claude may be called (its key, the owner's spend ceiling) */
export const brainOn = (): boolean => (process.env.JARVIS_BRAIN ?? "").trim() !== "0" && claudeConfigured();
const LANE = (): Lane => (process.env.BRAIN_EVAL === "1" ? "eval" : "brain");
const MAX_ROUNDS = 7;
/** Sonnet costs about twenty times Haiku: at most this many turns of it in a day */
const DEEP_A_DAY = () => Number(process.env.JARVIS_BRAIN_DEEP_DAY ?? 80) || 80;

const ANSWER_TOOL = {
  name: "answer",
  description: "End the turn: the answer (or the question back) to the Collector. Call it exactly once, alone, after the tools. Write kind, lang and say first.",
  eager_input_streaming: true,
  input_schema: {
    type: "object", additionalProperties: false, required: ["kind", "lang", "say", "title"],
    properties: {
      kind: { type: "string", enum: ["answer", "clarify", "chat", "refuse"], description: "answer: from the results; clarify: a question back with options; chat: small talk or general knowledge; refuse: private, harmful or forbidden" },
      lang: { type: "string", enum: ["en", "ta"], description: "the language of say" },
      say: { type: "string", description: "the answer itself, flowing sentences, the direct answer first" },
      title: { type: "string", description: "what the screen shows, at most 9 words" },
      points: { type: "array", items: { type: "string" }, description: "short lines for the screen, one finding each; [] for a one-line answer" },
      show: { type: "array", description: "what to draw, from the results", items: { type: "object", additionalProperties: false, required: ["as", "from"], properties: {
        as: { type: "string", enum: ["kpis", "table", "bars", "line", "donut", "heat", "cases", "news", "timeline", "map"] }, from: { type: "string", description: "result and table: r2.by" }, title: { type: "string" },
        label: { type: "string", description: "bars, donut, line, heat: the column with the names (line: the time)" }, value: { type: "string", description: "the column with the figure" }, series: { type: "string", description: "line, heat: the column that splits it" }, columns: { type: "array", items: { type: "string" }, description: "table: the columns, in order" }, limit: { type: "integer" } } } },
      options: { type: "array", description: "clarify only: 2 to 4 choices", items: { type: "object", additionalProperties: false, required: ["label", "request"], properties: { label: { type: "string", description: "a short button" }, request: { type: "string", description: "the whole request it stands for, in plain words" } } } }
    }
  }
};
const EXPERT_TOOL = { name: "ask_expert", description: "Hand this turn to the stronger model, with everything read so far. Use it when the request needs real reasoning over several results (a plan, a root cause, weighing options, a long report of many parts) or when you are unsure what is meant after reading the conversation.", input_schema: { type: "object", additionalProperties: false, properties: { why: { type: "string" } } } };

export interface BrainIn {
  text: string;
  channel: "voice" | "chat";
  user: BrainUser;
  world: World;
  now: string;
  console: ConsoleNow;
  /** the conversation it belongs to (memory.ts) */
  history: { user: string; assistant: string; digest?: string }[];
  past: Evidence[];
  kpi?: string | null; studio?: string | null; memory?: string[];
  /** the language the last sentences were in, when this one has none of its own */
  lastLang?: Lang | null;
  signal?: AbortSignal;
  /** when the answer must be done (epoch ms) */
  until: number;
  progress?: (label: { en: string; ta: string }) => void;
  /** a checked sentence of the answer, as soon as it is written (voice) */
  sentence?: (text: string, lang: Lang) => void;
  /** start with the stronger model (a forced deep turn) */
  deep?: boolean;
  /** the language chosen for the chat; null: the words' own */
  lang?: Lang | null;
}
export interface BrainOut {
  /** the words asked */
  question?: string;
  answer: FinalAnswer; evidence: Evidence[]; model: string; rounds: number; ms: number; firstMs: number | null; tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  steps: Record<string, unknown>[]; screen: { recipe: string; slots: Record<string, unknown> } | null; stageOp: { op: string; n: number | null; text: string | null } | null;
  /** why an answer was sent back, for the record */
  repaired: string[]; spoken: string[]; escalated: string | null;
  /** each model call's time and size, and each round's tools */
  trace: { model: string; ms: number; out: number; read: number; write: number; tools: string }[];
}

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlockParam;

const toolsFor = (u: BrainUser, channel: "voice" | "chat"): BrainTool[] => TOOLS.filter((t) => !(t.collectorOnly && u.role !== "collector") && !(channel === "chat" && (t.name === "open_screen_action" || t.name === "screen")));
const wireTools = (ts: BrainTool[], deepAllowed: boolean) => [...ts.map((t) => ({ name: t.name, description: t.description, input_schema: t.input })), ...(deepAllowed ? [EXPERT_TOOL] : []), ANSWER_TOOL] as unknown as Anthropic.Beta.BetaToolUnion[];

const TAMIL = /[஀-௿]/;
/** Tamil said in Latin letters: the everyday words that mark it */
const TANGLISH = /\b(?:enna|enga|enge|epdi|eppadi|eppo|evlo|evvalavu|ethana|ethanai|edhu|ethu|yaaru|yaar|indha|intha|andha|antha|inga|anga|iruk+u\w*|irukka\w*|illa|illai|illadha|venum|vendum|vendaam|kudu|kudunga|sollu|sollunga|solu|kaattu|kaatu|kaami\w*|pannu|pannunga|panni|paaru|paakanum|vandhu|vandha|vandhuchu|nadandha|nadakk\w*|aachu|aagum|aagala|innaikku|innikku|indru|netru|nethu|neththu|naalai|naalaikku|vaaram|maasam|maadham|pona|kadandha|rendu|moonu|naalu|anju|ellam|ellaam|ella|ellathukkum|mattum|adhigam\w*|adhiga|kammi|rombha|romba|konjam|oru|naan|nee|neenga|avanga|enakku|unakku|dhaan|thaan|pathi|patri|seithi|pugaar|sambavam|yean|ippo|appo|vera|saalai|thanni|mazhai|kuppai|ivlo|avlo|yen|yaen|kitta|la|pakkam|pakkathula|seri|aama|ille|thaana|adhula|idhula|edhula|eppudi|koodudha|kuraiyudha|prachanai|mudik\w+|panna|pannanum|naal|illaya|theriyuma|dhana|mattumdhan)\b/g;
/** the language the answer is owed in: the words' own, unless they ask for another */
export function owedLang(text: string, last: Lang | null | undefined): Lang | null {
  if (/\b(?:in|to)\s+(?:tamil|english|thamizh|tamizh)\b|தமிழில்|தமிழ்ல|ஆங்கிலத்தில்|english-?ல|\btamil(?:la|il)\b|\benglish(?:la|il)\b|translate/i.test(text)) return null;
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return last ?? null;
  if (TAMIL.test(text)) return (text.match(/[஀-௿]/g)?.length ?? 0) >= letters.length * 0.3 ? "ta" : null;
  const tg = (text.toLowerCase().match(TANGLISH) ?? []).length;
  if (tg >= 2 || detectLang(text) === "ta") return "ta";
  return tg ? null : "en";
}

function parseAnswer(raw: unknown): FinalAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const kind = ["answer", "clarify", "chat", "refuse"].includes(str(x.kind)) ? (str(x.kind) as FinalAnswer["kind"]) : "answer";
  const list = (v: unknown): unknown[] => { if (Array.isArray(v)) return v; if (typeof v === "string" && v.trim().startsWith("[")) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } } return []; };
  const say = str(x.say).replace(/\*\*/g, "").replace(/\s+/g, " ");
  if (!say) return null;
  return {
    kind, lang: str(x.lang) === "ta" || TAMIL.test(say) ? "ta" : "en", say, title: str(x.title).slice(0, 140), points: list(x.points).map(str).filter(Boolean).map((p) => p.replace(/^\s*[-•*]\s*/, "").replace(/\*\*/g, "")).slice(0, 18),
    show: list(x.show).filter((y): y is Record<string, unknown> => !!y && typeof y === "object").map((y) => ({ as: str(y.as) as Show["as"], from: str(y.from).replace(/^\[|\]$/g, ""), title: str(y.title) || null, label: str(y.label) || null, value: str(y.value) || null, series: str(y.series) || null, columns: Array.isArray(y.columns) ? y.columns.map(str).filter(Boolean) : null, limit: Number(y.limit) || null })).filter((y) => y.from).slice(0, 6),
    options: list(x.options).filter((y): y is Record<string, unknown> => !!y && typeof y === "object").map((y) => ({ label: str(y.label).slice(0, 60), request: str(y.request).slice(0, 220) })).filter((y) => y.label && y.request).slice(0, 4), used: []
  };
}

/** the `say` of an answer as far as it is written (the tool's JSON, half finished) */
export function partialSay(json: string): string | null {
  const m = json.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!m) return null;
  try { return JSON.parse(`"${m[1].replace(/\\[^"\\/bfnrtu]?$/, "").replace(/\\u[0-9a-fA-F]{0,3}$/, "")}"`); } catch { return null; }
}
const sayClosed = (json: string) => /"say"\s*:\s*"(?:[^"\\]|\\.)*"/.test(json);

/** a call that has not begun to answer by now is asked a second time, and the first to begin is used */
const HEDGE_MS = 6000;
/**
 * The conversation's thread, put beside the question: the context block (clock, tiles, files) stands between the last answer and the question, and
 * "Their main problems?" was once asked back as if nothing had been said (26 Nov).
 */
export function justBefore(hist: { user: string; assistant: string }[]): string {
  if (!hist.length) return "Nothing has been said before this.\n";
  const asked = hist.slice(-4).map((h) => `"${h.user.replace(/\s+/g, " ").slice(0, 160)}"`).join(", then ");
  return `THREAD: the Collector asked ${asked}. Your last answer: "${hist.at(-1)!.assistant.replace(/\s+/g, " ").slice(0, 420)}". A short or pronoun question continues this thread (same subject, place, window), unless its own words change it.\n`;
}
const ONE_WINDOW = new Set(["incidents", "dashboard", "briefing", "news"]);
function sameWindow(input: unknown): WhenIn | null {
  try { return whenFit((input as { when?: unknown } | null)?.when); } catch { return null; }
}

async function runTool(t: BrainTool, input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const ms = t.name === "briefing" || t.name === "map" || t.name === "evidence" ? 16_000 : 12_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([t.run(input, c), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new ToolProblem(`${t.name} took too long. Try a narrower call or another tool.`)), ms); })]);
  } finally { clearTimeout(timer); }
}

export async function think(i: BrainIn): Promise<BrainOut | null> {
  const t0 = Date.now();
  const deepLeft = (() => { try { return ledger().spent("anthropic", DEEP(), 86_400_000, LANE()).requests < DEEP_A_DAY() * 4; } catch { return true; } })();
  let model = i.deep && deepLeft ? DEEP() : FAST();
  let escalated: string | null = i.deep ? "forced" : null;
  const ts = toolsFor(i.user, i.channel);
  const byName = new Map(ts.map((t) => [t.name, t]));
  const sys = systemText(i.world);
  const system = [{ type: "text" as const, text: sys, cache_control: { type: "ephemeral" as const, ttl: "1h" as const } }];
  const messages: Msg[] = [];
  const hist = i.history.slice(-8);
  hist.forEach((h, k) => {
    messages.push({ role: "user", content: h.user });
    messages.push({ role: "assistant", content: `${h.assistant}${h.digest && k >= hist.length - 3 ? `\n\n<read_then>\n${h.digest}\n</read_then>` : ""}` });
  });
  messages.push({ role: "user", content: [{ type: "text", text: contextText({ now: i.now, channel: i.channel, user: i.user, con: i.console, kpi: i.kpi, studio: i.studio, memory: i.memory, lang: i.lang ?? null }) }, { type: "text", text: `${justBefore(hist)}The Collector says: ${i.text}`, cache_control: { type: "ephemeral" } }] });
  const evidence: Evidence[] = [];
  const ctx: ToolCtx = { user: i.user, world: i.world, now: i.now, signal: i.signal, turn: evidence, past: i.past, console: i.console, channel: i.channel };
  const want = i.lang ?? owedLang(i.text, i.lastLang);
  const said = [i.text, ...i.history.flatMap((h) => [h.user, h.assistant, h.digest ?? ""]), i.kpi ?? "", i.console.screen ?? "", i.console.screenTitle ?? "", i.studio ?? "", i.now, contextText({ now: i.now, channel: i.channel, user: i.user, con: i.console })];
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const repaired: string[] = [], spoken: string[] = [];
  const trace: BrainOut["trace"] = [];
  let firstMs: number | null = null, rounds = 0, bad = 0, seq = 0, toolErrors = 0, badJson = 0;
  const speak = (line: string, lang: Lang) => { if (spoken.includes(line)) return; spoken.push(line); firstMs ??= Date.now() - t0; try { i.sentence?.(line, lang); } catch { /* the listener is gone */ } };
  let best: FinalAnswer | null = null;
  let window: WhenIn | null = null;

  while (rounds < MAX_ROUNDS && Date.now() < i.until - 500) {
    rounds++;
    const est = Math.ceil(sys.length / 4 / 10) + 4000;
    const room = ledger().room("anthropic", model, { tokens: est });
    if (!room.ok) { if (model !== FAST()) { model = FAST(); continue; } telemetry("brain", { ok: false, why: room.why ?? "room", ms: Date.now() - t0 }); return best ? finish(best) : null; }
    // (never forced before anything was read: a slow start once made it answer "placeholder", 26 Nov)
    const last = (evidence.length > 0 || bad > 0) && (rounds >= MAX_ROUNDS - 1 || Date.now() > i.until - 6000);
    let streamed = 0, broke = false;
    const k0 = knownOf([...i.past, ...evidence], said);
    let r: Awaited<ReturnType<typeof claudeTools>>;
    try {
      r = await claudeTools({
        name: "brain", model, system, tools: wireTools(ts, model === FAST() && deepLeft && !escalated), messages, maxTokens: 4096, effort: model === FAST() && rounds <= 2 ? ((process.env.JARVIS_BRAIN_EFFORT as "low" | "medium") || "medium") : "low", think: (process.env.JARVIS_BRAIN_THINK ?? "1") !== "0",
        timeoutMs: Math.max(4000, Math.min(25_000, i.until - Date.now())), hedgeMs: HEDGE_MS, signal: i.signal,
        // the last round must answer (Haiku takes a forced choice; the newer models do not)
        ...(last && model === FAST() ? { toolChoice: { type: "tool" as const, name: "answer" } } : {}),
        // the checked sentences of a spoken answer go out as they are written
        onToolJson: i.sentence ? (_ix, tool, json) => {
          // an answer written beside other calls is not the answer yet, and one that has read nothing waits to be checked whole
          if (tool !== "answer") broke = true;
          if (broke || (!evidence.length && /"kind"\s*:\s*"answer"/.test(json))) return;
          if (/"kind"\s*:\s*"(?:clarify|refuse)"/.test(json)) return;
          const p = partialSay(json);
          if (!p) return;
          const done = sayClosed(json);
          const ss = sentences(p.replace(/\*\*/g, ""));
          const ready = done ? ss : ss.slice(0, -1);
          for (; streamed < ready.length; streamed++) {
            const line = ready[streamed];
            const lang: Lang = TAMIL.test(line) ? "ta" : "en";
            if (SLIP.test(line) || strayFigures(line, k0).length || strayNames(line, k0, i.world).length || /\bINC-\d|\br\d+\.\w+/.test(line) || (want && want !== lang) || (evidence.length === 0 && /\d/.test(line))) { broke = true; return; }
            speak(line, lang);
          }
        } : undefined
      });
    } catch (e) {
      if (i.signal?.aborted) throw e;
      telemetry("brain", { ok: false, why: (e as Error).name, ms: Date.now() - t0, model });
      // a tool's input that was not written whole (eager streaming hands it on unchecked): the same request once more
      if (/parse tool parameter JSON|JSON at position|Unexpected end of JSON/i.test((e as Error).message ?? "") && badJson++ < 2) continue;
      if (model !== FAST()) { model = FAST(); escalated = null; continue; }
      console.warn(`[brain] ${(e as Error).message?.slice(0, 200)}`);
      return best ? finish(best) : null;
    }
    if (model === FAST()) brainUsed();
    tokens.input += r.inputTokens; tokens.output += r.outputTokens; tokens.cacheRead += r.cacheReadTokens; tokens.cacheWrite += r.cacheWriteTokens;
    // the day's count: what is read from the cache is billed at a tenth, and counted so
    ledger().record("anthropic", model, { tokens: r.inputTokens - r.cacheReadTokens + Math.ceil(r.cacheReadTokens / 10) + r.outputTokens, lane: LANE() });
    const m = r.message;
    if (m.stop_reason === "refusal") return finish({ kind: "refuse", lang: want ?? "en", say: want === "ta" ? "அதற்கு என்னால் உதவ முடியாது." : "I can't help with that.", title: "", points: [], show: [], options: [], used: [] });
    messages.push({ role: "assistant", content: m.content as unknown as Block[] });
    const uses = m.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    trace.push({ model, ms: r.ms, out: r.outputTokens, read: r.cacheReadTokens, write: r.cacheWriteTokens, tools: uses.map((u) => u.name).join("+") });
    if (!uses.length) {
      // plain words instead of the answer tool: taken as the answer when they stand, else asked for properly
      const text = m.content.map((b) => (b.type === "text" ? b.text : "")).join(" ").trim();
      if (m.stop_reason === "max_tokens" || !text || rounds >= MAX_ROUNDS) { if (best) return finish(best); messages.push({ role: "user", content: "Finish now: call answer." }); continue; }
      messages.push({ role: "user", content: "Give that through the answer tool." });
      continue;
    }
    const ans = uses.find((u) => u.name === "answer");
    if (ans && uses.length === 1) {
      const a = parseAnswer(ans.input);
      if (!a) { messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: ans.id, is_error: true, content: "say is missing. Call answer again." }] }); continue; }
      const k = knownOf([...i.past, ...evidence], said);
      const v = checkAnswer(a, k, i.world, { toolsRun: evidence.length, wantLang: want });
      if (v.ok || bad >= 2 || Date.now() > i.until - 3500) {
        if (v.ok) return finish(a);
        const sound = keepSound(a, k, i.world);
        if (sound.say) { telemetry("brain_kept", { why: v.why[0]?.slice(0, 40).replace(/\s+/g, "-"), model }); return finish(sound); }
        if (best) return finish(best);
        return finish({ ...a, say: want === "ta" ? "பதிவுகளில் இருந்து உறுதியாகச் சொல்ல முடியவில்லை. அட்டவணை திரையில் உள்ளது." : "I could not confirm that from the records. What I read is on the screen.", points: [], title: "" });
      }
      bad++;
      repaired.push(v.why.join("; ").slice(0, 300));
      if (v.why.some((x) => /in no result/.test(x)) === false || keepSound(a, k, i.world).say) best = keepSound(a, k, i.world).say ? keepSound(a, k, i.world) : best;
      if (bad >= 2 && model === FAST() && deepLeft && !escalated && i.until - Date.now() > 9000) { model = DEEP(); escalated = "check"; }
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: ans.id, is_error: true, content: `Not accepted: ${v.why.join("; ")}. Correct it and call answer again${evidence.length ? "" : ", or call a tool first"}.` }] });
      continue;
    }
    if (uses.some((u) => u.name === "ask_expert")) { model = DEEP(); escalated = "asked"; }
    // the tools, all at once
    const results = await Promise.all(uses.map(async (u): Promise<Block> => {
      if (u.name === "ask_expert") return { type: "tool_result", tool_use_id: u.id, content: "You are the stronger model now: go on from here." };
      if (u.name === "answer") return { type: "tool_result", tool_use_id: u.id, is_error: true, content: "Call answer alone, once the other tools have returned." };
      const t = byName.get(u.name);
      if (!t) return { type: "tool_result", tool_use_id: u.id, is_error: true, content: `There is no tool ${u.name}.` };
      const s = Date.now();
      i.progress?.(t.doing);
      try {
        const input = fitInput(t, (u.input ?? {}) as Record<string, unknown>);
        // one question, one window: a call that names none takes the one its neighbours named (a quarter's trend with the day's follow-ups beside it, 26 Nov)
        if (input.when) window ??= input.when as WhenIn;
        else if (ONE_WINDOW.has(t.name) && !(t.name === "news" && input.view === "missing_from_records")) { const w = window ?? uses.map((y) => sameWindow(y.input)).find(Boolean); if (w) input.when = w; }
        const out = await runTool(t, input, ctx);
        const id = `r${++seq}`;
        out.parts = out.parts.map((p) => ({ ...p, key: p.key.startsWith(`${id}.`) ? p.key : `${id}.${p.key}` }));
        evidence.push({ id, tool: t.name, input, out, ms: Date.now() - s });
        return { type: "tool_result", tool_use_id: u.id, content: outText(id, out, t.name === "briefing" ? 14 : 40).slice(0, 14_000) };
      } catch (e) {
        if (i.signal?.aborted) throw e;
        toolErrors++;
        if (!(e instanceof ToolProblem)) console.warn(`[brain] ${u.name}: ${(e as Error).message?.slice(0, 240)}`);
        return { type: "tool_result", tool_use_id: u.id, is_error: true, content: e instanceof ToolProblem ? e.message.slice(0, 2500) : "That call failed. Try it another way, or another tool." };
      }
    }));
    const lastR = results.at(-1) as { cache_control?: unknown };
    for (const msg of messages) if (Array.isArray(msg.content)) for (const b of msg.content as { cache_control?: unknown }[]) if (b.cache_control && messages.indexOf(msg) > hist.length * 2) delete b.cache_control;
    lastR.cache_control = { type: "ephemeral" };
    messages.push({ role: "user", content: results });
    if (model === FAST() && deepLeft && !escalated && (toolErrors >= 4 || rounds >= 5) && i.until - Date.now() > 9000) { model = DEEP(); escalated = "long"; }
  }
  return best ? finish(best) : null;

  function finish(a: FinalAnswer): BrainOut {
    const steps = evidence.flatMap((e) => e.out.steps ?? []);
    const screen = [...evidence].reverse().find((e) => e.out.screen)?.out.screen ?? null;
    const stageOp = [...evidence].reverse().find((e) => e.out.stageOp)?.out.stageOp ?? null;
    // what was not yet said of the checked answer
    if (i.sentence && a.kind !== "clarify") for (const line of sentences(a.say)) speak(line, TAMIL.test(line) ? "ta" : "en");
    const show = validShow(a.show, evidence);
    const out: BrainOut = { question: i.text, answer: { ...a, show, used: [...new Set(show.map((s) => s.from.split(".")[0]))] }, evidence, model, rounds, ms: Date.now() - t0, firstMs, tokens, steps, screen, stageOp, repaired, spoken, escalated, trace };
    telemetry("brain", { ok: true, kind: a.kind, model, round: rounds, ms: out.ms, tokens: tokens.input + tokens.output, calls: evidence.length, count: repaired.length, why: escalated ?? undefined });
    return out;
  }
}

const BRIEF_SECTIONS: [string, Show["as"]][] = [["figures", "kpis"], ["serious", "cases"], ["actions", "table"], ["news", "news"], ["differ", "table"], ["missing", "cases"], ["stories", "table"], ["departments", "table"], ["taluks", "bars"], ["kinds", "bars"], ["warnings", "table"], ["beds", "table"], ["lakes", "bars"], ["jams", "table"], ["tasks", "table"], ["review", "table"]];
/** what is drawn exists, with rows; nothing named and a list read: the best table is drawn */
export function validShow(show: Show[], evidence: Evidence[]): Show[] {
  const parts = new Map(evidence.flatMap((e) => e.out.parts.map((p) => [p.key, p] as const)));
  const out: Show[] = [];
  for (const s of show) {
    const key = parts.has(s.from) ? s.from : [...parts.keys()].find((k) => k === `${s.from}.by` || k === `${s.from}.cases` || k.startsWith(`${s.from}.`) || k.endsWith(`.${s.from}`));
    const p = key ? parts.get(key) : null;
    if (!p?.rows.length || out.some((x) => x.from === key && x.as === s.as)) continue;
    // a trend is drawn as a trend
    const as = p.of === "series" && (s.as === "table" || s.as === "bars") && new Set(p.rows.map((r) => r.day ?? r.week ?? r.month)).size >= 2 && p.cols.some((c) => ["day", "week", "month"].includes(c.key)) ? "line" : p.of === "timeline" && s.as === "table" ? "timeline" : s.as;
    out.push({ ...s, as, from: key! });
  }
  // a whole briefing shows every section that has something (the owner, 26 Nov: "the briefing was simply incidents; everything should be included")
  const b = [...evidence].reverse().find((e) => e.tool === "briefing" && !(Array.isArray(e.input.topics) && e.input.topics.length));
  if (b && evidence.at(-1) === b) for (const [k, as] of BRIEF_SECTIONS) {
    const key = `${b.id}.${k}`, p = parts.get(key);
    if (p?.rows.length && !out.some((x) => x.from === key) && out.length < 13) out.push({ as, from: key });
  }
  return out;
}

export { digestOf };

// ---------------------------------------------------------------- warm-up --

const W = globalThis as { __brainWarm?: { at: number; busy: boolean } };
/**
 * Writes the brain's fixed prompt (its instructions and tools) into Claude's cache, and the `cases` table, before the first question needs them:
 * when Jarvis or the chat opens, at most once in 50 minutes (the cache keeps it an hour after its last use). One token is asked for.
 */
/** `deep`: also read what a briefing reads (the keep-warm's quiet moments only: on opening Jarvis it held the first question up) */
export async function warmBrain(w: World, force = false, deep = false): Promise<boolean> {
  if (!brainOn()) return false;
  const s = (W.__brainWarm ??= { at: 0, busy: false });
  if (s.busy || (!force && Date.now() - s.at < 50 * 60_000)) return false;
  s.busy = true;
  try {
    const { caseRows } = await import("./sql");
    await caseRows("SELECT 1 FROM cases LIMIT 1").catch(() => null);
    const user: BrainUser = { email: "warm", role: "collector", lockDept: null };
    for (const channel of ["voice", "chat"] as const) {
      const r = await claudeTools({ name: "brain-warm", model: FAST(), system: [{ type: "text", text: systemText(w), cache_control: { type: "ephemeral", ttl: "1h" } }], tools: wireTools(toolsFor(user, channel), true), messages: [{ role: "user", content: "warm" }], maxTokens: 1, effort: ((process.env.JARVIS_BRAIN_EFFORT as "low" | "medium") || "medium"), think: (process.env.JARVIS_BRAIN_THINK ?? "1") !== "0", timeoutMs: 15_000 });
      ledger().record("anthropic", FAST(), { tokens: r.inputTokens - r.cacheReadTokens + Math.ceil(r.cacheReadTokens / 10) + r.outputTokens, lane: "warm" });
    }
    s.at = Date.now();
    // what a briefing reads (the live traffic, the stories, the review list) is read once, so the first briefing asked for takes seconds, not ten
    if (deep) void import("@/lib/collector/intel").then(async ({ asOf }) => {
      const t = TOOLS.find((x) => x.name === "briefing");
      await t?.run({}, { user, world: w, now: await asOf(), turn: [], past: [], console: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, incident: null }, channel: "voice" } as unknown as ToolCtx);
    }).catch(() => undefined);
    return true;
  } catch { return false; } finally { s.busy = false; }
}
/** a question was answered: the cache is warm for another hour */
export const brainUsed = (): void => { (W.__brainWarm ??= { at: 0, busy: false }).at = Date.now(); };
