/** Every number in the text must be a number of the facts (small counts and clock times aside). */
export function numbersHold(text: string, facts: string): boolean {
  const have = new Set((facts.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")));
  for (const n of text.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    const v = n.replace(/,/g, "");
    if (Number(v) <= 12 || have.has(v) || have.has(String(Number(v)))) continue;
    return false;
  }
  return true;
}
