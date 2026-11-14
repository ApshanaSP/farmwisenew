/**
 * Figures as Jarvis says them aloud (docs/qa/JARVIS_VOICE.md "Numbers"; ULTIMATE_JARVIS Pillar 4). Below a lakh: the figure
 * with Indian grouping, Intl.NumberFormat('en-IN') ("45,230"). From a lakh up: lakh and crore with one decimal ("1.2 lakh",
 * "3.4 crore"; in Tamil "1.2 லட்சம்", "3.4 கோடி"). Pure.
 *
 * A rounded form says a rounded value: 1,23,456 said as "1.2 lakh" says 1,20,000. Each spoken form carries that value, so
 * code hands the number gate the value it now says (spokenAllowed). The gate (numbergate.ts figuresIn) reads "1.2 lakh",
 * "3.4 crore", "1.2 லட்சம்" and "1,234 crore" as their values; numberwords.v4.test.ts holds it to that.
 */
import { allowedSet } from "./numbergate";

export type SpokenLang = "en" | "ta";
export interface SpokenFigure { text: string; value: number }

const THOUSAND = 1000, LAKH = 100_000, CRORE = 10_000_000;
const WORD: Record<SpokenLang, { lakh: string; crore: string }> = { en: { lakh: "lakh", crore: "crore" }, ta: { lakh: "லட்சம்", crore: "கோடி" } };
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const oneDp = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** One figure as it is said, and the value that form says. */
export function spokenFigure(n: number, lang: SpokenLang = "en"): SpokenFigure {
  if (!Number.isFinite(n)) return { text: String(n), value: n };
  const a = Math.abs(n), sign = n < 0 ? "-" : "", w = WORD[lang] ?? WORD.en;
  const out = (text: string, v: number): SpokenFigure => ({ text: `${sign}${text}`, value: v === 0 ? 0 : n < 0 ? -v : v });
  if (a >= LAKH) {
    // a lakh to one decimal is the nearest 10,000; a crore to one decimal the nearest 10,00,000 (99.96 lakh is said "1 crore")
    const lakhs = Math.round(a / 10_000) * 10_000;
    if (lakhs < CRORE) return out(`${oneDp.format(lakhs / LAKH)} ${w.lakh}`, lakhs);
    const crores = Math.round(a / 1_000_000) * 1_000_000;
    return out(`${oneDp.format(crores / CRORE)} ${w.crore}`, crores);
  }
  if (a >= THOUSAND) { const v = Math.round(a); return out(whole.format(v), v); }
  const v = Math.round(a * 10) / 10;
  return out(oneDp.format(v), v);
}

/**
 * The figures in a line Jarvis is about to say, from a lakh up, in lakh and crore. Only a figure written with grouping
 * commas is changed (that is how code writes a count: toLocaleString("en-IN")); a bare run of digits may be a PIN code or an
 * id, and is left as it is, as is a figure that already has its scale word or a unit glued to it. Returns the line and the
 * values the new forms say (for the gate: spokenAllowed).
 */
export function speakNumbers(text: string, lang: SpokenLang = "en"): { text: string; values: number[] } {
  const values: number[] = [];
  const re = /(?<![\p{L}\p{M}\p{N}.,\-/:#])(\d{1,3}(?:,\d{2,3})+)(\.\d+)?(?![\p{L}\p{M}\p{N}]|[.,]\d|\s*(?:lakhs?|crores?|thousand|hundred|million|billion|percent|per cent|%|இ?லட்ச|கோடி|ஆயிர|நூறு|சதவீத))/giu;
  const out = text.replace(re, (m: string, int: string, dec?: string) => {
    const n = Number(`${int.replace(/,/g, "")}${dec ?? ""}`);
    if (!Number.isFinite(n) || n < LAKH) return m;
    const f = spokenFigure(n, lang);
    values.push(f.value);
    return f.text;
  });
  return { text: out, values };
}

/** The figures a line may say once its numbers are in spoken form: what code allowed, and the rounded values it now says. */
export function spokenAllowed(allowed: Set<string>, values: Iterable<number>): Set<string> {
  const s = new Set(allowed);
  for (const v of allowedSet(values)) s.add(v);
  return s;
}
