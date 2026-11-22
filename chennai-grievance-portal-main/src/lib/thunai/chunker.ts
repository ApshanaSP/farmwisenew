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
/**
 * v6: a Tamil answer's first chunk, at most this many characters (cut at a comma, else a space): Edge's online Tamil voice takes longer
 * to start the longer the utterance (eval/v6/latency/voiceprobe.json: 33 characters 0.8 s, 109 characters 2.2 s, 236 characters about 3 s;
 * English about 0.2-0.3 s at any length), so the first words go first. NEXT_PUBLIC_JARVIS_TA_FIRST_CHUNK=0 turns it off.
 */
export const FIRST_MAX_TA = 48;
const firstMaxTa = (): number => {
  const v = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_JARVIS_TA_FIRST_CHUNK : undefined;
  const n = v == null || v.trim() === "" ? FIRST_MAX_TA : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : FIRST_MAX_TA;
};
/**
 * the first chunk cut short at a comma, else a space, at most max characters and at least MIN_FIRST. Not at a comma between two
 * digits: "1,234" cut there is spoken by the number gate as 1 and 234.
 */
function shortFirst(c: string[], max: number): string[] {
  if (!max || !c.length || c[0].length <= max) return c;
  const s = c[0], head = s.slice(0, max + 1);
  let cut = head.lastIndexOf(",");
  while (cut >= MIN_FIRST && /\d/.test(s[cut - 1] ?? "") && /\d/.test(s[cut + 1] ?? "")) cut = head.lastIndexOf(",", cut - 1);
  if (cut < MIN_FIRST) cut = head.lastIndexOf(" ");
  if (cut < MIN_FIRST) return c;
  const a = c[0].slice(0, cut + (c[0][cut] === "," ? 1 : 0)).trim(), b = c[0].slice(cut + 1).trim();
  return b ? [a, b, ...c.slice(1)] : c;
}

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
  // v16 (22 Nov, the browser drive): a dot with a letter right after it is inside an abbreviation, never a sentence's end: "M.K.B. Nagar" was
  // spoken as four utterances, "at M." / "K." / "B." / "Nagar, which ...", each stopped and started again
  if (/\p{L}/u.test(before) && /\p{L}/u.test(after)) return true;
  // an initial or a title: "T. Nagar", "St. Thomas", "Dr. Rao", and the last initial of a run ("M.K.B. Nagar")
  const word = /(?:^|[\s(.])([\p{L}]{1,3})$/u.exec(t.slice(Math.max(0, i - 4), i))?.[1] ?? "";
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

export function chunks(text: string, o: { lang?: "ta" | "en" } = {}): string[] {
  const c = chunksOf(text);
  return o.lang === "ta" ? shortFirst(c, firstMaxTa()) : c;
}
function chunksOf(text: string): string[] {
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
