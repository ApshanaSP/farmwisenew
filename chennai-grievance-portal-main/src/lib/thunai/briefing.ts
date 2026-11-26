/**
 * The Collector's brief, on power-on and on "brief me": the bottom line first, then three to five items, each with a source chip
 * (which data, how fresh), and an explicit end ("That's everything for now" / "இப்போதைக்கு இவ்வளவுதான்"). Finite, never a feed
 * (ChatGPT Pulse and Gemini's daily brief end on purpose). Every figure comes from code: the watch's signals and the console's own
 * briefing counts. Every spoken line passes the number gate with the brief's own values, and the label and copy checks of
 * speechcheck.ts; a line that fails is dropped, never said. The end line is always the last line. Pure.
 */
import { allowedSet, gateChunk } from "./numbergate";
import { dayWords } from "@/lib/period/day";
import { copiedRun, labelIn } from "./speechcheck";
import { freshWords, watchFor, type Bi, type Conditions, type Severity, type SignalKind, type SourceChip, type WatchSignal } from "./signals";

export interface BriefItem { id: string; kind: SignalKind | "standing"; severity: Severity; text: Bi; source: SourceChip; values: Record<string, number> }
export interface Standing { reported: number | null; open: number | null; overdue: number | null; severe: number | null; asOf: string | null;
  /** rain and reservoirs on a calm day (signals.ts conditionsOf) */ conditions?: Conditions | null }
export interface Brief {
  asOf: string;
  bottomLine: Bi;
  items: BriefItem[];
  end: Bi;
  /** the lines to say, in order: bottom line, items, end; each passed the gates */
  spoken: { en: string[]; ta: string[] };
  /** every figure the brief may say */
  values: Record<string, number>;
  /** signal keys the brief tells (so the watch does not interject them again) */
  told: { key: string; level: number }[];
  /** lines dropped by a gate (should be none: code builds them) */
  dropped: number;
}

export const BRIEF_END: Bi = { en: "That's everything for now.", ta: "இப்போதைக்கு இவ்வளவுதான்." };
export const BRIEF_MAX = 5;
export const BRIEF_MIN = 3;

/** a few words for what a signal is about, for the bottom line */
function topicWords(s: WatchSignal): Bi {
  const at = s.place ? ` in ${s.place.en}` : "";
  switch (s.kind) {
    case "rise": return { en: `the rise in reports${at}`, ta: `${s.place ? `${s.place.ta} பகுதியில ` : ""}புகார் கூடியிருப்பது` };
    case "overdue": return { en: "the cases piling up past their deadline", ta: "கெடு தாண்டிய கேஸ்கள் கூடுவது" };
    case "rain": return { en: "the heavy rain", ta: "கனமழை" };
    case "reservoir": return { en: "a reservoir that is nearly full", ta: "கிட்டத்தட்ட நிரம்பிய நீர்த்தேக்கம்" };
    case "warning": return { en: "IMD's warning", ta: "IMD எச்சரிக்கை" };
    case "followed": return { en: "something you follow", ta: "நீங்க கவனிக்கிற ஒரு விஷயம்" };
    case "gap": return { en: "news with no department record", ta: "துறைப் பதிவு இல்லாத செய்திகள்" };
    default: return { en: "your Data Studio watch", ta: "உங்க Data Studio கண்காணிப்பு" };
  }
}

const chipOf = (id: SourceChip["id"], name: Bi, t: string | null, asOf: string): SourceChip => ({ id, name, asOf: t, fresh: freshWords(t, asOf) });

/** The standing items, from the console's own briefing counts, used to fill the brief to three when the watch is quiet. */
function standingItems(s: Standing, asOf: string): BriefItem[] {
  const src = chipOf("briefing", { en: "the console's briefing counts", ta: "கன்சோல் சுருக்க எண்ணிக்கைகள்" }, s.asOf, asOf);
  const out: BriefItem[] = [];
  if (s.overdue != null && s.open != null && s.open > 0) {
    out.push({ id: "standing:overdue", kind: "standing", severity: s.overdue > 0 ? "medium" : "low", source: src, values: { overdue: s.overdue, open: s.open },
      text: s.overdue > 0 ? { en: `${s.overdue} cases are past their deadline, out of ${s.open} still open.`, ta: `${s.open} நிலுவை கேஸ்கள்ல ${s.overdue} கெடு தாண்டியிருக்கு.` }
        : { en: `None of the ${s.open} open cases is past its deadline.`, ta: `நிலுவையில இருக்கிற ${s.open} கேஸ்கள்ல எதுவும் கெடு தாண்டல.` } });
  }
  if (s.reported != null) {
    const sev = s.severe ?? 0;
    // the console's Daily: the calendar day since 12 AM (lib/period/day.ts)
    const w = dayWords(s.asOf), day = { en: w.en.inWords, ta: w.ta.inWords };
    out.push({ id: "standing:today", kind: "standing", severity: sev > 0 ? "medium" : "low", source: src, values: { reported: s.reported, severe: sev },
      text: sev > 0 ? { en: `${s.reported} incidents came in ${day.en}, and ${sev} of them are severe.`, ta: `${day.ta} ${s.reported} சம்பவங்கள் வந்திருக்கு, அதுல ${sev} கடுமையானவை.` }
        : { en: `${s.reported} incidents came in ${day.en}, none of them severe.`, ta: `${day.ta} ${s.reported} சம்பவங்கள் வந்திருக்கு, எதுவும் கடுமையானது இல்லை.` } });
  }
  const c = s.conditions;
  if (c && (c.rainMax != null || c.lakeMax != null)) {
    const rain: Bi | null = c.rainMax == null ? null : c.rainMax < 64.5
      ? { en: `no gauge shows heavy rain, the most in 24 hours being ${c.rainMax} millimetres`, ta: `எந்த மழைமானியிலும் கனமழை இல்லை, 24 மணி நேரத்துல அதிகபட்சம் ${c.rainMax} மில்லிமீட்டர்` }
      : { en: `the wettest gauge had ${c.rainMax} millimetres in 24 hours`, ta: `24 மணி நேரத்துல அதிகபட்ச மழை ${c.rainMax} மில்லிமீட்டர்` };
    const lake: Bi | null = c.lakeMax == null ? null : { en: `the fullest reservoir${c.lakeAt ? `, ${c.lakeAt},` : ""} is at ${c.lakeMax} percent`, ta: `அதிகம் நிரம்பிய நீர்த்தேக்கம்${c.lakeAt ? ` ${c.lakeAt}` : ""} ${c.lakeMax} சதவீதம்` };
    const parts = [rain, lake].filter((x): x is Bi => !!x);
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    out.push({ id: "standing:conditions", kind: "standing", severity: "low", source: chipOf("conditions", { en: "rain gauges and reservoir readings", ta: "மழைமானி, நீர்த்தேக்க அளவீடுகள்" }, c.t, asOf),
      values: { ...(c.rainMax != null ? { rain: c.rainMax, hours: 24 } : {}), ...(c.lakeMax != null ? { lake: c.lakeMax } : {}) },
      text: { en: `${cap(parts.map((p) => p.en).join("; "))}.`, ta: `${parts.map((p) => p.ta).join("; ")}.` } });
  }
  return out;
}

/** A line may be said: every figure is the brief's, no field label, no run of six words copied from a record. */
export function sayable(line: string, allowed: Set<string>, records: string[] = []): boolean {
  return gateChunk(line, allowed).ok && !labelIn(line) && !copiedRun(line, records);
}

/**
 * The brief. `signals` come ranked from the watch (buildSignals); `standing` from the console's briefing counts; `records` is any
 * record text the lines must not copy (none is used to build them; the check stays so a future line cannot read a record out).
 */
export function buildBrief(signals: WatchSignal[], standing: Standing, asOf: string, records: string[] = []): Brief {
  const fromSignals: BriefItem[] = signals.slice(0, 4).map((s) => ({ id: s.key, kind: s.kind, severity: s.severity, text: s.text, source: s.sources[0] ?? chipOf("incidents", { en: "incident records", ta: "சம்பவப் பதிவுகள்" }, asOf, asOf), values: s.values }));
  const items = [...fromSignals];
  for (const st of standingItems(standing, asOf)) if (items.length < BRIEF_MAX && (items.length < BRIEF_MIN || st.severity !== "low")) items.push(st);
  const top = items.slice(0, BRIEF_MAX);

  const highs = signals.filter((s) => s.severity === "high");
  const worth = top.filter((i) => i.kind !== "standing").length;
  const bottomLine: Bi = highs.length
    ? (() => { const t = topicWords(highs[0]); return highs.length === 1 ? { en: `Bottom line: one thing needs you first, ${t.en}.`, ta: `முக்கியமா: முதல்ல கவனிக்க வேண்டியது ${t.ta}.` }
      : { en: `Bottom line: ${highs.length} things need you first, and the most urgent is ${t.en}.`, ta: `முக்கியமா: ${highs.length} விஷயங்களை முதல்ல கவனிக்கணும்; அதுல அவசரமானது ${t.ta}.` }; })()
    : worth ? { en: `Bottom line: a quiet day, with ${worth === 1 ? "one thing" : `${worth} things`} worth a look.`, ta: `முக்கியமா: அமைதியான நாள்; பார்க்க வேண்டியது ${worth} விஷயம்.` }
      : { en: "Bottom line: nothing unusual in the data right now.", ta: "முக்கியமா: இப்போ தரவுல அசாதாரணமா எதுவும் இல்லை." };

  const values: Record<string, number> = { highs: highs.length, worth, one: 1 };
  for (const it of top) for (const [k, v] of Object.entries(it.values)) values[`${it.id}.${k}`] = v;
  const allowed = allowedSet(Object.values(values));
  let dropped = 0;
  const lines = (lang: "en" | "ta") => {
    const out: string[] = [];
    for (const l of [bottomLine[lang], ...top.map((i) => i.text[lang])]) {
      if (l && sayable(l, allowed, records)) out.push(l); else dropped += 1;
    }
    return [...out, BRIEF_END[lang]];
  };
  const spoken = { en: lines("en"), ta: lines("ta") };
  return { asOf, bottomLine, items: top, end: BRIEF_END, spoken, values, dropped,
    told: top.filter((i) => i.kind !== "standing").map((i) => ({ key: i.id, level: signals.find((s) => s.key === i.id)?.level ?? 1 })) };
}

/** The console's own briefing counts for today, since 12 AM (the briefing tool, the Briefing page's figures); nulls when it cannot say. */
export async function standingNow(): Promise<Standing> {
  try {
    const { runTool } = await import("@/lib/assistant/tools");
    const r = await runTool("briefing", { scope: { period: "daily" } });
    const f = (id: string) => { const x = r.facts.find((k) => k.id === id); return x && Number.isFinite(x.value) ? x.value : null; };
    return { reported: f("briefing.reported"), open: f("briefing.open"), overdue: f("briefing.overdue"), severe: f("briefing.severe"), asOf: r.asOf };
  } catch {
    return { reported: null, open: null, overdue: null, severe: null, asOf: null };
  }
}

/** A Collector's brief now: their signals (watchFor) and the standing counts. Server only (dynamic imports). */
export async function briefFor(user: number): Promise<Brief> {
  const [{ signals, asOf, conditions }, standing] = await Promise.all([watchFor(user), standingNow()]);
  return buildBrief(signals, { ...standing, conditions }, asOf);
}
