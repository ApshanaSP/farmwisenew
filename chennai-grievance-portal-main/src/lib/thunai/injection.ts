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

/**
 * Does the Collector's sentence ASK for this kind of step? A bare keyword is not an ask ("what type of complaints", "street light
 * complaints", "Tamil Nadu pollution board", "why did the officer not talk to residents", a place called Maraimalai Nagar): the
 * word must be used as a command. So each kind needs the shape of a command: the verb at the start of a clause or after a polite or
 * auxiliary prefix, or the noun phrase that only means the setting ("dark mode", "quiet mode", "in Tamil"). Words are cut at
 * letter boundaries, never inside a longer word (RC-19, PB-097).
 */
const L = String.raw`[\p{L}\p{M}]`;
const LEAD = String.raw`(?:^|[,.;!?]\s*|\b(?:and|then|also|please|pls|just|now|kindly|can you|could you|would you|will you|you can|you should|i want you to|i'd like you to|let's|lets|to)\s+)`;
const cmd = (words: string, tail = "") => String.raw`${LEAD}(?:${words})(?!${L})${tail}`;
const ASKED: Partial<Record<Step["a"], RegExp>> = {
  type: new RegExp(`${cmd("type|write|enter|fill(?:\\s+in)?", String.raw`(?:\s+(?:it|this|that|in|out|the|a|an|my|\S+:|"|'))`)}|டைப்\\s*(?:செய்|பண்ணு|பண்ணுங்க)|(?<!${L})எழுது(?!${L})`, "iu"),
  mode: new RegExp(String.raw`\b(?:quiet|silent|voice|visual)\s+mode\b|\b(?:mute|unmute|silence)\b|\b(?:be|go|stay|keep|remain)\s+(?:quiet|silent)\b|\b(?:talk|speak)\s+(?:less|more|quietly|softly|softer|louder)\b|\bstop\s+(?:talking|speaking)\b|அமைதியாக\s*(?:இரு|இருங்க)|பேசாதே|பேசாதீங்க|சத்தத்தை\s*(?:குறை|நிறுத்து)|\bpesaadha\b`, "iu"),
  theme: new RegExp(String.raw`\b(?:dark|light|night|bright)\s+(?:mode|theme)\b|\b(?:theme|dark mode|night mode)\b|\b(?:switch|change|set|turn|make|go|use|put|toggle|flip)\b.{0,20}\b(?:dark|light|night|bright)\b|தீம்|இருட்டு\s*(?:மோட்|தீம்|ஆக்கு)|வெளிச்சமாக\s*(?:மாற்று|வை)`, "iu"),
  lang: new RegExp(String.raw`\b(?:in|to|into)\s+(?:tamil|english|thamizh|tamizh)\b|\b(?:tamil|english)\s+(?:please|pls|only|mode|la|le)\b|\b(?:speak|reply|answer|respond|talk|switch|change|set|use|say|translate)\b.{0,15}\b(?:tamil|english|thamizh|tamizh|language)\b|\blanguage\b|தமிழில்|ஆங்கிலத்தில்|தமிழ்\s*(?:மொழி|ல)|ஆங்கில\s*(?:மொழி|த்தில்)|மொழியை`, "iu"),
  forget: new RegExp(String.raw`\b(?:forget|erase (?:your |my |the )?memory|clear (?:your |my |the )?(?:memory|notes))\b|\bmarandhu\w*|(?<!${L})மறந்து${L}*|(?<!${L})மறந்திடு`, "iu"),
  remember: new RegExp(String.raw`\bremember\b|\b(?:note\s+(?:down|that|this)|make\s+a\s+note|keep\s+in\s+mind)\b|\bnyabagam|நினைவில்\s*(?:வை|வச்சுக்கோ)|ஞாபகம்\s*வை|நினைவு\s*வை`, "iu"),
  send: new RegExp(String.raw`\b(?:send|forward|e-?mail|mail)\s+(?:it|this|that|them|a|an|the|me|to)\b|\bdraft\b|\btray\b|\banuppu\w*|அனுப்பு|வரைவு`, "iu"),
  draft: new RegExp(String.raw`\b(?:draft|write|compose|prepare)\b.{0,25}\b(?:letter|mail|email|note|message|notice|memo)\b|\bdraft\b|வரைவு|கடிதம்`, "iu"),
  click: new RegExp(cmd("click|press|tap|hit|select|choose"), "iu"),
  undo: new RegExp(`${cmd("undo|go back|revert|step back|take (?:it )?back")}|(?<!${L})திரும்ப(?:ிப்)?\\s*(?:போ|போங்க)`, "iu")
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
