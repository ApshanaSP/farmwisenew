/**
 * Digits of every script, read as one thing (RC-13, RC-42). Unicode keeps each script's ten digits together in one run
 * (Tamil, Arabic-Indic, Devanagari, fullwidth, Bengali and the rest are all general category Nd), so the value of a digit is
 * its place in its run. That covers every script by rule, with no list of scripts to keep up to date.
 */
const ND = /\p{Nd}/u;

/** The value 0 to 9 of one decimal digit of any script, or -1 if the character is not a digit. */
export function digitValue(ch: string): number {
  const cp = ch.codePointAt(0);
  if (cp === undefined || !ND.test(ch)) return -1;
  let start = cp;
  while (start > 0 && ND.test(String.fromCodePoint(start - 1))) start--;
  return (cp - start) % 10;
}

/** The text with every decimal digit of every script written as 0 to 9. Other characters are left alone. */
export function asciiDigits(s: string): string {
  return s.replace(/\p{Nd}/gu, (d) => String(digitValue(d)));
}
