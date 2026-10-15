/**
 * The department a question names, by its usual short name ("PWD", "Metrowater", "SWD", "TNPCB", "police") or its full
 * name ("Solid Waste Management"). One table for the router's route and the rules' fast path, so "open complaints for
 * Metrowater" is the Metrowater's complaints whether or not a model is available. Pure: no database.
 */
import type { RefNames } from "@/lib/assistant/scope";

/** Short names, Tamil names and nicknames; "PWD" names two departments (the card says which one it covers). */
export const DEPT_ALIASES: [RegExp, string[]][] = [
  [/\bpwd\b|public works department|பொதுப்பணித் ?துறை/i, ["PWD-WRD", "PWD-BLD"]],
  [/\b(metro ?water|cmwssb)\b|குடிநீர் வாரியம்/i, ["CMWSSB"]],
  [/\bswd\b|storm ?water drain(s|age)? (dept|department|wing)/i, ["GCC-SWD"]],
  [/\bswm\b|solid waste management/i, ["GCC-SWM"]],
  [/\btnpcb\b|pollution control board/i, ["TNPCB"]],
  [/\bpolice\b(?! station)|காவல் ?துறை/i, ["POL-GCP"]],
  [/\b(tangedco|tneb)\b|electricity board|மின் ?வாரிய/i, ["TANGEDCO"]]
];

export interface DeptNamed {
  code: string;
  /** a short name that also means another department: what was assumed, and the question for the other one */
  alt: { note: string; chips: string[] } | null;
}

/** The department `message` names, or null. A full department name wins over a nickname. */
export function deptFromWords(message: string, n: RefNames): DeptNamed | null {
  const said = message.toLowerCase();
  // the full name, as written ("solid waste management complaints", "greater chennai police")
  for (const [code, d] of n.depts.entries()) {
    const name = String(d.name ?? "").toLowerCase().replace(/\s*\(gcc\)\s*/, " ").replace(/&/g, "and").trim();
    if (d.actionOwner && name.length >= 6 && said.replace(/&/g, "and").includes(name)) return { code, alt: null };
  }
  const hit = DEPT_ALIASES.find(([re]) => re.test(message));
  const codes = hit ? hit[1].filter((c) => n.depts.has(c)) : [];
  if (!codes.length) return null;
  // "PWD buildings" / "PWD water": the one named
  const pick = codes.find((c) => (/build/i.test(message) && /BLD/.test(c)) || (/water|lake|tank|canal|river|flood/i.test(message) && /WRD/.test(c))) ?? codes[0];
  const others = codes.filter((c) => c !== pick);
  const alt = others.length && pick === codes[0] && !/build|water|lake|tank|canal|river|flood/i.test(message)
    ? { note: `"PWD" can mean ${codes.map((c) => n.depts.get(c)?.name ?? c).join(" or ")}: this covers ${n.depts.get(pick)?.name ?? pick}.`,
      chips: others.map((c) => message.replace(/\bpwd\b/i, n.depts.get(c)?.name ?? c)) }
    : null;
  return { code: pick, alt };
}
