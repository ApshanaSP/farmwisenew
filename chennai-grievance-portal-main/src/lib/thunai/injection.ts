/**
 * Instructions hidden in data are data (docs/qa/BUGS.md BUG-011). A model can be talked into anything by a complaint title, a
 * headline or a dataset cell, so the gates are in code, after the model:
 *   - a step that changes the console beyond showing data (typing, the voice mode, the theme, the language, forgetting,
 *     remembering, a draft for the tray, pressing a button) runs only when the Collector's own words asked for that kind of thing;
 *   - a line the model wrote is not said if it repeats six or more words of the records it read (the injected sentence itself).
 */
import type { ToolResult } from "@/lib/assistant/types";
import { copiedRun } from "./speechcheck";
import type { Step } from "./types";

const ASKED: Partial<Record<Step["a"], RegExp>> = {
  type: /\b(type|write|enter|fill)\b|டைப்|எழுது/i,
  mode: /\b(mode|quiet|silent|silence|mute|voice|visual|speak|talk|louder|softer)\b|அமைதி|சத்தம்|பேசு|பேசாத/i,
  theme: /\b(theme|dark|light|night)\b|இருட்டு|வெளிச்ச/i,
  lang: /\b(tamil|english|language|thamizh|tamizh)\b|தமிழ்|ஆங்கில/i,
  forget: /\b(forget|erase memory|clear memory|marandhu|marandhudu)\b|மற/i,
  remember: /\b(remember|note|keep in mind|nyabagam)\b|நினைவு|ஞாபக/i,
  send: /\b(send|draft|tray|mail|email|forward|anuppu)\b|அனுப்பு|வரைவு/i,
  draft: /\b(draft|write|letter|mail|email|tray)\b|வரைவு|கடிதம்/i,
  click: /\b(click|press|tap|hit|select|choose)\b|அழுத்து|தட்டு|கிளிக்/i,
  undo: /\b(undo|go back|revert|back)\b|திரும்ப/i
};

/** Only the steps the Collector's own words asked for, of the kinds that need asking. */
export function stepsAskedFor(steps: Step[], said: string): Step[] {
  return steps.filter((s) => { const re = ASKED[s.a]; return !re || re.test(said); });
}

/** Every piece of text the tools returned (titles, summaries, headlines): what an injected instruction would sit in. */
export function recordText(results: { result: ToolResult }[]): string[] {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || out.length > 400) return;
    if (typeof v === "string") { if (v.split(/\s+/).length >= 6) out.push(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v && typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  for (const r of results) walk(r.result?.data, 0);
  return out;
}

/** A model's line that repeats a record's wording (six words or more) is the record speaking, not Jarvis: not said. */
export const echoesRecords = (line: string | null | undefined, records: string[]): boolean => !!line && copiedRun(line, records) != null;
