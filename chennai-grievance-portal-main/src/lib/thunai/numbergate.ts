/**
 * The number gate on every spoken chunk: every figure Jarvis says comes from code. A figure in digits, Tamil digits, lakh and
 * crore forms, a percentage or spelled out in English or Tamil is allowed only when code supplied it. Text built by code from
 * the data (templates, screens) carries its numbers as `allowed`; a model-written line has none, so it can hold no figure.
 *
 * Extends the agent's figuresOk and spellsNumber (stage.ts, agent.ts) so one rule holds for digits and for words. Pure.
 */
const TA_DIGITS = "௦௧௨௩௪௫௬௭௮௯";
const EN_WORDS: Record<string, number> = {
  zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, lakh: 100_000, lakhs: 100_000, crore: 10_000_000, crores: 10_000_000, million: 1_000_000, billion: 1_000_000_000, dozen: 12, dozens: 12
};
const TA_WORDS: Record<string, number> = {
  "இரண்டு": 2, "ரெண்டு": 2, "மூன்று": 3, "மூணு": 3, "நான்கு": 4, "நாலு": 4, "ஐந்து": 5, "அஞ்சு": 5, "ஆறு": 6, "ஏழு": 7, "எட்டு": 8, "ஒன்பது": 9, "பத்து": 10,
  "இருபது": 20, "முப்பது": 30, "நாற்பது": 40, "ஐம்பது": 50, "அறுபது": 60, "எழுபது": 70, "எண்பது": 80, "தொண்ணூறு": 90,
  "நூறு": 100, "ஆயிரம்": 1000, "லட்சம்": 100_000, "இலட்சம்": 100_000, "கோடி": 10_000_000
};
const TG_WORDS: Record<string, number> = { rendu: 2, moonu: 3, naalu: 4, anju: 5, aaru: 6, ezhu: 7, ettu: 8, ombodhu: 9, pathu: 10, nooru: 100, aayiram: 1000 };
/** "ஆறு" is also a river and a place-name ending: only a whole word that stands as a number counts */
const TA_RIVER = /(அடையாறு|பாலாறு|கூவம் ஆறு|ஆறு கரை|ஆற்று)/;

export interface Figure { raw: string; value: number; words?: boolean }

const taDigits = (s: string) => s.replace(/[௦-௯]/g, (d) => String(TA_DIGITS.indexOf(d)));

/** Every figure in the text, with its value: digits (grouped Indian or Western, decimals, %), Tamil digits, lakh/crore, words. */
export function figuresIn(text: string): Figure[] {
  const t = taDigits(text);
  const out: Figure[] = [];
  const seenWord = new Set<string>();
  // digits with a scale word: "3.5 lakh", "2 crore", "12 லட்சம்"
  const num = /(?<![\p{L}\d-])(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\s*(lakhs?|crores?|thousand|hundred|லட்சம்|இலட்சம்|கோடி|ஆயிரம்|நூறு)?(?![\p{L}\d])/giu;
  for (let m; (m = num.exec(t)); ) {
    const base = Number((m[1] + (m[2] ?? "")).replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const scale = m[3]?.toLowerCase();
    const mult = !scale ? 1 : /lakh|லட்சம்/.test(scale) ? 100_000 : /crore|கோடி/.test(scale) ? 10_000_000 : /thousand|ஆயிரம்/.test(scale) ? 1000 : 100;
    out.push({ raw: m[0].trim(), value: base * mult });
    if (scale) seenWord.add(scale);
  }
  for (const m of t.matchAll(/(?<![\p{L}])([a-z]+)(?![\p{L}])/giu)) {
    const w = m[1].toLowerCase();
    if (seenWord.has(w)) continue;
    if (EN_WORDS[w] != null) out.push({ raw: m[1], value: EN_WORDS[w], words: true });
    else if (TG_WORDS[w] != null) out.push({ raw: m[1], value: TG_WORDS[w], words: true });
  }
  if (/\b(percent|per cent)\b|சதவீத/i.test(t) && !/%/.test(t) && !out.some((f) => !f.words)) out.push({ raw: "percent", value: NaN, words: true });
  const clean = t.replace(TA_RIVER, " ");
  for (const m of clean.matchAll(/[஀-௿]+/g)) {
    if (seenWord.has(m[0])) continue;
    if (TA_WORDS[m[0]] != null) out.push({ raw: m[0], value: TA_WORDS[m[0]], words: true });
  }
  return out;
}

/** Figures a chunk may use: the same value in any form, rounded to whole and to one place (as the screens show it). */
export function allowedSet(values: Iterable<number | string>): Set<string> {
  const s = new Set<string>();
  for (const v of values) {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[,%\s]/g, ""));
    if (!Number.isFinite(n)) continue;
    for (const x of [n, Math.abs(n), Math.round(n), Math.round(Math.abs(n)), Math.round(n * 10) / 10, Math.round(Math.abs(n) * 10) / 10]) s.add(String(x));
  }
  return s;
}

export interface GateResult { ok: boolean; bad: string[] }

/** Does every figure in the chunk come from code? */
export function gateChunk(chunk: string, allowed: Set<string>): GateResult {
  const bad = figuresIn(chunk).filter((f) => !allowed.has(String(f.value))).map((f) => f.raw);
  return { ok: !bad.length, bad };
}

/**
 * Speech templates: the model writes {n:key} placeholders only, code fills them from named values. An unknown key refuses the
 * whole line; any figure the model wrote itself refuses it too. Returns the filled line, or null.
 */
export function fillTemplate(tpl: string, values: Record<string, number | string>): string | null {
  const literal = tpl.replace(/\{n:[a-zA-Z0-9_]+\}/g, " ");
  if (figuresIn(literal).length) return null;
  let ok = true;
  const out = tpl.replace(/\{n:([a-zA-Z0-9_]+)\}/g, (_, k: string) => {
    if (!(k in values)) { ok = false; return ""; }
    return String(values[k]);
  });
  return ok ? out : null;
}
