/**
 * What Thunai suggests doing next on a screen (the owner: "anticipate, like JARVIS"): two or three steps computed by code
 * from what the screen shows, never by the model. Each is a direct screen (built from the data, no model), a draft into
 * the approval tray (still waiting for "confirm N"), or a sentence sent back through Thunai.
 */
import type { NextStepT, StageDocT } from "./stage";

type B = StageDocT["blocks"][number];
const find = <K extends B["kind"]>(d: StageDocT, k: K) => d.blocks.find((b) => b.kind === k) as Extract<B, { kind: K }> | undefined;
const other = (p: string) => (p === "weekly" ? "monthly" : "weekly");
const PERIOD_EN: Record<string, string> = { daily: "today", weekly: "this week", monthly: "30 days", quarterly: "90 days" };

/** a period said in words for an offer, never a figure (the number gate has nothing to check) */
const PERIOD_OFFER: Record<string, { en: string; ta: string }> = {
  daily: { en: "today", ta: "இன்னைக்கு" }, weekly: { en: "the past week", ta: "கடந்த வாரத்துக்கு" }, monthly: { en: "the past month", ta: "கடந்த மாசத்துக்கு" }, quarterly: { en: "the past quarter", ta: "கடந்த காலாண்டுக்கு" }
};

/**
 * One question Jarvis offers after an answer ("Shall I put these on the map?"), from the screen's own next steps (nextSteps above): the first
 * one built directly from the data, said as an offer in English and spoken-register Tamil. Drafts are never offered by voice (they go to the
 * tray from a tap), and an offer that would carry a figure is skipped, so the number gate has nothing to refuse. null when there is none.
 * The step itself is returned: picking it is `{ direct: { recipe, slots } }`, with no model.
 */
export function nextQuestion(d: StageDocT): { say: { en: string; ta: string }; step: NextStepT } | null {
  const steps = d.next ?? nextSteps(d);
  for (const s of steps) {
    if (s.kind !== "direct" || !s.recipe) continue;
    const say = offerOf(s, d);
    if (say && !/\p{Nd}/u.test(say.en + say.ta)) return { say, step: s };
  }
  return null;
}

function offerOf(s: NextStepT, d: StageDocT): { en: string; ta: string } | null {
  const slots = (s.slots ?? {}) as Record<string, unknown>;
  const en = s.label.en;
  const m = (re: RegExp) => re.exec(en);
  let x: RegExpExecArray | null;
  switch (s.recipe) {
    case "map": return { en: "Shall I put these on the map?", ta: "இதை வரைபடத்துல காட்டட்டுமா?" };
    case "performance":
      if (d.recipe === "performance") return slots.by === "zone" ? { en: "Shall I show it zone by zone?", ta: "மண்டல வாரியா காட்டட்டுமா?" } : { en: "Shall I show it department by department?", ta: "துறை வாரியா காட்டட்டுமா?" };
      return { en: "Shall I check which department is slowest?", ta: "எந்தத் துறை மெதுவா இருக்குன்னு பார்க்கட்டுமா?" };
    case "why":
      if ((x = m(/^Why is (.+) (higher|highest)\?$/))) return { en: `Shall I look into why ${x[1]} is ${x[2]}?`, ta: `${x[1]} ஏன் அதிகம்னு பார்க்கட்டுமா?` };
      if (d.recipe === "why" && slots.period && PERIOD_OFFER[String(slots.period)]) return { en: `Shall I do the same for ${PERIOD_OFFER[String(slots.period)].en}?`, ta: `இதையே ${PERIOD_OFFER[String(slots.period)].ta} பார்க்கட்டுமா?` };
      return { en: "Shall I look at what drove it?", ta: "எதனால இப்படி ஆச்சுன்னு பார்க்கட்டுமா?" };
    case "cases":
      if ((x = m(/^Open (.+)'s cases$/))) return { en: `Shall I open ${x[1]}'s cases?`, ta: `${x[1]} சம்பவங்களைத் திறக்கட்டுமா?` };
      if ((x = m(/^Open (.+)'s backlog$/))) return { en: `Shall I open ${x[1]}'s backlog?`, ta: `${x[1]} நிலுவையைத் திறக்கட்டுமா?` };
      if ((x = m(/^More in (.+)$/))) return { en: `Shall I show more from ${x[1]}?`, ta: `${x[1]}-ல இன்னும் காட்டட்டுமா?` };
      if (slots.sev === "Severe") return { en: "Shall I show the severe cases?", ta: "கடுமையான சம்பவங்களைக் காட்டட்டுமா?" };
      return null;
    case "compare":
      if ((x = m(/^Compare (.+) and (.+)$/))) return { en: `Shall I compare ${x[1]} and ${x[2]}?`, ta: `${x[1]}, ${x[2]} ஒப்பிடட்டுமா?` };
      if (slots.period && PERIOD_OFFER[String(slots.period)]) return { en: `Shall I do the same for ${PERIOD_OFFER[String(slots.period)].en}?`, ta: `இதையே ${PERIOD_OFFER[String(slots.period)].ta} ஒப்பிடட்டுமா?` };
      return null;
    case "ranking": return slots.measure === "rain" ? { en: "Shall I check where it's raining most?", ta: "எங்க அதிக மழைன்னு பார்க்கட்டுமா?" } : null;
    case "dashboard": return slots.cat === "FLOOD_WATERLOGGING" ? { en: "Shall I pull up today's flooding picture?", ta: "இன்னைக்கு வெள்ள நிலவரத்தைக் காட்டட்டுமா?" } : null;
    default: return null;
  }
}

export function nextSteps(d: StageDocT): NextStepT[] {
  const out: NextStepT[] = [];
  const add = (x: NextStepT) => { if (out.length < 3 && !out.some((y) => y.label.en === x.label.en)) out.push(x); };
  const slots = d.slots as Record<string, unknown>;
  const list = find(d, "CaseList");
  const rank = find(d, "Ranking");
  const late = list?.rows.filter((r) => r.overdue) ?? [];
  switch (d.recipe) {
    case "cases": case "map":
      if (late.length) add({ label: { en: `Draft for the ${late.length} past deadline`, ta: `காலக்கெடு தாண்டிய ${late.length}-க்கு வரைவு` }, kind: "draft", ids: late.slice(0, 5).map((r) => r.id), recipe: null, slots: null, text: null });
      if (d.recipe === "cases" && list?.rows.some((r) => r.lat != null)) add({ label: { en: "Show them on a map", ta: "வரைபடத்தில் காட்டு" }, kind: "direct", recipe: "map", slots: { ...slots, what: "severe" }, ids: [], text: null });
      add({ label: { en: "Which department is slowest?", ta: "எந்தத் துறை மெதுவாக உள்ளது?" }, kind: "direct", recipe: "performance", slots: { by: "dept", period: d.scope.period }, ids: [], text: null });
      break;
    case "compare": {
      const c = find(d, "Compare");
      const hi = c?.diffs[0] ? c.sides.find((s) => s.label === c.diffs[0].hi) : null;
      if (hi?.zone) add({ label: { en: `Why is ${hi.label} higher?`, ta: `${hi.label} ஏன் அதிகம்?` }, kind: "direct", recipe: "why", slots: { zones: [hi.zone], period: d.scope.period }, ids: [], text: null });
      add({ label: { en: `Same, ${PERIOD_EN[other(d.scope.period)]}`, ta: "வேறு காலம்" }, kind: "direct", recipe: "compare", slots: { ...slots, period: other(d.scope.period) }, ids: [], text: null });
      break;
    }
    case "ranking": case "performance": {
      const top = rank?.items[0], second = rank?.items[1];
      if (top?.action === "zone" && top.zone) {
        add({ label: { en: `Open ${top.label}'s cases`, ta: `${top.label} சம்பவங்கள்` }, kind: "direct", recipe: "cases", slots: { zones: [top.zone], period: d.scope.period, sort: "priority", n: 15 }, ids: [], text: null });
        if (second?.zone) add({ label: { en: `Compare ${top.label} and ${second.label}`, ta: `${top.label}, ${second.label} ஒப்பிடு` }, kind: "direct", recipe: "compare", slots: { zones: [top.zone, second.zone], period: d.scope.period }, ids: [], text: null });
      }
      if (top?.action === "dept") add({ label: { en: `Open ${top.label}'s backlog`, ta: `${top.label} நிலுவை` }, kind: "direct", recipe: "cases", slots: { dept: top.key, status: "open", sort: "priority", n: 15 }, ids: [], text: null });
      if (top?.action === "station") add({ label: { en: "Flooding picture today", ta: "இன்றைய வெள்ள நிலவரம்" }, kind: "direct", recipe: "dashboard", slots: { cat: "FLOOD_WATERLOGGING", period: "daily" }, ids: [], text: null });
      if (d.recipe === "performance") add({ label: slots.by === "zone" ? { en: "Department-wise", ta: "துறை வாரியாக" } : { en: "Zone-wise", ta: "மண்டல வாரியாக" }, kind: "direct", recipe: "performance", slots: { ...slots, by: slots.by === "zone" ? "dept" : "zone" }, ids: [], text: null });
      break;
    }
    case "trend":
      add({ label: { en: "What drove it?", ta: "காரணம் என்ன?" }, kind: "direct", recipe: "why", slots: { cat: d.scope.cat, period: d.scope.period }, ids: [], text: null });
      add({ label: { en: "Hotspots on a map", ta: "வரைபடத்தில் மையங்கள்" }, kind: "direct", recipe: "map", slots: { what: "hotspots", cat: d.scope.cat }, ids: [], text: null });
      break;
    case "why":
      if (list?.rows.length) add({ label: { en: "Draft for these incidents", ta: "இவற்றுக்கு வரைவு" }, kind: "draft", ids: list.rows.slice(0, 3).map((r) => r.id), recipe: null, slots: null, text: null });
      add({ label: { en: `Same, ${PERIOD_EN[other(d.scope.period)]}`, ta: "வேறு காலம்" }, kind: "direct", recipe: "why", slots: { ...slots, period: other(d.scope.period) }, ids: [], text: null });
      break;
    case "dashboard": {
      if (list?.rows.length) add({ label: { en: "Draft for the top 3", ta: "முதல் 3-க்கு வரைவு" }, kind: "draft", ids: list.rows.slice(0, 3).map((r) => r.id), recipe: null, slots: null, text: null });
      const z = find(d, "Ranking")?.items[0];
      if (z?.zone) add({ label: { en: `Why is ${z.label} highest?`, ta: `${z.label} ஏன் அதிகம்?` }, kind: "direct", recipe: "why", slots: { zones: [z.zone], cat: d.scope.cat, period: d.scope.period }, ids: [], text: null });
      break;
    }
    case "nearby": {
      const ids = (list?.rows ?? []).slice(0, 3).map((r) => r.id);
      if (ids.length) add({ label: { en: `Draft an alert for the nearest ${ids.length}`, ta: `அருகிலுள்ள ${ids.length}-க்கு எச்சரிக்கை வரைவு` }, kind: "draft", ids, recipe: null, slots: null, text: null });
      break;
    }
    case "readings":
      add({ label: { en: "Where is it raining most?", ta: "எங்கே அதிக மழை?" }, kind: "direct", recipe: "ranking", slots: { measure: "rain", n: 3 }, ids: [], text: null });
      break;
    case "brief": case "news":
      add({ label: { en: "Show the severe cases", ta: "கடுமையான சம்பவங்கள்" }, kind: "direct", recipe: "cases", slots: { sev: "Severe" }, ids: [], text: null });
      add({ label: { en: "Department-wise performance", ta: "துறை வாரியான செயல்திறன்" }, kind: "direct", recipe: "performance", slots: { by: "dept" }, ids: [], text: null });
      break;
    case "case": {
      const det = find(d, "CaseDetail");
      if (det) add({ label: { en: "Draft action for it", ta: "இதற்கு வரைவு" }, kind: "draft", ids: [det.incident.id], recipe: null, slots: null, text: null });
      if (det?.incident.zone) add({ label: { en: `More in ${det.incident.zoneName}`, ta: `${det.incident.zoneName} மேலும்` }, kind: "direct", recipe: "cases", slots: { zones: [det.incident.zone], sort: "priority", n: 15 }, ids: [], text: null });
      break;
    }
    default: break;
  }
  return out;
}
