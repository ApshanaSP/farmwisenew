/**
 * A zone named by its NUMBER, however the number was said (QA pass 4, RC-05, RC-07: "zone five", Tamil "மண்டலம் ஐந்து", Tanglish "zone anju" were ignored while "zone 5" worked,
 * because each reader had its own digits-only pattern). One reader, built on the console's number normaliser (thunai/normalise.ts: English and Tamil number words, ordinals, the
 * digits of every script). Returns the number as said (the caller checks it is a zone, 1 to 15) or null. Pure.
 */
import { normalise, taNumber } from "@/lib/thunai/normalise";

const ZONE_NO = /(?:^| )(?:zone|zones|மண்டல[஀-௿]*|mandalam)[ -]*(?:no |number |num )?-?(\d{1,2})(?= |$)/;

/**
 * Every zone named by number in a sentence, in the order said, with "5 and 6", "5, 6" and "5 to 7" (a range) expanded: "zone five and six", "zones 5 to 7", "மண்டலம் 5 மற்றும் 6".
 * The numbers are as said: the caller checks each is a zone (1 to 15), because a number that is no zone ("zone 99") must be said and never dropped (SKG1-33..35).
 */
const ZONE_RUN = /(?:^| )(?:zone|zones|மண்டல[஀-௿]*|mandalam)[ -]*(?:no |number |num )?-?(\d{1,2})((?: (?:and|&|to|through|till|matrum|மற்றும்|um) (?:zones? )?-?\d{1,2})*)(?= |$)/g;
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
export function zoneNosIn(text0: string): number[] {
  // "ninety nine" is 99, not 90 and 9
  const text = String(text0 ?? "").replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/gi, (_m, t: string, u: string) => String(TENS[t.toLowerCase()] + UNITS.indexOf(u.toLowerCase()) + 1));
  const nt = normalise(text).text, out: number[] = [];
  for (const m of nt.matchAll(ZONE_RUN)) {
    let prev = Number(m[1]);
    out.push(prev);
    for (const x of m[2].matchAll(/(and|&|to|through|till|matrum|மற்றும்|um) (?:zones? )?-?(\d{1,2})/g)) {
      const n = Number(x[2]);
      if (/^(to|through|till)$/.test(x[1]) && n > prev && n - prev <= 15) for (let k = prev + 1; k <= n; k++) out.push(k); else out.push(n);
      prev = n;
    }
  }
  return [...new Set([...out, ...ordinalZonesIn(text)])];
}

/** "5th zone", "fifth zone", "ஐந்தாவது மண்டலம்": an ordinal before the zone word (the number readers above read the number after it) */
const EN_ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15 };
function ordinalZonesIn(text: string): number[] {
  const t = String(text ?? "").normalize("NFC").toLowerCase(), out: number[] = [];
  for (const m of t.matchAll(/(?<![\p{L}\d])(?:(\d{1,2})(?:st|nd|rd|th)|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth))\s+zone(?![\p{L}])/gu))
    out.push(m[1] ? Number(m[1]) : EN_ORD[m[2]]);
  for (const m of t.matchAll(/([஀-௿]+(?:ாவது|ாம்))\s+மண்டல[஀-௿]*/gu)) { const n = taNumber(m[1]); if (n != null) out.push(n); }
  return out;
}

/** The sentence with each zone said by a number word, an ordinal or another script's digits also written as "zone N" in 0-9, so a reader that takes ASCII digits only reads it too (map resolver, Data Studio). */
export function withZoneDigits(text: string): string {
  const have = new Set([...String(text ?? "").matchAll(/\bzone\s*(\d{1,2})\b/gi)].map((m) => Number(m[1])));
  const extra = zoneNosIn(text).filter((n) => !have.has(n));
  return extra.length ? `${text} ${extra.map((n) => `zone ${n}`).join(" ")}` : text;
}

export function zoneNoIn(text: string): number | null {
  const m = ZONE_NO.exec(normalise(String(text ?? "")).text);
  return m ? Number(m[1]) : ordinalZonesIn(text)[0] ?? null;
}
