/**
 * A zone named by its NUMBER, however the number was said (QA pass 4, RC-05, RC-07: "zone five", Tamil "மண்டலம் ஐந்து", Tanglish "zone anju" were ignored while "zone 5" worked,
 * because each reader had its own digits-only pattern). One reader, built on the console's number normaliser (thunai/normalise.ts: English and Tamil number words, ordinals, the
 * digits of every script). Returns the number as said (the caller checks it is a zone, 1 to 15) or null. Pure.
 */
import { normalise } from "@/lib/thunai/normalise";

const ZONE_NO = /(?:^| )(?:zone|zones|மண்டல[஀-௿]*|mandalam)[ -]*(?:no |number |num )?-?(\d{1,2})(?= |$)/;

/**
 * Every zone named by number in a sentence, in the order said, with "5 and 6", "5, 6" and "5 to 7" (a range) expanded: "zone five and six", "zones 5 to 7", "மண்டலம் 5 மற்றும் 6".
 * The numbers are as said: the caller checks each is a zone (1 to 15), because a number that is no zone ("zone 99") must be said and never dropped (SKG1-33..35).
 */
const ZONE_RUN = /(?:^| )(?:zone|zones|மண்டல[஀-௿]*|mandalam)[ -]*(?:no |number |num )?-?(\d{1,2})((?: (?:and|&|to|through|till|matrum|மற்றும்|um) (?:zones? )?-?\d{1,2})*)(?= |$)/g;
export function zoneNosIn(text: string): number[] {
  const nt = normalise(String(text ?? "")).text, out: number[] = [];
  for (const m of nt.matchAll(ZONE_RUN)) {
    let prev = Number(m[1]);
    out.push(prev);
    for (const x of m[2].matchAll(/(and|&|to|through|till|matrum|மற்றும்|um) (?:zones? )?-?(\d{1,2})/g)) {
      const n = Number(x[2]);
      if (/^(to|through|till)$/.test(x[1]) && n > prev && n - prev <= 15) for (let k = prev + 1; k <= n; k++) out.push(k); else out.push(n);
      prev = n;
    }
  }
  return [...new Set(out)];
}

export function zoneNoIn(text: string): number | null {
  const m = ZONE_NO.exec(normalise(String(text ?? "")).text);
  return m ? Number(m[1]) : null;
}
