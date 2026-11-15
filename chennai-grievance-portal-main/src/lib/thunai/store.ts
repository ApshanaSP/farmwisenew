/**
 * Thunai's files on this server: one memory file per Collector user (notes, habits, preferences, reminders, recent
 * commands) and the shared hash-chained audit trail. Both live in data/thunai/ (git-ignored), never in the shared store.
 * THUNAI_DIR moves them (tests use a temporary folder).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { brokenAt, chain, GENESIS, type AuditEvent, type AuditLine } from "./audit";
import { redactText } from "./privacy";
import { emptyWatch, withPref, withSeen, withSpoken, type WatchPref, type WatchState } from "./watch";
import type { Follow, Snapshot } from "./signals";
import { fromSaid, NOTE_SOURCE, ownWords, promptable } from "./plan";

export { fromSaid };

const dir = () => process.env.THUNAI_DIR || path.join(process.cwd(), "data", "thunai");

/**
 * A kept note. v5 G3 (c): `source` "collector-spoken" (the Collector's own words, written through changeMemory's checks), `at` when it
 * was written and `turn` the turn id that wrote it (null when the client sent none). A note saved before v5 has no source: it stays on
 * disk and in the Collector's own list ("what do you remember", the memory panel) where he can forget it, and never reaches a prompt.
 */
export interface Note { id: string; text: string; at: string; source?: typeof NOTE_SOURCE; turn?: string | null }
/** a list entry that is a note at all (an object with text), whatever its source: what the Collector's own list may show */
const isNote = (n: unknown): n is Note => !!n && typeof n === "object" && !Array.isArray(n) && typeof (n as Note).text === "string";
export interface Reminder { id: string; text: string; at: string; done: boolean }
export interface Memory {
  notes: Note[];
  /** heard words -> what the Collector meant (from ask-once answers and repeated corrections) */
  habits: Record<string, string>;
  /** corrections seen once, waiting for a second identical one before they become a habit */
  pending: Record<string, string>;
  prefs: { lang?: "en" | "ta"; mode?: "voice" | "visual" | "quiet"; rate?: number };
  reminders: Reminder[];
  recent: { text: string; at: string }[];
  /** Stage screens the Collector pinned (v2): the recipe and slots rebuild them from the data when opened */
  pins: Pin[];
  /** v4: incidents and zones the Collector asked Jarvis to follow (Level B); absent until the first one */
  follows?: Follow[];
  /** v4: the watch's seen and told state and the Collector's "later" / "not about this" / "tell me" choices; absent until used */
  watch?: WatchState;
}
export interface Pin { id: string; title: string; recipe: string; slots: Record<string, unknown>; at: string }

const EMPTY: Memory = { notes: [], habits: {}, pending: {}, prefs: {}, reminders: [], recent: [], pins: [] };

function file(user: number) { return path.join(dir(), `memory-${Number(user)}.json`); }

const blank = (): Memory => ({ ...EMPTY, notes: [], habits: {}, pending: {}, prefs: {}, reminders: [], recent: [], pins: [] });

/** RC-51 (PB-329): the memory file exists but cannot be read as a memory (cut short by a crash or a full disk, or not an object). */
export class MemoryDamagedError extends Error {
  constructor(public user: number) { super("Thunai's saved memory file is damaged"); this.name = "MemoryDamagedError"; }
}

const LISTS = ["notes", "reminders", "recent", "pins"] as const;
const MAPS = ["habits", "pending", "prefs"] as const;

/** A missing file is an empty memory. A file that is there but unreadable is damaged, and must never be treated as empty. */
function load(user: number): { m: Memory; damaged: boolean; unreadable?: boolean } {
  let text: string;
  try { text = fs.readFileSync(file(user), "utf8"); }
  catch (e) { const gone = (e as NodeJS.ErrnoException)?.code === "ENOENT"; return { m: blank(), damaged: !gone, unreadable: !gone }; } // not readable (a lock, no permission): says nothing about the notes
  try {
    const m = JSON.parse(text);
    if (!m || typeof m !== "object" || Array.isArray(m)) return { m: blank(), damaged: true };
    // a field that is there but of the wrong kind (notes as text, reminders as null) is damage too: a spread of it would throw or split text into letters (SK2-2, SK2-3)
    for (const k of LISTS) if (k in m && !Array.isArray(m[k])) return { m: blank(), damaged: true };
    for (const k of MAPS) if (k in m && (!m[k] || typeof m[k] !== "object" || Array.isArray(m[k]))) return { m: blank(), damaged: true };
    if ("follows" in m && !Array.isArray(m.follows)) return { m: blank(), damaged: true };
    if ("watch" in m && (!m.watch || typeof m.watch !== "object" || Array.isArray(m.watch))) return { m: blank(), damaged: true };
    return { m: { ...blank(), ...m }, damaged: false };
  } catch { return { m: blank(), damaged: true }; }
}

/**
 * For the prompt-building routes: never throws; a damaged file reads as empty here but stays on disk untouched until a write keeps it aside.
 * v5 G3 (c): only notes with source "collector-spoken" (plan.ts promptable): the plan, agent and round routes map these notes to their text
 * for the planner, so a note saved before v5, or anything in the list that is not a note, never reaches a prompt. Nothing is removed from disk.
 */
export function readMemory(user: number): Memory { const m = load(user).m; return { ...m, notes: m.notes.filter(promptable) as Note[] }; }

/**
 * For answering the person: throws MemoryDamagedError instead of showing empty lists for a file that still holds their notes. Every note
 * is shown, a pre-v5 one without a source too (he can forget it); an entry in the list that is not a note at all is left out of the answer.
 */
export function readMemoryStrict(user: number): Memory {
  const r = load(user);
  if (r.damaged) throw new MemoryDamagedError(user);
  return { ...r.m, notes: r.m.notes.filter(isNote) };
}

/** Copies a damaged file beside itself before anything is written over it. Returns the copy's name, or null when the file is fine. */
function keepDamagedAside(user: number): string | null {
  const r = load(user);
  if (r.unreadable) throw new MemoryDamagedError(user); // a transient lock must never end with the notes replaced (review point 6)
  if (!r.damaged) return null;
  const kept = `${file(user)}.damaged-${Date.now()}`;
  try { fs.copyFileSync(file(user), kept); } catch { return null; }
  console.error("[thunai] memory file for user " + Number(user) + " was damaged; kept as " + path.basename(kept));
  return kept;
}

function writeMemory(user: number, m: Memory) {
  fs.mkdirSync(dir(), { recursive: true });
  const f = file(user);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(m, null, 1));
  fs.renameSync(`${f}.tmp`, f);
}

const id = () => crypto.randomBytes(6).toString("hex");
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export type MemoryOp =
  | { op: "note"; text: string; turn?: string }
  | { op: "forget"; id?: string; all?: boolean }
  | { op: "remind"; text: string; at: string }
  | { op: "reminderDone"; id: string }
  | { op: "habit"; heard: string; meant: string }
  | { op: "correction"; heard: string; meant: string }
  | { op: "prefs"; prefs: Memory["prefs"] }
  | { op: "recent"; text: string }
  | { op: "pin"; pin: Pin }
  | { op: "unpin"; id: string }
  // v4, Level B: each carries the Collector's yes (a spoken or typed "yes", or a tap), checked here as well as in the route
  /**
   * "remember …": only the Collector's own sentence (`said`, when given, must hold the note's words), cleaned, never an order to Jarvis.
   * v5 G3: `turn` is the id of the turn that asked (stored with the note); `shown` is the news or complaint text the Stage showed in that
   * turn (headlines, complaint titles and summaries), sent only for this check and never kept: when there is any, the note must be the
   * Collector's own words (plan.ts ownWords), else it is refused ("not-said" with no sentence, "copied" when read off the screen).
   */
  | { op: "remember"; text: string; said?: string; yes: true; turn?: string; shown?: string[] }
  /** "forget that": the last note */
  | { op: "forgetLast"; yes: true }
  /** "reset": everything, follows and the watch's choices too */
  | { op: "reset"; yes: true }
  | { op: "follow"; kind: Follow["kind"]; ref: string; cat?: string | null; zone?: number | null; snap: Snapshot; yes: true }
  | { op: "unfollow"; id: string; yes: true }
  | { op: "watchPref"; pref: WatchPref; target: string; minutes?: number; yes: true }
  // v4 bookkeeping (no yes: what the watch raised and said, and a followed item's state once the Collector has been told)
  | { op: "followSeen"; id: string; snap: Snapshot }
  | { op: "watchSeen"; items: { key: string; level: number }[]; told?: boolean }
  | { op: "watchSpoken"; key: string; level: number };

const LEVEL_B = new Set(["remember", "forgetLast", "reset", "follow", "unfollow", "watchPref"]);

/** A note the store will not keep, and why, in both languages. */
export class NoteRefusedError extends Error {
  constructor(public why: "instruction" | "empty" | "link" | "not-said" | "copied" | "no-yes", public reply: { en: string; ta: string }) { super(`note refused: ${why}`); this.name = "NoteRefusedError"; }
}
const REFUSE: Record<NoteRefusedError["why"], { en: string; ta: string }> = {
  copied: { en: "That reads like the screen's own words. Tell me the note in your own words and I'll keep it.", ta: "அது திரையில் உள்ள வார்த்தைகள் மாதிரி இருக்கு. உங்க சொந்த வார்த்தைகளில் சொல்லுங்க, வச்சுக்குவேன்." },
  instruction: { en: "I won't keep that: it reads like a standing order to me, and I only keep notes about your work, never rules for what I do.", ta: "அதை நான் சேமிக்க மாட்டேன்: அது எனக்கான கட்டளை மாதிரி இருக்கு. உங்க வேலை பற்றிய குறிப்புகளை மட்டும்தான் வச்சுக்குவேன்." },
  empty: { en: "There was nothing left to keep once numbers and quoted words were taken out.", ta: "எண்களும் மேற்கோள் வார்த்தைகளும் நீக்கிய பிறகு சேமிக்க எதுவும் இல்லை." },
  link: { en: "I don't keep links in my notes.", ta: "குறிப்புகளில் இணைப்புகளை நான் சேமிப்பதில்லை." },
  "not-said": { en: "I only keep what you said yourself.", ta: "நீங்களே சொன்னதை மட்டும்தான் சேமிப்பேன்." },
  "no-yes": { en: "That needs your yes first.", ta: "அதுக்கு முதல்ல உங்க சம்மதம் வேணும்." }
};

/**
 * Orders hidden in a note (memory poisoning, MINJA arXiv 2503.03704): a note that tells Jarvis what to do from now on, to skip a
 * check, to approve or send, or to drop its rules, is refused. English, Tamil and Tanglish. A refusal of a harmless note is the
 * safe side: the Collector can say it another way.
 */
const ORDERS: RegExp[] = [
  /\b(?:ignore|disregard|forget|override|bypass|skip|disable|drop)\b[^.]{0,40}\b(?:rules?|instructions?|guard ?rails?|polic(?:y|ies)|limits?|prompt|safety|checks?|confirmations?|gates?)\b/i,
  /\b(?:always|automatically|auto|from now on|henceforth|every time|whenever|by default)\b[^.]{0,50}\b(?:approve|send|forward|delete|remove|confirm|press|click|submit|publish|share|e-?mail|mail|close|resolve|reject|transfer|pay|execute)\w*\b/i,
  /\b(?:approve|send|forward|delete|confirm|submit|close|resolve)\w*\b[^.]{0,25}\b(?:all|every|everything|anything|without (?:asking|confirm\w*|checking|a yes|me))\b/i,
  /\b(?:without|no need (?:to|for)|don'?t|do not|never|stop)\s+(?:ask(?:ing)?|confirm(?:ing|ation)?|check(?:ing)?|wait(?:ing)? for)\b/i,
  /\b(?:you are|you're|you will be) (?:now|no longer|from now)\b|\bact as\b|\bpretend\b|\bjailbreak\b|\bsystem prompt\b|\bdeveloper (?:mode|message)\b|\bnew instructions?\b|\binstructions? for (?:jarvis|thunai|the assistant)\b/i,
  /^\s*(?:system|assistant|user|developer|tool)\s*:|<\/?\s*(?:system|assistant|instructions?|tool)\b|\[\[|\]\]|```/im,
  /\b(?:jarvis|thunai|assistant)\b[^.]{0,20}\b(?:must|should|shall|will|has to)\b/i,
  /(?:எப்போதும்|எப்பவும்|தானாக|தானா|இனிமே|இனிமேல்)[^.]{0,40}(?:அனுப்பு|ஒப்புதல்|அங்கீகரி|நீக்கு|அழி|உறுதி|மூடு)/,
  /(?:விதிகளை|விதிமுறைகளை|கட்டுப்பாடுகளை|சோதனைகளை)[^.]{0,25}(?:புறக்கணி|மற|மீறு|தவிர்|விடு)/,
  /(?:கேட்காம|கேட்காமல்|உறுதிப்படுத்தாம|சம்மதம் இல்லாம)[^.]{0,25}(?:அனுப்பு|ஒப்புதல்|நீக்கு|அழி|செய்)/,
  /\b(?:eppavum|eppovum|epavum|automatic(?:a|aa)?|inime|inimel)\b[^.]{0,40}\b(?:approve|send|anuppu\w*|delete|confirm|close)\b/i,
  /\b(?:rules?|instructions?)\b[^.]{0,20}\b(?:ignore|maranth\w*|marandh\w*|vendam|venaam|vidu)\b/i,
  /\b(?:kekkama|kekkamal|ketkama)\b[^.]{0,25}\b(?:approve|send|anuppu\w*|delete)\b/i
];
const QUOTED = /"[^"]*"|“[^”]*”|„[^“”]*[“”]|«[^»]*»|‘[^’]*’|(?<![\p{L}\p{N}])'[^']{2,}'(?![\p{L}\p{N}])/gu;
const LINK = /\bhttps?:\/\/|\bwww\.|\b[\w-]+\.(?:com|in|org|net|io|gov|co)\b/i;

/**
 * A note as the store keeps it: phone numbers, Aadhaar-like numbers and e-mails taken out, quoted words (a citizen's own) taken out,
 * and refused when what is left is empty, a link, or an order to Jarvis. Pure.
 */
export function safeNote(text: string): { ok: true; text: string; stripped: boolean } | { ok: false; why: NoteRefusedError["why"] } {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (ORDERS.some((re) => re.test(raw))) return { ok: false, why: "instruction" };
  const cleaned = redactText(raw.replace(QUOTED, " ")).replace(/\[hidden\]/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();
  // after e-mails are out (redactText hides them), so an address is cleaned away rather than refused as a link
  if (LINK.test(cleaned)) return { ok: false, why: "link" };
  if (ORDERS.some((re) => re.test(cleaned))) return { ok: false, why: "instruction" };
  if ((cleaned.match(/[\p{L}]/gu) ?? []).length < 3) return { ok: false, why: "empty" };
  return { ok: true, text: clip(cleaned, 300), stripped: cleaned !== raw };
}

function noteOrRefuse(text: string, said?: string, shown?: unknown): string {
  const r = safeNote(text);
  if (!r.ok) throw new NoteRefusedError(r.why, REFUSE[r.why]);
  if (said != null && !fromSaid(r.text, said)) throw new NoteRefusedError("not-said", REFUSE["not-said"]);
  // v5 G3 (a): the Stage showed news or complaint text in this turn: the note is kept only in the Collector's own words (plan.ts ownWords)
  const onStage = Array.isArray(shown) ? shown.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 60) : [];
  if (onStage.length) {
    if (said == null) throw new NoteRefusedError("not-said", REFUSE["not-said"]);
    if (!ownWords(r.text, said, onStage)) throw new NoteRefusedError("copied", REFUSE.copied);
  }
  return r.text;
}

/** Apply one change and return the new memory. Corrections become a habit on the second identical one. */
export function changeMemory(user: number, op: MemoryOp, now = new Date()): Memory {
  // a Level B change with no yes is refused before anything is read or written (the route checks it too)
  if (LEVEL_B.has(op.op) && (op as { yes?: unknown }).yes !== true) throw new NoteRefusedError("no-yes", REFUSE["no-yes"]);
  // a note is checked before anything is written, so a refused one leaves the file as it was
  const noteText = op.op === "note" ? noteOrRefuse(op.text) : op.op === "remember" ? noteOrRefuse(op.text, op.said, op.shown) : null;
  keepDamagedAside(user); // RC-51: a half-written file is copied aside before the new note replaces it
  const m = load(user).m; // every note, a pre-v5 one without a source too: a write never drops what the prompt read leaves out
  const at = now.toISOString();
  const t = now.getTime();
  const watch = (): WatchState => ({ ...emptyWatch(), ...(m.watch ?? {}) });
  switch (op.op) {
    // v5 G3 (c): who said it, when, and the turn that asked (the client's turn id, else null: never one made up here)
    case "note": case "remember": {
      const turn = typeof op.turn === "string" && op.turn.trim() ? clip(op.turn, 40) : null;
      m.notes = [...m.notes, { id: id(), text: noteText as string, at, source: NOTE_SOURCE, turn }].slice(-100);
      break;
    }
    case "forget":
      if (op.all) { Object.assign(m, { ...EMPTY, habits: {}, pending: {}, prefs: {}, notes: [], reminders: [], recent: [], pins: [] }); delete m.follows; delete m.watch; }
      else if (op.id) { m.notes = m.notes.filter((n) => n?.id !== op.id); m.reminders = m.reminders.filter((r) => r.id !== op.id); delete m.habits[op.id]; if (m.follows) m.follows = m.follows.filter((f) => f.id !== op.id); }
      else m.notes = m.notes.slice(0, -1);
      break;
    case "forgetLast": m.notes = m.notes.slice(0, -1); break;
    case "reset": { const b = blank(); writeMemory(user, b); return b; }
    case "follow": {
      const ref = clip(op.ref, 40);
      const kept = (m.follows ?? []).filter((f) => !(f.kind === op.kind && f.ref === ref));
      m.follows = [...kept, { id: id(), kind: op.kind, ref, at, snap: op.snap, cat: op.cat ?? null, zone: op.zone ?? null }].slice(-20);
      break;
    }
    case "unfollow": m.follows = (m.follows ?? []).filter((f) => f.id !== op.id); break;
    case "followSeen": m.follows = (m.follows ?? []).map((f) => (f.id === op.id ? { ...f, snap: op.snap } : f)); break;
    case "watchPref": m.watch = withPref(watch(), op.pref, clip(op.target, 120), t, op.minutes); break;
    case "watchSeen": m.watch = withSeen(watch(), op.items.map((x) => ({ key: clip(x.key, 120), level: x.level })), t, !!op.told); break;
    case "watchSpoken": m.watch = withSpoken(watch(), clip(op.key, 120), op.level, t); break;
    case "remind": m.reminders = [...m.reminders, { id: id(), text: clip(op.text, 200), at: op.at, done: false }].slice(-50); break;
    case "reminderDone": m.reminders = m.reminders.map((r) => (r.id === op.id ? { ...r, done: true } : r)); break;
    case "habit": m.habits[clip(op.heard.toLowerCase(), 60)] = clip(op.meant, 80); break;
    case "correction": {
      const k = clip(op.heard.toLowerCase(), 60);
      if (m.pending[k] === op.meant) { m.habits[k] = clip(op.meant, 80); delete m.pending[k]; } else m.pending[k] = clip(op.meant, 80);
      break;
    }
    case "prefs": m.prefs = { ...m.prefs, ...op.prefs }; break;
    // the Collector's own command, kept without numbers that are someone's phone or Aadhaar and without quoted (a citizen's) words
    case "recent": m.recent = [...m.recent, { text: clip(redactText(op.text.replace(QUOTED, " ")).replace(/\[hidden\]/g, " "), 200), at }].slice(-200); break;
    case "pin": { const title = clip(op.pin.title, 80); m.pins = [...(m.pins ?? []).filter((p) => p.id !== op.pin.id && p.title !== title), { ...op.pin, title }].slice(-12); } break;
    case "unpin": m.pins = (m.pins ?? []).filter((p) => p.id !== op.id); break;
  }
  writeMemory(user, m);
  return m;
}

export interface RememberedItem { kind: "note" | "follow" | "mute" | "tell" | "habit" | "reminder"; id: string; text: string; at: string | null }

const TOPIC_WORDS: Record<string, string> = { rise: "unusual rises", overdue: "cases past their deadline", rain: "heavy rain", reservoir: "reservoir levels", warning: "IMD warnings",
  followed: "something you follow", gap: "news with no department record", studio: "your Data Studio watches" };

/**
 * "What do you remember about me?": everything kept for this Collector, as a list for the screen (notes in their own words, follows,
 * the watch choices, learned habits, open reminders), and one spoken line built by code with counts only: the list is on the screen.
 */
export function rememberList(m: Memory): { items: RememberedItem[]; spoken: { en: string; ta: string }; values: Record<string, number> } {
  const items: RememberedItem[] = [
    ...m.notes.filter(isNote).map((n) => ({ kind: "note" as const, id: n.id, text: n.text, at: n.at })),
    ...(m.follows ?? []).map((f) => ({ kind: "follow" as const, id: f.id, text: f.kind === "zone" ? `zone ${f.ref}` : `incident ${f.ref}`, at: f.at })),
    ...Object.entries(m.watch?.mute ?? {}).map(([k, at]) => ({ kind: "mute" as const, id: k, text: `not about ${TOPIC_WORDS[k.split(":")[0]] ?? "this"}`, at })),
    ...Object.entries(m.watch?.tell ?? {}).map(([k, at]) => ({ kind: "tell" as const, id: k, text: `tell me about ${TOPIC_WORDS[k.split(":")[0]] ?? "this"}`, at })),
    ...Object.entries(m.habits).map(([k, v]) => ({ kind: "habit" as const, id: k, text: `"${k}" means ${v}`, at: null })),
    ...m.reminders.filter((r) => !r.done).map((r) => ({ kind: "reminder" as const, id: r.id, text: r.text, at: r.at }))
  ];
  const notes = m.notes.filter(isNote).length, follows = (m.follows ?? []).length, choices = items.filter((i) => i.kind === "mute" || i.kind === "tell").length;
  const values = { notes, follows, choices };
  if (!items.length) return { items, values, spoken: { en: "I don't remember anything about you yet: I keep only what you ask me to.", ta: "உங்களைப் பற்றி இன்னும் எதுவும் வச்சுக்கல: நீங்க சொல்றதை மட்டும்தான் வச்சுக்குவேன்." } };
  return { items, values, spoken: {
    en: `I keep ${notes} ${notes === 1 ? "note" : "notes"} you asked me to remember, follow ${follows} ${follows === 1 ? "thing" : "things"} for you, and hold ${choices} of your choices about alerts. They're on the screen.`,
    ta: `நீங்க சொன்ன ${notes} குறிப்புகளை வச்சிருக்கேன், ${follows} விஷயங்களை கவனிக்கிறேன், அறிவிப்புகள் பற்றி உங்க ${choices} விருப்பங்கள் இருக்கு. எல்லாம் திரையில இருக்கு.`
  } };
}

// ------------------------------------------------------------------ audit --

const auditFile = () => path.join(dir(), "audit.jsonl");

export function readAudit(limit = 200): { lines: AuditLine[]; intact: boolean } {
  let all: AuditLine[] = [];
  try {
    all = fs.readFileSync(auditFile(), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as AuditLine);
  } catch { /* no trail yet */ }
  return { lines: all.slice(-limit), intact: brokenAt(all) === -1 };
}

export function appendAudit(e: Omit<AuditEvent, "id" | "at">, now = new Date()): AuditLine {
  fs.mkdirSync(dir(), { recursive: true });
  let prev = GENESIS;
  try {
    const text = fs.readFileSync(auditFile(), "utf8").trimEnd();
    const last = text.slice(text.lastIndexOf("\n") + 1);
    if (last) prev = (JSON.parse(last) as AuditLine).hash;
  } catch { /* first line */ }
  const line = chain({ id: id(), at: now.toISOString(), ...e }, prev);
  fs.appendFileSync(auditFile(), `${JSON.stringify(line)}\n`);
  return line;
}
