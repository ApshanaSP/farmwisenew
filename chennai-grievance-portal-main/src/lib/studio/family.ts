/**
 * The Collector's lens: what kind of data this is, so the Studio asks the questions a Collector asks of it. Rules over
 * the column meanings (the Profiler's roles) and the header words give each family a score; the best, with its
 * confidence, is the family. Below 0.7 the Collector confirms it with one click; a wrong one is corrected in one click
 * (meta.family, by "you"), and it is kept on every refresh.
 *
 *   progress   scheme / project progress against target   behind target? where? who? will the deadline be missed?
 *   works      a works register                             what is stalled, for how long, where?
 *   service    service delivery, grievances                 what is overdue? which department? repeats?
 *   health     health surveillance                          rising? unusual for the season? where?
 *   supplies   supplies and stock                           who is out, or about to be?
 *   water      water and weather                            how full? how fast is it changing?
 *   facility   a list of facilities                         where are the gaps?
 *   period     a period table (district x year)             how is Chennai doing against the state?
 */
import type { DatasetMeta, InsightLabel, Spec } from "@/lib/studio/types";

export type FamilyKey = "progress" | "works" | "service" | "health" | "supplies" | "water" | "facility" | "period";

export const FAMILIES: Record<FamilyKey, { name: string; ta: string; questions: string[]; boost: InsightLabel[] }> = {
  progress: { name: "Scheme / project progress", ta: "திட்ட முன்னேற்றம்", questions: ["Which units are furthest behind target?", "Will we miss the deadline at this pace?", "Who owns the laggards?"], boost: ["Target gap", "Outlier peer", "Service gap", "Delay"] },
  works: { name: "Works register", ta: "பணிகள் பதிவேடு", questions: ["Which works are stalled, and for how long?", "Where are the stalled works?", "Which contractor or zone is slowest?"], boost: ["Delay", "Backlog", "Service gap", "Turnaround"] },
  service: { name: "Service delivery / grievances", ta: "சேவை / குறைகள்", questions: ["What is overdue, and with which department?", "Where do complaints repeat?", "Is the backlog growing?"], boost: ["Backlog", "Delay", "Outlier peer", "Rising", "Local pattern"] },
  health: { name: "Health surveillance", ta: "சுகாதாரக் கண்காணிப்பு", questions: ["Are cases rising?", "Is this unusual for the season?", "Where are cases highest?"], boost: ["Unusual change", "Rising", "Seasonality", "Hotspot", "Drivers"] },
  supplies: { name: "Supplies / stock", ta: "பொருள் இருப்பு", questions: ["Who is out of stock, or about to be?", "How many days of cover are left?", "Where is stock short?"], boost: ["Ranking", "Capacity", "Freshness", "Anomaly"] },
  water: { name: "Water and weather", ta: "நீர் மற்றும் வானிலை", questions: ["How full are the reservoirs?", "How fast are levels changing?", "Is any level past a warning threshold?"], boost: ["Capacity", "Change", "Unusual change", "Change point"] },
  facility: { name: "Facility list", ta: "வசதிகள் பட்டியல்", questions: ["Where are the gaps in coverage?", "Which zones have the fewest facilities?", "Which wards are farthest from one?"], boost: ["Hotspot", "Data gap", "Concentration"] },
  period: { name: "Period table (district × year)", ta: "காலவாரி அட்டவணை", questions: ["How is Chennai doing against the state?", "What changed in the latest year?", "Where does Chennai rank?"], boost: ["Growth", "Ranking", "Change point"] }
};

const W = (re: RegExp, headers: string, w: number) => (re.test(headers) ? w : 0);

/** The family the rules read, with a confidence (0..1) and the runner-up. */
export function detectFamily(spec: Pick<Spec, "columns" | "openValues" | "panelBy" | "title">, file = ""): { key: FamilyKey; confidence: number; second: FamilyKey | null } {
  const h = [file, spec.title, ...spec.columns.map((c) => `${c.header} ${c.label}`)].join(" | ").toLowerCase();
  const role = (r: string) => spec.columns.some((c) => c.role === r);
  const s: Record<FamilyKey, number> = {
    progress: W(/\b(target|achiev|sanction|physical progress|financial progress|% complete|scheme|beneficiar)/, h, 3) + W(/\b(achieved|completed|progress)\b/, h, 1),
    works: W(/\b(work|contract|estimate|tender|desilt|road|drain|culvert|bridge|civil)/, h, 2) + (role("status") ? 1 : 0) + W(/\b(start date|completion|work order)/, h, 2),
    service: W(/\b(complaint|grievance|petition|request|ticket|case no|token)/, h, 3) + (spec.openValues.length ? 2 : 0),
    health: W(/\b(fever|dengue|malaria|cases|disease|hospital|surveillance|patients|deaths|opd|ipd|beds?)\b/, h, 3),
    supplies: W(/\b(stock|inventory|supply|ration|pds|quintal|kg|issued|received|balance|shortage)/, h, 3),
    water: W(/\b(reservoir|lake|level|storage|mcft|tmc|rain(fall)?|mm\b|inflow|outflow|groundwater|tank)/, h, 3),
    facility: W(/\b(station|school|hospital|toilet|shelter|centre|center|anganwadi|ration shop|facility|park)s?\b/, h, 2) + (role("lat") ? 1 : 0) + (!role("date") && !role("measure") ? 1 : 0),
    period: (spec.panelBy ? 3 : 0) + W(/\b(district|year|2021|2022|2023|2024|2025)\b/, h, 1)
  };
  const ranked = (Object.keys(s) as FamilyKey[]).sort((a, b) => s[b] - s[a]);
  const top = s[ranked[0]], next = s[ranked[1]];
  // confidence: how clearly the best beats the next, and how much evidence it has
  const confidence = top <= 0 ? 0.3 : Math.min(0.95, 0.45 + (top - next) * 0.12 + Math.min(top, 5) * 0.05);
  return { key: ranked[0], confidence: Math.round(confidence * 100) / 100, second: next > 0 ? ranked[1] : null };
}

/** The dataset's family: the Collector's choice when made, else the rules'. */
export function familyOf(meta: Pick<DatasetMeta, "spec" | "source"> & { family?: { key: FamilyKey; by: "you" } | null }): { key: FamilyKey; name: string; confidence: number; by: string; confirm: boolean; second: FamilyKey | null; questions: string[] } {
  if (meta.family?.key && FAMILIES[meta.family.key]) {
    const f = FAMILIES[meta.family.key];
    return { key: meta.family.key, name: f.name, confidence: 1, by: "you", confirm: false, second: null, questions: f.questions };
  }
  const d = detectFamily(meta.spec, meta.source.file);
  return { key: d.key, name: FAMILIES[d.key].name, confidence: d.confidence, by: "rules", confirm: d.confidence < 0.7, second: d.second, questions: FAMILIES[d.key].questions };
}

/** The family's insights count more: a Collector reading a works register wants the stalled works first. */
export function familyBoost(key: FamilyKey | null | undefined, label: InsightLabel): number {
  return key && FAMILIES[key]?.boost.includes(label) ? 1.25 : 1;
}
