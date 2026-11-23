/**
 * What was asked of Jarvis and what it answered, for the chatbot's "Jarvis" tab: nothing stacks up over the dashboard, it
 * goes here. The words and the screen each answer opened are kept in this browser (the last 60); an answer's chart card
 * only until the page reloads.
 */
import type { AnswerCard } from "@/lib/assistant/answer";
import type { StudioMsg } from "./StudioAnswer";

export interface JLog {
  id: string;
  who: "you" | "jarvis";
  text: string;
  lang: "en" | "ta";
  via?: "voice" | "typed";
  at: number;
  /** an insight screen this answer opened (a click opens it again); v17: a dataset answer's screen carries the Studio's own card too */
  screen?: { title: string; recipe: string; slots: Record<string, unknown>; studio?: StudioMsg };
  /** an analyst answer (charts, table, sources) */
  card?: AnswerCard;
  /** an answer from the dataset open in the Data Studio */
  studio?: StudioMsg;
}

const KEY = "jarvis-log";
const EMPTY: JLog[] = [];
let list: JLog[] = EMPTY;
let read = false;
const subs = new Set<() => void>();

function load() {
  if (read || typeof window === "undefined") return;
  read = true;
  try { const j = JSON.parse(localStorage.getItem(KEY) ?? "[]"); if (Array.isArray(j)) list = j as JLog[]; } catch { /* starts empty */ }
}
function save() {
  // the chart cards are large and rebuilt by asking again: only the words and the screen are kept (a dataset screen's own Studio card
  // too: its chart's labels and values, sixty times over, would fill the browser's storage and then nothing more would be kept)
  try {
    localStorage.setItem(KEY, JSON.stringify(list.map(({ card: _c, studio: _s, ...x }) => {
      if (!x.screen?.studio) return x;
      const { studio: _st, ...screen } = x.screen;
      return { ...x, screen };
    })));
  } catch { /* not kept */ }
}

export const jarvisLog = {
  get: (): JLog[] => { load(); return list; },
  /** the server's render, and the first paint */
  empty: (): JLog[] => EMPTY,
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  add: (m: Omit<JLog, "id" | "at">) => {
    load();
    list = [...list, { ...m, id: Math.random().toString(36).slice(2, 10), at: Date.now() }].slice(-60);
    save();
    subs.forEach((f) => f());
  },
  clear: () => { list = []; read = true; try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } subs.forEach((f) => f()); }
};
