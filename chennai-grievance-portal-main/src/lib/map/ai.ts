/**
 * The AI's two small jobs in Ask the Map, and nothing more: fill the typed plan for a question the rules could not read
 * (or edit the current plan for a follow-up), and reword the answer's template sentence. It never computes a number,
 * writes SQL, picks a feature to show or moves the map. A plan it returns is checked like any other (checkPlan); a
 * failed check is retried once with the problems, then becomes chips. A rewording whose numbers are not in the facts
 * is dropped and the template stands.
 */
import { generateJson } from "@/lib/ai/gateway";
import { extractNumbers } from "@/lib/assistant/verify";
import { z } from "zod";
import { checkPlan, type Plan } from "./plan";
import { WirePlan, fromWire, toWire } from "./wire";
import { LAYER_IDS } from "./types";
import type { Fact } from "./answer";
import type { Lang } from "./words";

const EXAMPLES: [string, unknown][] = [
  ["garbage complaints within 200 m of hospitals", { steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: ["SOLID_WASTE"], family: null, severity: null, status: "open", dept: null, overdue: null, citizen: true, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
    { op: "take", as: "f1", layer: "hospitals", filter: null, where: { government: null, kinds: ["hospital", "health_centre"] } },
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 200 }], show: "near", language: "en" }],
  ["பள்ளிகள் அருகே மழைநீர் தேக்கம்", { steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: ["FLOOD_WATERLOGGING"], family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
    { op: "take", as: "f1", layer: "schools", filter: null, where: null },
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 500 }], show: "near", language: "ta" }],
  ["Zone 10 vs Zone 13 open cases", { steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
    { op: "compare", as: "cmp", of: "a", a: { kind: "zone", id: 10 }, b: { kind: "zone", id: 13 } }], show: "cmp", language: "en" }],
  ["flooding zone wise this month", { steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: null, family: ["FLOOD"], severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 30, offset: 0 }, text: null }, where: null },
    { op: "count_by", as: "by", of: "a", by: "zone" }], show: "by", language: "en" }],
  ["schools in Zone 11", { steps: [
    { op: "take", as: "f1", layer: "schools", filter: null, where: null },
    { op: "inside", as: "in", of: "f1", area: { kind: "zone", id: 11 } }], show: "in", language: "en" }],
  ["areas with no fire station within 3 km", { steps: [
    { op: "take", as: "f1", layer: "fire_stations", filter: null, where: null },
    { op: "farthest", as: "far", areas: "ward", from: "f1", beyond_m: 3000 }], show: "far", language: "en" }]
];

function system(cats: string[], depts: string[]): string {
  return [
    "You turn a District Collector's question about a map of Chennai into a JSON plan. You never answer the question and never invent numbers.",
    "Steps run in order over named collections. Ops: take (a layer with a filter), within (incidents within N metres of facilities), inside (incidents or facilities in an area),",
    "along (a road or waterway id), nearest, farthest, count_by, hotspot, compare (two areas), change (two periods).",
    `Layers: ${LAYER_IDS.join(", ")}. Incident categories: ${cats.join(", ")}. Families: FLOOD, CRIME, DRAINAGE, ROADS_TRAFFIC, HEALTH, WASTE_SANITATION.`,
    `Departments: ${depts.join(", ")}.`,
    "Defaults: status open; period last 7 days (offset 0) unless the question names a period. Distances 10 to 5000 metres. Areas: ward 1-200, zone 1-15, taluk codes TLK-XXX,",
    "point refs are given to you as place refs in the prompt; use only those. A road or waterway is used only by a line id given in the prompt.",
    "language is en, ta (Tamil script) or tanglish (Tamil in Latin letters), as the question is written.",
    "understood is false when the text is not a question about incidents, places or facilities in Chennai (random letters, greetings, other topics); then steps may be a single take of incidents.",
    "Examples:",
    "Each step is one flat object with every field; fields a step does not use are null. Areas: area_kind with area_id (ward, zone), area_code (taluk), or area_ref with area_radius_m (point); compare uses area_* for A and b_* for B. Periods: period_days with period_offset (0 = ending now).",
    ...EXAMPLES.map(([q, p]) => `Q: ${q}\nPLAN: ${JSON.stringify(toWire(p as Plan))}`)
  ].join("\n");
}

/** Everyday words a Collector uses and what they mean on this map: the AI's vocabulary beyond the rules'. */
const CONCEPTS = [
  "kids, children, students, pupils -> layer schools (and colleges for students)",
  "patients, sick, elderly care, medical -> layer hospitals (kinds hospital, health_centre)",
  "commuters, passengers, travellers -> layer rail_metro",
  "water bodies, tanks, ponds, eri -> layer water_bodies; rivers, canals, nullah -> layer waterways",
  "law and order, safety of women -> families CRIME; civic complaints -> citizen true",
  "in the news, newspapers, press, media reports, headlines -> news true (incidents a news outlet reported; status any unless the question says open)",
  "by the sea, coast, beach, seashore -> the coastal zones (use count_by zone or inside one zone): 1 Thiruvottiyur, 4 Tondiarpet, 5 Royapuram, 9 Teynampet, 13 Adyar, 15 Sholinganallur",
  "north / central / south of the city -> zones by direction (see ZONES); a question about one direction may use count_by zone",
  "worst, most urgent -> severity Severe (or Severe and High); pending too long, overdue -> overdue true"
];

/** A plan from the AI for `text` (or `prev` edited by `text`), checked; null when it cannot be made valid. */
export async function aiPlan(text: string, prev: Plan | null, ctx: { cats: string[]; depts: string[]; places: { ref: string; kind: string; name: string }[]; user: string; lang: Lang; signal?: AbortSignal;
  /** the rules' plan for the parts they could read, and the words they could not */
  hint?: Plan | null; unread?: string[];
  zones?: { zone: number; name: string; lat: number; lon: number }[] }):
  Promise<{ plan: Plan } | { problems: string[] }> {
  const places = ctx.places.length ? `Places named (use these refs): ${ctx.places.map((p) => `${p.name} = ${p.kind} ${p.ref}`).join("; ")}` : "No place was recognised.";
  const zones = ctx.zones?.length ? `ZONES: ${ctx.zones.map((z) => `${z.zone} ${z.name} (${z.lat > 13.12 ? "north" : z.lat < 13.02 ? "south" : "central"})`).join("; ")}` : "";
  const hint = ctx.hint ? `\nTHE RULES READ IT AS: ${JSON.stringify(toWire(ctx.hint))}\nWORDS THE RULES COULD NOT USE: ${(ctx.unread ?? []).join(", ")}. Keep what the rules got right and use these words too.` : "";
  let prompt = prev
    ? `CURRENT PLAN: ${JSON.stringify(toWire(prev))}\nFOLLOW-UP: ${text}\n${places}\n${zones}\nReturn the current plan edited by the follow-up (never a fresh plan unless the follow-up starts a new topic).`
    : `QUESTION: ${text}\n${places}\n${zones}${hint}\nCONCEPTS: ${CONCEPTS.join(" | ")}\nReturn the plan.`;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateJson({ role: "fast", name: "map-plan", schema: WirePlan, system: system(ctx.cats, ctx.depts), prompt, temperature: 0, maxOutputTokens: 900, user: ctx.user, abortSignal: ctx.signal, chat: true });
    // not a map question: say so, never answer with a guessed plan ("asdf" became "all open incidents")
    if (r.object.understood === false) return { problems: ["not a map question"] };
    const c = checkPlan(fromWire(r.object));
    if (c.ok) return { plan: c.plan };
    problems = c.problems;
    prompt = `${prompt}\nYOUR LAST PLAN WAS REFUSED: ${problems.join("; ")}. Fix it.`;
  }
  return { problems };
}

const Reworded = z.object({ sentence: z.string().max(400) });
/**
 * The template's meaning sentence, reworded by the AI into at most two plain sentences in the answer's language. Every
 * number it writes must be one of the facts (or appear in the template); otherwise the template stands.
 */
export async function aiReword(template: string, facts: Fact[], lang: Lang, user: string, signal?: AbortSignal): Promise<string | null> {
  const allowed = new Set([...facts.map((f) => f.value), ...extractNumbers(template).map((x) => x.value)]);
  const r = await generateJson({
    role: "fast", name: "map-word", schema: Reworded, temperature: 0.2, maxOutputTokens: 220, user, abortSignal: signal, chat: true,
    system: "Reword the sentence for a District Collector in plain words, at most two sentences, in the language given. Keep every number exactly; add no number, cause or claim.",
    prompt: `LANGUAGE: ${lang === "ta" ? "Tamil (script)" : lang === "tanglish" ? "Tanglish (Tamil in Latin letters)" : "English"}\nSENTENCE: ${template}\nFACTS: ${facts.map((f) => `${f.label} = ${f.value}`).join("; ")}`
  });
  const s = r.object.sentence.trim();
  // the same numbers as the template, no more and no fewer: a rewording may not add a fact, even a true one
  const nums = (t: string) => extractNumbers(t).map((x) => x.value).sort((a, b) => a - b).join(",");
  if (!s || nums(s) !== nums(template) || extractNumbers(s).some((x) => !allowed.has(x.value)) || s.split(/(?<=[.!?।])\s+/).length > 2) return null;
  return s;
}
