import { studioLines } from "./studiosql";
/**
 * The one door to the brain, for Jarvis (round.ts) and Ask District IQ (pipeline.ts): the conversation, the console's state and its tiles go in, the
 * checked answer with what it rests on comes out. Null: the brain could not answer (Claude off, busy or out of time) and the caller's older lanes do.
 */
import { asOf, overview } from "@/lib/collector/intel";
import { asksForbiddenOrder } from "@/lib/thunai/privacy";
import type { World } from "@/lib/thunai/types";
import { historyOf, keep, lastLangOf, pastOf, recall, type Turn } from "./memory";
import { brainOn, think, type BrainOut } from "./loop";
import type { BrainUser, ConsoleNow, Lang } from "./types";

export { brainOn, warmBrain } from "./loop";
export type { BrainOut } from "./loop";

export interface AskIn {
  text: string; channel: "voice" | "chat"; user: BrainUser; world: World; console: ConsoleNow;
  /** the conversation's key: one person's Jarvis, or one chat */
  key: string;
  /** the words of earlier turns, when this server has not kept them (a restart) */
  seed?: { user: string; assistant: string }[];
  memory?: string[];
  signal?: AbortSignal;
  until: number;
  progress?: (label: { en: string; ta: string }) => void;
  sentence?: (text: string, lang: Lang) => void;
  deep?: boolean;
  /** the language chosen for the chat; null: the words' own */
  lang?: Lang | null;
}

/** words of a file's name that say nothing of what it holds */
const DULL = new Set("chennai daily weekly monthly data dataset file list location locations station stations type types district department management report reports record records count counts details number the and for with from name total summary information".split(" "));
/** the files are put before the model only when the talk is of them (their names beside every question once drew a plain follow-up away) */
export function studioAsked(names: string | null, said: string): boolean {
  if (!names) return false;
  const t = said.toLowerCase();
  if (/\b(?:files?|data ?sets?|data studio|studio|upload(?:ed|s)?|csv|excel|spread ?sheets?|sheets?|my (?:own )?data|your data|dashboards?|added (?:data|links?|sources?)|external links?)\b|தரவுத்தொகுப்பு|கோப்பு|பதிவேற்ற/i.test(t)) return true;
  const stem = (w: string) => w.replace(/(?:ies|es|s)$/, "");
  const mine = new Set((names.toLowerCase().match(/[a-z஀-௿]{4,}/g) ?? []).filter((w) => !DULL.has(w)).map(stem));
  return (t.match(/[a-z஀-௿]{4,}/g) ?? []).some((w) => mine.has(stem(w)));
}
const kpis = new Map<string, { at: number; v: string }>();
/** the dashboard's tiles as the console is filtered, in a line (so a plain "how many severe today" needs no second read) */
async function tilesLine(c: ConsoleNow, u: BrainUser): Promise<string | null> {
  const period = (["daily", "weekly", "monthly", "quarterly"] as const).find((p) => p === c.period) ?? "daily";
  const key = [period, c.zone ?? "", u.lockDept ?? c.dept ?? "", c.cat ?? "", c.taluk ?? ""].join("|");
  const had = kpis.get(key);
  if (had && Date.now() - had.at < 60_000) return had.v;
  const read = overview(period, c.zone ?? null, u.lockDept ?? c.dept ?? null, { cat: c.cat ?? null, taluk: c.taluk ?? null }).then((o) => {
    const k = o.kpi.cur as Record<string, number>, p = o.kpi.prev as Record<string, number>;
    const v = `${o.periodInfo.label}: reported ${k.reported} (before ${p.reported}), severe ${k.severe} (${k.severe_open} still open; before ${p.severe}), open ${k.ongoing} (before ${p.ongoing}), open citizen complaints ${k.complaints}, resolved ${k.resolved} (before ${p.resolved})`;
    kpis.set(key, { at: Date.now(), v });
    if (kpis.size > 40) kpis.delete(kpis.keys().next().value as string);
    return v;
  }).catch(() => null);
  let t: ReturnType<typeof setTimeout> | undefined;
  const out = await Promise.race([read, new Promise<null>((r) => { t = setTimeout(() => r(null), 900); })]);
  clearTimeout(t);
  return out ?? had?.v ?? null;
}

export async function askBrain(i: AskIn): Promise<BrainOut | null> {
  if (!brainOn()) return null;
  const now = await asOf();
  const turns: Turn[] = recall(i.key);
  const history = turns.length ? historyOf(turns) : (i.seed ?? []).slice(-6);
  const [kpi, files] = await Promise.all([tilesLine(i.console, i.user), Promise.resolve().then(() => (i.user.role === "collector" ? studioLines({ role: "collector", lockDept: null }) : null)).catch(() => null)]);
  const studio = i.console.page === "studio" || i.console.dataset || studioAsked(files ? (files.match(/"[^"]+"/g) ?? []).join(" ") : null, [i.text, ...history.slice(-2).map((h) => h.user)].join(" ")) ? files : null;
  const out = await think({ text: i.text, channel: i.channel, user: i.user, world: i.world, now, console: i.console, history, past: pastOf(turns), kpi, studio, memory: i.memory, lastLang: lastLangOf(turns), signal: i.signal, until: i.until, progress: i.progress, sentence: i.sentence, deep: i.deep, lang: i.lang ?? null });
  if (out) keep(i.key, { at: Date.now(), user: i.text, answer: out.answer, evidence: out.evidence });
  return out;
}

/** the console's own words for things it never does (asked in front of the brain, in code) */
export const forbiddenOrder = (text: string): boolean => asksForbiddenOrder(text);
