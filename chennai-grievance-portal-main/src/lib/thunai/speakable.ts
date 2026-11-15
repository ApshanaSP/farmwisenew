/**
 * The figures Jarvis may say or show about a screen (Finding 51). Every one comes from the screen's data or from text code wrote:
 *  - the numbers in its blocks (tiles, counts, totals, chart points, ranks, readings, filled cells) and how many items each list holds;
 *  - the figures in the text code and the records wrote inside the blocks (labels, methods, rows, headlines, brief points) and in the
 *    narration read from them (stagelocal.ts narrationOf);
 *  - the figures in the title, the takeaway, the notes and the block titles, less any figure the model wrote in a free-text slot.
 *
 * Never from the spoken line itself (`say`), which is what this set checks, and never a figure a model wrote: a figure in one of the
 * Screen schema's free-text slots (agent.ts: q, name, id) is not Jarvis's unless the data holds it, and an answer screen's own sentence
 * (the model's, agent.ts answerScreen) gives it none. Before this, the browser's allowed set took every number in `say`, and a screen
 * copied the model's `q` into its title and its spoken line, so "flood deaths 300" written by a model could be said (defect 1).
 *
 * Pure. Thunai.tsx hands this set to the voice for every spoken chunk (numbergate.ts gateChunk).
 */
import { allowedSet, figuresIn } from "./numbergate";
import { narrationOf } from "./stagelocal";
import type { StageDocT } from "./stage";
import type { Lang } from "./types";

/**
 * The Screen schema's free-text slots (agent.ts `Screen`): the only words of a model's that a screen builder can be handed. metricId is a
 * code of letters and underscores, but those can spell a figure ("three_hundred_deaths"; review, Numbers 5), so it is one of them.
 */
export const MODEL_TEXT_SLOTS = ["q", "name", "id", "metricId"] as const;

/** Keys whose numbers are never a figure anyone says: a point's coordinates (13.08, 80.26 would let "13" and "80" through). */
const NOT_FIGURES = new Set(["lat", "lon"]);

type Bag = { nums: number[]; text: string[]; shown: string[] };

/** The figures in a line of text: digits of every script, lakh/crore, percentages and number words (numbergate.ts). */
function figuresOfText(t: string): number[] {
  const out: number[] = [];
  for (const f of figuresIn(t)) if (Number.isFinite(f.value)) out.push(f.value);
  // a plain digit run inside a code-written word ("3rd", "24h") counts as written
  for (const m of t.match(/\d+(?:\.\d+)?/g) ?? []) out.push(Number(m));
  return out;
}

function walk(v: unknown, bag: Bag, key = "", top = false, answer = false): void {
  if (typeof v === "number") { if (Number.isFinite(v) && !NOT_FIGURES.has(key)) bag.nums.push(v); return; }
  if (typeof v === "string") { bag.text.push(v); return; }
  if (Array.isArray(v)) { if (v.length) bag.nums.push(v.length); for (const x of v) walk(x, bag, key); return; }
  if (!v || typeof v !== "object") return;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    // a block's own title and a note's text can carry the words of a request (the model's slots): read as shown text, less the model's figures
    if (top && (k === "title" || (k === "text" && (v as { kind?: string }).kind === "Note"))) { if (typeof x === "string") bag.shown.push(x); continue; }
    // the answer screen's sentence is the model's (checked against the facts by agent.ts): it lends no figure
    if (top && answer && k === "text" && (v as { kind?: string }).kind === "Answer") continue;
    walk(x, bag, k);
  }
}

/** The figures a model wrote in the screen's free-text slots, as the gate reads them. */
export function modelFigures(doc: Pick<StageDocT, "slots">): Set<string> {
  const slots = (doc.slots ?? {}) as Record<string, unknown>;
  const vals: number[] = [];
  for (const k of MODEL_TEXT_SLOTS) {
    const v = slots[k];
    // read as written and with its underscores as spaces ("forty_seven" is forty-seven too)
    for (const s of Array.isArray(v) ? v : [v]) if (typeof s === "string") vals.push(...figuresOfText(s), ...(s.includes("_") ? figuresOfText(s.replace(/_+/g, " ")) : []));
  }
  return allowedSet(vals);
}

/** What a screen lets Jarvis say and show: see the file's comment. The signature is the one Thunai.tsx imports. */
export function speakableFigures(doc: StageDocT, lang: Lang): Set<string> {
  const answer = doc.recipe === "answer";
  const bag: Bag = { nums: [], text: [], shown: [] };
  for (const b of doc.blocks ?? []) walk(b, bag, "", true, answer);
  // the narration is code reading the blocks aloud (a case's age, its complaints, a rank): code-written
  for (const x of narrationOf(doc, lang)) bag.text.push(x.text);
  const out = allowedSet(bag.nums);
  for (const s of bag.text) for (const v of allowedSet(figuresOfText(s))) out.add(v);
  if (answer) return out;
  // the title, takeaway and notes are code's templates, but a request's words can sit in them: a figure the model wrote never counts
  const shown = [...bag.shown, doc.title ?? "", doc.titles?.[lang] ?? "", doc.takeaway?.[lang] ?? "", ...(doc.notes ?? []), ...(doc.notesBi ?? []).map((n) => n[lang] ?? "")];
  const model = modelFigures(doc);
  for (const s of shown) for (const v of allowedSet(figuresOfText(s))) if (!model.has(v)) out.add(v);
  return out;
}
