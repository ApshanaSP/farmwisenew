/**
 * What Thunai does on an open Stage without the model: the instant commands ("next", "stop", "only the Adyar ones",
 * "sort by complaints", "show it as a table", "open 3", "pin this", "export"), the lane-1 acknowledgement said the moment a
 * request leaves ("Checking the severe cases."), and the Stage's own refinements and exports. Plain functions, tested.
 */
import type { BlockT, CaseRowT, StageDocT } from "./stage";
import type { Lang } from "./types";

export type LocalCmd =
  | { op: "filter"; text: string }
  | { op: "sort"; by: "complaints" | "time" | "value" | "name" | "severity" }
  | { op: "view"; view: "table" | "map" | "chart" }
  | { op: "next" } | { op: "prev" } | { op: "stop" } | { op: "read" } | { op: "again" } | { op: "close" } | { op: "back" } | { op: "clear" }
  | { op: "pin" }
  | { op: "export"; what: "png" | "csv" | null }
  | { op: "open"; n: number }
  | { op: "draft"; n: number; first: boolean }
  | { op: "map"; n: number | null }
  | { op: "full" };

const ORD: Record<string, number> = {
  first: 1, one: 1, "1st": 1, second: 2, two: 2, "2nd": 2, third: 3, three: 3, "3rd": 3, fourth: 4, four: 4, "4th": 4, fifth: 5, five: 5, "5th": 5,
  sixth: 6, six: 6, "6th": 6, seventh: 7, seven: 7, eighth: 8, eight: 8, ninth: 9, nine: 9, tenth: 10, ten: 10, top: 1, last: -1,
  onnu: 1, rendu: 2, moonu: 3, naalu: 4, anju: 5, aaru: 6,
  "முதல்": 1, "முதலாவது": 1, "இரண்டாவது": 2, "ரெண்டாவது": 2, "மூன்றாவது": 3, "நான்காவது": 4, "ஐந்தாவது": 5, "ஆறாவது": 6
};
const numberIn = (t: string): number | null => {
  const d = t.match(/\b(\d{1,2})\b/);
  if (d) return Number(d[1]);
  for (const [w, n] of Object.entries(ORD)) if (new RegExp(`(^|[^\\p{L}])${w}`, "u").test(t)) return n;
  return null;
};

/** A command on the open Stage that needs no model, or null (the sentence goes to the agent). */
export function localStageCommand(raw: string): LocalCmd | null {
  const t = raw.toLowerCase().replace(/[.!?,]+$/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^(next|next one|aduthathu|adutha|அடுத்தது|அடுத்து)$/.test(t)) return { op: "next" };
  if (/^(previous|prev|back one|munnadi|முந்தையது)$/.test(t)) return { op: "prev" };
  if (/^(stop|stop reading|pause|quiet|niruthu|நிறுத்து|போதும்|podhum)$/.test(t)) return { op: "stop" };
  if (/^(again|say (it|that) again|repeat( that)?|once more|innoru vaati|மீண்டும்)$/.test(t)) return { op: "again" };
  if (/^(read (them|it|these|this|all)( out| aloud)?|read out|padi|படி|படிங்க|vaasi)$/.test(t)) return { op: "read" };
  if (/^(close( (this|it|the stage|the screen))?|done|that's all|moodu|மூடு)$/.test(t)) return { op: "close" };
  if (/^(go back|back|previous screen|pinnadi|பின்னால்)$/.test(t)) return { op: "back" };
  if (/^(clear( the)? filter|show (all|everything)( again)?|ellam kaattu|எல்லாம் காட்டு)$/.test(t)) return { op: "clear" };
  if (/^(pin (this|it)( screen)?|pin pannu|பின் செய்)$/.test(t)) return { op: "pin" };
  if (/^(full screen|bigger|expand( it)?)$/.test(t)) return { op: "full" };
  const exp = t.match(/^(export|download)( this| it| the screen)?( as)?( (a )?(png|image|picture|csv|excel|data|table))?( pannu)?$/);
  if (exp) return { op: "export", what: /png|image|picture/.test(t) ? "png" : /csv|excel|data|table/.test(t) ? "csv" : null };
  const view = t.match(/^(?:show|switch|make|change|put)?(?: (?:it|this|that))?(?: (?:to|as|into|on))?(?: an?)? ?(table|map|chart|graph|bars?)(?: view)?(?:-?aa? (?:kaattu|maathu))?$/);
  if (view) return { op: "view", view: view[1] === "table" ? "table" : view[1] === "map" ? "map" : "chart" };
  const sort = t.match(/^(?:sort|order|rank)(?: (?:them|it|these))?(?: by)? (complaints?|time|date|newest|latest|value|name|severity|worst)$/);
  if (sort) return { op: "sort", by: /complaint/.test(sort[1]) ? "complaints" : /time|date|newest|latest/.test(sort[1]) ? "time" : /name/.test(sort[1]) ? "name" : /severity|worst/.test(sort[1]) ? "severity" : "value" };
  const only = t.match(/^(?:only|just|show only|show just|keep only)(?: the)? (.+?)(?: ones| cases| items| incidents)?(?: mattum)?$/) ?? t.match(/^(.+?) (?:mattum|மட்டும்)$/);
  if (only && only[1].length >= 3 && !/\b(severe|critical|high|medium|low|open|week|month|today|quarter)\b/.test(only[1])) return { op: "filter", text: only[1].replace(/^(?:ones?|cases?|items?|incidents?) (?:in|at|from|of) /, "").replace(/^(in|at|from|la|il)\s+/, "").replace(/\s+(la|il|ones)$/, "").trim() };
  const open = t.match(/^(?:open|show|thira|திற)(?: me)?(?: the| number| no\.?)? (.+?)(?: one| case| item)?(?: thira| திற)?$/) ?? t.match(/^(.+?)(?:vathu|வது)?(?:ai)? ?(?:thira|திற|தைத் திற|ஐத் திற)$/);
  if (open) { const n = numberIn(open[1]); if (n && n > 0) return { op: "open", n }; }
  const draft = t.match(/^draft(?: an?)?(?: action| alert| mail| email| letter)?(?: for| to)?(?: the)? (.+?)(?: ones?)?$/);
  if (draft) {
    // "the first three": the count follows "first"/"top"; "the first" alone is item 1
    const first = /^(?:first|top)\s+\S/.test(draft[1]);
    const n = numberIn(first ? draft[1].replace(/^(?:first|top)\s+/, "") : draft[1]);
    if (n && n > 0) return { op: "draft", n, first };
  }
  const mapIt = t.match(/^show (?:(?:number )?(\d{1,2}|this|it)) on the (?:main )?map$/);
  if (mapIt) return { op: "map", n: mapIt[1] && /\d/.test(mapIt[1]) ? Number(mapIt[1]) : null };
  return null;
}

/** Lane 1: what Thunai says the moment the request leaves, from the words alone (no figures). */
export function ackFor(text: string, lang: Lang): string {
  const t = text.toLowerCase();
  const pick = (en: string, ta: string) => (lang === "ta" ? ta : en);
  if (/news|headline|செய்தி|seithi/.test(t)) return pick("Getting the news.", "செய்திகளைப் பெறுகிறேன்.");
  if (/severe|critical|serious|கடுமை|urgent/.test(t)) return pick("Checking the severe cases.", "கடுமையான சம்பவங்களைப் பார்க்கிறேன்.");
  if (/compare|versus|\bvs\b|ஒப்பிடு/.test(t)) return pick("Putting them side by side.", "ஒப்பிட்டுப் பார்க்கிறேன்.");
  if (/rain|reservoir|lake|full|மழை|ஏரி|நீர்|air|aqi|காற்று/.test(t)) return pick("Reading the gauges.", "அளவீடுகளைப் பார்க்கிறேன்.");
  if (/department|dept|slowest|performance|துறை/.test(t)) return pick("Checking department performance.", "துறைகளின் செயல்பாட்டைப் பார்க்கிறேன்.");
  if (/school|hospital|near|within|km|metre|அருகில்/.test(t)) return pick("Asking the map.", "வரைபடத்தில் தேடுகிறேன்.");
  if (/why|reason|ஏன்/.test(t)) return pick("Looking at what changed.", "என்ன மாறியது என்று பார்க்கிறேன்.");
  if (/brief|சுருக்கம்/.test(t)) return pick("Preparing your brief.", "சுருக்கத்தைத் தயார் செய்கிறேன்.");
  if (/dashboard|trend|moved|map|hotspot|top|worst|most/.test(t)) return pick("Building that screen.", "திரையை உருவாக்குகிறேன்.");
  return pick("On it.", "பார்க்கிறேன்.");
}

// ------------------------------------------------------------------ refinements --

const has = (hay: (string | null | undefined)[], needle: string) => hay.some((h) => (h ?? "").toLowerCase().includes(needle.toLowerCase()));

/** Keep the items that mention the words (a place, a department, a kind); a block with nothing left keeps a note. */
export function filterStage(d: StageDocT, text: string): { doc: StageDocT; kept: number; of: number } {
  let kept = 0, of = 0;
  const blocks = d.blocks.map((b): BlockT => {
    switch (b.kind) {
      case "CaseList": { const rows = b.rows.filter((r) => has([r.title, r.place, r.zoneName, r.deptName, r.cat], text)); kept += rows.length; of += b.rows.length; return { ...b, rows }; }
      case "NewsReader": { const items = b.items.filter((x) => has([x.title, x.place, x.source], text)); kept += items.length; of += b.items.length; return { ...b, items }; }
      case "Ranking": { const items = b.items.filter((x) => has([x.label, x.sub], text)); kept += items.length; of += b.items.length; return { ...b, items }; }
      case "Readings": { const items = b.items.filter((x) => has([x.name], text)); kept += items.length; of += b.items.length; return { ...b, items }; }
      case "MapView": return { ...b, points: b.points.filter((p) => has([p.label], text)) };
      default: return b;
    }
  });
  return { doc: { ...d, blocks, title: `${d.title} · ${text}` }, kept, of };
}

export function sortStage(d: StageDocT, by: "complaints" | "time" | "value" | "name" | "severity"): StageDocT {
  const SEV: Record<string, number> = { Severe: 0, High: 1, Medium: 2, Low: 3 };
  const blocks = d.blocks.map((b): BlockT => {
    if (b.kind === "CaseList") {
      const rows = [...b.rows].sort((x, y) => by === "complaints" ? y.complaints - x.complaints : by === "time" ? String(y.t ?? "").localeCompare(String(x.t ?? ""))
        : by === "name" ? x.title.localeCompare(y.title) : (SEV[x.sev ?? ""] ?? 9) - (SEV[y.sev ?? ""] ?? 9));
      return { ...b, rows };
    }
    if (b.kind === "Ranking") return { ...b, items: [...b.items].sort((x, y) => (by === "name" ? x.label.localeCompare(y.label) : b.order === "top" ? y.value - x.value : x.value - y.value)) };
    if (b.kind === "Readings") return { ...b, items: [...b.items].sort((x, y) => (by === "name" ? x.name.localeCompare(y.name) : y.value - x.value)) };
    if (b.kind === "NewsReader" && by === "time") return { ...b, items: [...b.items].sort((x, y) => String(y.t ?? "").localeCompare(String(x.t ?? ""))) };
    return b;
  });
  return { ...d, blocks };
}

/** The items Thunai reads aloud one by one, with the key the Stage highlights while each is read. */
const ORDINAL_EN = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
const ORDINAL_TA = ["முதலாவது", "இரண்டாவது", "மூன்றாவது", "நான்காவது", "ஐந்தாவது", "ஆறாவது", "ஏழாவது", "எட்டாவது", "ஒன்பதாவது", "பத்தாவது"];
const ord = (i: number, lang: Lang) => (lang === "ta" ? ORDINAL_TA[i] ?? `${i + 1}-வது` : ORDINAL_EN[i] ?? `Number ${i + 1}`);

/** Hours between two IST timestamps ("2026-10-28 07:41:25"), or null. */
export function hoursBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const p = (x: string | null | undefined) => (x ? Date.parse(`${x.replace(" ", "T").slice(0, 19)}+05:30`) : NaN);
  const a = p(from), b = p(to);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 3_600_000 : null;
}
const ageWords = (h: number | null, lang: Lang) => (h == null ? null : lang === "ta"
  ? h < 1 ? "ஒரு மணி நேரத்துக்குள்" : h < 48 ? `${Math.round(h)} மணி நேரமாக` : `${Math.round(h / 24)} நாட்களாக`
  : h < 1 ? "under an hour" : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

/** What the problem is, in a few words: the incident's own short summary, else its kind and place (never an id or a citizen's words). */
export function problemOf(r: CaseRowT): string {
  if (r.why && r.why.length <= 110 && !/[.!?].+[.!?]/.test(r.why)) return r.why.replace(/\.$/, "");
  const t = r.title.replace(/\bINC-[A-Z0-9-]+\b/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= 90) return t;
  return r.cat ? `${r.cat}${r.place ? ` at ${r.place}` : ""}` : t.slice(0, 90);
}

/**
 * One case as an aide would brief it: where, what, how long and why it matters, who has it. No ids, no complaint text.
 * "First, in Royapuram: wall collapse at Chetpet. Open 22 hours and past its deadline. PWD Water Resources has it."
 */
export function caseBrief(r: CaseRowT, i: number, asOf: string | null, lang: Lang): string {
  const what = problemOf(r);
  const where = r.zoneName && !what.toLowerCase().includes(r.zoneName.toLowerCase()) ? r.zoneName : null;
  const age = ageWords(hoursBetween(r.t, asOf), lang);
  if (lang === "ta") {
    return [`${ord(i, lang)}${where ? `, ${where}` : ""}: ${what}.`, age ? `${age} திறந்துள்ளது${r.overdue ? ", காலக்கெடு தாண்டிவிட்டது" : ""}.` : r.overdue ? "காலக்கெடு தாண்டிவிட்டது." : "",
      r.complaints > 0 ? `${r.complaints} புகார்கள் வந்துள்ளன.` : "", r.deptName ? `${r.deptName} பொறுப்பு.` : ""].filter(Boolean).join(" ");
  }
  const state = age ? `Open ${age}${r.overdue ? " and past its deadline" : ""}.` : r.overdue ? "Past its deadline." : "";
  return [`${ord(i, lang)}${where ? `, in ${where}` : ""}: ${what}.`, state, r.complaints > 0 ? `${r.complaints} ${r.complaints === 1 ? "citizen has" : "citizens have"} complained.` : "",
    r.deptName ? `${r.deptName} has it.` : ""].filter(Boolean).join(" ");
}

/**
 * The items Thunai reads aloud one by one, with the key the Stage highlights and the lead-in said before the item's own
 * words (so the highlight follows the voice inside the headline).
 */
export function narrationOf(d: StageDocT, lang: Lang): { key: string; text: string; lead: string }[] {
  for (const b of d.blocks) {
    if (b.kind === "NewsReader") return b.items.map((x, i) => {
      const lead = lang === "ta" ? `${ord(i, lang)}${x.source ? `, ${x.source}` : ""}: ` : `${i === 0 ? "First" : i === b.items.length - 1 ? "And finally" : "Next"}${x.source ? `, from ${x.source}` : ""}: `;
      return { key: x.id, lead, text: `${lead}${x.title}.` };
    });
    if (b.kind === "Brief") return b.points.map((p, i) => ({ key: `brief-${i}`, lead: "", text: p.text }));
  }
  const list = d.blocks.find((b) => b.kind === "CaseList");
  if (list && list.kind === "CaseList") return list.rows.slice(0, 10).map((r, i) => ({ key: r.id, lead: "", text: caseBrief(r, i, d.asOf, lang) }));
  const rank = d.blocks.find((b) => b.kind === "Ranking");
  if (rank && rank.kind === "Ranking") return rank.items.slice(0, 8).map((x) => ({ key: x.key, lead: "", text: `${x.rank === 1 ? (lang === "ta" ? "முதலிடம்" : "Top") : `${lang === "ta" ? "இடம்" : "Number"} ${x.rank}`}: ${x.label}, ${x.value}${rank.unit && rank.unit !== "points" ? ` ${rank.unit}` : ""}.` }));
  return [];
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // a cell a spreadsheet would run as a formula is quoted as text
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The Stage's data as CSV, one section per block (the numbers exactly as shown). */
export function toCsv(d: StageDocT): string {
  const out: string[] = [`# ${d.title}`, `# as of ${d.asOf ?? "unknown"}; sources: ${d.sources.join(", ")}`];
  const table = (title: string, cols: string[], rows: unknown[][]) => { out.push("", `# ${title}`, cols.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))); };
  for (const b of d.blocks) {
    if (b.kind === "CaseList") table(b.title, ["#", "id", "title", "severity", "status", "zone", "place", "department", "complaints", "reported", "past deadline"],
      b.rows.map((r, i) => [i + 1, r.id, r.title, r.sev, r.status, r.zoneName, r.place, r.deptName, r.complaints, r.t, r.overdue ? "yes" : "no"]));
    else if (b.kind === "Ranking") table(b.title, ["rank", "name", `value${b.unit ? ` (${b.unit})` : ""}`, "detail"], b.items.map((x) => [x.rank, x.label, x.value, x.sub]));
    else if (b.kind === "Kpis") table(b.title, ["measure", "value", "unit", "before", "change"], b.items.map((x) => [x.label, x.value, x.unit, x.prev, x.delta]));
    else if (b.kind === "Readings") table(b.title, ["place", `value (${b.unit})`, "time", "28-day mean"], b.items.map((x) => [x.name, x.value, x.t, x.mean28]));
    else if (b.kind === "Compare") table(b.title, ["measure", ...b.sides.map((s) => s.label)], b.metrics.map((m) => [m.label, ...b.sides.map((s) => s.values[m.key])]));
    else if (b.kind === "Trend") table(b.title, ["period", b.unit], b.labels.map((l, i) => [l, b.values[i]]));
    else if (b.kind === "Chart") table(b.title, ["label", b.unit ?? "value"], b.labels.map((l, i) => [l, b.values[i]]));
    else if (b.kind === "Heat") table(b.title, ["", ...b.cols], b.rows.map((r, i) => [r, ...b.cells[i]]));
    else if (b.kind === "NewsReader") table(b.title, ["#", "headline", "source", "time", "incident"], b.items.map((x, i) => [i + 1, x.title, x.source, x.t, x.incidentId]));
    else if (b.kind === "Brief") table(b.title, ["#", "point"], b.points.map((p, i) => [i + 1, p.text]));
    else if (b.kind === "Answer") table(b.title, ["fact", "value", "unit"], b.facts.map((f) => [f.label, f.value, f.unit]));
  }
  return out.join("\n");
}

/** The case ids on the Stage in order, for "open 3" and "draft for the first three". */
export function caseIds(d: StageDocT): string[] {
  const list = d.blocks.find((b) => b.kind === "CaseList");
  if (list && list.kind === "CaseList") return list.rows.map((r) => r.id);
  const det = d.blocks.find((b) => b.kind === "CaseDetail");
  if (det && det.kind === "CaseDetail") return [det.incident.id];
  const news = d.blocks.find((b) => b.kind === "NewsReader");
  if (news && news.kind === "NewsReader") return news.items.map((x) => x.incidentId).filter((x): x is string => !!x);
  return [];
}
