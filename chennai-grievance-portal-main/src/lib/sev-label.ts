/**
 * How a severity level reads in a chip or a sentence (QA pass 4, RC-15, PB-302, PB-317): "Severe" is already the level, so it is never "Severe severity";
 * the other levels say what they are the level of: "High severity", "Medium severity". One place for every screen and answer.
 */
export function sevLabel(sev: string | null | undefined): string {
  const s = String(sev ?? "").trim();
  return !s ? "" : /^severe$/i.test(s) ? "Severe" : `${s} severity`;
}
/** "Severe incident", "High-severity incident": the level in front of the noun. */
export function sevIncident(sev: string | null | undefined): string {
  const s = String(sev ?? "").trim();
  return !s ? "Incident" : /^severe$/i.test(s) ? "Severe incident" : `${s}-severity incident`;
}
