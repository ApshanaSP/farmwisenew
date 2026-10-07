/**
 * The dataset's Spec: what each column means, what one row is, which department and incident categories it belongs
 * to. The AI proposes it (ai.ts); this module checks every part of the proposal against the columns' real types and
 * values, and builds the rules' own Spec when no AI answers. A role that does not fit a column's values (a "date"
 * that holds names, a "measure" that holds text) is refused and the rules' reading kept.
 */
import type { Refs } from "@/lib/studio/refs";
import { ROLES, pluralize, type ColumnProfile, type ColumnSpec, type Role, type Spec } from "@/lib/studio/types";
import { niceCase } from "@/lib/studio/values";

const OPEN_RE = /(pending|open|in[\s-]?progress|under[\s-]?progress|ongoing|not[\s-]?started|yet[\s-]?to|started|delayed|stalled|work[\s-]?in|sanctioned|tender|awaiting|low|out[\s-]?of[\s-]?stock|critical|alert|danger|shortage|nil stock|active|reported|registered|unresolved|நிலுவை|நடைபெறுகிறது)/i;
const CLOSED_RE = /(completed?|closed|resolved|done|finished|adequate|normal|available|disposed|rectified|cleared|attended|முடிந்தது)/i;

/** Status values that mean "still open" (as written in the data). */
export function openValuesOf(p: ColumnProfile | undefined): string[] {
  if (!p) return [];
  return p.top.map((t) => t.v).filter((v) => OPEN_RE.test(v) && !CLOSED_RE.test(v.replace(/not[\s-]?completed?/i, "")));
}

const DEPT_RULES: [RegExp, string][] = [
  [/(desilt|storm\s?water|\bswd\b|drain|culvert|flood|waterlog)/i, "GCC-SWD"],
  [/(garbage|solid waste|\bswm\b|bin\b|debris|waste)/i, "GCC-SWM"],
  [/(pothole|road|footpath|pavement|bus route)/i, "GCC-ENG"],
  [/(street\s?light|lamp|electrical pole)/i, "GCC-ELE"],
  [/(fever|dengue|malaria|cholera|diarrh|hospital|patient|\bopd\b|\bphc\b|\bbeds?\b|vaccin|health)/i, "HLT-DMS"],
  [/(water supply|drinking water|tanker|metro\s?water|sewer|sewage)/i, "CMWSSB"],
  [/(police|\bfir\b|crime|theft|accident)/i, "POL-GCP"],
  [/(lake|\btank\b|bund|sluice|reservoir|canal|river)/i, "PWD-WRD"],
  [/(ration|\bpds\b|fair price|civil supplies|revenue|patta|certificate|relief)/i, "DIST-REV"],
  [/(school|student|teacher|noon meal)/i, "GCC-EDU"],
  [/(power cut|transformer|electricity|\beb\b|tangedco)/i, "TANGEDCO"],
  [/(\baqi\b|air quality|pollution|pm2|pm10)/i, "TNPCB"],
  [/(property tax|trade licen|profession tax)/i, "GCC-REV"],
  [/(tree|park|playground)/i, "GCC-PRK"]
];
const LINK_RULES: [RegExp, string[]][] = [
  [/(desilt|storm\s?water|\bswd\b|drain|culvert|flood|waterlog|inundat)/i, ["FLOOD_WATERLOGGING", "DRAINAGE_SEWAGE"]],
  [/(fever|dengue|malaria|chikungunya|vector|mosquito|cholera|diarrh|typhoid)/i, ["VECTOR_DISEASE", "FLOOD_WATERLOGGING"]],
  [/(hospital|beds?|patients?|\bopd\b|ambulance)/i, ["HEALTH_SERVICES"]],
  [/(garbage|solid waste|\bswm\b|debris|waste)/i, ["SOLID_WASTE"]],
  [/(pothole|road|footpath|pavement)/i, ["ROAD_DAMAGE"]],
  [/(street\s?light|lamp)/i, ["STREETLIGHT_ELECTRICAL", "DARK_SPOT_SAFETY"]],
  [/(water supply|drinking water|tanker|metro\s?water)/i, ["WATER_SUPPLY"]],
  [/(sewer|sewage|manhole)/i, ["DRAINAGE_SEWAGE"]],
  [/(lake|\btank\b|bund|sluice|reservoir|canal)/i, ["WATERBODY_INFRA", "FLOOD_WATERLOGGING"]],
  [/(accident)/i, ["ROAD_ACCIDENT"]],
  [/(theft|snatch|burglar)/i, ["CRIME_PROPERTY"]],
  [/(tree|park)/i, ["TREES_PARKS"]],
  [/(\baqi\b|air quality|pollution)/i, ["AIR_POLLUTION"]],
  [/(stray|dog)/i, ["STRAY_ANIMALS"]],
  [/(encroach)/i, ["ENCROACHMENT"]]
];
const ENTITY_RULES: [RegExp, string][] = [
  [/(desilt|works?\b|register of works|work order)/i, "work"], [/(complaint|grievance|petition)/i, "complaint"], [/(fever|cases?\b|dengue|patients?)/i, "case report"],
  [/(ration|shop|\bpds\b)/i, "shop"], [/(hospital)/i, "hospital report"], [/(school)/i, "school"], [/(accident)/i, "accident"], [/(inspection)/i, "inspection"],
  [/(tanker|trip)/i, "trip"], [/(lake|tank)/i, "water body"], [/(light|lamp)/i, "street light"]
];

const text = (p: ColumnProfile[]) => p.map((c) => `${c.header} ${c.top.slice(0, 4).map((t) => t.v).join(" ")}`).join(" ");

export function defaultAgg(header: string, unit: string | null): "sum" | "avg" | "max" {
  if (unit === "%" || /(rate|average|avg|mean|level|index|\baqi\b|temperature|percent|ratio|score|occupancy|depth|height)/i.test(header)) return "avg";
  return "sum";
}

function cleanTitle(file: string): string {
  return niceCase(file.replace(/\.[a-z0-9]+$/i, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, 80) || "Added data";
}

/** The rules' own Spec (no AI): header and value patterns. */
export function rulesSpec(profile: ColumnProfile[], file: string, caption: string | null, refs: Refs): Spec {
  const all = `${file} ${caption ?? ""} ${text(profile)}`;
  const dept = DEPT_RULES.find(([re]) => re.test(all))?.[1] ?? null;
  const entity = ENTITY_RULES.find(([re]) => re.test(`${file} ${caption ?? ""}`))?.[1] ?? ENTITY_RULES.find(([re]) => re.test(all))?.[1] ?? "record";
  const columns: ColumnSpec[] = profile.map((p) => ({
    key: p.key, header: p.header, label: niceCase(p.header).slice(0, 40), role: p.guess, type: p.type, unit: p.unit,
    agg: p.guess === "measure" ? defaultAgg(p.header, p.unit) : null, conf: 0.7, why: "Read from the column's name and values."
  }));
  const status = columns.find((c) => c.role === "status");
  const measures = columns.filter((c) => c.role === "measure");
  const primary = measures.find((c) => c.unit?.startsWith("Rs")) ?? measures.find((c) => /(cases|count|number|total|qty|quantity|stock|patients|beds)/i.test(c.header)) ?? measures[0] ?? null;
  const spec: Spec = {
    title: caption ? niceCase(caption.split(/ — | · /)[0]).slice(0, 80) : cleanTitle(file),
    summary: "",
    entity, entityPlural: pluralize(entity),
    department: dept, deptName: refs.depts.find((d) => d.code === dept)?.name ?? null,
    columns,
    openValues: openValuesOf(profile.find((p) => p.key === status?.key)),
    primary: primary?.key ?? null,
    linkCategories: [...new Set(LINK_RULES.filter(([re]) => re.test(all)).flatMap(([, c]) => c))].slice(0, 3),
    questions: [],
    by: "rules", model: null
  };
  spec.openWord = openWordOf(spec.openValues);
  spec.summary = `${profile.length} columns about ${spec.entityPlural}${spec.deptName ? ` (${spec.deptName})` : ""}.`;
  spec.questions = defaultQuestions(spec);
  return spec;
}

export function defaultQuestions(s: Spec): string[] {
  const has = (r: Role) => s.columns.some((c) => c.role === r);
  const place = has("zone") || has("ward") || has("place") || has("lat");
  const open = s.openValues.length ? "open " : "";
  const q: string[] = [];
  if (place) q.push(`Which zone has the most ${open}${s.entityPlural}?`);
  if (has("date")) q.push(`How have ${s.entityPlural} changed week by week?`);
  const prim = s.columns.find((c) => c.key === s.primary);
  if (prim && place) q.push(`Total ${prim.label.toLowerCase()} by zone`);
  const cat = s.columns.find((c) => c.role === "category");
  if (cat) q.push(`Split by ${cat.label.toLowerCase()}`);
  if (s.openValues.length && place) q.push(`Which wards have more than 5 ${open}${s.entityPlural}?`);
  return q.slice(0, 4);
}

/** Does a role fit the column's values? */
function fits(role: Role, p: ColumnProfile): boolean {
  switch (role) {
    case "date": return p.type === "date";
    case "measure": return p.type === "number";
    case "lat": return p.type === "number" && (p.min ?? 0) > 5 && (p.max ?? 0) < 40;
    case "lon": return p.type === "number" && (p.min ?? 0) > 60 && (p.max ?? 0) < 100;
    case "ward": return p.type === "number" ? (p.min ?? 0) >= 1 && (p.max ?? 999) <= 250 : p.type === "text" && p.top.some((t) => /\d/.test(t.v));
    case "place": case "taluk": case "text": return p.type === "text";
    case "zone": return p.type === "text" || (p.type === "number" && (p.min ?? 0) >= 1 && (p.max ?? 99) <= 15);
    case "status": case "category": return p.type !== "empty" && p.type !== "date" && p.distinct <= Math.max(60, p.filled * 0.5);
    default: return true;
  }
}

const safe = (s: unknown, max: number) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, max);

export interface AiSpec {
  title: string; summary: string; entity: string; entity_plural: string; department: string | null;
  columns: { key: string; role: Role; label: string; unit: string | null; agg: "sum" | "avg" | "max" | null; why: string }[];
  open_values: string[]; open_phrase?: string; primary: string | null; link_categories: string[]; questions: string[];
  relevance?: "district" | "partly" | "unrelated"; relevance_why?: string;
}

/** "still pending", "short of stock": what open means for this data, from its status values when the AI gave none. */
export function openWordOf(values: string[]): string {
  const all = values.join(" ").toLowerCase();
  if (/out of stock|low|shortage|nil stock/.test(all)) return "short of stock";
  if (/pending|not started|yet to|in[\s-]?progress|under progress|ongoing|tender/.test(all)) return "still pending";
  if (/critical|alert|danger/.test(all)) return "on alert";
  return "still open";
}

/** The AI's proposal, checked column by column against the profile; the rules fill in what it got wrong or left out. */
export function mergeSpec(ai: AiSpec, profile: ColumnProfile[], rules: Spec, refs: Refs, model: string): Spec {
  const byKey = new Map(ai.columns.map((c) => [c.key, c]));
  const columns: ColumnSpec[] = profile.map((p) => {
    const r = rules.columns.find((c) => c.key === p.key)!;
    const a = byKey.get(p.key);
    if (!a || !ROLES.includes(a.role)) return { ...r, conf: 0.6 };
    if (!fits(a.role, p)) return { ...r, conf: 0.6, why: `${r.why} (The AI's reading, ${a.role}, did not fit the values.)` };
    // "not used" only for columns the rules also find empty of meaning: a list of countries or shops is a dimension,
    // even when it is not about Chennai
    if (a.role === "ignore" && !["ignore", "id", "text"].includes(r.role)) return { ...r, conf: 0.66, why: `${r.why} (Kept: it can group the data.)` };
    const agree = a.role === r.role;
    return {
      key: p.key, header: p.header, label: safe(a.label, 40) || r.label, role: a.role, type: p.type,
      unit: a.role === "measure" ? safe(a.unit, 16) || p.unit : null,
      agg: a.role === "measure" ? (a.agg ?? defaultAgg(p.header, p.unit)) : null,
      conf: agree ? 0.96 : 0.84, why: safe(a.why, 160) || r.why
    };
  });
  const status = columns.find((c) => c.role === "status");
  const statusVals = new Map((profile.find((p) => p.key === status?.key)?.top ?? []).map((t) => [t.v.toLowerCase(), t.v]));
  const open = ai.open_values.map((v) => statusVals.get(String(v).trim().toLowerCase())).filter((v): v is string => !!v);
  const primary = ai.primary && columns.find((c) => c.key === ai.primary && c.role === "measure") ? ai.primary
    : columns.find((c) => c.key === rules.primary && c.role === "measure")?.key ?? columns.find((c) => c.role === "measure")?.key ?? null;
  const dept = refs.depts.find((d) => d.code === ai.department) ?? refs.depts.find((d) => d.name.toLowerCase() === String(ai.department ?? "").toLowerCase());
  const codes = new Set(refs.categories.map((c) => c.code));
  const link = ai.link_categories.filter((c) => codes.has(c)).slice(0, 3);
  const entity = safe(ai.entity, 40).toLowerCase() || rules.entity;
  const spec: Spec = {
    title: safe(ai.title, 80) || rules.title,
    summary: safe(ai.summary, 280) || rules.summary,
    entity, entityPlural: safe(ai.entity_plural, 44).toLowerCase() || pluralize(entity),
    department: dept?.code ?? rules.department,
    deptName: dept?.name ?? rules.deptName,
    columns,
    openValues: open.length ? open : openValuesOf(profile.find((p) => p.key === status?.key)),
    primary,
    linkCategories: link.length ? link : rules.linkCategories,
    questions: [],
    by: "ai", model,
    aiRelevance: ai.relevance ? { verdict: ai.relevance, why: safe(ai.relevance_why, 160) } : null
  };
  const phrase = safe(ai.open_phrase, 32).toLowerCase().replace(/[^a-z\s-]/g, "").trim();
  spec.openWord = phrase && phrase.split(/\s+/).length <= 4 ? phrase : openWordOf(spec.openValues);
  const qs = ai.questions.map((q) => safe(q, 110)).filter((q) => q.length > 8).slice(0, 4);
  spec.questions = qs.length >= 2 ? qs : defaultQuestions(spec);
  return spec;
}

/** After the Collector changes a role by hand: the Spec stays consistent (open values, primary, questions). */
export function respec(spec: Spec, profile: ColumnProfile[], changes: { key: string; role: Role; label?: string }[]): Spec {
  const columns = spec.columns.map((c) => {
    const ch = changes.find((x) => x.key === c.key);
    if (!ch) return c;
    const p = profile.find((x) => x.key === c.key)!;
    const role = fits(ch.role, p) || ch.role === "ignore" || ch.role === "person" || ch.role === "id" ? ch.role : c.role;
    return { ...c, role, label: safe(ch.label, 40) || c.label, conf: 1, why: "Set by the Collector.",
      unit: role === "measure" ? c.unit ?? p.unit : null, agg: role === "measure" ? c.agg ?? defaultAgg(p.header, p.unit) : null };
  });
  const status = columns.find((c) => c.role === "status");
  const keepOpen = spec.openValues.length && columns.find((c) => c.role === "status")?.key === spec.columns.find((c) => c.role === "status")?.key;
  const openValues = keepOpen ? spec.openValues : openValuesOf(profile.find((p) => p.key === status?.key));
  const next: Spec = {
    ...spec, columns, openValues, openWord: keepOpen ? spec.openWord : openWordOf(openValues),
    primary: columns.find((c) => c.key === spec.primary && c.role === "measure")?.key ?? columns.find((c) => c.role === "measure")?.key ?? null
  };
  next.questions = spec.questions.length ? spec.questions : defaultQuestions(next);
  return next;
}
