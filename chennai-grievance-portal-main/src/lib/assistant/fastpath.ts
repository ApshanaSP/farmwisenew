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
import { HANDLED, detectIntent, topicByKey, type Detected, type Topic } from "@/lib/assistant/intent";
import { deptFromWords } from "@/lib/assistant/deptwords";
import { filtersOf, type ActiveFilters, type ConversationContext } from "@/lib/assistant/context";
import { actionsFor, anySynthetic, categoryRanking, countIncidents, countResolved, incidentDetail, incidentsByIds, periodLabel, rankedIncidents, relatedIncidents,
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

/** The period a question names, else null. */
export function periodNamed(text: string): Period | null {
  const t = text.toLowerCase();
  if (/\b(today'?s?|tonight|(last|past|previous) 24 ?(h|hrs?|hours?)|24 ?(hrs?|hours)|past day|this morning|yesterday|recent(ly)?|latest|right now|currently|just now|innaiki|innaikku)\b|இன்று|நேற்று/.test(t)) return "daily";
  if (/\b(this|last|past) week\b|\b7 days\b|\bweekly\b|vaaram|வாரம்/.test(t)) return "weekly";
  if (/\b(this|last|past) month\b|\b30 days\b|\bmonthly\b|maasam|மாதம்/.test(t)) return "monthly";
  if (/\b(this|last|past) quarter\b|\b90 days\b|\bquarterly\b/.test(t)) return "quarterly";
  return null;
}

/** `decided`: the intent the router understood; without it (no model) the rules read the message. */
/** A count said in Tamil or Tanglish; null for English. `where` is the English place phrase (" in Velachery (Adyar zone)"). */
export function countInLanguage(lang: string, c: { n: number; prev: number; severe: number; open: number; dead: number; kind: string; period: string; where: string;
  measure?: "deaths" | "complaints" | null; complaints?: number; openOnly?: boolean }):
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
  const at = place ? ` ${place} பகுதியில்` : "";
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
  if (!HANDLED.includes(d.intent)) return null;

  // filters: a refinement starts from the previous answer's; a new question from the console's; the question's own words win
  const prev = d.refinement ? i.ctx?.activeFilters ?? null : null;
  const named = d.period ?? periodNamed(i.message);
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
  const custom = customWindow(i.message);
  const zoneName = f.zone != null ? i.names.zones.get(f.zone)?.name ?? null : null;
  const locality = i.place?.place && !i.place?.asked_for_taluk && f.zone != null && String(i.place.place).toLowerCase() !== (zoneName ?? "").toLowerCase()
    ? String(i.place.place) : null;
  const inc: IncidentFilters = { period: (custom?.period ?? f.period) as Period, zone: f.zone, taluk: f.taluk, dept: f.dept, cats: topic?.cats ?? (f.cat ? [f.cat] : null),
    sev: f.sev as IncidentFilters["sev"], openOnly: f.openOnly, hours: custom?.hours ?? null, place: ward ? null : locality, offset: custom?.offset ?? 0, overdue: !!f.overdue,
    ward };
  const scope: Scope = { period: inc.period, zone: f.zone ?? null, dept: f.dept ?? null, cat: f.cat ?? null, taluk: f.taluk ?? null };
  const card = baseCard(i.lang, scope, describeScope(scope, i.names, i.lang, i.now), i.now);
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
  const pl = (p: Period) => custom?.label ?? periodLabel(p);
  const sw = spot ? ` in ${spot}${zoneName ? ` (${zoneName} zone)` : ""}${scopeWords({ ...scope, zone: null }, i.names)}` : scopeWords(scope, i.names);
  card.intent = d.intent;
  card.sources.verifier = { checked: 0, unmatched: [], regenerated: false, template: true };
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
      const nar = topic?.narrow ? await narrowed(topic, inc, i.now, n, i.message).catch(orNull("fastpath:127")) : null;
      if (nar) {
        card.sources.tools.push({ name: "search_records", args: { text: topic!.narrow, ...inc }, ms: 0 });
        card.sources.assumptions.push(`"${topic!.label}" is narrower than its category, so the incidents were found by meaning and keywords within it, or by a recorded death.`);
      }
      const r = nar ?? await rankedIncidents(inc, i.now, n, d.intent === "PRIORITY_INCIDENT_LIST" ? "priority" : "recent");
      if (r.widened) {
        card.scope = { ...scope, period: r.period };
        card.scopeLine = describeScope(card.scope, i.names, i.lang, i.now);
      }
      const kind = `${f.overdue ? "overdue " : f.openOnly ? "open " : ""}${d.sev === "Severe" ? "severe " : ""}${what ? `${what} ` : ""}incident${r.items.length === 1 ? "" : "s"}`;
      card.responseType = "incident_list";
      card.incidents = r.items;
      card.headline = d.intent === "PRIORITY_INCIDENT_LIST" ? `Top ${r.items.length} priority ${kind} · ${pl(r.period)}` : `${cap(kind)} · ${pl(r.period)}`;
      card.answerMarkdown = !r.items.length ? `No ${kind} in the ${pl(r.period)}${sw}.`
        : d.intent === "PRIORITY_INCIDENT_LIST"
          ? r.items.length === 1 ? `This is the highest-priority ${kind} recorded in the ${pl(r.period)}${sw}, by the console's priority score.`
            : `These are the ${words(r.items.length)} highest-priority ${kind} recorded in the ${pl(r.period)}${sw}, ranked by the console's priority score.`
          : `The ${r.items.length === r.total ? "" : `${words(r.items.length)} newest of ${r.total.toLocaleString("en-IN")} `}${kind} in the ${pl(r.period)}${sw}.`;
      // a short list is named in the answer itself, with what makes each one stand out, not only shown below it
      if (r.items.length && r.items.length <= 5 && i.lang === "en")
        card.answerMarkdown += "\n\n" + r.items.map((x, k) => {
          const where = [x.location, x.zone].filter(Boolean).filter((v, j, a) => a.indexOf(v) === j).join(", ");
          const why = x.dead ? `${x.dead} ${x.dead === 1 ? "death" : "deaths"}` : x.priorityReasons[0] ?? "";
          return `${k + 1}. **${x.title}**${where ? ` (${where})` : ""}: ${x.severity.toLowerCase()}, ${x.status.toLowerCase()}${why ? `; ${why.replace(/\.$/, "")}` : ""}.`;
        }).join("\n");
      if (r.widened) card.caveats.push(`Fewer than ${n} in the ${pl(inc.period)}, so this covers the ${pl(r.period)}.`);
      listData(card, r.items);
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
        card.answerMarkdown = `${r.n.toLocaleString("en-IN")} ${kind} ${r.n === 1 ? "was" : "were"} closed as resolved in the ${pl(inc.period)}${sw}`
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
      const change = (now: number, before: number) => (before ? `${now >= before ? "up" : "down"} from ${fmt(before)} in the period before` : "none in the period before");
      const rest = `${c.severe} severe, ${fmt(c.open)} still open${c.dead && d.measure !== "deaths" ? `, ${c.dead} ${c.dead === 1 ? "death" : "deaths"}` : ""}`;
      if (d.measure === "deaths") {
        const of = what || "incidents";
        card.headline = `${fmt(c.dead)} ${c.dead === 1 ? "death" : "deaths"} in ${of} · ${P}`;
        card.answerMarkdown = c.dead
          ? `**${fmt(c.dead)}** ${c.dead === 1 ? "person died" : "people died"} in ${of} reported in the ${P}${sw} (${change(c.dead, c.prevDead)}).`
            + `\n\n- ${fmt(c.n)} ${kind} in all${c.injured ? `, ${fmt(c.injured)} injured` : ""}\n- ${rest}`
          : `No deaths were recorded in ${of} in the ${P}${sw}${c.prevDead ? ` (${fmt(c.prevDead)} in the period before)` : ""}. ${fmt(c.n)} ${kind} ${c.n === 1 ? "was" : "were"} reported.`;
        card.caveats.push("Deaths are counted once per incident, as the department records and confirmed news reports give them; a toll that only one outlet reports is held until confirmed.");
      } else if (d.measure === "complaints") {
        const open = d.openOnly;
        const v = open ? c.openComplaints : c.complaints;
        card.headline = `${fmt(v)} ${open ? "open " : ""}citizen ${v === 1 ? "complaint" : "complaints"}${what ? ` about ${what}` : ""} · ${P}`;
        card.answerMarkdown = `**${fmt(v)}** ${open ? "open " : ""}citizen ${v === 1 ? "complaint" : "complaints"}${what ? ` about ${what}` : ""} in the ${P}${sw}`
          + `${!open && d.vsPrevious ? ` (${change(c.complaints, c.prevComplaints)})` : ""}.`
          + `\n\n- They are about ${fmt(c.n)} ${kind}${d.vsPrevious ? ` (${change(c.n, c.prev)})` : ""}\n- ${rest}`;
      } else {
        card.headline = `${fmt(c.n)} ${kind} · ${P}`;
        card.answerMarkdown = `${fmt(c.n)} ${kind} ${c.n === 1 ? "was" : "were"} reported in the ${P}${sw}`
          + `${c.prev ? ` (${d.vsPrevious ? change(c.n, c.prev) : `${fmt(c.prev)} in the period before`})` : ""}: ${rest}.`;
      }
      // a question in Tamil or Tanglish is answered in it ("Velachery la indha week evlo accidents?")
      const local = countInLanguage(i.lang, { n: c.n, prev: c.prev, severe: c.severe, open: c.open, dead: c.dead, kind, period: P, where: sw,
        measure: d.measure ?? null, complaints: d.openOnly ? c.openComplaints : c.complaints, openOnly: d.openOnly });
      if (local) { card.headline = local.headline; card.answerMarkdown = local.text; card.voiceSummary = local.text; }
      card.kpis = d.measure === "deaths"
        ? [{ label: "Deaths", value: c.dead, prev: c.prevDead, tone: c.dead ? "sev" : undefined }, { label: "Incidents", value: c.n, prev: c.prev, tone: "info" },
          ...(c.injured ? [{ label: "Injured", value: c.injured }] : [])]
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
      const kind = `${what ? `${what} ` : ""}incidents`;
      const sorted = [...rows].sort((a, b) => b.n - a.n);
      const lead = sorted[0], next = sorted[1];
      const out = sides.filter((s) => s.outside);
      const line = (r: (typeof rows)[number]) => `**${r.label}**: ${r.n.toLocaleString("en-IN")} reported (${r.prev.toLocaleString("en-IN")} in the period before), ${r.open.toLocaleString("en-IN")} still open, ${r.severe} severe${r.dead ? `, ${r.dead} ${r.dead === 1 ? "death" : "deaths"}` : ""}`;
      card.responseType = "chart";
      card.display = "chart";
      card.visualAsked = true;
      card.datasets = [{ id: "sides", title: `${cap(kind)} by place`, tab: "Places", hasPrev: true,
        fields: [{ key: "label", label: "Place", kind: "category" }, { key: "n", label: "Reported", kind: "value", format: "integer" },
          { key: "n_prev", label: "Period before", kind: "value", format: "integer" }, { key: "open", label: "Still open", kind: "value", format: "integer" },
          { key: "severe", label: "Severe", kind: "value", format: "integer" }],
        rows: rows.map((r) => ({ label: r.label, n: r.n, n_prev: r.prev, open: r.open, severe: r.severe })) }];
      card.chart = spec({ type: rows.length <= 3 ? "bar" : "horizontal_bar", dataset: "sides", x: "label", y: ["n"], compare: true, highlight: "max",
        title: next ? (lead.n === next.n ? "Level with each other" : `${lead.label} has more`) : `${lead.label}` });
      card.headline = next ? (lead.n === next.n ? `${lead.label} and ${next.label} level: ${lead.n.toLocaleString("en-IN")} ${kind} each`
        : `${lead.label}: ${lead.n.toLocaleString("en-IN")} ${kind}, against ${next.n.toLocaleString("en-IN")}`) : `${lead.label}: ${lead.n.toLocaleString("en-IN")} ${kind}`;
      card.answerMarkdown = [
        next && lead.n !== next.n ? `${lead.label} had more ${kind} than ${next.label} in the ${pl(inc.period)}.` : next ? `The places are level in the ${pl(inc.period)}.` : "",
        ...rows.map(line),
        out.length ? `${out.map((s) => s.asked.replace(/^./, (c) => c.toUpperCase())).join(" and ")} ${out.length === 1 ? "is" : "are"} not a place in Chennai district${out.some((s) => /tambaram|avadi|chengalpattu|kanchipuram|tiruvallur|poonamallee/i.test(s.asked)) ? " (it falls in a neighbouring district)" : ""}, so ${out.length === 1 ? "it is" : "they are"} not covered by this data.` : ""
      ].filter(Boolean).join("\n\n");
      card.scopeLine = [cap(pl(inc.period)), [...rows.map((r) => r.label), ...out.map((s) => s.asked)].join(" vs "), what ? cap(what) : null, card.scopeLine.split(" · ").pop()].filter(Boolean).join(" · ");
      if (out.length) card.caveats.push(`Not in Chennai district: ${out.map((s) => s.asked).join(", ")}.`);
      card.context = { ...ctxBase, lastResponseType: "chart" };
      card.sources.tools.push({ name: "compare_places", args: { ...inc, sides: d.sides }, ms: 0 });
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
      card.chart = spec({ type: "horizontal_bar", dataset: "kinds", x: "label", y: ["n"], compare: true, sort: "desc", highlight: "max",
        title: rows[0] ? `${rows[0].label} leads with ${rows[0].n.toLocaleString("en-IN")}` : "No incidents" });
      card.headline = `Top ${rows.length} ${what ? `${what} ` : ""}kinds · ${pl(inc.period)}`;
      card.answerMarkdown = rows.length ? rows.map((r, k) => `${k + 1}. **${r.label}**: ${r.n.toLocaleString("en-IN")} (${r.prev.toLocaleString("en-IN")} the period before)`).join("\n")
        : `No ${what || "incidents"} in the ${pl(inc.period)}.`;
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
          : d.focus === "status" ? `${/resolved|closed|verified|completed/i.test(x.status) ? "Yes" : "No"}, it is ${x.status.toLowerCase()}${x.deadlineMissed ? ", and **past its deadline**" : ""}${x.closedAt ? `; closed on ${x.closedAt}` : ""}.`
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
      card.answerMarkdown = groups.length ? (d.incidentId ? "The steps on record for this incident, open ones first." : "The steps on record for the three highest-priority open incidents.")
        : "No open step is on record.";
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
  card.testData = await anySynthetic([...new Set([...card.sources.incidentIds, ...(card.incident ? [card.incident.incidentId] : [])])]).catch(() => true);
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
  if (!hits) return null;
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
export function customWindow(text: string): { hours: number; label: string; period: Period; offset?: number } | null {
  // yesterday: the day before the last 24 hours (the previous day's window, compared with the day before it)
  if (/\b(yesterday|nethu|neththu|nethaiki)\b|நேற்று/i.test(text) && !/\b(since|from) yesterday\b/i.test(text)) return { hours: 24, label: "previous day", period: "daily", offset: 1 };
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
