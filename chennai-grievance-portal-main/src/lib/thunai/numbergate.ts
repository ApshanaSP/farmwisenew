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
  hundred: 100, thousand: 1000, lakh: 100_000, lakhs: 100_000, crore: 10_000_000, crores: 10_000_000, million: 1_000_000, billion: 1_000_000_000, dozen: 12, dozens: 12,
  hundreds: 100, thousands: 1000, millions: 1_000_000, billions: 1_000_000_000, half: 0.5, twice: 2, thrice: 3, double: 2, triple: 3
};
/** "one moment", "the first one" and "the second one" are not figures: "one" and the ordinals are left out on purpose, here and in Tamil */
const EN_PARTS: Record<string, number> = { third: 1 / 3, quarter: 0.25, fifth: 0.2, tenth: 0.1 };
/** Tamil number words by stem, so case endings, 11 to 19 and "-க்கணக்கான" count. Each stem stops short of the ordinary words beside it (நான், எண்ணிக்கை, பத்திரிகை, எட்டப்பட்டது). */
const TA_STEMS: [RegExp, number][] = [
  [/^பதினொ/, 11], [/^பன்னிர/, 12], [/^பதி(ன்)?மூ/, 13], [/^பதினான்|^பதினாலு/, 14], [/^பதினை|^பதினஞ்/, 15], [/^பதினாற/, 16], [/^பதினே/, 17], [/^பதினெ/, 18], [/^பத்தொன்ப/, 19],
  [/^இருநூற/, 200], [/^மு(ந்ந|ன்ன)ூற/, 300], [/^நானூற/, 400], [/^ஐ(ந்ந|ன்ன|ந)ூற/, 500], [/^அறுநூற/, 600], [/^எழுநூற/, 700], [/^எண்ணூற/, 800], [/^தொள்ளாயிர/, 900],
  [/^நூறு|^நூற்(று|றி|றை)/, 100], [/^ஆயிர/, 1000], [/^மூவாயிர/, 3000], [/^ஐயாயிர/, 5000], [/^இ?லட்ச(ம்|க்|த்|ங்|$)/, 100_000], [/^கோடி(க்|கள்|யே|$)/, 10_000_000],
  [/^இரண்ட|^ரெண்ட/, 2], [/^மூன்ற|^மூணு/, 3], [/^நான்க[ுிைா]|^நாலு/, 4], [/^ஐந்த|^அஞ்சு(க்கு|க்கும்)?$/, 5], [/^ஆறு(ம்|க்கு|க்கும்)?$|^ஆறில்$/, 6], [/^ஏழு(ம்|க்கு|க்கும்)?$|^ஏழில்$/, 7],
  [/^எட்டு(க்கு|க்கும்)?$|^எட்டில்$/, 8], [/^ஒன்பத/, 9], [/^பத்து|^பத்தில்$/, 10],
  [/^பாதி(யளவு|யும்)?$/, 0.5], [/^இரட்டிப்|^இருமடங்/, 2], [/^மும்மடங்/, 3]
];
const TA_TENS: [RegExp, number][] = [[/^இருபத/, 20], [/^முப்பத/, 30], [/^நாற்பத/, 40], [/^ஐம்பத/, 50], [/^அறுபத/, 60], [/^எழுபத/, 70], [/^எண்பத/, 80], [/^தொண்ணூ/, 90]];
const TA_UNITS: [RegExp, number][] = [[/ொன்ப/, 9], [/ொன்ற/, 1], [/ரண்ட|ரெண்ட/, 2], [/மூன்ற|மூணு/, 3], [/நான்க|நால/, 4], [/ைந்த|ஐந்த|ஞ்சு/, 5], [/ாற/, 6], [/ேழ/, 7], [/ெட்ட/, 8]];
const TG_WORDS: Record<string, number> = { rendu: 2, moonu: 3, naalu: 4, anju: 5, aaru: 6, ezhu: 7, ettu: 8, ombodhu: 9, pathu: 10, nooru: 100, aayiram: 1000 };
/** "ஆறு" is also a river and a place-name ending: only a whole word that stands as a number counts */
const TA_RIVER = /(அடையாறு|பாலாறு|கூவம் ஆறு|ஆறு கரை|ஆற்று)/g;

export interface Figure { raw: string; value: number; words?: boolean }

const taDigits = (s: string) => s.replace(/[௦-௯]/g, (d) => String(TA_DIGITS.indexOf(d)));

/** A Tamil word's value, or null: tens with their units (இருபத்தைந்து), thousands with their head (இரண்டாயிரம்). Ordinals (இரண்டாவது) and "both" (இரண்டையும்) are not figures. */
function taNumber(w: string): number | null {
  if (/ாம்$|ாவத/.test(w) || /^(இரண்|ரெண்)(டும்|டையும்|டிலும்)$/.test(w)) return null;
  const k = w.indexOf("ாயிர");
  if (k > 0) { const head = taNumber(`${w.slice(0, k)}ு`); if (head) return head * 1000; }
  for (const [re, v] of TA_TENS) {
    const m = re.exec(w);
    if (m) return v + (TA_UNITS.find(([u]) => u.test(w.slice(m[0].length)))?.[1] ?? 0);
  }
  return TA_STEMS.find(([re]) => re.test(w))?.[1] ?? null;
}

/** Every figure in the text, with its value: digits (grouped Indian or Western, decimals, %), Tamil digits, lakh/crore, words. */
export function figuresIn(text: string): Figure[] {
  const t = taDigits(text);
  const out: Figure[] = [];
  const seenWord = new Set<string>();
  // a code that starts with a letter is no figure (INC-2026-004, Covid-19), but a range is two (10-20)
  const d = t.replace(/\p{L}[\p{L}\p{M}\d]*(?:-[\p{L}\p{M}\d]*\d[\p{L}\p{M}\d]*)+/gu, " ");
  // a digit run counts with a letter after it (1990s, 5km, 500க்கும்); with a scale word: "3.5 lakh", "2 crore", "12 லட்சம்", "10k"
  const num = /(?<![\p{L}\d])(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?(?:(?:\s*(lakhs?|crores?|thousand|hundred|லட்சம்|இலட்சம்|கோடி|ஆயிரம்|நூறு)|(k))(?![\p{L}\p{M}\d]))?/giu;
  for (let m; (m = num.exec(d)); ) {
    const base = Number((m[1] + (m[2] ?? "")).replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const scale = m[3]?.toLowerCase();
    const mult = m[4] ? 1000 : !scale ? 1 : /lakh|லட்சம்/.test(scale) ? 100_000 : /crore|கோடி/.test(scale) ? 10_000_000 : /thousand|ஆயிரம்/.test(scale) ? 1000 : 100;
    out.push({ raw: m[0].trim(), value: base * mult });
    if (scale) seenWord.add(scale);
  }
  for (const m of t.matchAll(/(?<![\p{L}])([a-z]+)(?![\p{L}])/giu)) {
    const w = m[1].toLowerCase();
    if (seenWord.has(w)) continue;
    if (w === "double" && /^[\s-]*(check|click|tap)/i.test(t.slice((m.index ?? 0) + w.length))) continue;
    // a word like constructor or toString is a property of every object, not a number word (scans-code-2, the same class as RC-14)
    if (Object.hasOwn(EN_WORDS, w)) out.push({ raw: m[1], value: EN_WORDS[w], words: true });
    else if (Object.hasOwn(TG_WORDS, w)) out.push({ raw: m[1], value: TG_WORDS[w], words: true });
  }
  for (const m of t.matchAll(/(?<![\p{L}])(?:a|one)\s+(third|quarter|fifth|tenth)\s+of(?![\p{L}])/giu)) out.push({ raw: m[0], value: EN_PARTS[m[1].toLowerCase()], words: true });
  // "one" before a thing counted is a figure ("only one severe case open"); "one moment", "the second one" are not (BUG-017)
  for (const m of t.matchAll(/(?<![\p{L}])(?:only\s+|just\s+)?one\s+(?:more\s+|new\s+|open\s+|(?:severe|serious|critical|high|pending|overdue)\s+)?(case|cases|complaint|complaints|incident|incidents|issue|issues|death|deaths|person|people|report|reports|alert|alerts|zone|zones|ward|wards|department|departments|officer|officers|day|days|week|weeks|hour|hours|percent|lakh|crore|mm|millimetre|millimetres)(?![\p{L}])/giu)) out.push({ raw: m[0], value: 1, words: true });
  if (/\b(percent|per cent)\b|சதவீத/i.test(t) && !/%/.test(t) && !out.some((f) => !f.words)) out.push({ raw: "percent", value: NaN, words: true });
  const clean = t.replace(TA_RIVER, " ");
  for (const m of clean.matchAll(/[஀-௿]+/g)) {
    if (seenWord.has(m[0])) continue;
    const v = taNumber(m[0]);
    if (v != null) out.push({ raw: m[0], value: v, words: true });
  }
  return out;
}

/** "Zone 13" names a zone, when it is one of `zones`: the number is a label, not a figure. */
export function zoneLabelsOut(text: string, zones: Iterable<number>): string {
  const real = new Set(zones);
  return text.replace(/(?<![\p{L}])(zone|மண்டலம்)\s*(\d{1,2})(?![\d\p{L}])/giu, (m, _w: string, n: string) => (real.has(Number(n)) ? " " : m));
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
 * whole line; any figure the model wrote itself refuses it too. "percent" after a placeholder is the placeholder's unit, and
 * a zone the turn's tools named (`zones`) is a name. Returns the filled line, or null.
 */
export function fillTemplate(tpl: string, values: Record<string, number | string>, zones: Iterable<number> = []): string | null {
  const literal = zoneLabelsOut(tpl.replace(/\{n:[a-zA-Z0-9_]+\}(\s*(percent|per cent|சதவீத[஀-௿]*))?/gi, " "), zones);
  if (figuresIn(literal).length) return null;
  let ok = true;
  const out = tpl.replace(/\{n:([a-zA-Z0-9_]+)\}/g, (_, k: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, k)) { ok = false; return ""; }
    return String(values[k]);
  });
  return ok ? out : null;
}
