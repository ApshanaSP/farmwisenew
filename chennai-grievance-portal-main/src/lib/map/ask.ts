/**
 * One question to the map, end to end (POST /api/map/ask, and Ask District IQ's spatial questions): rules first, the AI
 * only for what the rules cannot read, then the executor, the answer, the chips, the trace, the list and the camera.
 * The officer's department is forced into every incident layer here, on the server, whatever the plan says. Each
 * question is logged without personal data to data/aws-cache/map-questions.jsonl for evaluation.
 */
import fs from "fs";
import path from "path";
import { AiUnavailableError, AiBudgetError, AiBusyError, aiStatus } from "@/lib/ai/gateway";
import { deptFromWords } from "@/lib/assistant/deptwords";
import { refNames } from "@/lib/assistant/scope";
import { aiPlan, aiReword } from "./ai";
import type { Insight } from "./insights";
import { conditionsNear, familiesOf, spreadOf, type Condition } from "./conditions";
import { compose, type Answer } from "./answer";
import { areaBrief, type Brief } from "./brief";
import { cameraFor, type CameraInput, type Shot } from "./camera";
import { planChips, type PlanChip } from "./chips";
import { PlanError, areaLabel, runMapPlan, drawnRadius, type Ctx, type Place, type RunResult, type StepOut } from "./execute";
import { bboxOf, circlePolygon, type Bbox, type LatLon, type Pair } from "./geom";
import { checkPlan, type AreaRef, type Plan } from "./plan";
import { makeResolver, type Found, type ResolverData } from "./resolve";
import { mapLang, rulesRoute, type RouteEnv } from "./route";
import { world } from "./world";
import { NEWS_PIN_LEVEL, type LayerId, type NewsDoc, type World } from "./types";
import { LAYER_WORD, type Lang } from "./words";

export interface AskInput {
  text: string | null;
  /** a plan edited by a chip (runs as is, no AI) */
  plan: Plan | null;
  /** the conversation's current plan, for follow-ups */
  prev: Plan | null;
  context: { zone: number | null; taluk: string | null; incidentId: string | null; drawn: { lat: number; lon: number; r: number } | null; ward: number | null };
  user: { email: string; role: "collector" | "department_officer"; lockDept: string | null };
  /** reword the meaning sentence with AI (off in tests and for chip edits) */
  reword?: boolean;
  signal?: AbortSignal;
}

export interface Row {
  id: string; title: string; sev: string; status: string; open: boolean; cat: string; catLabel: string; dept: string; deptName: string;
  ward: number | null; zone: number | null; zoneName: string | null; first: string; place: string | null; pinnable: boolean; prec: number | null;
  priority: number; reasons: string | null; near: { name: string | null; m: number; layer: LayerId } | null; overdue: boolean; citizen: boolean;
  /** reported by a news outlet; `press` = its newest articles (headline, outlet, link: public reporting only) */
  news: boolean; press: Press[]
}
export interface GlanceTile { n: number; ids: string[] }
export interface Glance {
  open: GlanceTile; overdue: GlanceTile; severe: GlanceTile;
  where: (GlanceTile & { en: string; ta: string }) | null;
  who: (GlanceTile & { code: string; name: string }) | null;
}
export interface Press { id: string; title: string; outlet: string; at: string; url: string | null }
export interface Feat { id: string; lat: number; lon: number; sev: string; open: boolean; cat: string; pinnable: boolean; prec: number | null; title: string; rank: number; citizen: boolean; news: boolean }
/** A news article drawn on the map: only articles that name a locality; the others are counted in `unplaced`. */
export interface NewsPin { id: string; lat: number; lon: number; title: string; outlet: string; at: string; url: string | null; inc: string | null; place: string | null }

export interface AskResponse {
  kind: "answer" | "brief" | "say" | "ui";
  lang: Lang;
  plan: Plan | null;
  chips: PlanChip[];
  edited: string | null;
  answer: Answer | null;
  trace: StepOut[];
  rows: Row[];
  total: number;
  /** every result's point (pinned when pinnable), capped at 5,000 */
  features: Feat[];
  unplaced: string[];
  /** exact places beyond the 5,000 the map draws (counted in the headline and by ward, not drawn) */
  hidden: number;
  context: {
    points: { id: string; layer: LayerId; name: string | null; name_ta: string | null; lat: number; lon: number; kind: string; government: boolean }[];
    lines: { id: string; name: string; name_ta: string | null; meters: number; path: Pair[][] }[];
    polys: { id: string; name: string | null; polys: Pair[][][] }[];
    areas: { key: string; ref: AreaRef; en: string; ta: string; circle: { lat: number; lon: number; r: number } | null }[];
    places: Place[];
    rings: { id: string; lat: number; lon: number; r: number }[];
  };
  extra: {
    groups?: { key: string; label: string; label_ta: string; n: number; lat: number; lon: number; ids: string[] }[];
    clusters?: { id: string; n: number; lat: number; lon: number; ids: string[]; place: string | null }[];
    hotWards?: { ward: number; z: number; n: number }[];
    compare?: { a: { label: string; label_ta: string; n: number; ids: string[] }; b: { label: string; label_ta: string; n: number; ids: string[] } };
    change?: { now: string[]; before: string[]; nowLabel: string; beforeLabel: string };
    areas?: { key: string; label: string; label_ta: string; p90: number; worst: { lat: number; lon: number; m: number; to: { name: string | null; lat: number; lon: number } | null } }[];
    nearest?: { origin: Place | null; pairs: { id: string | null; to: { id: string; name: string | null; m: number; lat: number; lon: number }[] }[] };
  };
  camera: CameraInput;
  shots: Shot[];
  /** computed findings about the answer (past deadline, repeat spots, change on the period before ...), each with its rows */
  insights: Insight[];
  /** the answer at a glance: still open, past deadline, severe, where most are, who holds most; each with its rows */
  glance: Glance | null;
  /** "On the ground now": live feeds that bear on the answer, where it is (rain, lakes, PWD works, hospitals, air) */
  conditions: Condition[];
  /** an "in the news" answer: the articles behind its incidents, pinned where they name a locality */
  news: { pins: NewsPin[]; unplaced: number; articles: number } | null;
  /** a change answer's earlier window, for the Before · Now toggle */
  before: Feat[];
  brief: Brief | null;
  say: { en: string; ta: string; chips: string[] } | null;
  ui: "open_trace" | "send" | "clear" | "export" | "visits" | null;
  uiDept: string | null;
  asOf: { now: string; data: string; layers: { id: string; en: string; ta: string; source: string; as_of: string | null; count: number }[] };
  ai_used: boolean;
  ms: number;
}

const ROW_CAP = 200;
const FEATURE_CAP = 5000;

declare global {
  // eslint-disable-next-line no-var
  var __askMapResolver: { data: ResolverData; fn: ReturnType<typeof makeResolver> } | undefined;
}
function resolverFor(data: ResolverData) {
  const g = global.__askMapResolver;
  if (g && g.data === data) return g.fn;
  const fn = makeResolver(data);
  global.__askMapResolver = { data, fn };
  return fn;
}

/** Looks up a plan's place reference: "loc:Adyar", "osm:n123", "fac:POL-01", "inc:<id>", "ll:13.04,80.25", "drawn:13.04,80.25,500". */
export function placeLookup(w: World, data: ResolverData): (ref: string) => Place | null {
  const cache = new Map<string, Place | null>();
  return (ref: string) => {
    if (cache.has(ref)) return cache.get(ref)!;
    let p: Place | null = null;
    const [kind, rest] = ref.split(/:([\s\S]*)/);
    if (kind === "ll" || kind === "drawn") {
      const [lat, lon] = rest.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) p = { ref, name: kind === "drawn" ? "the circle you drew" : `the spot at ${lat.toFixed(4)}, ${lon.toFixed(4)}`, name_ta: kind === "drawn" ? "நீங்கள் வரைந்த வட்டம்" : "தேர்ந்த இடம்", lat, lon, kind };
    } else if (kind === "inc") {
      const i = w.incidents.find((x) => x.id === rest);
      if (i && i.pinnable) p = { ref, name: `"${i.title}"`, name_ta: `"${i.title}"`, lat: i.lat, lon: i.lon, kind: "incident" };
    } else {
      const e = data.entries.find((x) => x.ref === ref && x.lat != null);
      if (e) p = { ref, name: e.name_en, name_ta: e.name_ta, lat: e.lat!, lon: e.lon!, kind: e.kind };
      else if (kind === "osm" || kind === "fac") {
        const id = kind === "osm" ? `osm:${rest}` : ref;
        for (const list of Object.values(w.points)) { const f = list.find((x) => x.id === id); if (f) { p = { ref, name: f.name ?? LAYER_WORD[f.layer].one, name_ta: f.name_ta, lat: f.lat, lon: f.lon, kind: f.layer }; break; } }
      }
    }
    cache.set(ref, p);
    return p;
  };
}

/** The bounds of an area for the camera (from the ward rings; a point's circle). */
function areaBox(a: AreaRef, w: World, ctx: Ctx): Bbox | null {
  if (a.kind === "point" || a.kind === "drawn") {
    const p = ctx.place(a.kind === "point" ? a.ref : `drawn:${a.id}`);
    const r = a.kind === "point" ? a.radius_m : drawnRadius(a.id) ?? 0;
    return p ? bboxOf(circlePolygon(p, r, 16).map(([lat, lon]) => ({ lat, lon }))) : null;
  }
  const wards = w.wards.filter((wd) => (a.kind === "ward" ? wd.ward === a.id : a.kind === "zone" ? wd.zone === a.id : wd.taluk === a.code));
  if (!wards.length) return null;
  return wards.reduce<Bbox>((b, wd) => ({ s: Math.min(b.s, wd.bbox.s), w: Math.min(b.w, wd.bbox.w), n: Math.max(b.n, wd.bbox.n), e: Math.max(b.e, wd.bbox.e) }), { s: 90, w: 180, n: -90, e: -180 });
}
const areaKey = (a: AreaRef) => (a.kind === "ward" ? `ward:${a.id}` : a.kind === "zone" ? `zone:${a.id}` : a.kind === "taluk" ? `taluk:${a.code}` : a.kind === "point" ? `point:${a.ref}:${a.radius_m}` : `drawn:${a.id}`);

function emptyResponse(lang: Lang, w: World): AskResponse {
  return {
    kind: "say", lang, plan: null, chips: [], edited: null, answer: null, trace: [], rows: [], total: 0, features: [], unplaced: [], hidden: 0,
    context: { points: [], lines: [], polys: [], areas: [], places: [], rings: [] }, extra: {},
    camera: { shape: "district", areas: [], points: [], line: null, focus: null, tour: [], district: w.district }, shots: [], before: [], insights: [], news: null, glance: null, conditions: [], brief: null, say: null, ui: null, uiDept: null,
    asOf: { now: w.now, data: w.dataAsOf, layers: [] }, ai_used: false, ms: 0
  };
}

export const EXAMPLES_EN = [
  "waterlogging within 300 m of schools", "open complaints near Adyar", "flooding in Zone 13 this week", "thefts along Anna Salai this month",
  "garbage complaints by ward", "where are road accidents clustering", "compare Adyar and Velachery flooding", "which ward is farthest from a fire station"
];
export const EXAMPLES_TA = ["பள்ளிகள் அருகே மழைநீர் தேக்கம்", "அடையாறு அருகே திறந்த புகார்கள்", "மண்டலம் 13 இல் இந்த வாரம் வெள்ளம்", "வார்டு வாரியாக குப்பை புகார்கள்"];

export async function askMap(input: AskInput): Promise<AskResponse> {
  const t0 = Date.now();
  const { world: w, resolver: data } = await world();
  const resolve = resolverFor(data);
  const lang: Lang = input.plan?.language ?? (input.text ? mapLang(input.text, resolve(input.text, null)) : input.prev?.language ?? "en");
  const ctx: Ctx = { place: placeLookup(w, data), lang };
  const names = await refNames().catch(() => null);
  const env: RouteEnv = { resolve, dept: (t) => (names ? deptFromWords(t, names)?.code ?? null : null), lang };
  const lock = input.user.role === "department_officer" ? input.user.lockDept : null;
  let plan: Plan | null = null, defaults: string[] = [], places: Found[] = [], edited: string | null = null, aiUsed = false, unread: string[] = [];
  const out = emptyResponse(lang, w);
  const done = (r: AskResponse) => { r.ms = Date.now() - t0; logQuestion(input, r); return r; };

  // ---- a drawn circle, a clicked ward or "what else is near this incident?": the area brief or a plan with no text
  if (!input.plan && !input.text) {
    const c = input.context;
    let area: AreaRef | null = null;
    if (c.drawn) area = { kind: "drawn", id: `${c.drawn.lat.toFixed(6)},${c.drawn.lon.toFixed(6)},${Math.round(c.drawn.r)}` };
    else if (c.ward) area = { kind: "ward", id: c.ward };
    if (area) {
      const ctxD: Ctx = { ...ctx, place: (ref) => (ref.startsWith("drawn:") ? ctx.place(ref) ?? null : ctx.place(ref)) };
      out.kind = "brief";
      out.brief = areaBrief(area, w, ctxD, lock);
      out.context.areas = [{ key: areaKey(area), ref: area, ...areaLabel(area, w, ctxD), circle: area.kind === "drawn" ? { lat: c.drawn!.lat, lon: c.drawn!.lon, r: c.drawn!.r } : null }];
      const box = areaBox(area, w, ctxD);
      if (box) out.conditions = conditionsNear(w, { fams: new Set(), center: { lat: (box.s + box.n) / 2, lon: (box.w + box.e) / 2 }, box, wide: false });
      out.camera = { shape: "area", areas: box ? [{ id: areaKey(area), box, label: out.brief.label.en, label_ta: out.brief.label.ta }] : [], points: [], line: null, focus: null, tour: [], district: w.district };
      return done(out);
    }
    if (c.incidentId) {
      plan = { language: lang, show: "in", steps: [
        { op: "take", as: "a", layer: "incidents", filter: { category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 30, offset: 0 }, text: null }, where: null },
        { op: "inside", as: "in", of: "a", area: { kind: "point", ref: `inc:${c.incidentId}`, radius_m: 500 } }] };
    } else return done(out);
  }

  if (input.plan) {
    const c = checkPlan(input.plan);
    if (!c.ok) { out.say = { en: `That change could not be made: ${c.problems[0]}.`, ta: "அந்த மாற்றத்தைச் செய்ய முடியவில்லை.", chips: [] }; return done(out); }
    plan = c.plan;
    edited = "chip";
  } else if (input.text && !plan) {
    const r = rulesRoute(input.text, input.prev, env);
    if (r?.kind === "say") { out.say = r; return done(out); }
    if (r?.kind === "ui") { out.kind = "ui"; out.ui = r.ui; out.uiDept = r.dept; out.plan = r.plan; return done(out); }
    if (r?.kind === "brief") {
      out.kind = "brief";
      out.brief = areaBrief(r.area, w, ctx, lock);
      const p = r.area.kind === "point" ? ctx.place(r.area.ref) : null;
      out.context.areas = [{ key: areaKey(r.area), ref: r.area, ...areaLabel(r.area, w, ctx), circle: p && r.area.kind === "point" ? { lat: p.lat, lon: p.lon, r: r.area.radius_m } : null }];
      const box = areaBox(r.area, w, ctx);
      if (box) out.conditions = conditionsNear(w, { fams: new Set(), center: p ?? { lat: (box.s + box.n) / 2, lon: (box.w + box.e) / 2 }, box, wide: false });
      out.camera = { shape: "area", areas: box ? [{ id: areaKey(r.area), box, label: out.brief.label.en, label_ta: out.brief.label.ta }] : [], points: [], line: null, focus: null, tour: [], district: w.district };
      return done(out);
    }
    if (r?.kind === "plan") {
      plan = r.plan; defaults = r.defaults; places = r.places; edited = r.edited;
      // words the rules could not use ("kids", "by the sea", "north of the city"): the AI reads the whole question, with
      // the rules' plan as a hint; if it cannot, the rules' answer stands and the trace names the words left unused
      if (r.unread?.length && aiStatus().available) {
        const found = resolve(input.text, null).slice(0, 6).map((f) => ({ ref: f.pick.entry.ref, kind: f.pick.entry.kind, name: f.pick.entry.name_en }));
        // a new question (the rules did not read it as an edit), so the AI reads it fresh, not as an edit of the last answer
        const a = await aiPlan(input.text, null, { cats: [...w.cats.keys()], depts: [...w.depts.keys()], places: found, user: input.user.email, lang, signal: input.signal,
          hint: r.plan, unread: r.unread, zones: w.zones }).catch(() => null);
        if (a && "plan" in a) { plan = a.plan; aiUsed = true; defaults = []; }
        else unread = r.unread;
      } else if (r.unread?.length) unread = r.unread;
    } else {
      // the AI fills the same plan; without it, the kinds of questions the rules answer
      try {
        const found = resolve(input.text, null).slice(0, 6).map((f) => ({ ref: f.pick.entry.ref, kind: f.pick.entry.kind, name: f.pick.entry.name_en }));
        const a = await aiPlan(input.text, input.prev, { cats: [...w.cats.keys()], depts: [...w.depts.keys()], places: found, user: input.user.email, lang, signal: input.signal, zones: w.zones });
        aiUsed = true;
        if ("plan" in a) plan = a.plan;
        else { out.say = { en: "I could not turn that into a map question. Try one of these:", ta: "அதை வரைபடக் கேள்வியாக மாற்ற முடியவில்லை. இவற்றில் ஒன்றை முயலுங்கள்:", chips: lang === "ta" ? EXAMPLES_TA : EXAMPLES_EN.slice(0, 4) }; out.ai_used = true; return done(out); }
      } catch (e) {
        if (!(e instanceof AiUnavailableError || e instanceof AiBudgetError || e instanceof AiBusyError)) console.warn("[map] AI plan failed:", (e as Error).message);
        out.say = { en: "I can answer these kinds of map questions without AI:", ta: "AI இல்லாமல் இவ்வகை வரைபடக் கேள்விகளுக்குப் பதில் சொல்ல முடியும்:", chips: lang === "ta" ? EXAMPLES_TA : EXAMPLES_EN };
        return done(out);
      }
    }
  }
  if (!plan) return done(out);

  // "compare with Adyar" after a district-wide answer: compare the zone holding most of the current answer
  for (const s of plan.steps) if (s.op === "compare" && s.a.kind === "zone" && s.a.id === -1) {
    const pre = runMapPlan({ steps: plan.steps.slice(0, plan.steps.indexOf(s)), show: s.of, language: plan.language }, w, ctx, lock);
    const m = new Map<number, number>();
    for (const h of pre.hits) if (h.inc.zone != null) m.set(h.inc.zone, (m.get(h.inc.zone) ?? 0) + 1);
    const top = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    const b = s.b.kind === "zone" ? s.b.id : null;
    // the other zone when the top one is the one being compared with
    const pick = [...m.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).find(([z]) => z !== b)?.[0] ?? (top ? top[0] : 1);
    s.a = { kind: "zone", id: pick };
  }

  // the same plan on the same data within a minute (a chip toggled back, a question asked again): the answer as it was
  const cacheKey = `${lock ?? ""}|${w.dataAsOf}|${w.incidents.length}|${w.now.slice(0, 16)}|${input.reword && !aiUsed ? "r" : ""}|${unread.join(",")}|${JSON.stringify(plan)}`;
  const cached = answerCache().get(cacheKey);
  if (cached && Date.now() - cached.at < 60_000) {
    const copy: AskResponse = { ...structuredClone(cached.res), edited, ai_used: aiUsed || cached.res.ai_used };
    return done(copy);
  }
  let r: RunResult;
  try { r = runMapPlan(plan, w, ctx, lock); }
  catch (e) {
    if (e instanceof PlanError) { out.say = { en: e.message, ta: "அந்தக் கேள்விக்கு வரைபடத்தில் பதில் காண முடியவில்லை.", chips: [] }; out.plan = plan; return done(out); }
    throw e;
  }
  if (unread.length) r.steps.push({ as: "unread", op: "take", count: 0, layer: null, ids: [],
    note_en: `Not used from your question: ${unread.join(", ")}. The map answered the rest; rephrase to include them.`,
    note_ta: `கேள்வியில் பயன்படுத்தப்படாதவை: ${unread.join(", ")}. மீதியைக் கொண்டு பதில் தரப்பட்டது.` });
  const answer = compose(plan, r, w, ctx);
  if (input.reword && answer.meaning && !aiUsed) {
    try { const s = await aiReword(answer.meaning, answer.facts, lang, input.user.email, input.signal); if (s) { answer.meaning = s; aiUsed = true; } } catch { /* the template stands */ }
  }
  const res = fill(out, plan, r, answer, w, ctx, data, defaults, places, edited, aiUsed);
  // the panel shows the answer itself; findings (insights.ts) are no longer computed per question
  res.insights = [];
  res.glance = glanceOf(r, w);
  if (r.show.type !== "points") {
    const t = plan.steps.find((s) => s.op === "take" && s.layer === "incidents");
    const f = t?.op === "take" ? t.filter : null;
    const pts = r.hits.filter((h) => h.inc.pinnable).map((h) => ({ lat: h.inc.lat, lon: h.inc.lon }));
    const place = r.context.places[0];
    const spread = place && !pts.length ? { center: place, box: { s: place.lat - 0.01, n: place.lat + 0.01, w: place.lon - 0.01, e: place.lon + 0.01 }, wide: false } : spreadOf(pts, w.district);
    res.conditions = conditionsNear(w, { fams: familiesOf(f?.category, f?.family, w), ...spread });
  }
  const store = answerCache();
  store.set(cacheKey, { at: Date.now(), res: structuredClone(res) });
  if (store.size > 120) store.delete(store.keys().next().value!);
  return done(res);
}

declare global {
  // eslint-disable-next-line no-var
  var __mapAnswers: Map<string, { at: number; res: AskResponse }> | undefined;
}
const answerCache = () => (global.__mapAnswers ??= new Map());

function fill(out: AskResponse, plan: Plan, r: RunResult, answer: Answer, w: World, ctx: Ctx, data: ResolverData, defaults: string[], places: Found[], edited: string | null, aiUsed: boolean): AskResponse {
  const lang = plan.language;
  out.kind = "answer";
  out.lang = lang;
  out.plan = plan;
  out.edited = edited;
  out.answer = answer;
  out.trace = r.steps;
  out.ai_used = aiUsed;
  const deptName = (c: string) => w.depts.get(c)?.name ?? c;
  const alternatives: Record<string, { key: string; en: string; ta: string }[]> = {};
  for (const s of plan.steps) {
    if (s.op !== "inside" && s.op !== "along") continue;
    const f = places.find((p) => (s.op === "along" ? p.pick.entry.ref === s.line : true));
    if (!f) continue;
    alternatives[s.as] = f.alternatives.map((m) => {
      const e = m.entry;
      const key = e.kind === "zone" || e.kind === "ward" || e.kind === "taluk" ? e.ref : e.kind === "road" || e.kind === "waterway" ? e.ref : `point:${e.ref}`;
      const kindWord = { zone: "zone", ward: "ward", taluk: "taluk", locality: "area, 1 km", osm_place: "area, 1 km", facility: "place, 500 m", road: "road", waterway: "river or canal", street_name_only: "street" }[e.kind];
      return { key, en: `${e.name_en} (${kindWord})`, ta: e.name_ta ?? e.name_en };
    });
  }
  out.chips = planChips(plan, {
    cat: (c) => w.cats.get(c)?.label ?? c, dept: deptName, area: (a) => areaLabel(a, w, ctx),
    line: (id) => { const l = [...w.lines.roads, ...w.lines.waterways].find((x) => x.id === id); return { en: l?.name ?? id.replace(/^gcc:/, ""), ta: l?.name_ta ?? l?.name ?? id.replace(/^gcc:/, "") }; },
    alternatives
  }, defaults);

  const hits = r.hits;
  out.total = hits.length;
  out.rows = hits.slice(0, ROW_CAP).map((h) => ({
    id: h.inc.id, title: h.inc.title, sev: h.inc.sev, status: h.inc.status, open: h.inc.open, cat: h.inc.cat, catLabel: w.cats.get(h.inc.cat)?.label ?? h.inc.cat,
    dept: h.inc.dept, deptName: deptName(h.inc.dept), ward: h.inc.ward, zone: h.inc.zone, zoneName: w.zones.find((z) => z.zone === h.inc.zone)?.name ?? null,
    first: h.inc.first, place: h.inc.place, pinnable: h.inc.pinnable, prec: h.inc.prec, priority: h.inc.priority, reasons: h.inc.reasons,
    near: h.near ? { name: h.near.name, m: Math.round(h.near.m), layer: h.near.layer } : null, overdue: h.inc.breached && h.inc.open, citizen: h.inc.citizen > 0,
    news: (h.inc.outlets ?? 0) > 0, press: pressFor(w, h.inc.id)
  }));
  const feat = (h: (typeof hits)[number], k: number): Feat => ({ id: h.inc.id, lat: h.inc.lat, lon: h.inc.lon, sev: h.inc.sev, open: h.inc.open, cat: h.inc.cat,
    pinnable: h.inc.pinnable, prec: h.inc.prec, title: h.inc.title, rank: k, citizen: h.inc.citizen > 0, news: (h.inc.outlets ?? 0) > 0 });
  // the map draws at most 5,000 places (the highest priority first); the rest are counted, by ward, and said plainly
  const pinnedHits = hits.filter((h) => h.inc.pinnable);
  out.features = pinnedHits.slice(0, FEATURE_CAP).map(feat);
  out.hidden = Math.max(0, pinnedHits.length - FEATURE_CAP);
  if (out.hidden && !r.show.type.startsWith("group")) {
    const byWard = new Map<number, { n: number; ids: string[] }>();
    for (const h of hits) if (h.inc.ward != null) { const g = byWard.get(h.inc.ward) ?? byWard.set(h.inc.ward, { n: 0, ids: [] }).get(h.inc.ward)!; g.n++; g.ids.push(h.inc.id); }
    out.extra.groups ??= [...byWard.entries()].map(([ward, g]) => {
      const wd = w.wards.find((x) => x.ward === ward);
      return { key: String(ward), label: `Ward ${ward}`, label_ta: `வார்டு ${ward}`, n: g.n, lat: wd?.lat ?? 0, lon: wd?.lon ?? 0, ids: g.ids };
    }).sort((a, b) => b.n - a.n);
    const n = (x: number) => x.toLocaleString("en-IN");
    answer.meaning = `${answer.meaning ?? ""} ${lang === "ta" ? `வரைபடம் அதிக முன்னுரிமையுள்ள ${n(FEATURE_CAP)} இடங்களைக் காட்டுகிறது; ${n(hits.length)} அனைத்தும் வார்டு வாரியாக எண்ணப்பட்டுள்ளன.`
      : `The map draws the ${n(FEATURE_CAP)} highest-priority places; all ${n(hits.length)} are counted, by ward in the bubbles.`}`.trim();
  }
  if (r.show.type === "change") out.before = r.show.before.hits.slice(0, FEATURE_CAP).map(feat);
  out.unplaced = hits.filter((h) => !h.inc.pinnable).map((h) => h.inc.id);
  if (plan.steps.some((s) => s.op === "take" && s.filter?.news)) out.news = newsFor(w, hits.map((h) => h.inc.id));

  // context layers: only the facilities that matter to the answer
  out.context.points = r.context.points.slice(0, 400).map((p) => ({ id: p.id, layer: p.layer, name: p.name, name_ta: p.name_ta, lat: p.lat, lon: p.lon, kind: p.kind, government: !!p.government }));
  out.context.lines = r.context.lines.map((l) => ({ id: l.feat.id, name: l.feat.name, name_ta: l.feat.name_ta, meters: l.meters, path: l.feat.lines }));
  out.context.polys = r.context.polys.slice(0, 200).map((p) => ({ id: p.id, name: p.name, polys: p.polys }));
  out.context.areas = r.context.areas.map((a) => {
    const p = a.kind === "point" ? ctx.place(a.ref) : null;
    return { key: areaKey(a), ref: a, ...areaLabel(a, w, ctx), circle: p && a.kind === "point" ? { lat: p.lat, lon: p.lon, r: a.radius_m } : null };
  });
  out.context.places = r.context.places;
  const within = plan.steps.find((s) => s.op === "within");
  if (within?.op === "within") out.context.rings = out.context.points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, r: within.meters }));

  const show = r.show;
  if (show.type === "groups") out.extra.groups = show.groups;
  if (show.type === "hotspots") { out.extra.clusters = show.clusters.slice(0, 60).map((c) => ({ id: c.id, n: c.n, lat: c.lat, lon: c.lon, ids: c.ids, place: c.place })); out.extra.hotWards = show.hotWards; }
  if (show.type === "compare") out.extra.compare = { a: { label: show.a.label, label_ta: show.a.label_ta, n: show.a.n, ids: show.a.ids }, b: { label: show.b.label, label_ta: show.b.label_ta, n: show.b.n, ids: show.b.ids } };
  if (show.type === "change") out.extra.change = { now: show.now.hits.map((h) => h.inc.id), before: show.before.hits.map((h) => h.inc.id), nowLabel: show.now.period.kind, beforeLabel: show.before.period.kind };
  if (show.type === "areas") out.extra.areas = show.areas.slice(0, 50).map((a) => ({ key: a.key, label: a.label, label_ta: a.label_ta, p90: Math.round(a.p90), worst: { lat: a.worst.lat, lon: a.worst.lon, m: Math.round(a.worst.m), to: a.worst.to ? { name: a.worst.to.name, lat: a.worst.to.lat, lon: a.worst.to.lon } : null } }));
  if (show.type === "nearest") out.extra.nearest = { origin: show.origin, pairs: show.pairs.slice(0, 500).map((p) => ({ id: p.hit?.inc.id ?? null, to: p.to.map((x) => ({ id: x.id, name: x.name, m: Math.round(x.m), lat: x.lat, lon: x.lon })) })) };

  // the camera's input: the plan's shape and the answer's geometry
  const pinned: LatLon[] = hits.filter((h) => h.inc.pinnable).map((h) => ({ lat: h.inc.lat, lon: h.inc.lon }));
  const last = plan.steps.find((s) => s.as === plan.show)!;
  const areas = r.context.areas.map((a) => { const box = areaBox(a, w, ctx); const l = areaLabel(a, w, ctx); return box ? { id: areaKey(a), box, label: l.en, label_ta: l.ta } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
  const cam: CameraInput = { shape: "district", areas, points: pinned, line: null, focus: null, tour: [], district: w.district };
  if (!hits.length && answer.miss) { cam.shape = "empty"; cam.focus = { id: answer.miss.id, lat: answer.miss.lat, lon: answer.miss.lon, label: answer.meaning ?? "", label_ta: answer.meaning ?? "" }; }
  else if (last.op === "compare") cam.shape = "compare";
  else if (last.op === "change") cam.shape = areas.length ? "change" : "district";
  else if (last.op === "hotspot" && show.type === "hotspots") {
    cam.shape = "hotspot";
    cam.tour = show.clusters.slice(0, 5).map((c, i) => ({ id: c.id, lat: c.lat, lon: c.lon,
      caption_en: `${i + 1}. ${c.n} reports${c.place ? ` near ${c.place}` : ""}${c.wards.length ? `, Ward ${c.wards.slice(0, 2).join(", ")}` : ""}`,
      caption_ta: `${i + 1}. ${c.n} அறிக்கைகள்${c.place ? `, ${c.place} அருகே` : ""}` }));
  } else if (last.op === "farthest" && show.type === "areas" && show.areas[0]) {
    const a = show.areas[0];
    cam.shape = "farthest";
    cam.focus = { id: a.key, lat: a.worst.lat, lon: a.worst.lon, label: a.label, label_ta: a.label_ta, to: a.worst.to ? { lat: a.worst.to.lat, lon: a.worst.to.lon, label: a.worst.to.name ?? "" } : undefined };
    const wd = w.wards.find((x) => String(x.ward) === a.key);
    if (wd && show.by === "ward") cam.areas = [{ id: `ward:${wd.ward}`, box: wd.bbox, label: a.label, label_ta: a.label_ta }];
  } else if (last.op === "nearest" && show.type === "nearest" && show.origin) {
    cam.shape = "nearest";
    cam.focus = { id: show.origin.ref, lat: show.origin.lat, lon: show.origin.lon, label: show.origin.name, label_ta: show.origin.name_ta ?? show.origin.name };
    cam.points = (show.pairs[0]?.to ?? []).map((x) => ({ lat: x.lat, lon: x.lon }));
  } else if (plan.steps.some((s) => s.op === "along") && r.context.lines[0]) {
    const l = r.context.lines[0].feat;
    const path = l.lines.reduce((a, b) => (b.length > a.length ? b : a), [] as Pair[]);
    cam.shape = "along";
    cam.line = { id: l.id, box: l.bbox, path };
  } else if (plan.steps.some((s) => s.op === "inside") && areas.length) cam.shape = "area";
  out.camera = cam;
  out.shots = cameraFor(cam, { width: 940, height: 594, padTopLeft: [400, 20], padBottomRight: [60, 40], reducedMotion: false, from: null });

  const used = new Set<string>(["incidents"]);
  for (const s of plan.steps) if (s.op === "take") used.add(s.layer);
  if (plan.steps.some((s) => s.op === "along")) used.add(r.context.lines[0]?.feat.layer ?? "roads");
  out.asOf = {
    now: w.now, data: w.dataAsOf,
    layers: [...used].map((id) => w.meta[id] ? { id, en: w.meta[id].name_en, ta: w.meta[id].name_ta, source: w.meta[id].source, as_of: w.meta[id].as_of, count: w.meta[id].count }
      : { id, en: "Incidents", ta: "சம்பவங்கள்", source: "District store", as_of: w.dataAsOf || w.now, count: w.incidents.length })
  };
  void data;
  return out;
}

// ---------------------------------------------------------------- glance --

const GLANCE_IDS = 5000;
/** The answer's key facts, counted over every result (not the list's 200): each tile shows its own rows when clicked. */
export function glanceOf(r: RunResult, w: World): Glance | null {
  const t = r.show.type;
  if (t === "nearest" || t === "areas" || !r.hits.length) return null;
  const tile = (hs: typeof r.hits): GlanceTile => ({ n: hs.length, ids: hs.slice(0, GLANCE_IDS).map((h) => h.inc.id) });
  const byZone = new Map<number, typeof r.hits>(), byDept = new Map<string, typeof r.hits>();
  for (const h of r.hits) {
    if (h.inc.zone != null) (byZone.get(h.inc.zone) ?? byZone.set(h.inc.zone, []).get(h.inc.zone)!).push(h);
    if (h.inc.dept) (byDept.get(h.inc.dept) ?? byDept.set(h.inc.dept, []).get(h.inc.dept)!).push(h);
  }
  const z = [...byZone.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
  const d = [...byDept.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  const zn = z ? w.zones.find((x) => x.zone === z[0])?.name ?? `Zone ${z[0]}` : null;
  return {
    open: tile(r.hits.filter((h) => h.inc.open && !h.inc.routed)),
    overdue: tile(r.hits.filter((h) => h.inc.open && h.inc.breached)),
    severe: tile(r.hits.filter((h) => h.inc.sev === "Severe")),
    // only when one zone or department stands out: "where" for a single-zone answer says nothing new
    where: z && byZone.size > 1 ? { ...tile(z[1]), en: `${zn} (Zone ${z[0]})`, ta: `${zn} (மண்டலம் ${z[0]})` } : null,
    who: d && byDept.size > 1 ? { ...tile(d[1]), code: d[0], name: w.depts.get(d[0])?.name ?? d[0] } : null
  };
}

// ------------------------------------------------------------------ news --

const byIncident = new WeakMap<NewsDoc[], Map<string, NewsDoc[]>>();
/** The world's articles by linked incident, newest first (built once per world). */
function newsIndex(w: World): Map<string, NewsDoc[]> {
  const docs = w.news ?? [];
  let m = byIncident.get(docs);
  if (!m) {
    m = new Map();
    for (const d of docs) if (d.inc) (m.get(d.inc) ?? m.set(d.inc, []).get(d.inc)!).push(d);
    byIncident.set(docs, m);
  }
  return m;
}
const PRESS_PER_ROW = 3;
function pressFor(w: World, id: string): Press[] {
  return (newsIndex(w).get(id) ?? []).slice(0, PRESS_PER_ROW).map((d) => ({ id: d.id, title: d.title_en || d.title, outlet: d.outlet, at: d.at, url: d.url }));
}
const NEWS_PIN_CAP = 500;
/** The articles behind an answer's incidents: pinned where an article names a locality, counted otherwise. */
export function newsFor(w: World, ids: string[]): { pins: NewsPin[]; unplaced: number; articles: number } {
  const idx = newsIndex(w);
  const docs = ids.flatMap((id) => idx.get(id) ?? []);
  const placed = docs.filter((d) => d.level === NEWS_PIN_LEVEL && d.lat != null && d.lon != null);
  return {
    pins: placed.slice(0, NEWS_PIN_CAP).map((d) => ({ id: d.id, lat: d.lat!, lon: d.lon!, title: d.title_en || d.title, outlet: d.outlet, at: d.at, url: d.url, inc: d.inc, place: d.place })),
    unplaced: docs.length - placed.length, articles: docs.length
  };
}

/** One line per question for evaluation: no names, no email, only the role. Never committed (data/aws-cache is ignored). */
function logQuestion(input: AskInput, r: AskResponse) {
  try {
    const line = JSON.stringify({ at: new Date().toISOString(), text: input.text, chip: !!input.plan, plan: r.plan, kind: r.kind, lang: r.lang, ms: r.ms, ai_used: r.ai_used,
      count: r.answer?.count ?? r.brief?.open.n ?? null, role: input.user.role });
    fs.appendFile(path.join(process.cwd(), "data", "aws-cache", "map-questions.jsonl"), line + "\n", () => undefined);
  } catch { /* logging never fails a question */ }
}

// ------------------------------------------------------------------ actions --

/** Every row of a plan's answer (not capped at the list's 200), for Export and Send to department. */
export async function answerRows(plan: Plan, user: AskInput["user"]): Promise<{ rows: Row[]; asOf: string; feats: Map<string, Feat> }> {
  const c = checkPlan(plan);
  if (!c.ok) throw new PlanError(c.problems[0]);
  const { world: w, resolver: data } = await world();
  const ctx: Ctx = { place: placeLookup(w, data), lang: c.plan.language };
  const r = runMapPlan(c.plan, w, ctx, user.role === "department_officer" ? user.lockDept : null);
  const deptName = (d: string) => w.depts.get(d)?.name ?? d;
  const rows: Row[] = r.hits.map((h) => ({
    id: h.inc.id, title: h.inc.title, sev: h.inc.sev, status: h.inc.status, open: h.inc.open, cat: h.inc.cat, catLabel: w.cats.get(h.inc.cat)?.label ?? h.inc.cat,
    dept: h.inc.dept, deptName: deptName(h.inc.dept), ward: h.inc.ward, zone: h.inc.zone, zoneName: w.zones.find((z) => z.zone === h.inc.zone)?.name ?? null,
    first: h.inc.first, place: h.inc.place, pinnable: h.inc.pinnable, prec: h.inc.prec, priority: h.inc.priority, reasons: h.inc.reasons,
    near: h.near ? { name: h.near.name, m: Math.round(h.near.m), layer: h.near.layer } : null, overdue: h.inc.breached && h.inc.open, citizen: h.inc.citizen > 0,
    news: (h.inc.outlets ?? 0) > 0, press: pressFor(w, h.inc.id)
  }));
  const feats = new Map(r.hits.map((h, k) => [h.inc.id, { id: h.inc.id, lat: h.inc.lat, lon: h.inc.lon, sev: h.inc.sev, open: h.inc.open, cat: h.inc.cat, pinnable: h.inc.pinnable,
    prec: h.inc.prec, title: h.inc.title, rank: k, citizen: h.inc.citizen > 0, news: (h.inc.outlets ?? 0) > 0 }]));
  return { rows, asOf: w.dataAsOf || w.now, feats };
}

const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** CSV or GeoJSON of exactly the answer's rows (the count equals the headline). No personal data; the as-of and the plan go in the header. */
export async function exportAnswer(plan: Plan, question: string | null, user: AskInput["user"], format: "csv" | "geojson"): Promise<{ body: string; type: string; name: string; rows: number }> {
  const { rows, asOf, feats } = await answerRows(plan, user);
  const stamp = asOf.slice(0, 16).replace(/[: ]/g, "-");
  if (format === "geojson") {
    const fc = {
      type: "FeatureCollection",
      properties: { source: "District IQ · Ask the Map", question, as_of: asOf, rows: rows.length, plan, note: "Straight-line distances. Incidents with no exact place have no geometry." },
      features: rows.map((r) => {
        const f = feats.get(r.id)!;
        return { type: "Feature", geometry: r.pinnable ? { type: "Point", coordinates: [f.lon, f.lat] } : null,
          properties: { id: r.id, title: r.title, category: r.catLabel, severity: r.sev, status: r.status, open: r.open, ward: r.ward, zone: r.zoneName, department: r.deptName,
            first_reported: r.first, place: r.place, location_known_to_m: r.prec, nearest: r.near?.name ?? null, nearest_m: r.near?.m ?? null } };
      })
    };
    return { body: JSON.stringify(fc), type: "application/geo+json", name: `ask-the-map-${stamp}.geojson`, rows: rows.length };
  }
  const head = ["id", "title", "category", "severity", "status", "open", "ward", "zone", "department", "first_reported", "place", "nearest", "nearest_m", "lat", "lon", "location_known_to_m"];
  const lines = rows.map((r) => {
    const f = feats.get(r.id)!;
    return [r.id, r.title, r.catLabel, r.sev, r.status, r.open ? "yes" : "no", r.ward, r.zoneName, r.deptName, r.first, r.place, r.near?.name ?? "", r.near?.m ?? "",
      r.pinnable ? f.lat : "", r.pinnable ? f.lon : "", r.prec ?? ""].map(csvCell).join(",");
  });
  const meta = [`# District IQ · Ask the Map export`, `# Question: ${question ?? "(edited with chips)"}`, `# As of: ${asOf} · ${rows.length} rows · straight-line distances`,
    `# Plan: ${JSON.stringify(plan)}`];
  return { body: [...meta, head.join(","), ...lines].join("\n") + "\n", type: "text/csv; charset=utf-8", name: `ask-the-map-${stamp}.csv`, rows: rows.length };
}
