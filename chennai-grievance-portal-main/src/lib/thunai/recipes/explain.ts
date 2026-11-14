/**
 * "Explain this": one case, or one part of a change, told the way an aide would (docs/qa/JARVIS_VOICE.md rule 5), in 2 to 4 short
 * sentences: what is wrong and where, how long it has been stuck, why it matters, what I would do. The facts are joined with reasons,
 * not listed. It is grounded on the case record (incident_detail, the CaseDetail block's data), how the same kind of report moved in the
 * same zone (change_drivers), the news linked to it, and the nearest rain gauge and the reservoirs when the kind is one rain is linked with.
 *
 * Every figure is code's and is on the screen; time is said in words (common.ts timeWords). The line retells and never reads a record
 * out: speechcheck.ts copiedRun and labelIn run on it, and a line that fails falls back to the plainest retelling. Rain is said as a
 * thing that happened nearby, in time, never as the cause.
 */
import { spoken } from "../insight";
import { closedAs, explainIssue, factSheet, hoursOf } from "../narrate";
import { caseRow, metres, recordsOf, when, type Slots } from "../screens";
import { speechProblem } from "../speechcheck";
import { hoursBetween } from "../stagelocal";
import type { BlockT, Bilingual, CaseRowT, StageDocT } from "../stage";
import { unusual, type Dim } from "./adtributor";
import { analyseChange, type Seg } from "./changed";
import { RAIN_KINDS, WATER_KINDS, bi, call, catName, clip, inTa, langOf, num, pick, scopeArg, segIn, stepFor, timeWords, windowWords, zoneName,
  type Lang, type RecipeCtx, type RecipePart, type Row } from "./common";

export type ExplainTarget = { kind: "case"; id: string } | { kind: "change"; dim: Dim; key: string } | { kind: "scope" };

const ID = /^[A-Za-z0-9_-]{3,64}$/;
const isDim = (x: unknown): x is Dim => x === "zone" || x === "dept" || x === "cat";

/**
 * What "explain" points at, from the slots: an incident id (`id`), one part of a change (`change: {dim, key}`, or `what: "change"` with
 * one zone, department or kind named), else the most urgent open case in the scope.
 */
export function explainTarget(slots: Slots): ExplainTarget {
  const x = slots as Slots & { change?: { dim?: unknown; key?: unknown } | null };
  if (x.id && ID.test(x.id)) return { kind: "case", id: x.id };
  const ch = x.change;
  if (ch && isDim(ch.dim) && typeof ch.key === "string" && ch.key.trim()) return { kind: "change", dim: ch.dim, key: ch.key.trim() };
  if (String(x.what ?? "") === "change") {
    if (x.zones.length === 1) return { kind: "change", dim: "zone", key: String(x.zones[0]) };
    if (x.dept) return { kind: "change", dim: "dept", key: x.dept };
    if (x.cat) return { kind: "change", dim: "cat", key: x.cat };
  }
  return { kind: "scope" };
}

/**
 * On an open Stage, what "explain" (or "explain the second one", n = 2) means: the case a CaseDetail shows; on a "what changed" screen
 * the nth mover (the most telling first); else the nth case of the list. Null when the Stage holds nothing to explain.
 * Thunai.tsx calls this instead of mapping explain to "again".
 */
export function explainTargetOf(doc: Pick<StageDocT, "blocks">, n?: number | null): ExplainTarget | null {
  const at = Math.max(1, Math.round(n ?? 1)) - 1;
  const detail = doc.blocks.find((b) => b.kind === "CaseDetail");
  if (detail?.kind === "CaseDetail") return { kind: "case", id: detail.incident.id };
  const isChange = doc.blocks.some((b) => b.kind === "Findings" && b.id === "drivers");
  const movers = doc.blocks.find((b) => b.kind === "Ranking" && b.id === "movers");
  if (isChange && movers?.kind === "Ranking") {
    const it = movers.items[at];
    if (it) return { kind: "change", dim: it.action === "zone" ? "zone" : it.action === "dept" ? "dept" : "cat", key: it.key };
  }
  const list = doc.blocks.find((b) => b.kind === "CaseList");
  if (list?.kind === "CaseList" && list.rows[at]) return { kind: "case", id: list.rows[at].id };
  return null;
}

/** The slots that build the explain screen for a target (for Thunai.tsx's direct call). */
export function explainSlots(t: ExplainTarget): Partial<Slots> & { change?: { dim: Dim; key: string } } {
  return t.kind === "case" ? { id: t.id } : t.kind === "change" ? { change: { dim: t.dim, key: t.key } } : {};
}

// ------------------------------------------------------------------ the readings near a case --

const LAKE_TA: Record<string, string> = { chembarambakkam: "செம்பரம்பாக்கம்", puzhal: "புழல்", "red hills": "புழல்", poondi: "பூண்டி", cholavaram: "சோழவரம்", veeranam: "வீராணம்",
  kannankottai: "கண்ணன்கோட்டை", thervoy: "கண்ணன்கோட்டை" };
const lakeTa = (name: string) => Object.entries(LAKE_TA).find(([k]) => name.toLowerCase().includes(k))?.[1] ?? null;

interface Reading { name: string; value: number; mean28: number | null; t: string | null; n: number; lat: number | null; lon: number | null; all: Row[] }
async function rainNear(c: RecipeCtx, at: { lat: number | null; lon: number | null }): Promise<Reading | null> {
  const r = await call(c, "environment", { metric: "rainfall_24h_mm" }).catch(() => null);
  const rows = (((r?.data as Row | undefined)?.rows ?? []) as Row[]).filter((x) => num(x.value) != null);
  if (!rows.length) return null;
  // the nearest gauge within 25 km of the case, else the wettest gauge in the data
  const near = at.lat != null && at.lon != null ? rows.filter((x) => num(x.lat) != null && num(x.lon) != null)
    .map((x) => ({ x, m: metres({ lat: at.lat as number, lon: at.lon as number }, { lat: Number(x.lat), lon: Number(x.lon) }) })).filter((y) => y.m <= 25_000).sort((a, b) => a.m - b.m)[0]?.x : null;
  const best = near ?? [...rows].sort((a, b) => Number(b.value) - Number(a.value))[0];
  return { name: clip(best.place, 120), value: Math.round(Number(best.value) * 10) / 10, mean28: num(best.mean28), t: best.t ?? null, n: rows.length, lat: num(best.lat), lon: num(best.lon), all: rows };
}
async function fullestLake(c: RecipeCtx): Promise<Reading | null> {
  const r = await call(c, "environment", { metric: "lake_pct_full" }).catch(() => null);
  const rows = (((r?.data as Row | undefined)?.rows ?? []) as Row[]).filter((x) => num(x.value) != null);
  if (!rows.length) return null;
  const best = [...rows].sort((a, b) => Number(b.value) - Number(a.value))[0];
  return { name: clip(best.place, 120), value: Math.round(Number(best.value)), mean28: num(best.mean28), t: best.t ?? null, n: rows.length, lat: num(best.lat), lon: num(best.lon), all: rows };
}
const readingsBlock = (id: string, title: string, metric: string, unit: string, r: Reading): BlockT => ({ kind: "Readings", id, title: clip(title, 160), metric, unit,
  items: [r.all.find((x) => clip(x.place, 120) === r.name), ...r.all.filter((x) => clip(x.place, 120) !== r.name).sort((a, b) => Number(b.value) - Number(a.value))].filter(Boolean).slice(0, 8)
    .map((x) => ({ id: clip(String((x as Row).place_id ?? (x as Row).place), 80), name: clip((x as Row).place, 120), value: Math.round(Number((x as Row).value) * 10) / 10, t: (x as Row).t ?? null,
      mean28: num((x as Row).mean28) == null ? null : Math.round(Number((x as Row).mean28) * 10) / 10, z: num((x as Row).zscore), anomaly: !!(x as Row).anomaly, detail: null })) });

// ------------------------------------------------------------------ one case --

const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad|people)\b/i.test(s) ? s : `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface CaseContext {
  row: CaseRowT; cat: string | null; hours: number | null; closed: ReturnType<typeof closedAs>;
  /** the same kind in the same zone, the last 7 days against the 7 days before */
  trend: { now: number; before: number; flag: "high" | "low" | null } | null;
  rain: Reading | null; lake: Reading | null; news: Row[];
}

/** The spoken explanation of one case, from its facts and its context: what and where, how long, why it matters, what I'd do. */
export function explainCaseSay(x: CaseContext, w: RecipeCtx["w"], sources: string[]): Bilingual {
  const { row } = x;
  const zone = zoneName(w, row.zone);
  const f = factSheet(row, { places: w.places, placeTa: zone?.ta ?? null, next: stepFor(x.cat, row.dept, row.deptName), open: x.closed ? 0 : 1 });
  f.hours = x.hours;
  if (x.closed) f.closed = x.closed;
  const names = [f.place ?? "", zone?.en ?? "", zone?.ta ?? ""];
  // a closed case is told as closed: nothing to chase (narrate.ts explainIssue)
  if (f.closed) return explainIssue(f, row.cat ?? "an issue", sources);
  const what = f.what ? article(f.what.en) : `an issue${row.cat ? ` logged under ${row.cat.toLowerCase().replace(/&/g, "and")}` : ""}`;
  const there = /^people\b/.test(what) ? "There are" : "There's";
  // a place the gazetteer names, then its zone; a record that names no place is said by its zone alone ("in Royapuram", never "at Royapuram")
  const atPlace = f.place && f.place !== row.zoneName && f.place !== zone?.en ? f.place : null;
  const where = atPlace ? ` at ${atPlace}${zone ? `, in ${zone.en}` : ""}` : zone ? ` in ${zone.en}` : f.place ? ` in ${f.place}` : "";
  const s1 = `${there} ${what}${where}.`;
  const age = timeWords(x.hours);
  const s2 = age ? `It's been stuck for ${age.en}${row.overdue ? ", and it's past its deadline" : ""}.` : row.overdue ? "It's past its deadline." : "";
  // why it matters: at most two reasons, joined, the trend last so "so it's getting worse" follows it
  // the trend is of the case's own kind in its own zone (read only when the kind is known), said by the kind's name
  const kindEn = catName(w, x.cat)?.en.toLowerCase().replace(/&/g, "and") ?? "reports like it";
  const reasons: { en: string; ta: string; worse?: boolean }[] = [];
  if (row.complaints >= 2) reasons.push({ en: `${spoken(row.complaints)} people have complained`, ta: `${spoken(row.complaints)} பேர் புகார் கொடுத்திருக்காங்க` });
  const up = x.trend && x.trend.now > x.trend.before;
  if (x.trend && up && zone) reasons.push({ en: `${kindEn}${kindEn.startsWith("reports") ? "" : " reports"} in ${zone.en} went up this week, ${spoken(x.trend.now)} against ${spoken(x.trend.before)}${x.trend.flag === "high" ? ", above the usual range" : ""}`,
    ta: `இந்த வாரம் ${inTa(zone.ta)} இந்த மாதிரி ${spoken(x.trend.now)} புகார் வந்திருக்கு, முன்னாடி ${spoken(x.trend.before)}`, worse: true });
  if (x.rain && x.rain.value >= 10) reasons.push({ en: `${spoken(x.rain.value)} mm of rain fell nearby in the last 24 hours`, ta: `கடந்த 24 மணி நேரத்துல பக்கத்துல ${spoken(x.rain.value)} மி.மீ மழை பெஞ்சிருக்கு` });
  if (x.lake && x.lake.value >= 80) reasons.push({ en: `${x.lake.name} is ${spoken(x.lake.value)}% full`, ta: `${lakeTa(x.lake.name) ?? "ஒரு ஏரி"} ${spoken(x.lake.value)}% நிரம்பியிருக்கு` });
  if (x.news.length) reasons.push({ en: "it's in the news too", ta: "செய்தியிலயும் வந்திருக்கு" });
  if (f.serious) reasons.push({ en: "it's rated serious", ta: "இது கடுமையான பிரச்சினை" });
  const two = reasons.slice(0, 2).sort((a, b) => Number(!!a.worse) - Number(!!b.worse));
  const worse = two.some((r) => r.worse);
  const s3 = two.length ? `${cap(two.map((r) => r.en).join(", and "))}${worse ? ", so it's getting worse" : ""}.` : "";
  const step = stepFor(x.cat, row.dept, row.deptName);
  // "today" once: the step may already carry it ("for a status today")
  const today = row.overdue && !/\btoday\b/.test(step.en);
  const s4 = `I'd ${step.en}${today ? " today" : ""}.`;
  const en = [s1, s2, s3, s4].filter(Boolean).join(" ");
  const whatTa = f.what ? f.what.ta : "ஒரு பிரச்சினை";
  const t1 = `${zone ? `${inTa(zone.ta)} ` : ""}${whatTa} இருக்கு.`;
  const t2 = age ? `${age.ta} அப்படியே இருக்கு${row.overdue ? ", கெடுவும் தாண்டிடுச்சு" : ""}.` : row.overdue ? "கெடு தாண்டிடுச்சு." : "";
  const t3 = two.length ? `${two.map((r) => r.ta).join("; ")}${worse ? "; நிலைமை மோசமாகுது" : ""}.` : "";
  const t4 = `${step.ta}${row.overdue && !/இன்றே|இன்னைக்கே|இன்று/.test(step.ta) ? ", இன்னைக்கே" : ""}.`;
  const ta = [t1, t2, t3, t4].filter(Boolean).join(" ");
  // the gates: a line that reads the record out, or carries a field, is said plainly instead
  if (speechProblem(en, sources, names)) return { en: [`${there} ${what}${where}.`, s2, s4].filter(Boolean).join(" "), ta };
  return { en, ta };
}

async function topCaseId(c: RecipeCtx): Promise<string | null> {
  if (c.h.list) {
    c.runs.push("incidents");
    c.sources.add("incidents");
    const r = await c.h.list(c.s, { sev: null, status: "open", q: c.slots.q, sort: "sev" });
    return r.rows[0]?.id ? String(r.rows[0].id) : null;
  }
  const r = await call(c, "incidents", { scope: scopeArg(c.s), sev: null, status: "open", q: c.slots.q, sort: "sev", dir: 1, page: 0 });
  const id = ((r.data as Row | undefined)?.rows ?? [])[0]?.id;
  return id ? String(id) : null;
}

async function explainCase(c: RecipeCtx, id: string): Promise<RecipePart> {
  const lang = langOf(c.heard);
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const r = await call(c, "incident_detail", { id });
  const d = r.data as { incident: Row; reports?: Row[]; officials?: Row[] } | null;
  if (!d?.incident) return { title: L("Incident", "சம்பவம்"), takeaway: null, say: bi("I could not find that incident in the data.", "அந்தச் சம்பவம் தரவில் இல்லை."),
    blocks: [{ kind: "Note", id: "none", text: L("No such incident in the data.", "அப்படி ஒரு சம்பவம் தரவில் இல்லை.") }] };
  const i = d.incident;
  const row = caseRow({ ...i, loc: i.place ?? i.loc }, c.w);
  const cat = String(i.cat ?? i.cat_code ?? i.category_code ?? "").match(/^[A-Z_]{3,40}$/)?.[0] ?? null;
  const hours = num(i.hours_open) ?? hoursOf(i.open_for) ?? hoursBetween(i.t ?? i.first ?? row.t, r.asOf);
  const closed = closedAs(row.status, i.open);
  const [trendR, news, rain, lake] = await Promise.all([
    row.zone && cat && !closed ? call(c, "change_drivers", { scope: { period: "weekly", zone: row.zone, dept: null, cat, taluk: null } }).catch(() => null) : Promise.resolve(null),
    c.h.news({ ...c.s, zone: null, dept: null, cat: null, taluk: null }).then((x) => { c.runs.push("console_news"); c.sources.add("console latest news"); return x.rows.filter((n) => String(n.incident ?? "") === row.id); }).catch(() => [] as Row[]),
    cat && RAIN_KINDS.has(cat) && !closed ? rainNear(c, row) : Promise.resolve(null),
    cat && WATER_KINDS.has(cat) && !closed ? fullestLake(c) : Promise.resolve(null)
  ]);
  const tt = ((trendR?.data as Row | undefined)?.totals ?? null) as Row | null;
  const trend = tt && num(tt.n) != null && num(tt.prev) != null ? { now: Number(tt.n), before: Number(tt.prev), flag: unusual(Number(tt.n), Number(tt.prev)).flag } : null;
  const ctx: CaseContext = { row, cat, hours, closed, trend, rain, lake, news };

  // the case itself, as the case screen shows it
  const what = ((i.why?.what ?? []) as unknown[]).map((x) => clip(x, 300)).slice(0, 6);
  const timeline = (d.reports ?? []).slice(0, 20).map((x) => ({ t: clip(x.t, 30), source: clip(x.publisher ?? x.source, 60), text: clip(x.title ?? x.what, 300) }));
  const officials = (d.officials ?? []).slice(0, 4).map((o) => ({ name: clip(o.name, 80), role: clip(o.designation, 120) }));
  const blocks: BlockT[] = [{ kind: "CaseDetail", id: "case", incident: { ...row, what, why: clip(i.why?.why?.[0], 300) || null, next: clip(i.why?.next, 300) || null, deadline: when(i.sla_due), officials }, timeline }];

  // why it matters, each with its method, what it rests on and a caveat
  const zone = zoneName(c.w, row.zone);
  const kind = catName(c.w, cat, row.cat);
  const items: Extract<BlockT, { kind: "Findings" }>["items"] = [];
  if (trend && zone) items.push({ title: clip(L(`${kind?.en ?? "This kind"} in ${zone.en}: ${trend.now} in the last 7 days, ${trend.before} the 7 days before`, `${inTa(zone.ta)} ${kind?.ta ?? "இந்த வகை"}: கடந்த 7 நாளில் ${trend.now}, அதற்கு முன் 7 நாளில் ${trend.before}`), 240),
    value: trend.now, unit: L("reports", "புகார்கள்"), method: L("Reports of this kind in this zone, the last 7 days against the 7 days before (change_drivers)", "இந்த மண்டலத்தில் இந்த வகைப் புகார்கள், கடந்த 7 நாள், அதற்கு முந்தைய 7 நாளுடன்"),
    n: trend.now + trend.before, caveat: L("A count of reports, not of the problem on the ground.", "இது புகார்களின் எண்ணிக்கை, களத்தின் நிலை அல்ல."), tone: trend.now > trend.before ? "bad" : "ok" });
  if (rain) items.push({ title: clip(L(`Rain at ${rain.name}: ${rain.value} mm in the last 24 hours`, `அருகிலுள்ள மழைமானி: கடந்த 24 மணி நேரத்தில் ${rain.value} மி.மீ`), 240), value: rain.value, unit: "mm",
    method: clip(L(`Latest reading at the nearest gauge${rain.mean28 != null ? `; its 28-day mean is ${Math.round(rain.mean28 * 10) / 10} mm` : ""}`, `அருகிலுள்ள மழைமானியின் சமீபத்திய அளவு${rain.mean28 != null ? `; 28 நாள் சராசரி ${Math.round(rain.mean28 * 10) / 10} மி.மீ` : ""}`), 200),
    n: rain.n, caveat: L("A gauge near the place, not at it: linked in time and place only.", "இடத்துக்கு அருகிலுள்ள மானி மட்டுமே: நேரத்திலும் இடத்திலும் மட்டுமே தொடர்பு."), tone: rain.value >= 15 ? "warn" : "ok" });
  if (lake) items.push({ title: clip(L(`${lake.name}: ${lake.value}% full`, `${lakeTa(lake.name) ?? "அதிகம் நிரம்பிய நீர்த்தேக்கம்"}: ${lake.value}% நிரம்பியுள்ளது`), 240), value: lake.value, unit: "% full",
    method: clip(L(`The fullest of ${lake.n} reservoirs, latest reading`, `${lake.n} நீர்த்தேக்கங்களில் அதிகம் நிரம்பியது, சமீபத்திய அளவு`), 200), n: lake.n,
    caveat: L("Storage is read once a day.", "இருப்பு நாளுக்கு ஒருமுறை அளக்கப்படுகிறது."), tone: lake.value >= 80 ? "warn" : "ok" });
  if (news.length) items.push({ title: clip(L(`${news.length} news ${news.length === 1 ? "report" : "reports"} on this`, `இது பற்றி ${news.length} செய்திகள்`), 240), value: news.length, unit: null,
    method: L("News reports the pipeline linked to this incident", "இந்தச் சம்பவத்துடன் இணைக்கப்பட்ட செய்திகள்"), n: news.length, caveat: L("Headlines are shown, never read out.", "தலைப்புகள் காட்டப்படும், படிக்கப்படாது."), tone: "ok" });
  if (items.length) blocks.push({ kind: "Findings", id: "context", title: L("Why it matters", "இது ஏன் முக்கியம்"), items });
  if (news.length) blocks.push({ kind: "NewsReader", id: "news", title: L("In the news", "செய்திகளில்"), total: news.length, items: news.slice(0, 10).map((x) => ({
    id: clip(x.id, 120), title: clip(x.title, 300), source: clip((x.outletNames ?? [])[0] ?? x.publisher, 80) || null, t: x.t ?? null, place: clip(x.loc, 120) || null, incidentId: x.incident ?? null,
    url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null })) });
  if (rain) blocks.push(readingsBlock("rain", L("Rainfall, last 24 hours", "கடந்த 24 மணி நேர மழை"), "rain", "mm", rain));
  if (lake) blocks.push(readingsBlock("lakes", L("Reservoir storage", "நீர்த்தேக்க இருப்பு"), "lakes", "% full", lake));
  if (row.lat != null && row.lon != null) blocks.push({ kind: "MapView", id: "map", title: L("Where", "எங்கே"), rule: null, shade: null, outline: [],
    points: [{ n: 1, id: row.id, lat: row.lat, lon: row.lon, label: row.title, sev: row.sev, value: null, hot: true }] });

  const sources = [row.title, String(i.summary ?? ""), ...what, ...timeline.map((x) => x.text), ...news.map((x) => String(x.title ?? ""))].filter(Boolean);
  const say = explainCaseSay(ctx, c.w, sources);
  // where the record comes from, when it matters (JARVIS_VOICE rule 6): police, PWD and government-hospital records are generated test data
  if (row.dept && /^(POL-|PWD-|HLT-DMS$)/.test(row.dept)) c.notes.push(pick(lang, recordsOf(row.dept)));
  const title = L(`Explain · ${kind?.en ?? "an issue"}${zone ? ` · ${zone.en}` : ""}`, `விளக்கம் · ${kind?.ta ?? "ஒரு பிரச்சினை"}${zone ? ` · ${zone.ta}` : ""}`);
  return { title, takeaway: row.overdue && !closed ? bi("Past its deadline.", "காலக்கெடு தாண்டியது.") : null, say, blocks: blocks.slice(0, 6) };
}

// ------------------------------------------------------------------ one part of a change --

async function explainChange(c: RecipeCtx, dim: Dim, key: string): Promise<RecipePart> {
  const lang = langOf(c.heard);
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const a = await analyseChange(c);
  const seg = a.splits.find((x) => x.dim === dim)?.segs.find((x) => x.key === key && !x.other) as Seg | undefined;
  const win = windowWords(c.s.period);
  if (!seg) return { title: L("Explain the change", "மாற்றத்தின் விளக்கம்"), takeaway: null, say: bi("That part of the change is not in the data for this window.", "இந்தக் காலத்துக்கான தரவில் அந்தப் பகுதி இல்லை."),
    blocks: [{ kind: "Note", id: "none", text: L("Nothing in this window matches that part of the change.", "இந்தக் காலத்தில் அந்தப் பகுதிக்கு எதுவும் இல்லை.") }] };
  // inside the segment: the kinds that moved in a zone or a department; the zones that moved for a kind
  const narrowed = { ...c.s, ...(dim === "zone" ? { zone: Number(key) } : dim === "dept" ? { dept: key } : { cat: key }) };
  const [sub, zr] = await Promise.all([
    call(c, "change_drivers", { scope: scopeArg(narrowed) }).catch(() => null),
    dim === "cat" ? call(c, "zones", { scope: scopeArg({ ...narrowed, zone: null }) }).catch(() => null) : Promise.resolve(null)
  ]);
  const sd = (sub?.data ?? {}) as Row;
  const same = (d: number) => (seg.delta >= 0 ? d > 0 : d < 0);
  const inner = dim === "cat"
    ? (((zr?.data as Row | undefined)?.rows ?? []) as Row[]).filter((x) => num(x.n) != null && num(x.n_prev) != null)
      .map((x) => ({ key: String(Number(x.zone)), name: zoneName(c.w, Number(x.zone)) ?? bi(clip(x.name, 80), clip(x.name, 80)), now: Number(x.n), before: Number(x.n_prev), d: Number(x.n) - Number(x.n_prev), zone: Number(x.zone) }))
    : ((sd.categories ?? []) as Row[]).filter((x) => x.code && num(x.n) != null && num(x.prev) != null)
      .map((x) => ({ key: String(x.code), name: catName(c.w, String(x.code), clip(x.label, 80)) ?? bi(String(x.code), String(x.code)), now: Number(x.n), before: Number(x.prev), d: Number(x.n) - Number(x.prev), zone: null as number | null }));
  inner.sort((x, y) => (same(y.d) ? Math.abs(y.d) : -1) - (same(x.d) ? Math.abs(x.d) : -1));
  const lead = inner.find((x) => same(x.d));
  // the kind of incident the part is about: the part itself, or the kind that moved most inside a zone or a department
  const kindCode = dim === "cat" ? key : lead ? lead.key : null;
  const rainy = !!kindCode && RAIN_KINDS.has(kindCode) && seg.delta > 0;
  // a gauge reads the last 24 hours: said beside a 24-hour window only; a longer window is set against its rain days
  const rain = rainy && c.s.period === "daily" ? await rainNear(c, { lat: null, lon: null }) : null;
  const rainDays = num(sd.rainDays), rainDaysBefore = num(sd.rainDaysPrev);
  const wetter = rainy && !rain && rainDays != null && rainDaysBefore != null && rainDays > rainDaysBefore;
  const linked = num((sd.totals as Row | undefined)?.rainLinked);
  const overdue = num((sd.totals as Row | undefined)?.overdue);
  const u = unusual(seg.now, seg.before);
  const pct = seg.ep == null ? null : Math.round(seg.ep * 100);
  const up = seg.delta > 0;

  const blocks: BlockT[] = [{ kind: "Kpis", id: "kpis", title: clip(pick(lang, seg.name), 120), items: [
    { key: "now", label: clip(L(`Reported, ${win.now.en}`, `பதிவானவை, ${win.now.ta}`), 80), value: seg.now, unit: null, prev: seg.before, delta: seg.delta, tone: up ? "bad" : "good", spark: [] },
    { key: "before", label: clip(L(`Reported, ${win.before.en}`, `பதிவானவை, ${win.before.ta}`), 80), value: seg.before, unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
    ...(pct != null ? [{ key: "share", label: L("Share of the whole change", "மொத்த மாற்றத்தில் பங்கு"), value: pct, unit: "%", prev: null, delta: null, tone: "neutral" as const, spark: [] }] : []),
    ...(dim === "dept" && overdue != null ? [{ key: "overdue", label: L("Open past their deadline", "காலக்கெடு தாண்டியவை"), value: overdue, unit: null, prev: null, delta: null, tone: "bad" as const, spark: [] }] : []),
    ...(wetter ? [{ key: "raindays", label: L("Rain days", "மழை நாட்கள்"), value: rainDays as number, unit: null, prev: rainDaysBefore, delta: (rainDays as number) - (rainDaysBefore as number), tone: "neutral" as const, spark: [] }] : []),
    ...(linked ? [{ key: "rain", label: L("During or after rain", "மழையின் போது அல்லது பிறகு"), value: linked, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }] : [])
  ] }];
  const items: Extract<BlockT, { kind: "Findings" }>["items"] = [];
  if (u.flag) items.push({ title: clip(L(`${seg.name.en}: ${u.flag === "high" ? "above" : "below"} the usual range`, `${seg.name.ta}: வழக்கமான அளவை விட ${u.flag === "high" ? "அதிகம்" : "குறைவு"}`), 240), value: seg.now, unit: L("incidents", "சம்பவங்கள்"),
    method: clip(L(`Exact test of two Poisson counts: ${seg.now} now against ${seg.before} before; 99% band ${u.band.lo} to ${u.band.hi}`, `இரண்டு Poisson எண்ணிக்கைகளின் சோதனை: இப்போது ${seg.now}, முன்பு ${seg.before}; 99% வரம்பு ${u.band.lo}–${u.band.hi}`), 200),
    n: seg.now + seg.before, caveat: L("The window before is a rough baseline on its own.", "முந்தைய காலம் மட்டுமே ஒரு தோராயமான அடிப்படை."), tone: "warn" });
  if (lead) items.push({ title: clip(L(`${lead.name.en}: ${Math.abs(lead.d)} ${lead.d > 0 ? "more" : "fewer"} (${lead.now} against ${lead.before})`, `${lead.name.ta}: ${Math.abs(lead.d)} ${lead.d > 0 ? "கூடுதல்" : "குறைவு"} (${lead.now}, முன்பு ${lead.before})`), 240),
    value: lead.d, unit: L("incidents", "சம்பவங்கள்"), method: L(dim === "cat" ? "The zone where this kind moved most, against the window before" : "The kind that moved most here, against the window before", dim === "cat" ? "இந்த வகை அதிகம் மாறிய மண்டலம், முந்தைய காலத்துடன்" : "இங்கே அதிகம் மாறிய வகை, முந்தைய காலத்துடன்"),
    n: inner.length, caveat: L("Shows where the change sits, not what is behind it.", "மாற்றம் எங்கே என்று மட்டும் காட்டுகிறது, அதன் பின்னணியை அல்ல."), tone: lead.d > 0 ? "bad" : "ok" });
  if (rain) items.push({ title: clip(L(`Rain at ${rain.name}: ${rain.value} mm in the last 24 hours`, `அதிக மழை பெய்த மானி: கடந்த 24 மணி நேரத்தில் ${rain.value} மி.மீ`), 240), value: rain.value, unit: "mm",
    method: L(`The wettest of ${rain.n} gauges, latest reading`, `${rain.n} மழைமானிகளில் அதிகம், சமீபத்திய அளவு`), n: rain.n, caveat: L("Linked in time only.", "நேரத்தில் மட்டுமே தொடர்பு."), tone: rain.value >= 15 ? "warn" : "ok" });
  if (items.length) blocks.push({ kind: "Findings", id: "why", title: L("What sits under it", "இதன் உள்ளே"), items });
  const moved = inner.filter((x) => x.d !== 0).slice(0, 10);
  if (moved.length) blocks.push({ kind: "Ranking", id: "inner", title: dim === "cat" ? L("Zones, the biggest move first", "மண்டலங்கள், அதிகம் மாறியது முதலில்") : L("Kinds, the biggest move first", "வகைகள், அதிகம் மாறியது முதலில்"),
    unit: L("incidents", "சம்பவங்கள்"), order: "top", method: L("Change against the window before", "முந்தைய காலத்தை விட மாற்றம்"),
    items: moved.map((x, i) => ({ key: x.key, label: clip(pick(lang, x.name), 120), value: x.d, rank: i + 1, sub: clip(L(`${x.now} now, ${x.before} before`, `இப்போது ${x.now}, முன்பு ${x.before}`), 160), zone: x.zone, lat: null, lon: null, action: x.zone != null ? "zone" as const : "none" as const })) });
  if (rain) blocks.push(readingsBlock("rain", L("Rainfall, last 24 hours", "கடந்த 24 மணி நேர மழை"), "rain", "mm", rain));
  const top = ((sd.top ?? []) as Row[]).map((x) => caseRow({ ...x, sev: x.severity ?? x.sev, why: null, reasons: x.reasons }, c.w));
  if (top.length) blocks.push({ kind: "CaseList", id: "top", title: L("The open incidents that rank highest here", "இங்கே முன்னுரிமை உள்ள திறந்த சம்பவங்கள்"), source: "list", sev: null, total: top.length, rows: top });

  // the spoken line
  const said = seg.said;
  const capd = said.en.charAt(0).toUpperCase() + said.en.slice(1);
  const subject = dim === "zone" ? `Incidents in ${said.en}` : dim === "dept" ? `Cases with ${said.en}` : `${capd} reports`;
  const en: string[] = [`${subject} went ${up ? "up" : "down"}: ${spoken(seg.now)} ${win.inNow.en} against ${spoken(seg.before)} ${win.before.en}${pct != null && pct > 0 ? `, ${pct}% of the whole change` : ""}.`];
  const ta: string[] = [`${segIn(dim, said.ta)} ${win.now.ta} ${spoken(seg.now)}${dim === "cat" ? "" : " சம்பவங்கள்"}, ${win.before.ta} ${spoken(seg.before)}; ${up ? "கூடியிருக்கு" : "குறைஞ்சிருக்கு"}${pct != null && pct > 0 ? `, மொத்த மாற்றத்தில் ${pct}%` : ""}.`];
  if (lead) {
    const leadSaid = dim === "cat" ? lead.name : bi(lead.name.en.toLowerCase().replace(/&/g, "and"), lead.name.ta);
    en.push(dim === "cat" ? `Most of it is in ${leadSaid.en}, ${spoken(Math.abs(lead.d))} ${lead.d > 0 ? "more" : "fewer"}.` : `Most of it is ${leadSaid.en}, ${spoken(Math.abs(lead.d))} ${lead.d > 0 ? "more" : "fewer"}.`);
    ta.push(dim === "cat" ? `பெரும்பகுதி ${inTa(leadSaid.ta)}, ${spoken(Math.abs(lead.d))} ${lead.d > 0 ? "கூட" : "குறைவு"}.` : `பெரும்பகுதி ${leadSaid.ta} புகார்கள், ${spoken(Math.abs(lead.d))} ${lead.d > 0 ? "கூட" : "குறைவு"}.`);
  } else if (dim === "dept" && overdue) {
    en.push(`${spoken(overdue)} of its open cases are past their deadline.`);
    ta.push(`இதுல ${spoken(overdue)} கெடு தாண்டியவை.`);
  }
  const why: Bilingual[] = [];
  if (u.flag) why.push(bi(`that's ${u.flag === "high" ? "above" : "below"} the usual range`, `இது வழக்கமான அளவை விட ${u.flag === "high" ? "அதிகம்" : "குறைவு"}`));
  if (rain && rain.value >= 10) why.push(bi(`${spoken(rain.value)} mm of rain fell at ${rain.name} in the same 24 hours`, `அதே 24 மணி நேரத்துல ${spoken(rain.value)} மி.மீ மழை பெஞ்சிருக்கு`));
  else if (wetter) why.push(bi(`the window had ${spoken(rainDays as number)} rain days against ${spoken(rainDaysBefore as number)} before`, `இந்தக் காலத்துல ${spoken(rainDays as number)} மழை நாள், முன்னாடி ${spoken(rainDaysBefore as number)}`));
  else if (linked && up) why.push(bi(`${spoken(linked)} came during or after rain`, `${spoken(linked)} மழை நேரத்துலயோ அதுக்கு அப்புறமோ வந்திருக்கு`));
  if (why.length) { const j = why.slice(0, 2); en.push(`${cap(j.map((x) => x.en).join(", and "))}.`); ta.push(`${j.map((x) => x.ta).join("; ")}.`); }
  if (up) {
    const step = stepFor(kindCode, dim === "dept" ? key : null, dim === "dept" ? seg.name.en : null);
    en.push(`I'd ${step.en}.`);
    ta.push(`${step.ta}.`);
  }
  const title = L(`Explain · ${seg.name.en} · ${win.label.en}`, `விளக்கம் · ${seg.name.ta} · ${win.label.ta}`);
  c.notes.push(L("Counts of reports in two windows of the same length; where a change sits is not why it happened.", "ஒரே நீளமுள்ள இரண்டு காலங்களின் பதிவு எண்ணிக்கை; மாற்றம் எங்கே என்பது அது ஏன் நடந்தது என்பதல்ல."));
  return { title, takeaway: bi(en[0], ta[0]), say: bi(en.slice(0, 4).join(" "), ta.slice(0, 4).join(" ")), blocks: blocks.slice(0, 6) };
}

/** The recipe: registered in screens.ts as `explain` (slots: id, or change {dim, key}, or what "change" with one zone/dept/cat, else the scope's top open case). */
export async function explainRecipe(c: RecipeCtx): Promise<RecipePart> {
  const t = explainTarget(c.slots);
  if (t.kind === "change") return explainChange(c, t.dim, t.key);
  const id = t.kind === "case" ? t.id : c.s.zone || c.s.cat || c.slots.q ? await topCaseId(c).catch(() => null) : null;
  const lang: Lang = langOf(c.heard);
  if (!id) return { title: lang === "ta" ? "விளக்கம்" : "Explain", takeaway: null,
    say: t.kind === "scope" && !(c.s.zone || c.s.cat || c.slots.q) ? bi("Which one? Say its number on the list, or the place and the kind of issue.", "எதை? பட்டியலில் அதன் எண்ணையோ, இடத்தையும் பிரச்சினையின் வகையையுமோ சொல்லுங்கள்.")
      : bi("I can't find an open issue like that in the data.", "அப்படி ஒரு திறந்த பிரச்சினை தரவில் இல்லை."), blocks: [] };
  return explainCase(c, id);
}
