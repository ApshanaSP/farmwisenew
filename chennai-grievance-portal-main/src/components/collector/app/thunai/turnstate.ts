/**
 * What the browser's turn loop (Thunai.tsx) carries from one sentence to the next and sends to the planner (v4), kept pure so
 * it is tested without a browser:
 *   - the last turns as memory: what was heard, what was done, the screen's recipe and slots, a one-line result (no citizen
 *     text, no figure the model wrote);
 *   - observations of the console steps a round asked for, the last one carrying the digest of the screen now showing;
 *   - how sure the ears were, and what that changes (an unsure sentence is put as a question before it runs);
 *   - the two speeds: a turn past 10 s shows its running steps and a Stop; nothing is shown for a quick one;
 *   - the honest spoken acknowledgement: only when nothing of the answer has started 1.2 s after the end of speech;
 *   - the live captions, only while an addressed sentence is being heard.
 */
import { figuresIn, gateChunk } from "@/lib/thunai/numbergate";
import type { StageDocT } from "@/lib/thunai/stage";
import type { Lang, ScreenState } from "@/lib/thunai/types";

// ---------------------------------------------------------------- memory --
export interface MemTurn { heard: string; did: string; recipe?: string; slots?: Record<string, unknown>; result?: string }

export const RESULT_MAX = 120;
/** slots the model fills with its own words: their figures are dropped, and a slot still holding a number word is dropped */
const FREE_TEXT = new Set(["q", "name", "text", "title", "label", "request", "topic", "query", "what", "about"]);
const DIGITS = /\p{Nd}+(?:[.,]\p{Nd}+)*\s*%?/gu;

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).trim()}…`;
};

function freeText(v: string, max: number): string | undefined {
  const t = v.replace(DIGITS, " ").replace(/\s+/g, " ").trim();
  if (!t || figuresIn(t).length) return undefined;
  return t.slice(0, max);
}

function slotValue(k: string, v: unknown): unknown {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return FREE_TEXT.has(k) ? freeText(v, 80) : v.slice(0, 60);
  if (Array.isArray(v)) {
    const out = v.slice(0, 10).map((x) => (typeof x === "string" ? (FREE_TEXT.has(k) ? freeText(x, 40) : x.slice(0, 40)) : typeof x === "number" || typeof x === "boolean" ? x : undefined)).filter((x) => x !== undefined);
    return out.length ? out : undefined;
  }
  return undefined;
}

/** A screen's slots, small enough for the prompt: scalars and short lists only, free text without figures, under 400 characters. */
export function compactSlots(slots: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  let size = 2;
  for (const [k, raw] of Object.entries(slots ?? {})) {
    // the round's schema takes slot names of up to 24 characters (brain.ts TurnBody)
    if (k.length > 24 || raw == null || raw === "" || (Array.isArray(raw) && !raw.length)) continue;
    const v = slotValue(k, raw);
    if (v === undefined) continue;
    const add = JSON.stringify(k).length + JSON.stringify(v).length + 2;
    if (size + add > 400) continue;
    out[k] = v;
    size += add;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * One line of what came of a turn, at most 120 characters. `allowed`: the figures it may hold ("code" for a line code wrote
 * from the data); a line holding any other figure is not kept (undefined), so no figure the model wrote reaches the prompt.
 */
export function resultLine(text: string | null | undefined, allowed: Set<string> | "code"): string | undefined {
  if (!text) return undefined;
  const t = clip(text, RESULT_MAX);
  if (!t) return undefined;
  if (allowed !== "code" && !gateChunk(t, allowed).ok) return undefined;
  return t;
}

/** What a screen showed, in a line: never an incident's own title (a citizen's words), only code's figures. */
export function screenResult(doc: Pick<StageDocT, "recipe" | "title" | "slots" | "blocks">, allowed: Set<string>): string {
  if (doc.recipe === "case") return clip(`incident ${String(doc.slots?.id ?? "").slice(0, 40)}`, RESULT_MAX);
  const head = (() => {
    for (const b of doc.blocks) {
      if (b.kind === "CaseList") return `${b.total} ${b.total === 1 ? "case" : "cases"}`;
      if (b.kind === "Kpis" && b.items[0]) return `${b.items[0].label} ${b.items[0].value}${b.items[0].unit ? ` ${b.items[0].unit}` : ""}`;
    }
    return "";
  })();
  const title = resultLine(doc.title, allowed);
  const line = [title ?? `${doc.recipe} screen`, head ? `(${head})` : ""].filter(Boolean).join(" ");
  return clip(line, RESULT_MAX);
}

/**
 * A screen opened from a control, a pin, an offer or a "Tell me" (no sentence was heard): the turn's "heard" in memory is this code
 * label, never the screen's title (a case's title can be a citizen's own words, and the turns go to the planner). Codes only: the
 * recipe, an incident's id, the scope's zone number, department and category codes, and the period.
 */
export function screenLabel(doc: Pick<StageDocT, "recipe" | "slots"> & { scope?: Partial<StageDocT["scope"]> | null }): string {
  if (doc.recipe === "case") return clip(`opened incident ${String(doc.slots?.id ?? "").slice(0, 40)}`, RESULT_MAX);
  const s = doc.scope ?? {};
  const parts = [s.zone ? `zone ${s.zone}` : null, s.dept ? `department ${s.dept}` : null, s.cat ? `category ${s.cat}` : null, s.period ?? null].filter(Boolean);
  return clip(`a ${doc.recipe} screen${parts.length ? ` (${parts.join(", ")})` : ""}`, RESULT_MAX);
}

/** A turn as the planner may see it. */
export function memTurn(heard: string, did: string, o: { doc?: Pick<StageDocT, "recipe" | "slots"> | null; result?: string | null } = {}): MemTurn {
  const t: MemTurn = { heard: heard.slice(0, 300), did: did.slice(0, 300) };
  if (o.doc) {
    t.recipe = o.doc.recipe;
    const s = compactSlots(o.doc.slots);
    if (s) t.slots = s;
  }
  if (o.result) t.result = clip(o.result, RESULT_MAX);
  return t;
}
/** the last four turns, newest last */
export const keepTurns = (list: MemTurn[], t: MemTurn) => [...list, t].slice(-4);

// ---------------------------------------------------------------- observations --
export interface Observation { step: string; ok: boolean; error?: string | null; digest?: string }
/** how much of the screen's digest an observation carries */
export const OBS_DIGEST_MAX = 700;

/** The console as a digest, when no screen of Jarvis's is open: codes and counts, no record's words. */
export function consoleDigest(st: Pick<ScreenState, "page" | "period" | "zone" | "dept" | "cat" | "taluk" | "sev" | "mapMode" | "panel" | "incident" | "list">): string {
  return JSON.stringify({ console: { page: st.page, period: st.period, zone: st.zone, dept: st.dept, cat: st.cat, taluk: st.taluk, sev: st.sev, mapMode: st.mapMode, panel: st.panel, incident: st.incident, list: st.list.length } });
}

/** The round's observations as they go back: at most 8, the last one with the digest of what is on screen after them. */
export function withDigest(obs: Observation[], digest: string | null | undefined): Observation[] {
  const list = obs.slice(-8).map((o) => ({ step: o.step.slice(0, 60), ok: o.ok, ...(o.error != null ? { error: String(o.error).slice(0, 150) } : {}) }));
  if (!list.length || !digest) return list;
  const last = list.length - 1;
  return list.map((o, i) => (i === last ? { ...o, digest: digest.slice(0, OBS_DIGEST_MAX) } : o));
}

// ---------------------------------------------------------------- the ears' confidence --
export interface HeardInfo { lang: Lang; conf: number; source: "whisper" | "captions" | "typed" }
/** below this the speech itself is unsure */
export const LOW_SPEECH_CONF = 0.6;
/** What the round is told about how the sentence came: typed text is sure; a confidence the ears did not give is 0.95, as before. */
export function heardOf(source: HeardInfo["source"], lang: Lang, conf: number | null | undefined): HeardInfo {
  if (source === "typed") return { lang, conf: 1, source };
  const c = typeof conf === "number" && Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.95;
  return { lang, conf: Math.round(c * 1000) / 1000, source };
}
/** The rules' reading is put as a question before it runs: below 0.6 always, below 0.85 when the speech itself was unsure. */
export const asksFirst = (ruleConf: number, speechConf: number) => ruleConf < 0.6 || (speechConf < LOW_SPEECH_CONF && ruleConf < 0.85);

/** a clean Whisper decode starts here (lib/thunai/heard.ts confOf: about 0.73-0.89) */
export const CLEAN_DECODE = 0.73;
/** what understand()'s thresholds were tuned on: the old fixed value every sentence carried */
export const TUNED_CONF = 0.95;
/** at or below this the ears were unsure (Whisper's own unsure line 0.45, the third racer 0.47, the captions 0.5): kept as it is */
export const UNSURE_DECODE = 0.5;
/**
 * The ears' confidence as understand() reads it (v4, lane L4's note). understand()'s thresholds (0.9 for a plain move, 0.85 for a sure
 * reading) were tuned on a fixed 0.95, but a clean decode scores 0.73-0.89, which alone took a sure command under the bar. So the map is
 * monotone and keeps both ends: a clean decode (and the 0.95 a server with no confidence sends) reads exactly 0.95, as before; above it
 * stays as it is; an unsure decode (0.5 and below) stays as it is, so its reading is put as a question first; in between it rises in a line.
 * Only understand() reads this: the round and asksFirst keep the raw value (round.ts LOW_CONF is on the raw scale).
 */
export function rulesConf(raw: number | null | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return TUNED_CONF;
  const c = Math.max(0, Math.min(1, raw));
  if (c >= TUNED_CONF) return c;
  if (c >= CLEAN_DECODE) return TUNED_CONF;
  if (c <= UNSURE_DECODE) return c;
  return Math.round((UNSURE_DECODE + ((c - UNSURE_DECODE) * (TUNED_CONF - UNSURE_DECODE)) / (CLEAN_DECODE - UNSURE_DECODE)) * 1000) / 1000;
}

// ---------------------------------------------------------------- two speeds --
/** Nielsen's 10 s: past this a turn shows what it is doing and how to stop it */
export const LONG_TURN_MS = 10_000;
export interface ProgressRow { id: string; label: string; state: "pending" | "running" | "done" | "failed"; ms: number | null }
/** The long turn's card: nothing before 10 s (no "thinking" theatre on a quick answer); after, its real steps, newest five. */
export function longTurn(elapsedMs: number, rows: ProgressRow[]): { show: boolean; seconds: number; rows: ProgressRow[] } {
  if (!(elapsedMs >= LONG_TURN_MS)) return { show: false, seconds: 0, rows: [] };
  return { show: true, seconds: Math.floor(elapsedMs / 1000), rows: rows.slice(-5) };
}

// ---------------------------------------------------------------- the honest ack --
/** the spoken acknowledgement waits this long after the end of speech for the answer to start */
export const ACK_AFTER_MS = 1200;
export const ackDelay = (endAt: number | null, now: number) => (endAt == null ? null : Math.max(0, ACK_AFTER_MS - (now - endAt)));
/**
 * Say the acknowledgement now? Only for a spoken sentence (endAt), only while the turn still waits for its answer, only when
 * neither the answer (on screen) nor its voice has started since the speech ended, and never over a voice.
 */
export function ackDue(o: { endAt: number | null; now: number; answeredAt: number; findingAt: number; speaking: boolean; waiting: boolean }): boolean {
  if (o.endAt == null || o.speaking || !o.waiting) return false;
  if (o.now - o.endAt < ACK_AFTER_MS) return false;
  return o.answeredAt < o.endAt && o.findingAt < o.endAt;
}

// ---------------------------------------------------------------- captions while hearing --
export interface Recogniser { start(): unknown; stop(): void; setLang?(lang: string): void }
/**
 * The browser's live captions send room audio to the browser's speech service, so they run only while an addressed
 * sentence is being heard (the conductor's speech start says whether it is engaged), or while a spoken yes is awaited, and
 * stop at the end of speech. Display only: Whisper's text decides.
 */
export class HearingCaptions {
  private rec: Recogniser | null = null;
  constructor(private make: () => Recogniser | null) {}
  get running() { return !!this.rec; }
  speechStart(o: { on: boolean; engaged: boolean; awaitingYes: boolean }) {
    if (this.rec || !o.on || !(o.engaged || o.awaitingYes)) return;
    const r = this.make();
    if (!r) return;
    this.rec = r;
    r.start();
  }
  speechEnd() { const r = this.rec; this.rec = null; r?.stop(); }
  stop() { this.speechEnd(); }
  setLang(lang: string) { this.rec?.setLang?.(lang); }
}
