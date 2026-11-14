/**
 * What Jarvis says, cut into the pieces it speaks one at a time. Pure, tested in Tamil and English. A sentence ends at . ! ?
 * । ॥ or a newline; the first chunk is at least 20 characters, so the first thing heard is a phrase and not a word; a comma
 * splits only above 120 characters. "12.5" and "St. Thomas" do not end a sentence. Every chunk goes through the number gate
 * (numbergate.ts) before it is spoken. No chunk is longer than 220 characters (cut at a space): Chrome stops an utterance after
 * about 15 s. This is the only chunking: the browser voice (voice.ts) speaks each chunk as it is.
 */
const END = /[.!?।॥\n]/;
const MIN_FIRST = 20;
const COMMA_ABOVE = 120;
const HARD_MAX = 220;

/** a clause with no comma still has to fit one utterance: cut at the last space before the limit (or at the limit, in a word with none) */
function hardCap(s: string): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > HARD_MAX) {
    const sp = rest.lastIndexOf(" ", HARD_MAX);
    const cut = sp > 40 ? sp : HARD_MAX;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** A dot that does not end a sentence: inside a number, or after a short title or a single initial. */
function softDot(t: string, i: number): boolean {
  if (t[i] !== ".") return false;
  const before = t[i - 1] ?? "", after = t[i + 1] ?? "";
  if (/\d/.test(before) && /\d/.test(after)) return true;
  // an initial or a title: "T. Nagar", "St. Thomas", "Dr. Rao"
  const word = /(?:^|[\s(])([\p{L}]{1,3})$/u.exec(t.slice(Math.max(0, i - 4), i))?.[1] ?? "";
  if (word && /\s/.test(after) && (/^[A-Z]$/.test(word) || /^(St|Dr|Mr|Ms|Mrs|No|Rd)$/.test(word))) return true;
  return false;
}

function splitLong(s: string): string[] {
  if (s.length <= COMMA_ABOVE) return [s];
  const out: string[] = [];
  let rest = s;
  while (rest.length > COMMA_ABOVE) {
    // the last comma that leaves a sensible piece; none: the piece stays whole (a long clause is still one breath)
    const cut = rest.slice(0, COMMA_ABOVE + 40).lastIndexOf(",");
    if (cut < 20) break;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function chunks(text: string): string[] {
  const t = text.replace(/[ \t]+/g, " ").trim();
  if (!t) return [];
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    if (!END.test(t[i]) || softDot(t, i)) continue;
    // keep a run of terminators ("?!", "...") with its sentence
    let e = i;
    while (e + 1 < t.length && END.test(t[e + 1])) e++;
    const s = t.slice(start, e + 1).trim();
    if (s.replace(/[.!?।॥\s]/g, "")) sentences.push(s);
    start = e + 1;
    i = e;
  }
  const tail = t.slice(start).trim();
  if (tail.replace(/[.!?।॥\s]/g, "")) sentences.push(tail);
  // the first chunk is at least 20 characters
  const merged: string[] = [];
  for (const s of sentences) {
    if (merged.length === 1 && merged[0].length < MIN_FIRST) merged[0] = `${merged[0]} ${s}`;
    else merged.push(s);
  }
  return merged.flatMap(splitLong).flatMap(hardCap);
}

/** What Jarvis says aloud: the first sentence or two (about 240 characters); the panel and the screen show it all. A dot inside a figure or a word ends nothing. */
export function spokenPart(text: string): string {
  const parts = text.replace(/\s+/g, " ").trim().match(/(?:[^.!?।]|[.!?।](?=\S))+[.!?।]*(?:\s|$)/g) ?? [text];
  let out = "", n = 0;
  for (const p of parts) {
    if (out && (out.length + p.length > 240 || n >= 2)) break;
    out += p;
    n++;
  }
  return out.trim() || text.slice(0, 240);
}
