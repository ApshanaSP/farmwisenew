/**
 * Jarvis's persona, where code enforces it (docs/jarvis/PERSONA.md; the brief, Pillar 4 "Persona"): composed, precise, candid, a little
 * dry. Two pieces live here so the planner prompt, the screens and the recipes share them:
 *   - PERSONA_LINE, the one line the planner's stable system prompt carries (round.ts CORE): no per-turn text, so the cache prefix holds;
 *   - thinLine, the candid push-back when the data is thin: a finding, a side of a comparison, a change or a ranking that rests on fewer
 *     than ten cases says so, once, with code's own count (a figure on the screen's blocks, so the number gate lets it through).
 * Pure: no model, no data access.
 */
import type { Bilingual, StageDocT } from "./stage";

/** One line for the planner's system prompt (round.ts CORE). Kept short: the token diet counts it on every call. */
export const PERSONA_LINE = "Be composed, precise, candid, a little dry: one breath a line, long data to the screen; say linked with, never caused by; no flattery, no mirroring of emotion.";

/** under this many cases a finding is thin */
export const THIN_UNDER = 10;

const EN_WORD = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TA_WORD = ["", "ஒரு", "ரெண்டு", "மூணு", "நாலு", "அஞ்சு", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது"];

/** What kind of thin it is: the whole finding, one side of a comparison, or the top of a ranking. */
export type ThinKind = "finding" | "side" | "top";

/**
 * The push-back line for a count under ten (1-9; none is said elsewhere), in English and spoken-register Tamil (flagged for a native
 * speaker's check in PERSONA.md). The count is said as a word, which the number gate reads as the same figure (numbergate.ts figuresIn).
 */
export function thinSay(n: number, kind: ThinKind = "finding"): Bilingual | null {
  if (!Number.isInteger(n) || n < 1 || n >= THIN_UNDER) return null;
  const en = EN_WORD[n], ta = TA_WORD[n];
  const cases = n === 1 ? "case" : "cases";
  const caseTa = n === 1 ? "சம்பவம்" : "சம்பவங்கள்";
  // (no other number word in a line: "one side" would be a second figure for the gate)
  if (kind === "side") return { en: `The smaller side rests on only ${en} ${cases}, so I wouldn't read much into the gap.`, ta: `குறைஞ்ச பக்கத்துல ${ta} ${caseTa} தான், அதனால வித்தியாசத்தை பெருசா எடுத்துக்க வேண்டாம்.` };
  if (kind === "top") return { en: `Even the top has only ${en} ${cases}, so I wouldn't read much into the order.`, ta: `முதல் இடத்துலயே ${ta} ${caseTa} தான், அதனால வரிசையை பெருசா எடுத்துக்க வேண்டாம்.` };
  return { en: `Only ${en} ${cases}, so I wouldn't read much into it.`, ta: `${ta} ${caseTa} தான், அதனால பெருசா எடுத்துக்க வேண்டாம்.` };
}

const thin = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v < THIN_UNDER;

/**
 * How thin a screen's main finding is, read from its own blocks: the count it rests on when that is 1-9, else null.
 *   why: the cases reported in the window (its "n" tile); what changed and explaining a change: the window's count ("now" tile);
 *   a trend: its total; a comparison of places: the smaller side's incidents; a ranking of incident counts: the top item's count.
 * A list, a case, a reading or a brief is not a finding and is never pushed back on.
 */
export function thinCount(doc: Pick<StageDocT, "recipe" | "blocks">): { n: number; kind: ThinKind } | null {
  const kpi = (key: string) => {
    for (const b of doc.blocks) if (b.kind === "Kpis") { const it = b.items.find((x) => x.key === key); if (it) return it.value; }
    return null;
  };
  switch (doc.recipe) {
    case "why": { const v = kpi("n"); return thin(v) ? { n: v, kind: "finding" } : null; }
    case "changed": case "explain": { const v = kpi("now"); return thin(v) ? { n: v, kind: "finding" } : null; }
    case "trend": { const v = kpi("total"); return thin(v) ? { n: v, kind: "finding" } : null; }
    case "compare": {
      const cmp = doc.blocks.find((b) => b.kind === "Compare");
      if (cmp?.kind !== "Compare") return null;
      const ns = cmp.sides.map((s) => s.values.n ?? s.values.open).filter((x): x is number => typeof x === "number");
      const least = ns.length ? Math.min(...ns) : null;
      return thin(least) ? { n: least, kind: "side" } : null;
    }
    case "ranking": {
      const r = doc.blocks.find((b) => b.kind === "Ranking");
      if (r?.kind !== "Ranking" || r.unit !== "incidents" || r.order !== "top" || r.items.length < 2) return null;
      const top = Math.max(...r.items.map((x) => x.value));
      return thin(top) ? { n: top, kind: "top" } : null;
    }
    default: return null;
  }
}

/** The line a thin screen's spoken summary ends with, or null. */
export function thinLine(doc: Pick<StageDocT, "recipe" | "blocks">): Bilingual | null {
  const t = thinCount(doc);
  return t ? thinSay(t.n, t.kind) : null;
}
