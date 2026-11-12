/**
 * A zone named by its NUMBER, however the number was said (QA pass 4, RC-05, RC-07: "zone five", Tamil "மண்டலம் ஐந்து", Tanglish "zone anju" were ignored while "zone 5" worked,
 * because each reader had its own digits-only pattern). One reader, built on the console's number normaliser (thunai/normalise.ts: English and Tamil number words, ordinals, the
 * digits of every script). Returns the number as said (the caller checks it is a zone, 1 to 15) or null. Pure.
 */
import { normalise } from "@/lib/thunai/normalise";

const ZONE_NO = /(?:^| )(?:zone|zones|மண்டல[஀-௿]*|mandalam)[ -]*(?:no |number |num )?-?(\d{1,2})(?= |$)/;

export function zoneNoIn(text: string): number | null {
  const m = ZONE_NO.exec(normalise(String(text ?? "")).text);
  return m ? Number(m[1]) : null;
}
