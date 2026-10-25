/**
 * Answers for the explicit intents (intent.ts) that the generic tools answered badly: the incidents themselves
 * ("top 3 priority crimes"), one incident in full, incidents like it nearby, how many, which kinds, top news stories,
 * one story, and actions when asked. Every figure and line comes from the store (incidents.ts, news.ts); the chat model
 * writes nothing here, so nothing needs the number check and nothing depends on an API key. Follow-ups resolve against
 * the structured context the previous answer saved; anything else returns null and goes to the existing router.
 */
import { baseCard } from "@/lib/assistant/cards";
import { describeScope, type RefNames } from "@/lib/assistant/scope";
import { spec } from "@/lib/assistant/datasets";
import { HANDLED, PICK_FROM_LIST, detectIntent, topicByKey, topicWords, type Detected, type Topic } from "@/lib/assistant/intent";
import { deptFromWords } from "@/lib/assistant/deptwords";
import { filtersOf, type ActiveFilters, type ConversationContext } from "@/lib/assistant/context";
import { actionsFor, anySynthetic, categoryRanking, countByZone, countIncidents, countResolved, incidentDetail, incidentsByIds, incidentsWithWords, periodLabel, rankedIncidents, relatedIncidents,
  type IncidentFilters } from "@/lib/assistant/incidents";
import { storiesOfDocs, topStories } from "@/lib/assistant/news";
import { currentIncidentIds, hybridSearch } from "@/lib/assistant/lance";
import { PERIODS } from "@/lib/collector/intel";
import { resolveSides } from "@/lib/assistant/compare";
import type { AnswerCard, Dataset, IncidentItem, Scope } from "@/lib/assistant/answer";
import type { Lang } from "@/lib/assistant/lang";
import { orNull } from "@/lib/fallback";

type Period = Scope["period"];
const WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const words = (n: number) => (n <= 10 ? WORD[n] : n.toLocaleString("en-IN"));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NEWS_HOURS: Record<Period, number> = { daily: 36, weekly: 168, monthly: 720, quarterly: 2160 };

export interface FastInput {
  message: string;
  lang: Lang;
  scope: Scope;
  names: RefNames;
  now: string;
  lockDept: string | null;
  ctx: ConversationContext | null;
  /** the place the question names (resolve_place): zone, taluk */
  place: Record<string, any> | null;
}
export interface FastOutput { card: AnswerCard; plan: Record<string, unknown> }

/** "the 10 oldest open complaints", "pending the longest": first reported first */
const OLDEST = /\b(oldest|earliest|longest (pending|open|unresolved)|pending (the )?longest|open (the )?longest)\b/i;

/** "is it resolved?", "has it been closed?": a question answered yes or no ("what is the status?" is not) */
const YES_NO = /^\s*(is|are|has|have|was|were|did|does|do)\b|\b(yet|or not)\s*\??\s*$/i;

/** The period a question names, else null. */
export function periodNamed(text: string): Period | null {
  // "open for more than 7 days": how long something has been open, not the period asked about
  const t = text.toLowerCase().replace(/\b(for\s+)?(more than|longer than|older than|beyond)\s+(\d+|seven|thirty|an?|one|two|three)\s+(days?|weeks?|months?)\b|\bfor\s+over\s+(\d+|seven|thirty|an?|one|two|three)\s+(days?|weeks?|months?)\b/g, " ");
  if (/\b(today'?s?|tonight|(last|past|previous) 24 ?(h|hrs?|hours?)|24 ?(hrs?|hours)|past day|this morning|yesterday|recent(ly)?|latest|right now|currently|just now|innaiki|innaikku)\b|இன்று|இன்றைய|நேற்று|நேற்றைய/.test(t)) return "daily";
  if (/\b(this|last|past|indha|intha|pona) week\b|\b7 days\b|\bweekly\b|vaaram|வாரம்/.test(t)) return "weekly";
  if (/\b(this|last|past) month\b|\b30 days\b|\bmonthly\b|maasam|மாதம்/.test(t)) return "monthly";
  if (/\b(this|last|past) quarter\b|\b90 days\b|\bquarterly\b/.test(t)) return "quarterly";
  return null;
}

/** `decided`: the intent the router understood; without it (no model) the rules read the message. */
/** A count said in Tamil or Tanglish; null for English. `where` is the English place phrase (" in Velachery (Adyar zone)"). */
export function countInLanguage(lang: string, c: { n: number; prev: number; severe: number; open: number; dead: number; kind: string; period: string; where: string;
  measure?: "deaths" | "complaints" | "injured" | null; complaints?: number; openOnly?: boolean; zoneTa?: string | null }):
  { headline: string; text: string } | null {
  if (lang !== "ta" && lang !== "tanglish") return null;
  const place = c.where.replace(/^\s*in\s+/i, "").trim();
  const days = c.period.match(/(\d+)\s*days?/)?.[1], hours = /24 hours/.test(c.period), yday = /previous day|yesterday/.test(c.period);
  const f = (v: number) => v.toLocaleString("en-IN");
  if (lang === "tanglish") {
    const when = yday ? "netru" : hours ? "kadandha 24 mani neram-la" : days ? `kadandha ${days} naal-la` : c.period;
    const at = place ? `${place}-la ` : "";
    if (c.measure === "deaths")
      return { headline: `${f(c.dead)} per uyirizhappu · ${when}`, text: `${at}${when} ${c.kind}-la ${f(c.dead)} per uyirizhandhaanga (${f(c.n)} ${c.kind}, ${f(c.severe)} severe).` };
    if (c.measure === "complaints")
      return { headline: `${f(c.complaints ?? 0)} ${c.openOnly ? "open " : ""}complaints · ${when}`,
        text: `${at}${when} ${f(c.complaints ?? 0)} ${c.openOnly ? "open " : ""}citizen complaints irukku (${f(c.n)} ${c.kind}; ${f(c.open)} innum open).` };
    const text = `${at}${when} ${f(c.n)} ${c.kind} report aagirukku${c.prev ? ` (munnadi ${f(c.prev)})` : ""}: ${f(c.severe)} severe, ${f(c.open)} innum open${c.dead ? `, ${f(c.dead)} per uyirizhappu` : ""}.`;
    return { headline: `${f(c.n)} ${c.kind} · ${when}`, text };
  }
  const when = yday ? "நேற்று" : hours ? "கடந்த 24 மணி நேரத்தில்" : days ? `கடந்த ${days} நாட்களில்` : c.period;
  const kind = tamilKind(c.kind);
  // "Adyar zone" in a Tamil sentence: the zone's Tamil name ("அடையாறு மண்டல"), when the place is just the zone
  const zoneTa = c.zoneTa && /^[A-Za-z .-]+ zone$/.test(place) ? `${c.zoneTa} மண்டல` : null;
  const at = zoneTa ? ` ${zoneTa} பகுதியில்` : place ? ` ${place} பகுதியில்` : "";
  if (c.measure === "deaths")
    return { headline: `${f(c.dead)} உயிரிழப்பு · ${when}`, text: `${when}${at} ${kind} காரணமாக ${f(c.dead)} பேர் உயிரிழந்துள்ளனர் (${f(c.n)} ${kind}, ${f(c.severe)} கடுமையானவை).` };
  if (c.measure === "complaints")
    return { headline: `${f(c.complaints ?? 0)} ${c.openOnly ? "நிலுவையிலுள்ள " : ""}புகார்கள் · ${when}`,
      text: `${when}${at} ${f(c.complaints ?? 0)} ${c.openOnly ? "நிலுவையிலுள்ள " : ""}குடிமக்கள் புகார்கள் உள்ளன (${f(c.n)} ${kind}; ${f(c.open)} இன்னும் நிலுவையில்).` };
  const text = `${when}${at} ${f(c.n)} ${kind} பதிவாகியுள்ளன${c.prev ? ` (முந்தைய காலத்தில் ${f(c.prev)})` : ""}: ${f(c.severe)} கடுமையானவை, ${f(c.open)} இன்னும் நிலுவையில்${c.dead ? `, ${f(c.dead)} உயிரிழப்பு` : ""}.`;
  return { headline: `${f(c.n)} ${kind} · ${when}`, text };
}

/** The incident kind in Tamil, for the common topics; anything else stays as written. */
const TA_KIND: [RegExp, string][] = [
  [/road accidents?/, "சாலை விபத்துகள்"], [/murders?/, "கொலைகள்"], [/fires?/, "தீ விபத்துகள்"], [/flooding incidents?|flooding/, "வெள்ள பாதிப்புகள்"],
  [/garbage incidents?|garbage/, "குப்பை புகார்கள்"], [/theft and robbery( incidents?)?/, "திருட்டு, கொள்ளை சம்பவங்கள்"], [/crime( incidents?)?/, "குற்றச் சம்பவங்கள்"],
  [/drinking water( incidents?)?/, "குடிநீர் பிரச்சினைகள்"], [/drainage and sewage( incidents?)?/, "கழிவுநீர் பிரச்சினைகள்"], [/dengue and disease( incidents?)?/, "டெங்கு, நோய் பாதிப்புகள்"],
  [/^incidents?$/, "சம்பவங்கள்"]
];
function tamilKind(kind: string): string {
  const k = kind.toLowerCase().trim();
  return TA_KIND.find(([re]) => re.test(k))?.[1] ?? kind;
}

export async function fastPath(i: FastInput, decided?: Detected): Promise<FastOutput | null> {
  const d = decided ?? detectIntent(i.message, i.ctx);
  // pictures of an earlier incident list: the same incidents on a map or in a table
  if ((d.intent === "MAP" || d.intent === "TABLE") && i.ctx?.resultIds?.length && ["incident_list", "map", "table"].includes(String(i.ctx.lastResponseType)))
    return pictureOfList(i, d);
  // "show it as a chart" after a count: the same count, zone by zone (or kind by kind within one zone)
  const countChart = d.intent === "CHART" && i.ctx?.lastIntent === "INCIDENT_COUNT" && i.ctx?.lastResponseType === "kpi";
  if (!HANDLED.includes(d.intent) && !countChart) return null;

  // filters: a refinement starts from the previous answer's; a new question from the console's; the question's own words win
  const prev = d.refinement ? i.ctx?.activeFilters ?? null : null;
  // "open for more than a week" names an age, not a period: the router's "week" is dropped unless the words name a period too
  const named = d.minOpenDays && !periodNamed(i.message) ? null : d.period ?? periodNamed(i.message);
  const f: ActiveFilters = {
    ...(prev ?? filtersOf(i.scope)),
    // news without a period: the last 7 days (the whole quarter would bury this week's stories); everything else: the scope's period (the quarter)
    period: named ?? prev?.period ?? (d.intent.startsWith("NEWS") ? "weekly" : i.scope.period),
    topic: d.topic?.key ?? (d.refinement ? prev?.topic ?? null : null),
    sev: d.sev ?? (d.refinement ? prev?.sev ?? null : null),
    openOnly: d.openOnly || (d.refinement && !!prev?.openOnly),
    overdue: !!d.overdue || (d.refinement && !!prev?.overdue)
  };
  if (i.place?.zone != null && !i.place?.asked_for_taluk) (f.zone = Number(i.place.zone), f.taluk = null);
  if (i.place?.asked_for_taluk && i.place?.taluk_named?.code) (f.taluk = String(i.place.taluk_named.code), f.zone = null);
  if (/\b(whole district|all zones|district[- ]wide|everywhere)\b/i.test(i.message)) (f.zone = null, f.taluk = null);
  // a department the question names ("open complaints for Metrowater", "police cases this week"); never over an officer's own
  const deptNamed = !i.lockDept ? deptFromWords(i.message, i.names) : null;
  if (deptNamed) f.dept = deptNamed.code;
  if (i.lockDept) f.dept = i.lockDept;
  // one ward ("ward 106"): narrower than its zone
  const ward = i.place?.ward_asked && i.place?.ward != null ? Number(i.place.ward) : null;
  const topic: Topic | null = d.topic ?? (f.topic && prev ? topicByKey(f.topic) ?? { key: f.topic, label: f.topic, cats: catsOf(f, i) ?? [] } : null);
  // the question's own window ("last 10 days") and a locality inside the zone ("Velachery"), never rounded to the console's
  // period or widened to the whole zone
  const custom = customWindow(i.message, i.now);
  const zoneName = f.zone != null ? i.names.zones.get(f.zone)?.name ?? null : null;
  const locality = i.place?.place && !i.place?.asked_for_taluk && f.zone != null && String(i.place.place).toLowerCase() !== (zoneName ?? "").toLowerCase()
    ? String(i.place.place) : null;
  const card0Notes: string[] = [];
  const inc: IncidentFilters = { period: (custom?.period ?? f.period) as Period, zone: f.zone, taluk: f.taluk, dept: f.dept, cats: topic?.cats ?? (f.cat ? [f.cat] : null),
    sev: f.sev as IncidentFilters["sev"], openOnly: f.openOnly, hours: custom?.hours ?? null, place: ward ? null : locality, offset: custom?.offset ?? 0, overdue: !!f.overdue,
    ward, range: custom?.range ?? null, minOpenDays: d.minOpenDays ?? null };
  // "accidents on OMR": a main road across zones, matched on the incident's place and title
  const road = roadNamed(i.message);
  if (road) (inc.roads = road.like, card0Notes.push(`${road.label}: incidents whose place or title names the road.`));
  if (d.minOpenDays) card0Notes.push(`Only incidents still open more than ${d.minOpenDays} days after they were first reported.`);
  // the scope line names what was counted: a topic's own category when it has one, else the topic itself ("Drain works site
  // safety" once headed a count of 859 drainage incidents, the router's category beside the topic the rules counted)
  const scopeCat = topic ? (topic.cats.length === 1 ? topic.cats[0] : null) : f.cat ?? null;
  const scope: Scope = { period: inc.period, zone: f.zone ?? null, dept: f.dept ?? null, cat: scopeCat, taluk: f.taluk ?? null };
  const card = baseCard(i.lang, scope, describeScope(scope, i.names, i.lang, i.now), i.now);
  if (road) {
    const segs = card.scopeLine.split(" · ");
    segs[1] = road.label;
    card.scopeLine = segs.join(" · ");
  }
  if (topic && topic.cats.length > 1) {
    const segs = card.scopeLine.split(" · ");
    segs.splice(Math.max(1, segs.length - 1), 0, cap(topic.label));
    card.scopeLine = segs.join(" · ");
  }
  card.sources.assumptions.push(...card0Notes);
  // what the answer calls the place: a ward by its number, a locality by its name
  const spot = ward ? `Ward ${ward}` : locality;
  if (custom || spot) {
    const segs = card.scopeLine.split(" · ");
    if (custom) segs[0] = cap(custom.label);
    if (spot && zoneName) segs[1] = `${spot}, in ${segs[1] ?? `${zoneName} zone`}`;
    card.scopeLine = segs.join(" · ");
    if (ward) card.sources.assumptions.push(`Ward ${ward} is in ${zoneName} zone: incidents recorded in that ward.`);
    else if (locality) card.sources.assumptions.push(`"${locality}" is a locality in ${zoneName} zone: incidents whose place names it.`);
  }
  if (deptNamed?.alt) {
    card.caveats.push(deptNamed.alt.note);
    card.chips = [...deptNamed.alt.chips, ...(card.chips ?? [])].slice(0, 4);
  }
  if (custom?.note) card.caveats.push(custom.note);
  const pl = (p: Period) => custom?.label ?? periodLabel(p);
  // "in the last 7 days", "in September 2026", "since 1 Oct 2026"
  const inP = (p: Period) => { const l = pl(p); return /^since\b/i.test(l) ? l : /^(last|previous|past)\b/i.test(l) ? `in the ${l}` : `in ${l}`; };
  const sw = (road ? ` on ${road.label}` : "")
    + (spot ? ` in ${spot}${zoneName ? ` (${zoneName} zone)` : ""}${scopeWords({ ...scope, zone: null }, i.names)}` : scopeWords(scope, i.names));
  card.intent = d.intent;
  card.sources.verifier = { checked: 0, unmatched: [], regenerated: false, template: true };
  // a taluk outside Chennai district ("power cuts in Tambaram"): said plainly, not "no incidents in Tambaram taluk"
  const outside = f.taluk ? i.names.taluks.get(f.taluk)
    : i.place?.zone == null ? [...i.names.taluks.values()].find((t) => t.inDistrict === false && new RegExp(`\\b${t.name.replace(/[^A-Za-z ]/g, "")}\\b`, "i").test(i.message)) ?? null : null;
  if (outside && outside.inDistrict === false && ["INCIDENT_LIST", "INCIDENT_COUNT", "PRIORITY_INCIDENT_LIST", "CATEGORY_RANKING"].includes(d.intent)) {
    card.headline = `${outside.name} is outside Chennai district`;
    card.answerMarkdown = `${outside.name} is not in Chennai district${outside.note ? ` (${outside.note.replace(/\.$/, "")})` : ""}, so the console holds no records for it. Ask about a place in Chennai district, or the whole district.`;
    card.voiceSummary = card.answerMarkdown;
    card.display = "text";
    card.responseType = "text";
    card.scopeLine = "";
    return { card, plan: { intent: d.intent, fastPath: true, filters: f, outside: f.taluk } };
  }
  card.sources.assumptions.push(`Read as ${d.intent.toLowerCase().replace(/_/g, " ")}: ${d.because}.`);
  const what = topic?.label ?? "";
  const ctxBase: ConversationContext = { lastIntent: d.intent, activeFilters: f, resultIds: i.ctx?.resultIds, storyIds: i.ctx?.storyIds,
    resultTitles: i.ctx?.resultTitles, storyTitles: i.ctx?.storyTitles, selectedTitle: i.ctx?.selectedTitle ?? null,
    selectedIncidentId: i.ctx?.selectedIncidentId ?? null, selectedNewsStoryId: i.ctx?.selectedNewsStoryId ?? null };
  const plan = { intent: d.intent, fastPath: true, filters: f, n: d.n };

  switch (d.intent) {
    case "PRIORITY_INCIDENT_LIST":
    case "INCIDENT_LIST": {
      // a refinement ("only Adyar") keeps the number the previous question asked for
      const n = d.n ?? (d.refinement ? i.ctx?.n ?? null : null) ?? (d.intent === "INCIDENT_LIST" ? 8 : 5);
      // a topic narrower than its category ("murder" within violent crime): the incidents that are about it, by meaning
      // "which one is most serious?": the highest priority among the incidents the last answer listed, not a new search (it once
      // added "severe", found none in the week and widened to a month, naming an incident that was not in the list)
      const picked = d.because === PICK_FROM_LIST && i.ctx?.resultIds?.length
        ? [...await incidentsByIds(i.ctx.resultIds)].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0)).slice(0, n) : null;
      const nar = picked ? { items: picked, total: picked.length, period: inc.period, widened: false }
        : topic?.narrow ? await narrowed(topic, inc, i.now, n, i.message).catch(orNull("fastpath:127")) : null;
      if (nar && !picked) {
        card.sources.tools.push({ name: "search_records", args: { text: topic!.narrow, ...inc }, ms: 0 });
        card.sources.assumptions.push(`"${topic!.label}" is narrower than its category, so the incidents were found by meaning and keywords within it, or by a recorded death.`);
      }
      const oldest = d.intent === "INCIDENT_LIST" && OLDEST.test(i.message);
      const r = nar ?? await rankedIncidents(inc, i.now, n, d.intent === "PRIORITY_INCIDENT_LIST" ? "priority" : oldest ? "oldest" : "recent");
      if (r.widened) {
        card.scope = { ...scope, period: r.period };
        card.scopeLine = describeScope(card.scope, i.names, i.lang, i.now);
      }
      const aged = d.minOpenDays ? ` open for more than ${d.minOpenDays} days` : "";
      // (the filters in force, not only the follow-up's own words: "only in Adyar" after "severe incidents today" kept severe but its headline dropped it)
      const kindOf = (n: number) => `${f.overdue ? "overdue " : f.openOnly && !aged ? "open " : ""}${f.sev === "Severe" ? "severe " : ""}${countNoun(what, n)}${aged}`;
      const kind = kindOf(r.items.length);
      card.responseType = "incident_list";
      card.incidents = r.items;
      card.headline = d.intent === "PRIORITY_INCIDENT_LIST" ? `Top ${r.items.length} priority ${kind} · ${pl(r.period)}` : `${cap(kind)} · ${pl(r.period)}`;
      card.answerMarkdown = !r.items.length ? `No ${kind} ${inP(r.period)}${sw}.`
        : d.intent === "PRIORITY_INCIDENT_LIST"
          ? r.items.length === 1 ? `This is the highest-priority ${kind} recorded ${inP(r.period)}${sw}, by the console's priority score.`
            : `These are the ${words(r.items.length)} highest-priority ${kind} recorded ${inP(r.period)}${sw}, ranked by the console's priority score.`
          // all of them fit: say how many ("The flooding incidents in Adyar zone" left the count out)
          // (the total first: "The eight newest of 9 murders" was read by the AI writer as "eight of nine murders this week")
          : r.items.length === r.total ? `The ${r.total === 1 ? "only " : `${words(r.total)} `}${kind} ${inP(r.period)}${sw}.`
            : `${r.total.toLocaleString("en-IN")} ${kindOf(r.total)} ${inP(r.period)}${sw}; the ${words(r.items.length)} ${oldest ? "oldest" : "newest"} are listed.`;
      if (picked?.length && i.lang === "en") {
        card.headline = `Most serious of the ${words(i.ctx!.resultIds!.length)} listed: ${picked[0].title}`.slice(0, 160);
        card.answerMarkdown = `Of the ${words(i.ctx!.resultIds!.length)} incidents in the last answer, this one ranks highest by the console's priority score.`;
      }
      // a Tamil or Tanglish question, answered in it when the model is out ("இன்றைய முக்கிய பிரச்சனைகள்" once got the English template)
      if (i.lang !== "en") {
        const when = { daily: { ta: "கடந்த 24 மணி நேரத்தில்", tanglish: "kadandha 24 mani neram-la" }, weekly: { ta: "கடந்த 7 நாட்களில்", tanglish: "kadandha 7 naal-la" },
          monthly: { ta: "கடந்த 30 நாட்களில்", tanglish: "kadandha 30 naal-la" }, quarterly: { ta: "கடந்த 90 நாட்களில்", tanglish: "kadandha 90 naal-la" } }[r.period as Period]?.[i.lang] ?? pl(r.period);
        const top = d.intent === "PRIORITY_INCIDENT_LIST";
        const kindTa = tamilKind(countNoun(what, r.items.length));
        card.headline = i.lang === "ta" ? `${top ? "முக்கியமான " : ""}${r.items.length} ${kindTa} · ${when}` : `${top ? "Mukkiyamaana " : ""}${r.items.length} ${countNoun(what, r.items.length)} · ${when}`;
        card.answerMarkdown = !r.items.length ? (i.lang === "ta" ? `${when} ${kindTa} எதுவும் பதிவாகவில்லை.` : `${when} ${countNoun(what, 2)} edhuvum record aagala.`)
          : i.lang === "ta" ? `${when} பதிவான ${top ? "மிக முக்கியமான " : "புதிய "}${r.items.length} ${kindTa}${r.total > r.items.length ? ` (மொத்தம் ${r.total.toLocaleString("en-IN")})` : ""}:\n\n`
            + r.items.map((x, k) => `${k + 1}. **${x.title}** (${[x.location, x.zone].filter(Boolean).join(", ")})`).join("\n")
          : `${when} report aana ${top ? "romba mukkiyamaana " : "pudhu "}${r.items.length} ${countNoun(what, r.items.length)}${r.total > r.items.length ? ` (motham ${r.total.toLocaleString("en-IN")})` : ""}:\n\n`
            + r.items.map((x, k) => `${k + 1}. **${x.title}** (${[x.location, x.zone].filter(Boolean).join(", ")})`).join("\n");
      }
      // a short list is named in the answer itself, with what makes each one stand out, not only shown below it
      if (r.items.length && r.items.length <= 5 && i.lang === "en")
        card.answerMarkdown += "\n\n" + r.items.map((x, k) => {
          const where = [x.location, x.zone].filter(Boolean).filter((v, j, a) => a.indexOf(v) === j).join(", ");
          const why = x.dead ? `${x.dead} ${x.dead === 1 ? "death" : "deaths"}` : x.priorityReasons[0] ?? "";
          return `${k + 1}. **${x.title}**${where ? ` (${where})` : ""}: ${x.severity.toLowerCase()}, ${x.status.toLowerCase()}${why ? `; ${why.replace(/\.$/, "")}` : ""}.`;
        }).join("\n");
      if (r.widened) card.caveats.push(`Fewer than ${n} ${inP(inc.period)}, so this covers the ${pl(r.period)}.`);
      listData(card, r.items);
      // "show me the map of severe incidents this week": the same list, drawn where they are
      if (/\bmaps?\b|on the map|வரைபட/i.test(i.message) && r.items.some((x) => x.lat != null)) {
        card.display = "map";
        card.visualAsked = true;
        card.chart = spec({ type: "map_points", dataset: "incidents", x: "title", y: ["priority"], title: card.headline, sort: "none", highlight: "none" });
      }
      card.context = { ...ctxBase, lastResponseType: "incident_list", resultIds: r.items.map((x) => x.incidentId), resultTitles: r.items.map((x) => x.title),
        storyIds: undefined, storyTitles: undefined, selectedIncidentId: r.items.length === 1 ? r.items[0].incidentId : null,
        selectedTitle: r.items.length === 1 ? r.items[0].title : null, n, activeFilters: { ...f, period: r.period } };
      card.sources.tools.push({ name: d.intent === "PRIORITY_INCIDENT_LIST" ? "priority_incidents" : "recent_incidents", args: { ...inc, n }, ms: 0 });
      break;
    }
    case "INCIDENT_COUNT": {
      // "how many were resolved yesterday": counted by when they were closed, not when they were reported
      if (d.resolved) {
        const r = await countResolved(inc, i.now);
        const kind = countNoun(what, r.n);
        card.responseType = "kpi";
        card.display = "kpi";
        card.visualAsked = true;
        card.headline = `${r.n.toLocaleString("en-IN")} ${kind} resolved · ${pl(inc.period)}`;
        card.answerMarkdown = `${r.n.toLocaleString("en-IN")} ${kind} ${r.n === 1 ? "was" : "were"} closed as resolved ${inP(inc.period)}${sw}`
          + `${` (${r.prev.toLocaleString("en-IN")} in the period before)`}${r.severe ? `, ${r.severe} of them severe` : ""}`
          + `${r.late ? `; ${r.late} ${r.late === 1 ? "was" : "were"} closed after the deadline` : ""}.`;
        card.kpis = [{ label: "Resolved", value: r.n, prev: r.prev, tone: "low" }, ...(r.severe ? [{ label: "Severe", value: r.severe, tone: "sev" as const }] : []),
          ...(r.late ? [{ label: "Closed late", value: r.late }] : [])];
        card.caveats.push("Counted by when each incident was closed as resolved, in the department records.");
        card.context = { ...ctxBase, lastResponseType: "kpi" };
        card.sources.tools.push({ name: "count_resolved", args: { ...inc }, ms: 0 });
        break;
      }
      const c = await countIncidents(inc, i.now);
      const kind = countNoun(what, c.n);
      const fmt = (v: number) => v.toLocaleString("en-IN");
      const P = pl(inc.period);
      card.responseType = "kpi";
      card.display = "kpi";
      card.visualAsked = true;
      // the one-line answer to what was asked first (deaths, complaints, or this period against the one before), then the rest
      const change = (now: number, before: number) => (!before ? "none in the period before" : now === before ? `the same as in the period before`
        : `${now > before ? "up" : "down"} from ${fmt(before)} in the period before`);
      const rest = `${c.severe} severe, ${fmt(c.open)} still open${c.dead && d.measure !== "deaths" ? `, ${c.dead} ${c.dead === 1 ? "death" : "deaths"}` : ""}`;
      if (d.measure === "deaths") {
        const of = what || "incidents";
        card.headline = `${fmt(c.dead)} ${c.dead === 1 ? "death" : "deaths"} in ${of} · ${P}`;
        card.answerMarkdown = c.dead
          ? `**${fmt(c.dead)}** ${c.dead === 1 ? "person died" : "people died"} in ${of} reported ${inP(inc.period)}${sw} (${change(c.dead, c.prevDead)}).`
            + `\n\n- ${fmt(c.n)} ${kind} in all${c.injured ? `, ${fmt(c.injured)} injured` : ""}\n- ${rest}`
          : `No deaths were recorded in ${of} ${inP(inc.period)}${sw}${c.prevDead ? ` (${fmt(c.prevDead)} in the period before)` : ""}. ${fmt(c.n)} ${kind} ${c.n === 1 ? "was" : "were"} reported.`;
        card.caveats.push("Deaths are counted once per incident, as the department records and confirmed news reports give them; a toll that only one outlet reports is held until confirmed.");
      } else if (d.measure === "injured") {
        const of = what || "incidents";
        card.headline = `${fmt(c.injured)} injured in ${of} · ${P}`;
        card.answerMarkdown = `**${fmt(c.injured)}** ${c.injured === 1 ? "person was" : "people were"} injured in ${of} reported ${inP(inc.period)}${sw}`
          + `${c.dead ? `; ${fmt(c.dead)} ${c.dead === 1 ? "person" : "people"} died` : ""}.\n\n- ${fmt(c.n)} ${kind} in all\n- ${rest}`;
      } else if (d.measure === "complaints") {
        const open = d.openOnly;
        const v = open ? c.openComplaints : c.complaints;
        // "pending for more than 30 days": said in the answer, not only in the filter
        const aged = inc.minOpenDays ? ` still open after more than ${inc.minOpenDays} days` : "";
        const label = `${open && !aged ? "open " : ""}citizen ${v === 1 ? "complaint" : "complaints"}${what ? ` about ${what}` : ""}${aged}`;
        card.headline = `${fmt(v)} ${label} · ${P}`;
        card.answerMarkdown = `**${fmt(v)}** ${label} ${inP(inc.period)}${sw}`
          + `${!open && d.vsPrevious ? ` (${change(c.complaints, c.prevComplaints)})` : ""}.`
          + `\n\n- They are about ${fmt(c.n)} ${kind}${d.vsPrevious ? ` (${change(c.n, c.prev)})` : ""}\n- ${rest}`;
      } else if (inc.openOnly || inc.overdue) {
        // "how many are still pending": the open ones, said as open (it once read "1,010 incidents were reported ... 1,010 still open")
        const late = inc.overdue ? "past their deadline" : inc.minOpenDays ? `still open after more than ${inc.minOpenDays} days` : "still open";
        card.headline = `${fmt(c.n)} ${kind} ${late} · ${P}`;
        card.answerMarkdown = `**${fmt(c.n)}** ${kind} reported ${inP(inc.period)}${sw} ${c.n === 1 ? "is" : "are"} ${late}`
          + `${c.severe ? `, ${c.severe} of them severe` : ""}${c.dead ? `; ${c.dead} ${c.dead === 1 ? "death" : "deaths"} recorded in them` : ""}.`;
      } else {
        card.headline = `${fmt(c.n)} ${kind} · ${P}`;
        card.answerMarkdown = `${fmt(c.n)} ${kind} ${c.n === 1 ? "was" : "were"} reported ${inP(inc.period)}${sw}`
          + `${c.prev ? ` (${d.vsPrevious ? change(c.n, c.prev) : `${fmt(c.prev)} in the period before`})` : ""}: ${rest}.`;
      }
      // a question in Tamil or Tanglish is answered in it ("Velachery la indha week evlo accidents?")
      const local = countInLanguage(i.lang, { n: c.n, prev: c.prev, severe: c.severe, open: c.open, dead: c.dead, kind, period: P, where: sw,
        zoneTa: f.zone != null ? i.names.zones.get(f.zone)?.nameTa ?? null : null,
        measure: d.measure ?? null, complaints: d.openOnly ? c.openComplaints : c.complaints, openOnly: d.openOnly });
      if (local) { card.headline = local.headline; card.answerMarkdown = local.text; card.voiceSummary = local.text; }
      card.kpis = d.measure === "deaths"
        ? [{ label: "Deaths", value: c.dead, prev: c.prevDead, tone: c.dead ? "sev" : undefined }, { label: "Incidents", value: c.n, prev: c.prev, tone: "info" },
          ...(c.injured ? [{ label: "Injured", value: c.injured }] : [])]
        : d.measure === "injured"
          ? [{ label: "Injured", value: c.injured, tone: c.injured ? "high" as const : undefined }, { label: "Incidents", value: c.n, prev: c.prev, tone: "info" as const },
            ...(c.dead ? [{ label: "Deaths", value: c.dead, tone: "sev" as const }] : [])]
        : d.measure === "complaints"
          ? [{ label: d.openOnly ? "Open complaints" : "Complaints", value: d.openOnly ? c.openComplaints : c.complaints, prev: d.openOnly ? undefined : c.prevComplaints, tone: "info" },
            { label: "Incidents", value: c.n, prev: c.prev }, { label: "Still open", value: c.open }]
          : [{ label: "Reported", value: c.n, prev: c.prev, tone: "info" }, { label: "Severe", value: c.severe, tone: c.severe ? "sev" : undefined },
            { label: "Still open", value: c.open }, ...(c.dead ? [{ label: "Deaths", value: c.dead, tone: "sev" as const }] : [])];
      card.context = { ...ctxBase, lastResponseType: "kpi" };
      card.sources.tools.push({ name: "count_incidents", args: { ...inc }, ms: 0 });
      break;
    }
    case "COMPARISON": {
      // places side by side, each counted with the same topic, period and department
      if (!d.sides?.length) return null;
      const sides = await resolveSides(d.sides);
      const inside = sides.filter((s) => !s.outside);
      if (!inside.length) return null;
      const rows = await Promise.all(inside.map(async (s) => {
        const zn = s.zone != null ? i.names.zones.get(s.zone)?.name ?? `Zone ${s.zone}` : null;
        const locality = s.locality && s.locality.toLowerCase() !== (zn ?? "").toLowerCase() ? s.locality : null;
        const c = await countIncidents({ ...inc, zone: s.zone, taluk: null, place: locality }, i.now);
        const label = locality ? `${locality} (${zn} zone)` : `${zn} zone`;
        return { label, ...c };
      }));
      // the measure asked: citizen complaints ("open complaints in Anna Nagar compared to Teynampet") or incidents; open ones
      // when the question says open (it once printed "211 reported (21 in the period before)" for open counts)
      const complaints = d.measure === "complaints", open = !!inc.openOnly;
      const v = (r: (typeof rows)[number]) => (complaints ? (open ? r.openComplaints : r.complaints) : r.n);
      const kind = complaints ? `${open ? "open " : ""}citizen complaints` : `${open ? "open " : ""}${what ? `${what} ` : ""}incidents`;
      const sorted = [...rows].sort((a, b) => v(b) - v(a));
      const lead = sorted[0], next = sorted[1];
      const out = sides.filter((s) => s.outside);
      const fmtN = (x: number) => x.toLocaleString("en-IN");
      const line = (r: (typeof rows)[number]) => (complaints
        ? `**${r.label}**: ${fmtN(v(r))} ${kind}; they are about ${fmtN(r.n)} incidents, ${fmtN(r.open)} still open`
        : open ? `**${r.label}**: ${fmtN(r.n)} still open, ${r.severe} severe`
          : `**${r.label}**: ${fmtN(r.n)} reported (${fmtN(r.prev)} in the period before), ${fmtN(r.open)} still open, ${r.severe} severe`)
        + `${r.dead ? `, ${r.dead} ${r.dead === 1 ? "death" : "deaths"}` : ""}`;
      const withPrev = !complaints && !open;
      card.responseType = "chart";
      card.display = "chart";
      card.visualAsked = true;
      card.datasets = [{ id: "sides", title: `${cap(kind)} by place`, tab: "Places", hasPrev: withPrev,
        fields: [{ key: "label", label: "Place", kind: "category" }, { key: "v", label: cap(kind), kind: "value", format: "integer" },
          ...(withPrev ? [{ key: "v_prev", label: "Period before", kind: "value" as const, format: "integer" as const }] : []),
          { key: "open", label: "Still open", kind: "value", format: "integer" }, { key: "severe", label: "Severe", kind: "value", format: "integer" }],
        rows: rows.map((r) => ({ label: r.label, v: v(r), ...(withPrev ? { v_prev: r.prev } : {}), open: r.open, severe: r.severe })) }];
      card.chart = spec({ type: rows.length <= 3 ? "bar" : "horizontal_bar", dataset: "sides", x: "label", y: ["v"], compare: withPrev, highlight: "max",
        title: next ? (v(lead) === v(next) ? "Level with each other" : `${lead.label} has more`) : `${lead.label}` });
      card.headline = next ? (v(lead) === v(next) ? `${lead.label} and ${next.label} level: ${fmtN(v(lead))} ${kind} each`
        : `${lead.label}: ${fmtN(v(lead))} ${kind}, against ${fmtN(v(next))}`) : `${lead.label}: ${fmtN(v(lead))} ${kind}`;
      card.answerMarkdown = [
        next && v(lead) !== v(next) ? `${lead.label} had more ${kind} than ${next.label} ${inP(inc.period)}.` : next ? `The places are level ${inP(inc.period)}.` : "",
        ...rows.map(line),
        out.length ? `${out.map((s) => s.asked.replace(/^./, (c) => c.toUpperCase())).join(" and ")} ${out.length === 1 ? "is" : "are"} not a place in Chennai district${out.some((s) => /tambaram|avadi|chengalpattu|kanchipuram|tiruvallur|poonamallee/i.test(s.asked)) ? " (it falls in a neighbouring district)" : ""}, so ${out.length === 1 ? "it is" : "they are"} not covered by this data.` : ""
      ].filter(Boolean).join("\n\n");
      card.scopeLine = [cap(pl(inc.period)), [...rows.map((r) => r.label), ...out.map((s) => s.asked)].join(" vs "), what ? cap(what) : null, card.scopeLine.split(" · ").pop()].filter(Boolean).join(" · ");
      if (out.length) card.caveats.push(`Not in Chennai district: ${out.map((s) => s.asked).join(", ")}.`);
      card.context = { ...ctxBase, lastResponseType: "chart" };
      card.sources.tools.push({ name: "compare_places", args: { ...inc, sides: d.sides }, ms: 0 });
      break;
    }
    case "CHART": {
      const byKind = inc.zone != null || !!inc.taluk || !!inc.place || !!inc.ward;
      const rows = byKind
        ? (await categoryRanking(inc, i.now, 10)).map((r) => ({ label: r.label, n: r.n, n_prev: r.prev, severe: r.severe }))
        : (await countByZone(inc, i.now)).map((r) => ({ label: r.name, n: r.n, n_prev: r.prev, severe: r.severe }));
      const kind = what ? cap(what) : "Incidents";
      card.responseType = "chart";
      card.display = "chart";
      card.visualAsked = true;
      card.datasets = [{ id: "split", title: `${kind} by ${byKind ? "kind" : "zone"}`, tab: byKind ? "Kinds" : "Zones", hasPrev: true,
        fields: [{ key: "label", label: byKind ? "Kind" : "Zone", kind: "category" }, { key: "n", label: "Reported", kind: "value", format: "integer" },
          { key: "n_prev", label: "Period before", kind: "value", format: "integer" }, { key: "severe", label: "Severe", kind: "value", format: "integer" }],
        rows }];
      card.chart = spec({ type: "horizontal_bar", dataset: "split", x: "label", y: ["n"], compare: true, sort: "desc", highlight: "max",
        title: rows[0] ? `${rows[0].label} has the most: ${rows[0].n.toLocaleString("en-IN")}` : "None in this period" });
      card.headline = rows[0] ? `${kind} by ${byKind ? "kind" : "zone"} · ${pl(inc.period)}: ${rows[0].label} has the most` : `No ${what || "incidents"} ${inP(inc.period)}${sw}`;
      card.answerMarkdown = rows.length
        ? rows.slice(0, 5).map((r, k) => `${k + 1}. **${r.label}**: ${r.n.toLocaleString("en-IN")} (${r.n_prev.toLocaleString("en-IN")} the period before)`).join("\n")
        : `No ${what || "incidents"} ${inP(inc.period)}${sw}.`;
      card.context = { ...ctxBase, lastIntent: "INCIDENT_COUNT", lastResponseType: "kpi" };
      card.sources.tools.push({ name: byKind ? "category_ranking" : "count_by_zone", args: { ...inc }, ms: 0 });
      break;
    }
    case "CATEGORY_RANKING": {
      const n = d.n ?? 5;
      const rows = await categoryRanking(inc, i.now, n);
      const ds: Dataset = { id: "kinds", title: `${what ? cap(what) : "Incidents"} by kind`, tab: "Kinds",
        fields: [{ key: "label", label: "Kind", kind: "category" }, { key: "n", label: "Reported", kind: "value", format: "integer" },
          { key: "n_prev", label: "Period before", kind: "value", format: "integer" }, { key: "severe", label: "Severe", kind: "value", format: "integer" }],
        rows: rows.map((r) => ({ label: r.label, n: r.n, n_prev: r.prev, severe: r.severe })), hasPrev: true };
      card.responseType = "category_ranking";
      card.datasets = [ds];
      card.display = "chart";
      card.visualAsked = true;
      // "as a pie chart": shares of the whole, when there are few enough slices to read
      const pie = /\b(pie|donut|doughnut|share|shares|proportion)\b|வட்ட/i.test(i.message) && rows.length <= 6;
      card.chart = spec({ type: pie ? "donut" : "horizontal_bar", dataset: "kinds", x: "label", y: ["n"], compare: !pie, sort: "desc", highlight: "max",
        title: rows[0] ? `${rows[0].label} leads with ${rows[0].n.toLocaleString("en-IN")}` : "No incidents" });
      card.headline = `Top ${rows.length} ${what ? `${what} ` : ""}kinds · ${pl(inc.period)}`;
      card.answerMarkdown = rows.length ? rows.map((r, k) => `${k + 1}. **${r.label}**: ${r.n.toLocaleString("en-IN")} (${r.prev.toLocaleString("en-IN")} the period before)`).join("\n")
        : `No ${what || "incidents"} ${inP(inc.period)}.`;
      card.context = { ...ctxBase, lastResponseType: "category_ranking" };
      card.sources.tools.push({ name: "category_ranking", args: { ...inc, n }, ms: 0 });
      break;
    }
    case "INCIDENT_DETAIL":
    case "INCIDENT_TIMELINE": {
      const id = d.incidentId;
      if (!id) return null;
      const x = await incidentDetail(id, d.intent === "INCIDENT_TIMELINE" ? "all" : d.focus);
      if (!x) return null;
      card.responseType = "incident_detail";
      card.incident = x;
      card.scope = null;
      card.scopeLine = "";
      card.headline = d.intent === "INCIDENT_TIMELINE" ? `How it unfolded: ${x.title}` : x.title;
      card.answerMarkdown = d.focus === "where" ? `It happened at ${[x.location, x.ward != null ? `Ward ${x.ward}` : null, x.zone ? `${x.zone} zone` : null, x.taluk ? `${x.taluk} taluk` : null].filter(Boolean).join(", ") || "an unrecorded place"}.`
        : d.focus === "when" ? `It was first reported on ${x.occurredAt ?? "an unrecorded date"}.`
          : d.focus === "status" ? `${YES_NO.test(i.message) ? `${/resolved|closed|verified|completed/i.test(x.status) ? "Yes" : "No"}, it is` : "It is"} ${x.status.toLowerCase()}${x.deadlineMissed ? ", and **past its deadline**" : ""}${x.closedAt ? `; closed on ${x.closedAt}` : ""}.`
            : d.focus === "who" ? `${x.department ?? "The department"} is responsible${x.officials.length ? `: ${x.officials.map((o) => `${o.name}${o.designation ? `, ${o.designation}` : ""}`).join("; ")}` : ""}.`
              : x.whatHappened;
      card.context = { ...ctxBase, lastResponseType: "incident_detail", selectedIncidentId: id, selectedNewsStoryId: null, selectedTitle: x.title };
      card.sources.incidentIds = [id];
      card.sources.tools.push({ name: "incident_detail", args: { id, focus: d.focus }, ms: 0 });
      break;
    }
    case "INCIDENT_RELATED": {
      const id = d.incidentId ?? i.ctx?.selectedIncidentId;
      if (!id) return null;
      const r = await relatedIncidents(id, d.n ?? 5);
      if (!r) return null;
      card.responseType = "incident_list";
      card.incidents = r.items;
      card.headline = `Incidents like ${r.anchor.title}`;
      card.answerMarkdown = r.items.length
        ? `${cap(words(r.items.length))} ${r.sameKind ? r.anchor.category.toLowerCase() : "related"} incident${r.items.length === 1 ? "" : "s"} ${r.byZone ? `in ${r.anchor.zone ?? "the same zone"}` : `within ${r.km} km of ${r.anchor.location ?? "it"}`} in the 60 days around it, closest first.`
        : `No ${r.anchor.category.toLowerCase()} incident ${r.byZone ? "in the same zone" : `within ${r.km} km`} in the 60 days around it.`;
      listData(card, r.items);
      // "show me the map of severe incidents this week": the same list, drawn where they are
      if (/\bmaps?\b|on the map|வரைபட/i.test(i.message) && r.items.some((x) => x.lat != null)) {
        card.display = "map";
        card.visualAsked = true;
        card.chart = spec({ type: "map_points", dataset: "incidents", x: "title", y: ["priority"], title: card.headline, sort: "none", highlight: "none" });
      }
      card.context = { ...ctxBase, lastResponseType: "incident_list", resultIds: r.items.map((x) => x.incidentId), resultTitles: r.items.map((x) => x.title),
        selectedIncidentId: id, selectedTitle: r.anchor.title };
      card.sources.tools.push({ name: "related_incidents", args: { id }, ms: 0 });
      break;
    }
    case "NEWS_TOP":
    case "NEWS_ONLY_GAPS":
    case "NEWS_DETAIL": {
      // a story described in words ("the Odisha worker news"): found by meaning and keywords among the period's articles
      // (the last 7 days when the question names no period); close runner-ups are named so the Collector can switch
      let others: string[] = [];
      if (d.intent === "NEWS_DETAIL" && !d.storyId && d.find) {
        const hours = d.period ? NEWS_HOURS[d.period] : 168;
        const nowSec = Date.parse(i.now.replace(" ", "T") + "+05:30") / 1000;
        const found = (await hybridSearch("news", d.find, { since: nowSec - hours * 3600 }, 8).catch(orNull("fastpath:305"))) ?? [];
        const keys = await storiesOfDocs(found.map((x) => String(x.id)));
        if (!keys.length) {
          card.responseType = "news_list";
          card.stories = [];
          card.headline = "No matching story";
          card.answerMarkdown = `No Chennai news story about "${d.find}" in the ${hours <= 36 ? "last 36 hours" : hours === 168 ? "last 7 days" : periodLabel(d.period!)}.`;
          card.scopeLine = "Chennai news";
          card.context = { ...ctxBase, lastResponseType: "news_list" };
          card.sources.tools.push({ name: "find_news_story", args: { text: d.find, hours }, ms: 0 });
          break;
        }
        d.storyId = keys[0];
        // runner-ups only when nearly as close in meaning as the story shown (a shared word such as "Odisha" is not enough)
        const firstTitle = String(found[0]?.rec.title ?? "");
        const top = found[0]?.sim ?? null;
        others = found.filter((x) => top != null && x.sim != null && x.sim >= top - 0.02 && x.sim >= 0.86)
          .map((x) => String(x.rec.title)).filter((t, k, a) => t !== firstTitle && a.indexOf(t) === k).slice(0, 2);
        card.sources.tools.push({ name: "find_news_story", args: { text: d.find, hours }, ms: 0 });
        card.sources.assumptions.push(`Found by meaning and keywords: "${d.find}"${d.period ? "" : " (last 7 days)"}.`);
      }
      const one = d.intent === "NEWS_DETAIL" && d.storyId;
      const hours = d.intent === "NEWS_ONLY_GAPS" ? Math.max(NEWS_HOURS[f.period as Period], 168) : NEWS_HOURS[f.period as Period];
      const r = await topStories({ hours, topic, zone: f.zone ?? null, gapsOnly: d.intent === "NEWS_ONLY_GAPS" }, i.now, one ? 1 : d.n ?? 6, one ? [d.storyId!] : undefined);
      card.responseType = one ? "news_detail" : "news_list";
      card.stories = r.stories;
      const span = hours <= 36 ? "last 36 hours" : periodLabel(f.period as Period);
      card.headline = one ? r.stories[0]?.headline ?? "Story not found"
        : d.intent === "NEWS_ONLY_GAPS" ? `In the news, no department record · ${span}` : `${topic ? `News about ${topic.label}` : "Top district news"} · ${span}`;
      card.answerMarkdown = one ? r.stories[0]?.summary ?? "That story is no longer in the news window."
        // the stories themselves first (a summary, not a description of the list), then how they were chosen
        : r.stories.length ? `${r.stories.slice(0, 3).map((s, k) => `${k === 0 ? "The biggest story: " : k === 1 ? ". Also: " : "; "}**${s.headline.replace(/\s+-\s+[^-]{2,40}$/, "").replace(/\*/g, "")}**${s.sourceCount > 1 ? ` (${s.sourceCount} outlets)` : ""}`).join("")}.`
          + ` ${cap(words(r.stories.length))} ${r.stories.length === 1 ? "story" : "stories"}${r.candidates > r.stories.length ? ` of ${r.candidates.toLocaleString("en-IN")}` : ""} shown, ranked by severity, coverage, recency and whether a department has it; reports of the same event are grouped.`
          : `No ${topic ? `${topic.label} ` : ""}story in Chennai news in the ${span}.`;
      card.scopeLine = `${cap(span)}${f.zone ? ` · ${i.names.zones.get(f.zone)?.name ?? `Zone ${f.zone}`}` : ""} · Chennai news`;
      card.context = { ...ctxBase, lastResponseType: card.responseType, storyIds: one ? i.ctx?.storyIds : r.stories.map((s) => s.storyId),
        storyTitles: one ? i.ctx?.storyTitles : r.stories.map((s) => s.headline), selectedNewsStoryId: one ? r.stories[0]?.storyId ?? d.storyId : null,
        selectedIncidentId: one ? r.stories[0]?.matchedIncidentId ?? null : ctxBase.selectedIncidentId, selectedTitle: one ? r.stories[0]?.headline ?? null : null,
        resultIds: i.ctx?.resultIds };
      card.sources.incidentIds = r.stories.map((s) => s.matchedIncidentId).filter(Boolean) as string[];
      card.sources.tools.push({ name: one ? "news_detail" : "top_news", args: { hours, topic: topic?.key ?? null, zone: f.zone ?? null }, ms: 0 });
      card.caveats.push("News rests mostly on headlines and short summaries; open a source for the full report.");
      if (others.length) card.caveats.push(`Other close matches: ${others.map((t) => `"${t}"`).join("; ")}.`);
      break;
    }
    case "ACTION_REQUEST": {
      const ids = d.incidentId ? [d.incidentId] : (await rankedIncidents({ ...inc, openOnly: true }, i.now, 3, "priority")).items.map((x) => x.incidentId);
      const groups = (await Promise.all(ids.map(async (id) => ({ id, a: await actionsFor(id) })))).filter((g) => g.a).map((g) => ({ incidentId: g.id, title: g.a!.title, items: g.a!.items }));
      card.responseType = "actions";
      card.actions = groups;
      card.headline = d.incidentId ? `What to do: ${groups[0]?.title ?? d.incidentId}` : "What needs action now";
      // the steps themselves, not only a pointer to them: who does what, by when (the card lists them all below)
      // a due date as people write it ("due 22 Sep", "overdue since 22 Sep"), not "2026-09-22 00:00:00"
      const due = (t: string | null) => {
        if (!t || !/^\d{4}-\d{2}-\d{2}/.test(t)) return t;
        const day = new Date(`${t.slice(0, 10)}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
        return t.slice(0, 10) < i.now.slice(0, 10) ? `overdue since ${day}` : `due ${day}`;
      };
      const step = (a: { text: string; owner: string | null; due: string | null }) => `${a.text.replace(/\.$/, "")}${a.owner ? ` (${a.owner}${a.due ? `, ${due(a.due)}` : ""})` : a.due ? ` (${due(a.due)})` : ""}`;
      card.answerMarkdown = !groups.length ? "No open step is on record."
        : d.incidentId ? `${groups[0].items.length ? `First: **${step(groups[0].items[0])}**.` : "No step is recorded for this incident yet."}${groups[0].items.length > 1
          ? `\n\nThen:\n${groups[0].items.slice(1, 4).map((a) => `- ${step(a)}`).join("\n")}` : ""}`
          : `The three highest-priority open incidents and the first step for each:\n${groups.map((g) => `- **${g.title}**: ${g.items[0] ? step(g.items[0]) : "no step recorded yet"}`).join("\n")}`;
      card.context = { ...ctxBase, lastResponseType: "text" };
      card.sources.incidentIds = ids;
      card.sources.tools.push({ name: "actions", args: { ids }, ms: 0 });
      break;
    }
    default:
      return null;
  }
  card.voiceSummary = card.answerMarkdown.replace(/\*\*/g, "").split("\n")[0].slice(0, 300);
  card.sources.incidentIds = card.sources.incidentIds.length ? card.sources.incidentIds : (card.incidents ?? []).map((x) => x.incidentId);
  card.sources.refs = [{ kind: "table", name: "incidents" }, ...(card.stories ? [{ kind: "table", name: "documents" }] : [])];
  // the "Test data" label from the records shown (news articles are real; a story's linked incident may not be)
  // (when the check fails the answer is labelled test data: the safe side)
  card.testData = await anySynthetic([...new Set([...card.sources.incidentIds, ...(card.incident ? [card.incident.incidentId] : [])])])
    .catch((e) => { console.warn("[assistant] test-data check failed; labelled test data:", (e as Error).message); return true; });
  return { card, plan };
}

/**
 * The incidents of a narrow topic in the period: searched by meaning and keywords within the topic's categories (and the
 * zone), kept when they match by keyword, are close in meaning, or record a death; priority order. Null while the search
 * index is not built (the caller lists the whole category instead).
 */
async function narrowed(topic: Topic, inc: IncidentFilters, now: string, n: number, message: string) {
  const nowT = Date.parse(`${now.replace(" ", "T")}+05:30`) / 1000;
  // the question's own window ("past 24 hrs", "yesterday"), else the period
  const hours = inc.hours ?? PERIODS[inc.period].hours;
  const until = nowT - (inc.offset ?? 0) * hours * 3600;
  const hits = await hybridSearch("incidents", `${topic.narrow}. ${message}`, { since: until - hours * 3600, until, zone: inc.zone ?? null,
    cats: topic.cats, dept: inc.dept ?? null, openOnly: !!inc.openOnly }, 40);
  if (!hits) {
    // the meaning index is not ready: the topic's own words in the titles (and a recorded death, for a murder), never the
    // whole category ("188 murders" was every violent crime)
    const words = topicWords(topic.key).filter((w) => w.length >= 4 || /[஀-௿]/.test(w));
    const r = await incidentsWithWords({ ...inc, cats: topic.cats }, now, words, topic.key === "murder", n);
    return { items: await incidentsByIds(r.ids), total: r.total, period: inc.period, widened: false };
  }
  // a recorded death makes a violent crime a murder; for anything else only a close match in meaning (or a keyword hit) counts
  const keep = hits.filter((h) => (topic.key === "murder" && Number(h.rec.dead) > 0) || h.sim == null || h.sim >= (topic.key === "murder" ? 0.83 : 0.86));
  const all = await incidentsByIds(await currentIncidentIds(keep));
  const items = [...all].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0)).slice(0, n);
  return { items, total: all.length, period: inc.period, widened: false };
}

/** "make that a map" / "as a table" after an incident list: the same incidents, drawn. */
async function pictureOfList(i: FastInput, d: Detected): Promise<FastOutput> {
  const items = await incidentsByIds(i.ctx!.resultIds!);
  const card = baseCard(i.lang, null, "", i.now);
  card.intent = d.intent;
  card.responseType = d.intent === "MAP" ? "map" : "table";
  card.headline = d.intent === "MAP" ? "The same incidents on the map" : "The same incidents as a table";
  const unplaced = items.filter((x) => x.lat == null).length;
  card.answerMarkdown = `${cap(words(items.length))} incident${items.length === 1 ? "" : "s"} from the previous answer`
    + `${d.intent === "MAP" && unplaced ? `; ${words(unplaced)} without a location ${unplaced === 1 ? "is" : "are"} not drawn` : ""}.`;
  listData(card, items);
  card.visualAsked = true;
  if (d.intent === "MAP") {
    card.display = "map";
    card.chart = spec({ type: "map_points", dataset: "incidents", x: "title", y: ["priority"], title: card.headline, sort: "none", highlight: "none" });
  } else {
    card.display = "table";
    card.table = "incidents";
  }
  card.incidents = items;
  card.sources.verifier = { checked: 0, unmatched: [], regenerated: false, template: true };
  card.sources.incidentIds = items.map((x) => x.incidentId);
  card.context = { ...i.ctx!, lastIntent: d.intent, lastResponseType: card.responseType, lastVisualization: d.intent === "MAP" ? "map_points" : "table" };
  return { card, plan: { intent: d.intent, fastPath: true, ids: i.ctx!.resultIds } };
}

/** The listed incidents as a dataset, so the card can switch to a table or a map without a new question. */
function listData(card: AnswerCard, items: IncidentItem[]) {
  card.datasets = [{
    id: "incidents", title: "Incidents", tab: "Incidents", idField: "id",
    fields: [{ key: "id", label: "Incident", kind: "id" }, { key: "title", label: "Incident", kind: "category" }, { key: "place", label: "Place", kind: "text" },
      { key: "sev", label: "Severity", kind: "text" }, { key: "status", label: "Status", kind: "text" }, { key: "when", label: "Reported", kind: "text" },
      { key: "priority", label: "Priority", kind: "value", format: "decimal1", additive: false }, { key: "lat", label: "lat", kind: "geo" }, { key: "lon", label: "lon", kind: "geo" }],
    rows: items.map((x) => ({ id: x.incidentId, title: x.title, place: x.location ?? x.zone, sev: x.severity, status: x.status, when: x.occurredAt,
      priority: x.priorityScore, lat: x.lat, lon: x.lon }))
  }];
}

/**
 * A window the question states in its own words: "last 10 days", "past 3 weeks", "last 48 hours", "கடந்த 10 நாட்கள்".
 * Null when it is one of the console's periods (24 hours, 7, 30 or 90 days) or not stated. At most the store's 180 days.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Days a Collector counts from, as observed in Tamil Nadu (dates, IST). */
const HOLIDAYS: [RegExp, string, string[]][] = [
  [/\b(diwali|deepavali|deepawali)\b|தீபாவளி/i, "Deepavali", ["2025-10-20", "2026-11-08"]],
  [/\bpongal\b|பொங்கல்/i, "Pongal", ["2026-01-15"]],
  [/\bnew year\b|புத்தாண்டு/i, "New Year", ["2026-01-01"]],
  [/\bchristmas\b/i, "Christmas", ["2025-12-25"]],
  [/\brepublic day\b/i, "Republic Day", ["2026-01-26"]],
  [/\bindependence day\b/i, "Independence Day", ["2026-08-15"]]
];
/** The store keeps about 180 days: a window reaching further back is cut there (and the answer says so). */
const MAX_HOURS = 180 * 24;

/**
 * A window the question names in its own words, when it is not one of the console's periods: "last 10 days", "yesterday",
 * "in September" (the month, to its end or to now), "since 1 October", "since Diwali". `range`: the window's exact calendar bounds
 * (IST, from inclusive, to exclusive), for windows that are not "the last N hours". `now` is the store's as-of time (IST).
 */
export function customWindow(text: string, now?: string): { hours: number; label: string; period: Period; offset?: number; range?: { from: string; to: string }; note?: string } | null {
  // yesterday: the day before the last 24 hours (the previous day's window, compared with the day before it)
  if (/\b(yesterday|nethu|neththu|nethaiki)\b|நேற்று/i.test(text) && !/\b(since|from) yesterday\b/i.test(text)) return { hours: 24, label: "previous day", period: "daily", offset: 1 };
  const nowMs = now ? Date.parse(`${now.replace(" ", "T")}+05:30`) : NaN;
  const periodOf = (h: number): Period => (h <= 24 ? "daily" : h <= 168 ? "weekly" : h <= 720 ? "monthly" : "quarterly");
  const ist = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const day = (ms: number) => new Date(ms + 330 * 60_000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (Number.isFinite(nowMs)) {
    // "since 1 October", "since Oct 1", "since Diwali": from that day to now
    const since = text.match(/\b(?:since|from)\s+(?:(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})|([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?)\b/i);
    const holiday = /\b(since|from|after)\b/i.test(text) ? HOLIDAYS.find(([re]) => re.test(text)) : undefined;
    let start: number | null = null, label = "";
    if (since) {
      const d = Number(since[1] ?? since[4]), mi = MONTHS.indexOf(String(since[2] ?? since[3]).slice(0, 3).toLowerCase());
      if (mi >= 0 && d >= 1 && d <= 31) {
        const y = new Date(nowMs + 330 * 60_000).getUTCFullYear();
        start = Date.parse(`${y}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+05:30`);
        if (start > nowMs) start = Date.parse(`${y - 1}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+05:30`);
        label = `since ${day(start)}`;
      }
    } else if (holiday) {
      const past = holiday[2].map((x) => Date.parse(`${x}T00:00:00+05:30`)).filter((t) => t <= nowMs).sort((a, b) => b - a)[0];
      if (past != null) { start = past; label = `since ${holiday[1]} (${day(past)})`; }
    }
    if (start != null && start < nowMs) {
      const want = Math.ceil((nowMs - start) / 3600_000), hours = Math.min(want, MAX_HOURS);
      // up to and including now (the store's as-of second)
      return { hours, label, period: periodOf(hours), range: { from: ist(nowMs - hours * 3600_000), to: ist(nowMs + 1000) },
        note: want > hours ? "The records go back about 180 days, so this counts from then." : undefined };
    }
    // "in September", "September 2026", "for Aug": that calendar month (to now if it is this month)
    const mm = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b(?:\s+(20\d{2}))?/i);
    if (mm && !(mm[1].toLowerCase() === "may" && !mm[2] && !/\bin may\b/i.test(text))) {
      const mi = MONTHS.indexOf(mm[1].slice(0, 3).toLowerCase());
      const cur = new Date(nowMs + 330 * 60_000);
      let y = mm[2] ? Number(mm[2]) : cur.getUTCFullYear();
      if (!mm[2] && (y > cur.getUTCFullYear() || mi > cur.getUTCMonth())) y -= 1;
      const s = Date.parse(`${y}-${String(mi + 1).padStart(2, "0")}-01T00:00:00+05:30`);
      const e = Math.min(nowMs, Date.parse(`${mi === 11 ? y + 1 : y}-${String(mi === 11 ? 1 : mi + 2).padStart(2, "0")}-01T00:00:00+05:30`));
      if (s < nowMs && nowMs - s <= MAX_HOURS * 3600_000 + 31 * 864e5) {
        const from = Math.max(s, nowMs - MAX_HOURS * 3600_000);
        const hours = Math.round((e - from) / 3600_000);
        return { hours, label: `${MONTH_NAMES[mi]} ${y}${e === nowMs ? " (to date)" : ""}`, period: "monthly", range: { from: ist(from), to: ist(e === nowMs ? e + 1000 : e) },
          note: from > s ? "The records go back about 180 days, so the start of this month is not covered." : undefined };
      }
    }
  }
  const m = text.match(/\b(?:last|past|previous|kadandha|kadaisi)\s+(\d{1,3})\s*(hours?|hrs?|days?|weeks?|months?|naal|naatkal)\b/i)
    ?? text.match(/(?:கடந்த|கடைசி)\s*(\d{1,3})\s*(மணி|நாட்கள்|நாள்|வாரங்கள்|வாரம்|மாதங்கள்|மாதம்)/);
  if (!m) return null;
  const n = Number(m[1]), u = m[2].toLowerCase();
  const per = /^(h|மணி)/.test(u) ? 1 : /^(w|வார)/.test(u) ? 168 : /^(mo|மாத)/.test(u) ? 720 : 24;
  const hours = Math.min(n * per, 180 * 24);
  if (!n || [24, 168, 720, 2160].includes(hours)) return null;
  const unit = per === 1 ? "hour" : per === 168 ? "week" : per === 720 ? "month" : "day";
  // the console period that holds the window: for the previous-period comparison's label and the card's period chip
  const period: Period = hours <= 24 ? "daily" : hours <= 168 ? "weekly" : hours <= 720 ? "monthly" : "quarterly";
  return { hours, label: `last ${n} ${unit}${n === 1 ? "" : "s"}`, period };
}

function scopeWords(s: Scope, n: RefNames): string {
  const parts = [s.zone != null ? `in ${n.zones.get(s.zone)?.name ?? `Zone ${s.zone}`} zone` : null, s.taluk ? `in ${n.taluks.get(s.taluk)?.name ?? s.taluk} taluk` : null,
    s.dept ? `for ${n.depts.get(s.dept)?.name ?? s.dept}` : null].filter(Boolean);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function catsOf(f: ActiveFilters, i: FastInput): string[] | null {
  return topicByKey(f.topic)?.cats ?? (f.cat ? [f.cat] : null) ?? (i.scope.cat ? [i.scope.cat] : null);
}

/** "4 road accidents", "1 fire", "12 garbage incidents": a topic that is already a noun is not followed by "incidents". */
export function countNoun(what: string, n: number): string {
  const one = n === 1;
  const m = what.match(/^(.*?)(accident|case|complaint|fire|theft|murder|death|protest|snatching|incident)s?$/i);
  if (m) return `${m[1]}${m[2]}${one ? "" : "s"}`;
  return `${what ? `${what} ` : ""}incident${one ? "" : "s"}`;
}

/** Chennai's main roads by their common names: a road is a strip across zones, matched on the incident's place and title. */
const ROADS: { label: string; re: RegExp; like: string[] }[] = [
  { label: "OMR (Rajiv Gandhi Salai)", re: /\b(omr|old mahabalipuram road|rajiv gandhi salai|it corridor)\b/i, like: ["omr", "old mahabalipuram", "rajiv gandhi salai"] },
  { label: "ECR", re: /\b(ecr|east coast road)\b/i, like: ["ecr", "east coast road"] },
  { label: "GST Road", re: /\b(gst road|grand southern trunk)\b/i, like: ["gst road", "g.s.t road", "grand southern trunk"] },
  { label: "Anna Salai", re: /\b(anna salai|mount road)\b/i, like: ["anna salai", "mount road"] },
  { label: "Poonamallee High Road", re: /\b(poonamallee high road|ph road)\b/i, like: ["poonamallee high road", "p.h. road", "ph road"] },
  { label: "Inner Ring Road", re: /\binner ring road\b/i, like: ["inner ring road"] },
  { label: "Outer Ring Road", re: /\bouter ring road\b/i, like: ["outer ring road"] },
  { label: "100 Feet Road", re: /\b100 (feet|ft) road\b/i, like: ["100 feet road", "100 ft road"] },
  { label: "Kamarajar Salai", re: /\b(kamarajar salai|beach road)\b/i, like: ["kamarajar salai", "beach road"] },
  { label: "Arcot Road", re: /\barcot road\b/i, like: ["arcot road"] },
  { label: "Velachery Main Road", re: /\bvelachery main road\b/i, like: ["velachery main road"] },
  { label: "Sardar Patel Road", re: /\bsardar patel road\b/i, like: ["sardar patel road"] },
  { label: "Periyar EVR Salai", re: /\b(evr salai|periyar salai|poonamallee road)\b/i, like: ["evr salai", "periyar salai"] }
];
export function roadNamed(text: string): { label: string; like: string[] } | null {
  return ROADS.find((r) => r.re.test(text)) ?? null;
}
