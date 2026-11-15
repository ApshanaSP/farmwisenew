/**
 * The aide around a turn (v4, the client's integration of the finished lanes), as pure code so each part is tested without a browser.
 * Thunai.tsx does the wiring; what it decides with is here:
 *   - a mission's plan card (missions.run.ts MissionCard) as the bar's mission card (hudstore.ts HudMission);
 *   - whether Jarvis may speak unprompted now: the server's candidate signal re-checked by mayInterject against the live state, and
 *     never before the brief, never while the Collector has a card to answer;
 *   - the brief (GET /api/collector/thunai/brief) as a card and the lines to say in order, the end line last, with their figures;
 *   - the two-misses offer (docs/jarvis/PERSONA.md rule 8);
 *   - a spoken line whose "Zone 13" names a zone, not a figure (numbergate.ts zoneLabelsOut), made safe for the voice's own gate;
 *   - the open Stage's names for the ears (the conductor's vocab) and its labels for the round (register.ts labelsOf);
 *   - follow and unfollow, "what did you do today?", a plain yes to an offer, and the screen a "Tell me" on a signal opens.
 * Phase 7 review (lane F1): the brief re-checked after its fetch (briefStale), the power-on brief's moment (briefGo) and the greeting
 * it replaces (greetingOk), one hourly budget for both unprompted channels (interjectNow's `spoken`, clientSignal), and the Level-B
 * question's figures (confirmAsk).
 * Every figure said or shown comes from code: nothing here writes one.
 */
import { chunks } from "@/lib/thunai/chunker";
import { asciiDigits } from "@/lib/thunai/digits";
import type { MissionCard, StepState } from "@/lib/thunai/missions.run";
import { allowedSet, figuresIn, gateChunk, zoneLabelsOut } from "@/lib/thunai/numbergate";
import { labelsOf } from "@/lib/thunai/register";
import { whenText } from "@/lib/thunai/say";
import type { Recipe, StageContext, StageDocT } from "@/lib/thunai/stage";
import type { Lang, World } from "@/lib/thunai/types";
import { band, emptyWatch, mayInterject, type Signal } from "@/lib/thunai/watch";
// types only: these modules read the store on the server
import type { Brief } from "@/lib/thunai/briefing";
import type { WatchSignal } from "@/lib/thunai/signals";
import type { HudMission, HudMissionStepState, JarvisMode } from "./hudstore";

export interface Bi { en: string; ta: string }

// ------------------------------------------------------------------ missions --

const STEP: Record<StepState, HudMissionStepState> = { pending: "pending", running: "running", done: "done", failed: "failed", skipped: "skipped", stopped: "skipped" };

/**
 * The plan card as the bar shows it (H2's HudMission: a title, steps with their state and measured time, and whether it runs). A card
 * dropped before Start (cancelled) is no card: null. Once the mission has stopped or ended, a step never run reads "skipped", so the
 * card shows Close and never Start again (hudview.ts missionPhase reads "plan" only while every step is pending and none runs).
 */
export function hudMissionOf(c: MissionCard | null | undefined, lang: Lang): HudMission | null {
  if (!c || c.phase === "cancelled" || c.phase === "idle") return null;
  const over = c.phase === "stopped" || c.phase === "done";
  return {
    id: c.id,
    title: (lang === "ta" ? c.title.ta : c.title.en) || c.title.en,
    running: c.phase === "running",
    steps: c.steps.map((s) => ({ label: (lang === "ta" ? s.label.ta : s.label.en) || s.label.en, state: over && s.state === "pending" ? "skipped" : STEP[s.state], ms: s.ms }))
  };
}

const EDIT_EN = /^(?:(?:jarvis|please|ok|okay)[,\s]+)*(?:without|leave out|drop|remove|take out|cut|skip)\s+(?:steps?\s+|number\s+)?(\d(?:\s*(?:,|and|&)\s*\d)*)(?:\s+(?:please|jarvis))?$/i;
const EDIT_TG = /^(?:step\s+)?(\d(?:\s*(?:,|um|and)\s*\d)*)\s+(?:venaam|vendaam|vendam|venam|thookidu|eduthudu)$/i;
const EDIT_TA = /^(?:படி\s*)?(\d(?:\s*(?:,|உம்)\s*\d)*)\s*(?:-?வது\s*)?(?:வேண்டாம்|எடுத்துடு|நீக்கு)$/u;

/**
 * The card's Edit, said or typed before Start: "without 3", "leave out steps 2 and 4", "3 venaam", "3 வேண்டாம்" (the numbers the card
 * shows). The plan's own steps less those, in order, for MissionControl.edit; null when it is not an edit or would leave nothing.
 */
export function editIds(steps: { id: string }[], text: string): string[] | null {
  const t = asciiDigits(text.normalize("NFC")).replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
  for (const re of [EDIT_EN, EDIT_TG, EDIT_TA]) {
    const m = re.exec(t);
    if (!m) continue;
    const drop = new Set((m[1].match(/\d/g) ?? []).map(Number));
    const kept = steps.filter((_, i) => !drop.has(i + 1)).map((s) => s.id);
    return kept.length && kept.length < steps.length ? kept : null;
  }
  return null;
}

// ------------------------------------------------------------------ the machine --

/** No 22 px viewport blur behind the Stage on a machine with four cores or fewer, or under reduced motion (stage.css .jv-lowfx). */
export const lowFx = (cores: number | null | undefined, reducedMotion: boolean): boolean => reducedMotion || (typeof cores === "number" && cores > 0 && cores <= 4);

// ------------------------------------------------------------------ speaking unprompted --

/** What the browser knows about the moment (Thunai.tsx fills it from its refs). */
export interface Live {
  mode: JarvisMode;
  /** speech is being heard now (VAD onset seen, its end not yet) */
  collectorSpeaking: boolean;
  /** a turn is being understood, planned, acted or built */
  busy: boolean;
  /** Jarvis's voice is going (an answer, a narration, a mission's line) */
  speaking: boolean;
  /** the brief is being fetched or said: a brief is always finished first */
  briefing: boolean;
  /** an ask card, a Level-B yes or a mission's plan waits on the Collector, or a mission runs */
  waiting: boolean;
  lastUserSpeech: number | null;
  /** the Quiet output mode */
  quiet: boolean;
}

const SPEAKING_WHY = "Jarvis is speaking";
/** Why Jarvis must not raise anything now, from the live state alone; null: the signal's own rules decide. */
export function heldBack(l: Live): string | null {
  if (l.mode !== "on") return "Jarvis is not listening";
  if (l.briefing) return "the brief comes first";
  if (l.waiting) return "the Collector has a card to answer";
  if (l.collectorSpeaking) return "the Collector is speaking";
  if (l.busy) return "a turn is in flight";
  if (l.speaking) return SPEAKING_WHY;
  return null;
}

/** What the interjection gate reads of a signal: the server's, or the old client watch's as clientSignal puts it. */
export type InterjectSignal = Pick<WatchSignal, "key" | "topic" | "severity" | "level"> & { lifeSafety?: boolean };

/** the times (ms) in the last hour, oldest first as given: the ledger of what was said unprompted */
export const withinHour = (times: number[], now: number): number[] => times.filter((t) => Number.isFinite(t) && now - t < 3_600_000);

/**
 * May this be said now, unprompted? The live state first (never during the brief, a card, the Collector's speech, a turn or Jarvis's
 * own voice), then mayInterject with the same state (high severity, quiet mode and hours, ten minutes apart, three an hour). `spoken`:
 * when this browser said something unprompted, from either channel (the server's watch and the old client watch), so the hour's total
 * stays within the one policy. The server applied the Collector's own later / not-about-this choices when it chose its candidate.
 */
export function interjectNow(sig: InterjectSignal | null | undefined, l: Live, now: number, spoken: number[] = []): { ok: boolean; why: string } {
  if (!sig) return { ok: false, why: "nothing to tell" };
  const held = heldBack(l);
  if (held) return { ok: false, why: held };
  const recent = withinHour(spoken, now);
  const watch = recent.length ? { ...emptyWatch(), spoken: recent.map((t) => new Date(t).toISOString()) } : emptyWatch();
  return mayInterject({ now, signal: sig, collectorSpeaking: l.collectorSpeaking, turnInFlight: l.busy, jarvisSpeaking: l.speaking, lastUserSpeech: l.lastUserSpeech, quiet: l.quiet, watch });
}

/**
 * The old client watch's signal (a new severe bell, a reminder due, the morning greeting) as the interjection gate reads it: only
 * what that watch would speak (band "speak" or "interrupt") is high severity, and only "interrupt" is life safety.
 */
export function clientSignal(s: Signal): InterjectSignal {
  const b = band(s);
  return { key: s.key, topic: s.key, severity: b === "speak" || b === "interrupt" ? "high" : b === "chip" ? "medium" : "low", level: s.level, lifeSafety: b === "interrupt" };
}

// ------------------------------------------------------------------ the brief, unprompted --

/**
 * The brief, its fetch done: is it still wanted? Not after a newer turn began (it would cut that answer), not once Jarvis was closed
 * or muted (a brief asked for by typing with the mode muted still comes), and the power-on brief only into a quiet moment (its own
 * fetch is no reason to wait). Null: say it; else why not.
 */
export function briefStale(o: { gen0: number; gen: number; mode0: JarvisMode; mode: JarvisMode; asked: boolean; live: Live }): string | null {
  if (o.gen !== o.gen0) return "a newer turn began";
  if (o.mode === "off" || (o.mode0 === "on" && o.mode !== "on")) return "Jarvis is not listening";
  return o.asked ? null : heldBack({ ...o.live, briefing: false });
}
/** The power-on brief at its moment: go; wait and try again when the only reason is Jarvis speaking (a line it will finish); else drop it. */
export function briefGo(l: Live): "go" | "retry" | "drop" {
  const why = heldBack({ ...l, briefing: false });
  return why == null ? "go" : why === SPEAKING_WHY ? "retry" : "drop";
}
/**
 * The old watch's morning greeting: the brief replaces it. None while the brief is due on this page (it has not been given in this
 * tab's session) or once it was given here; only where it was given earlier in the session (a reload), so it is not due again.
 */
export const greetingOk = (o: { briefedPage: boolean; sessionBriefed: boolean }): boolean => o.sessionBriefed && !o.briefedPage;

const zoneNos = (w: Pick<World, "zones"> | null | undefined) => (w?.zones ?? []).map((z) => z.n);
/** A line passes the number gate with these figures, a real zone's label ("Zone 13") read as its name. */
export const lineOk = (t: string, allowed: Set<string>, zones: Iterable<number>): boolean => !!t.trim() && chunks(t).every((c) => gateChunk(zoneLabelsOut(c, zones), allowed).ok);

/** A signal's one line in the turn's language, with the figures it may say (its own values); null when the line would not pass the gate. */
export function signalLine(sig: Pick<WatchSignal, "text" | "values">, lang: Lang, w?: Pick<World, "zones"> | null): { text: string; allowed: Set<string> } | null {
  const text = (lang === "ta" ? sig.text?.ta : sig.text?.en) ?? "";
  const allowed = allowedSet(Object.values(sig.values ?? {}).filter((v) => typeof v === "number" && Number.isFinite(v)));
  return lineOk(text, allowed, zoneNos(w)) ? { text, allowed } : null;
}

const SCREEN_LABEL: Bi = { en: "Opening what I noticed", ta: "கவனிச்சதைத் திறக்கிறேன்" };
/** The screen "Tell me" opens for a signal (built by code from the data, no model); null when there is none to open. */
export function signalScreen(s: Pick<WatchSignal, "kind" | "key" | "topic">): { recipe: Recipe; slots: Record<string, unknown>; label: Bi } | null {
  const at = (recipe: Recipe, slots: Record<string, unknown>) => ({ recipe, slots, label: SCREEN_LABEL });
  switch (s.kind) {
    case "rise": {
      // rise:<dim>:<zone>:<dept>:<cat> (signals.ts riseSignal)
      const [, , zone, dept, cat] = s.topic.split(":");
      const z = Number(zone);
      return at("cases", { ...(Number.isInteger(z) && z >= 1 && z <= 15 ? { zones: [z] } : {}), ...(dept ? { dept } : {}), ...(cat ? { cat } : {}), period: "daily", sort: "priority", n: 15, fresh: true });
    }
    case "overdue": return at("cases", { status: "overdue", period: "weekly", sort: "priority", n: 20, fresh: true });
    case "rain": case "warning": return at("readings", { metric: "rain" });
    case "reservoir": return at("readings", { metric: "lakes" });
    case "gap": return at("news", { period: "daily" });
    case "followed": {
      // followed:incident:<ref>:<tag> or followed:zone:<ref>:<late|open>:<n>
      const [, kind, ref] = s.key.split(":");
      if (kind === "incident" && ref) return at("case", { id: ref });
      const z = Number(ref);
      if (kind === "zone" && Number.isInteger(z) && z >= 1 && z <= 15) return at("cases", { zones: [z], status: "open", period: "weekly", sort: "priority", n: 15, fresh: true });
      return null;
    }
    default: return null;
  }
}

// ------------------------------------------------------------------ the brief --

export interface BriefCard {
  bottom: string;
  items: { id: string; text: string; source: string; fresh: string; severity: "high" | "medium" | "low" }[];
  end: string;
  /** the lines to say, in order: the bottom line, the items, the end line last */
  lines: string[];
  /** every figure the brief may say (its own values) */
  allowed: Set<string>;
}
const BRIEF_END: Bi = { en: "That's everything for now.", ta: "இப்போதைக்கு இவ்வளவுதான்." };

/** The brief as a card and the lines to say. A line or an item that would not pass the gate is left out; the end line is always last. */
export function briefCard(b: Partial<Pick<Brief, "bottomLine" | "items" | "end" | "spoken" | "values">> | null | undefined, lang: Lang, w?: Pick<World, "zones"> | null): BriefCard | null {
  if (!b || !b.bottomLine || !Array.isArray(b.items)) return null;
  const pick = (x: Bi | null | undefined) => ((lang === "ta" ? x?.ta : x?.en) ?? "").trim();
  const allowed = allowedSet(Object.values(b.values ?? {}).filter((v) => typeof v === "number" && Number.isFinite(v)));
  const zs = zoneNos(w);
  const ok = (t: string) => lineOk(t, allowed, zs);
  const end = pick(b.end) || BRIEF_END[lang];
  const bottom = pick(b.bottomLine);
  const items = b.items.map((x) => ({ id: String(x.id), text: pick(x.text), source: pick(x.source?.name), fresh: pick(x.source?.fresh), severity: x.severity }))
    .filter((x) => ok(x.text) && !figuresIn(`${x.source} ${x.fresh}`).some((f) => !allowed.has(String(f.value))));
  const said = (b.spoken?.[lang] ?? []).map((t) => String(t ?? "").trim()).filter((t) => t && t !== end && ok(t));
  if (!ok(bottom) && !said.length) return null;
  return { bottom: ok(bottom) ? bottom : "", items, end, lines: [...said, end], allowed };
}

// ------------------------------------------------------------------ the two-misses offer --

/** PERSONA.md rule 8: after two misunderstandings in a row, the screen and the keyboard, in one line, numberless. */
export const OFFER_KEYS: Bi = {
  en: "I'm not getting this one. The options are on the screen, or you can type it.",
  ta: "இது எனக்குச் சரியா புரியல. வழிகள் திரையில இருக்கு, இல்லன்னா டைப் பண்ணுங்க."
};
/** a sentence the transcriber did not answer in time (the conductor's onMissed): calm and numberless (PERSONA.md "Didn't catch it") */
export const NOT_CAUGHT: Bi = { en: "I didn't catch that.", ta: "சரியா கேக்கல." };

/**
 * The count of misunderstandings in a row (a clarifying question, nothing usable, a sentence not heard). A turn that went through
 * resets it; the second miss in a row offers the screen and the keyboard and starts the count again.
 */
export function missStep(n: number, outcome: "miss" | "ok"): { n: number; offer: boolean } {
  if (outcome === "ok") return { n: 0, offer: false };
  const k = Math.max(0, n) + 1;
  return k >= 2 ? { n: 0, offer: true } : { n: k, offer: false };
}

// ------------------------------------------------------------------ zone labels in speech --

const ZONE_LABEL = /(?<![\p{L}])(zone|மண்டலம்)\s*(\d{1,2})(?![\d\p{L}])/giu;

/**
 * Lines made safe for the voice's gate (mouth.ts gates each chunk with `allowed`), so a real zone's label ("Zone 13") is said as the
 * zone's name it is and never counted as a figure (L1: a point's coordinates no longer lend "13" to the set). Each chunk is checked as
 * the gate will see it, its zone labels taken out: a chunk that passes is kept and its label numbers are allowed for this speech; a chunk
 * that fails is left out here (the voice would refuse it anyway), so a label's number can never let the same number through bare.
 * Lines with no zone label come back as they were.
 */
export function zoneSafe(lines: string[], allowed: Set<string>, zones: Iterable<number>): { lines: string[]; allowed: Set<string> } {
  const real = new Set(zones);
  const labelled = (t: string) => { ZONE_LABEL.lastIndex = 0; return [...t.matchAll(ZONE_LABEL)].some((m) => real.has(Number(m[2]))); };
  if (!lines.some(labelled)) return { lines, allowed };
  const extra = new Set<string>();
  const out = lines.map((line) => {
    if (!labelled(line)) return line;
    const kept: string[] = [];
    for (const c of chunks(line)) {
      if (gateChunk(c, allowed).ok) { kept.push(c); continue; }
      if (!gateChunk(zoneLabelsOut(c, real), allowed).ok) continue;
      kept.push(c);
      for (const m of c.matchAll(ZONE_LABEL)) if (real.has(Number(m[2]))) extra.add(String(Number(m[2])));
    }
    // a line left with nothing stays, empty: the voice's line numbers (the narration's highlight) must not shift
    return kept.join(" ");
  });
  if (!extra.size) return { lines: out, allowed };
  return { lines: out, allowed: new Set([...allowed, ...extra]) };
}

// ------------------------------------------------------------------ the open Stage, for the ears and the round --

const tidy = (s: unknown, n: number): string => (typeof s === "string" ? s.replace(/[\r\n\t"`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n) : "");

/** The names on the open Stage (places, zones, departments, stations, ranked labels), at most 30, for the transcriber's prompt. Never a case title. */
export function vocabOf(doc: Pick<StageDocT, "blocks"> | null | undefined, max = 30): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: unknown) => {
    const t = tidy(s, 40);
    const k = t.toLowerCase();
    if (t.length < 3 || seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push(t);
  };
  for (const b of doc?.blocks ?? []) {
    if (b.kind === "CaseList") for (const r of b.rows) { add(r.place); add(r.zoneName); add(r.deptName); }
    else if (b.kind === "CaseDetail") { add(b.incident.place); add(b.incident.zoneName); add(b.incident.deptName); }
    else if (b.kind === "Ranking") for (const x of b.items) add(x.label);
    else if (b.kind === "Compare") for (const x of b.sides) add(x.label);
    else if (b.kind === "Readings") for (const x of b.items) add(x.name);
    else if (b.kind === "NewsReader") for (const x of b.items) add(x.place);
  }
  return out;
}

/** The open Stage as the round takes it, each block with the labels of its ids (register.ts labelsOf: place, kind, zone; never a title). */
export function withLabels(ctx: StageContext, doc: Pick<StageDocT, "blocks">): StageContext {
  return { ...ctx, blocks: ctx.blocks.map((b, i) => (b.labels || !doc.blocks[i] ? b : { ...b, labels: labelsOf(doc.blocks[i]).slice(0, 30) })) };
}

// ------------------------------------------------------------------ words for the Level-B flows --

/**
 * The Level-B question before a step that keeps something (a note, a reminder, a saved view, a forget), as the one builder wrote it
 * (say.ts confirmLine: the browser and the grader's copy both call it), gated: the figures it may say and show are only the Collector's
 * own (the sentence they said) and, for a reminder, its time as code writes it from its date. A note or a name the model wrote with any
 * other figure is not offered at all (null): it would be said and shown, and then kept.
 */
export function confirmAsk(text: string | null | undefined, step: { a: string; at?: unknown }, said: string, lang: Lang, zones: Iterable<number>): { text: string; allowed: Set<string> } | null {
  if (!text) return null;
  const own = figuresIn(said).map((f) => f.value);
  const when = step.a === "remind" ? figuresIn(whenText(step.at, lang)).map((f) => f.value) : [];
  const allowed = allowedSet([...own, ...when]);
  return lineOk(text, allowed, zones) ? { text, allowed } : null;
}

/** a plain yes to an offer ("Shall I put these on the map?"); Level A, so the captions' yes counts too */
export const plainYes = (t: string): boolean =>
  /^(?:(?:jarvis|ok|okay)[,\s]+)?(?:yes|yeah|yep|sure|ok|okay|go ahead|do it|please do|show (?:me|it)|ஆமா|ஆமாம்|ஆம்|சரி|காட்டு|காட்டுங்க|aama|aamam|sari|seri|kaattu|kaatu|kaatunga)(?:[,\s]+(?:please|jarvis|sir|do it|go ahead|பண்ணு|pannu))*[.!]?$/iu.test(t.trim());

/** "what did you do today?" (the decision record, GET /api/collector/thunai/audit?today=1) */
export const asksWhatToday = (t: string): boolean =>
  /\bwhat (?:did|have) you (?:do|done)(?: for me)?(?: so far)? today\b|\bwhat have you been (?:doing|up to) today\b|\bwhat did you do for me today\b/i.test(t)
  || /\b(?:innaiku|innaikku|inniki) (?:enna|ennalam|enna ellam) (?:senja|senjeenga|senjinga|pannina|panneenga|pannuna|pannunga)\b/i.test(t)
  || /(?:இன்னைக்கு|இன்று|இன்றைக்கு)\s+(?:நீ\s+|நீங்க\s+)?(?:என்ன|என்னென்ன)\s+(?:செஞ்ச|செய்த|பண்ண)/u.test(t);

export type FollowAsk =
  | { op: "follow" | "unfollow"; kind: "incident"; ref: string; name: Bi }
  | { op: "follow" | "unfollow"; kind: "zone"; ref: number; name: Bi };

const LEAD = String.raw`^(?:(?:jarvis|please|ok|okay|hey)[,\s]+)*`;
const FOLLOW_EN = new RegExp(`${LEAD}(?:follow|keep (?:an )?eye on|keep track of|keep watching|track)\\s+(.{2,60}?)(?:\\s+(?:for me|please|jarvis|closely))*[.!]?$`, "i");
const UNFOLLOW_EN = new RegExp(`${LEAD}(?:stop following|unfollow|don'?t follow|do not follow|no longer follow|stop tracking|stop watching)\\s+(.{2,60}?)(?:\\s+(?:any ?more|now|please|jarvis))*[.!]?$`, "i");
const FOLLOW_TG = /^(.{2,60}?)\s+(?:follow|track)\s+(?:pannu|pannunga|panni kudu|pannikko|pannikonga)$|^(.{2,60}?)\s+(?:kavanichukko|kavanichikko|kavanichukonga|kavaninga)$/i;
const UNFOLLOW_TG = /^(.{2,60}?)\s+(?:follow|track)\s+(?:panna\s+)?(?:vendaam|venaam|vendam|venam)$|^(.{2,60}?)\s+(?:kavanikka\s+)?(?:vendaam|venaam)$/i;
const FOLLOW_TA = /^(.{2,60}?)\s*(?:ஃபாலோ|பாலோ)\s*(?:பண்ணு|பண்ணுங்க|செய்)$|^(.{2,60}?)\s*கவனிச்சுக்(?:கோ|கோங்க|கங்க)$/u;
const UNFOLLOW_TA = /^(.{2,60}?)\s*(?:ஃபாலோ|பாலோ)\s*(?:பண்ண\s*)?வேண்டாம்$|^(.{2,60}?)\s*கவனிக்க\s*வேண்டாம்$/u;
const THIS_CASE = /^(?:this|that|the)?\s*(?:incident|case|complaint|one|issue)(?:\s+(?:here|there|on (?:the )?screen))?$|^(?:idha|idhai|indha|andha|adha|adhai)(?:\s+(?:case|complaint|incident))?$|^(?:இதை|இந்த|அந்த|அதை)(?:\s*(?:கேஸை|கேஸ்|சம்பவத்தை|சம்பவம்|புகாரை))?$/iu;
const THIS_ZONE = /^(?:this|that|the)\s+(?:zone|area|place)$|^(?:indha|andha)\s+(?:zone|area|edam|idam)$|^(?:இந்த|அந்த)\s*(?:மண்டலத்தை|மண்டலம்|பகுதியை|பகுதி)$/iu;

/**
 * "Follow this case", "keep an eye on Adyar", "Velachery follow pannu", "இந்த கேஸை கவனிச்சுக்கோ", and the same with "stop following" /
 * "vendaam" / "வேண்டாம்": a Level-B standing watch on an incident or a zone. The target is the case on screen, the zone on screen or a
 * zone named; anything else is not a follow (null), so "track the rain" goes on to the planner.
 */
export function followAsk(text: string, ctx: { incident: string | null; zone: number | null; world: Pick<World, "zones"> }): FollowAsk | null {
  const t = text.normalize("NFC").replace(/\s+/g, " ").replace(/[?]+$/, "").trim();
  if (!t || t.length > 90) return null;
  let op: "follow" | "unfollow" | null = null;
  let target: string | null = null;
  for (const [re, o] of [[UNFOLLOW_EN, "unfollow"], [UNFOLLOW_TG, "unfollow"], [UNFOLLOW_TA, "unfollow"], [FOLLOW_EN, "follow"], [FOLLOW_TG, "follow"], [FOLLOW_TA, "follow"]] as const) {
    const m = re.exec(t);
    if (m) { op = o; target = (m[1] ?? m[2] ?? "").trim(); break; }
  }
  if (!op || !target) return null;
  const zoneBy = (n: number): FollowAsk | null => {
    const z = ctx.world.zones.find((x) => x.n === n);
    return z ? { op: op!, kind: "zone", ref: n, name: { en: z.name, ta: z.ta || z.name } } : null;
  };
  if (THIS_CASE.test(target)) return ctx.incident ? { op, kind: "incident", ref: ctx.incident, name: { en: "this case", ta: "இந்த கேஸை" } } : null;
  if (THIS_ZONE.test(target)) return ctx.zone ? zoneBy(ctx.zone) : null;
  const num = /^(?:zone|மண்டலம்)\s*(\d{1,2})$/iu.exec(target);
  if (num) return zoneBy(Number(num[1]));
  const low = target.toLowerCase().replace(/^(?:the\s+)?/, "").replace(/\s+(?:zone|area)$/, "");
  const z = ctx.world.zones.find((x) => x.name.toLowerCase() === low || (!!x.ta && target!.replace(/(?:யை|ஐ|ஐயும்)$/u, "") === x.ta));
  return z ? zoneBy(z.n) : null;
}
