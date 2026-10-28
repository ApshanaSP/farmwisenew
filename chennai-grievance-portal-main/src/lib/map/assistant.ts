/**
 * Ask District IQ's spatial questions ("waterlogging within 300 m of schools", "thefts along Anna Salai", "nearest
 * hospital to …") are answered by Ask the Map's engine, so the chat and the map give the same number. The card carries
 * the map answer's points, the steps behind it, and "Show on the console map", which runs the same plan on the
 * Overview's map. Only questions the map's rules read as distance, road or nearest questions come here; counts by
 * zone, trends and the rest stay with the assistant's own tools.
 */
import type { AnswerCard, Dataset } from "@/lib/assistant/answer";
import { askMap } from "./ask";
import type { Plan } from "./plan";
import { makeResolver } from "./resolve";
import { rulesRoute } from "./route";
import { world } from "./world";

const SPATIAL = new Set(["within", "along", "nearest", "farthest"]);
/** the question says how far, near what or along what, in words */
const RELATION = /\b(within|near|nearby|around|close to|next to|along|alongside|nearest|closest|farthest|furthest|\d+(\.\d+)?\s*(m|km|kms|meters?|metres?))\b|அருகே|அருகில்|அருகிலுள்ள|பக்கத்தில்|சாலையில்|மீட்டர்|கி\.?மீ|pakkathula|pakkathil|kitta|kitte/i;
/** the assistant's own lanes: prices, environment readings, hospital capacity, explanations */
const NOT_MAP = /\b(price|prices|rate|rates|mandi|market|onion|tomato|potato|aqi|air quality|rain|rainfall|lake levels?|reservoir|storage|beds?|occupancy|overload\w*|why|trend|forecast)\b/i;

/**
 * Is this a map question the assistant should hand to Ask the Map? Rules only, no AI, and narrow on purpose: a distance
 * to a kind of facility, a road or waterway, or nearest/farthest, said in words. "In Adyar" or "near Anna Nagar"
 * (a place, not a distance) stays with the assistant, which counts by area as the console does.
 */
export async function isMapQuestion(text: string): Promise<boolean> {
  if (!RELATION.test(text) || NOT_MAP.test(text)) return false;
  const { resolver } = await world();
  const r = rulesRoute(text, null, { resolve: makeResolver(resolver), dept: () => null });
  if (r?.kind !== "plan") return false;
  return r.plan.steps.some((s) => SPATIAL.has(s.op));
}

export async function mapCard(base: AnswerCard, text: string, user: string, lockDept: string | null): Promise<AnswerCard | null> {
  if (!(await isMapQuestion(text))) return null;
  const r = await askMap({ text, plan: null, prev: null, user: { email: user, role: lockDept ? "department_officer" : "collector", lockDept },
    context: { zone: null, taluk: null, incidentId: null, ward: null, drawn: null }, reword: false });
  if (r.kind !== "answer" || !r.answer || !r.plan) return null;
  const ta = r.lang === "ta";
  const points: Dataset = {
    id: "map_answer", title: r.answer.headline, tab: ta ? "வரைபடம்" : "Map",
    fields: [{ key: "title", label: "Incident", kind: "category" }, { key: "priority", label: "Priority", kind: "value" }, { key: "lat", label: "lat", kind: "geo" }, { key: "lon", label: "lon", kind: "geo" },
      { key: "sev", label: "Severity", kind: "category" }, { key: "id", label: "Id", kind: "id" }] as Dataset["fields"],
    rows: r.rows.filter((x) => x.pinnable).slice(0, 150).map((x) => {
      const f = r.features.find((y) => y.id === x.id)!;
      return { title: x.title, priority: Math.round(x.priority), lat: f.lat, lon: f.lon, sev: x.sev, id: x.id };
    }),
    total: r.total
  };
  const steps = r.trace.map((s, i) => `${i + 1}. ${ta ? s.note_ta : s.note_en}`);
  return {
    ...base,
    kind: "answer",
    language: r.lang,
    headline: r.answer.headline,
    answerMarkdown: [r.answer.meaning ?? "", "", `**${ta ? "இது எப்படிக் கணக்கிடப்பட்டது" : "How this was worked out"}**`, ...steps].join("\n").trim(),
    voiceSummary: r.answer.headline.replace(/ · (map layer ready|வரைபட அடுக்கு தயார்)/, ""),
    chart: points.rows.length
      ? { type: "map_points", dataset: "map_answer", x: "title", y: ["priority"], title: r.answer.headline, subtitle: null, sort: "none", highlight: "none" } as unknown as AnswerCard["chart"]
      : null,
    visualAsked: true,
    datasets: [points],
    kpis: [{ label: ta ? "முடிவுகள்" : "Results", value: r.total }],
    table: null,
    followUps: ta ? ["கடுமையானவை மட்டும்", "500 மீ ஆக்கு"] : ["only severe", "make it 500 m", "show by ward"],
    consoleActions: [{ action: "show_on_map", label: ta ? "கன்சோல் வரைபடத்தில் காட்டு" : "Show on the console map", plan: r.plan as Plan } as AnswerCard["consoleActions"][number]],
    caveats: [ta ? "நேர்கோட்டுத் தூரம்." : "Straight-line distance.", ...(r.unplaced.length ? [`${r.unplaced.length} ${ta ? "துல்லிய இடமின்றி, குறிக்கப்படவில்லை" : "with no exact place are counted but not pinned"}`] : [])],
    sources: { ...base.sources, tools: [{ name: "ask_the_map", args: { plan: r.plan }, ms: r.ms }], plan: r.plan, rows: r.total, incidentIds: r.rows.map((x) => x.id) }
  };
}
