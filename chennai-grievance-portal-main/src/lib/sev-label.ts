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

export type SevLevel = "Severe" | "High" | "Medium" | "Low";
/** The pipeline's cut-offs (district_intel/dintel/refdata.py severity_level): a score of 0-100 and its level. */
export const SEV_CUTS: Readonly<Record<Exclude<SevLevel, "Low">, number>> = { Severe: 70, High: 50, Medium: 30 };
export function sevOfScore(score: number | null | undefined): SevLevel | "" {
  const n = Number(score);
  if (score == null || !Number.isFinite(n)) return "";
  return n >= SEV_CUTS.Severe ? "Severe" : n >= SEV_CUTS.High ? "High" : n >= SEV_CUTS.Medium ? "Medium" : "Low";
}
/** The levels in words, for a note under a score. */
export const SEV_BANDS_TEXT = `Severe ${SEV_CUTS.Severe} or more · High ${SEV_CUTS.High} to ${SEV_CUTS.Severe - 1} · Medium ${SEV_CUTS.Medium} to ${SEV_CUTS.High - 1} · Low under ${SEV_CUTS.Medium}`;
