/**
 * What the bar shows, worked out in plain functions so it can be tested without a browser (v4, Pillar 6): the caption's
 * highlighted word, the progress line, the evidence chip, the mission card's phase, what a screen reader hears, and the key
 * that means "listen". Every number shown here comes from the store, which only code writes.
 */
import type { StageDocT } from "@/lib/thunai/stage";
import type { HudEvidence, HudMission, WorkStep } from "./hudstore";

const SPACE = /\s/;

// ------------------------------------------------------------------ captions --

/**
 * The word the voice is on, as whole words: the speech engine's character index can land inside a word (a Tamil vowel sign, a
 * word joined by a hyphen), and splitting there would break a Tamil letter apart. So the highlight snaps to the whole word that
 * holds the index, from the space before it to the space after it.
 */
export function captionParts(text: string, char: number | null): { done: string; word: string; rest: string } {
  if (char == null || !text) return { done: "", word: "", rest: text };
  const c = Math.max(0, Math.min(text.length, Math.floor(char)));
  let a = c;
  while (a > 0 && !SPACE.test(text[a - 1])) a--;
  while (a < text.length && SPACE.test(text[a])) a++;
  let b = a;
  while (b < text.length && !SPACE.test(text[b])) b++;
  return { done: text.slice(0, a), word: text.slice(a, b), rest: text.slice(b) };
}

/** which word (0-based, words split at spaces) the voice is on; null with no index */
export function wordIndexAt(text: string, char: number | null): number | null {
  if (char == null) return null;
  const { done } = captionParts(text, char);
  return done.split(/\s+/).filter(Boolean).length;
}

/**
 * The caption, a page at a time: a long piece is cut at spaces into pages of at most `max` characters, and the page holding the
 * word is shown. Pages do not slide word by word (that would make the line jump as it is read); a new page fades in whole.
 */
export function captionView(text: string, char: number | null, max = 140): { page: number; done: string; word: string; rest: string; before: boolean; after: boolean } {
  const pages: { from: number; to: number }[] = [];
  let from = 0;
  while (from < text.length) {
    let to = Math.min(text.length, from + max);
    if (to < text.length) {
      const cut = text.lastIndexOf(" ", to);
      if (cut > from) to = cut + 1;
    }
    pages.push({ from, to });
    from = to;
  }
  if (!pages.length) pages.push({ from: 0, to: 0 });
  const at = char == null ? 0 : Math.max(0, Math.min(text.length - 1, char));
  const k = Math.max(0, pages.findIndex((p) => at >= p.from && at < p.to));
  const p = pages[k] ?? pages[0];
  const slice = text.slice(p.from, p.to).trimEnd();
  const parts = captionParts(slice, char == null ? null : at - p.from);
  return { page: k, ...parts, before: k > 0, after: k < pages.length - 1 };
}

// ------------------------------------------------------------------ progress --

/** "320 ms", "1.2 s"; Tamil "மி.வி" and "வி" */
export function fmtMs(ms: number, ta = false): string {
  const v = Math.max(0, Math.round(ms));
  if (v < 1000) return `${v} ${ta ? "மி.வி" : "ms"}`;
  return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)} ${ta ? "வி" : "s"}`;
}

/**
 * The steps of the turn now running: those that began at or after its start (HudState.turnAt, set when a sentence to Jarvis ends and
 * when a turn begins). An earlier turn's steps never show on this one's progress line.
 */
export const currentSteps = (steps: WorkStep[], since: number): WorkStep[] => steps.filter((s) => s.at >= since);

/** The progress line's steps: the real ones from the store, the last few that fit, and how many earlier ones are not shown. */
export function progressItems(steps: WorkStep[], max = 4): { shown: WorkStep[]; earlier: number } {
  const shown = steps.slice(-max);
  return { shown, earlier: steps.length - shown.length };
}

// ------------------------------------------------------------------ evidence --

const short = (m: string) => m.replace(/^.*\//, "").replace(/#\d+$/, "");

/**
 * The time the evidence chip may show for the answer of turn `gen`: what was measured for that turn (to its first audio, else to its
 * answer on screen), never another turn's. The rules and the instant controls have no brain time of their own (0).
 */
export function turnMs(m: { gen: number; findingMs: number | null; lastMs: number | null } | null, gen: number): number | null {
  if (!m || m.gen !== gen) return null;
  return m.findingMs ?? m.lastMs ?? null;
}

/**
 * The evidence for an answer, from code only: who understood it (the turn's brain), how long it took, and, when a screen was
 * built, its method, how many records, its period, its sources and when the data is from. A model's words never reach it.
 */
export function evidenceOf(brain: { by: "rules" | "ai" | "instant"; model: string | null; ms: number } | null, doc: StageDocT | null, measuredMs: number | null = null): HudEvidence | null {
  if (!brain && !doc) return null;
  const by = brain?.by ?? "rules";
  const ms = brain && brain.ms > 0 ? brain.ms : measuredMs;
  let method: string | null = null;
  let n: number | null = null;
  for (const b of doc?.blocks ?? []) {
    if (method == null) {
      if (b.kind === "Findings" && b.items[0]) method = b.items[0].method;
      else if (b.kind === "Ranking" && b.method) method = b.method;
      else if (b.kind === "MapView" && b.rule) method = b.rule;
    }
    if (n == null) {
      if (b.kind === "CaseList" || b.kind === "NewsReader") n = b.total;
      else if (b.kind === "Findings" && b.items[0]) n = b.items[0].n;
      else if (b.kind === "Readings" && b.items.length) n = b.items.length;
      else if (b.kind === "Ranking" && b.items.length) n = b.items.length;
    }
  }
  return {
    by,
    model: by === "ai" && brain?.model ? short(brain.model) : null,
    ms: ms != null && Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null,
    method: method ? method.trim().slice(0, 120) || null : null,
    n: n != null && Number.isFinite(n) ? n : null,
    period: doc?.scope?.period ?? null,
    // v18/v19: a window of the screen's own, in its words (the chip said "Today" under "last 2 days")
    ...(doc?.when ? { when: [doc.when.en, doc.when.ta] as [string, string] } : {}),
    sources: [...new Set(doc?.sources ?? [])],
    asOf: doc?.asOf ?? null
  };
}

const PERIOD: Record<NonNullable<HudEvidence["period"]>, [string, string]> = {
  daily: ["Today", "இன்று"], weekly: ["This week", "இந்த வாரம்"], monthly: ["Last 30 days", "கடந்த 30 நாள்"], quarterly: ["Last 90 days", "கடந்த 90 நாள்"]
};
/** a data table's own name (change_drivers) is not a source the Collector would recognise */
const tableName = (s: string) => /^[a-z0-9_]+$/.test(s);

/** The chip, in parts: "AI · claude-opus-5-5 · 2.4 s · modified z-score · n = 47 · This week · GCC 1913 +1". */
export function evidenceParts(e: HudEvidence, ta = false): string[] {
  const out: string[] = [];
  out.push(e.by === "ai" ? "AI" : e.by === "instant" ? (ta ? "உடனடி" : "Instant") : (ta ? "விதிகள்" : "Rules"));
  if (e.model) out.push(e.model);
  if (e.ms != null) out.push(fmtMs(e.ms, ta));
  if (e.method) out.push(e.method.length > 48 ? `${e.method.slice(0, 47).trimEnd()}…` : e.method);
  if (e.n != null) out.push(`n = ${e.n.toLocaleString("en-IN")}`);
  if (e.when) out.push(e.when[ta ? 1 : 0]);
  else if (e.period) out.push(PERIOD[e.period][ta ? 1 : 0]);
  const named = e.sources.filter((s) => !tableName(s));
  const rest = e.sources.length - Math.min(2, named.length);
  if (e.sources.length) out.push(named.length ? `${named.slice(0, 2).join(", ")}${rest > 0 ? ` +${rest}` : ""}` : `${ta ? "ஆதாரங்கள்" : "sources"} ${e.sources.length}`);
  return out;
}

// ------------------------------------------------------------------ mission --

/** a plan waiting for Start, a mission running, or one that has finished (every step past pending, none running) */
export function missionPhase(m: HudMission): "plan" | "running" | "done" {
  if (m.running) return "running";
  return m.steps.every((x) => x.state === "pending") ? "plan" : "done";
}

/** the time the finished steps took, as code measured it (null when none has a time) */
export function missionMs(m: HudMission): number | null {
  const t = m.steps.filter((x) => x.ms != null);
  return t.length ? t.reduce((a, x) => a + (x.ms ?? 0), 0) : null;
}

// ------------------------------------------------------------------ screen reader --

/** a live region says what it holds only once that has stood this long: an answer growing sentence by sentence is read once */
export const SETTLE_MS = 500;

export interface Heard { word: string; answer: string; alert?: string }
/**
 * What the polite live region says when the bar settles (the caller waits half a second): something Jarvis noticed first, then a
 * new answer, else a new state word. Never the words being heard: a partial transcript is not announced.
 */
export function announcement(prev: Heard, next: Heard): string | null {
  if (next.alert && next.alert !== prev.alert) return next.alert;
  if (next.answer && next.answer !== prev.answer) return next.answer;
  if (next.word && next.word !== prev.word) return next.word;
  return null;
}

// ------------------------------------------------------------------ keyboard --

/**
 * The key that means "listen": Ctrl+Shift+Space. Alt+Space was the key before v4, but on Windows Alt+Space opens the window's
 * system menu (and is PowerToys Run's default), so the browser may never pass it to the page.
 */
export const LISTEN_KEY = "Ctrl+Shift+Space";
export function isListenKey(e: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "code">): boolean {
  return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "Space";
}
