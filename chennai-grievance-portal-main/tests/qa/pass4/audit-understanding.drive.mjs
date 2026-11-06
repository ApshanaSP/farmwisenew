// QA pass 4, audit of fixed bugs (understanding): drives POST /api/collector/thunai/agent/round over HTTP as the Collector, on the
// production build, with no model key, so that only the code lanes answer. Nothing here calls a model.
//   node tests/qa/pass4/server.mjs start --port 3130 --frozen --ticking
//   node tests/qa/pass4/audit-understanding.drive.mjs
// The sentence list is the evidence file's own bug, said and stage_open columns, plus EXTRA below, so a re-run refreshes every row and
// prints what changed. Records for BUG-033 are found by category and told by id (the "direct" round the client's own buttons send).
// Writes docs/qa/pass4/evidence/bug-audit/understanding-driven.json and understanding-driven-033.json. Passwords stay in the gitignored file.
import fs from "node:fs";
import path from "node:path";
import { accounts } from "../seed-local-users.mjs";
import { APP_ROOT } from "./lib/env.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:3130";
const OUT = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "bug-audit");
const FILE = path.join(OUT, "understanding-driven.json");
const START = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };

/** sentences added after the first run: { bug: sentences }, and BUG-020 with other screens open */
const SETS = {
  "BUG-001":["police report for chennai city","report on chennai police","report from chennai city police","chennai city police oda report kudu","மாநகராட்சி அறிக்கை","மாநகராட்சி நிலவரம் சொல்லு","corporation report kudu","குடிநீர் வாரியம் அறிக்கை","Metrowater nilavaram sollu","CMWSSB status","PWD report","பொதுப்பணித் துறை அறிக்கை","TNEB report","TANGEDCO status"],
  "BUG-030":["Tambaram police report","தாம்பரம் போலீஸ் அறிக்கை","Tambaram police report kudu","Avadi police report","ஆவடி காவல்துறை அறிக்கை","Tamil Nadu police report","தமிழ்நாடு காவல்துறை அறிக்கை","TN police report","state police report","Kerala police report","கேரளா போலீஸ் அறிக்கை","Pondy police report","Interpol report","NDRF report","Thanjavur corporation report","தஞ்சாவூர் மாநகராட்சி அறிக்கை","Hosur corporation status","Kumbakonam corporation report","Sivakasi police report","Rameswaram police report","Kodaikanal police report","Tiruchendur police report","கொடைக்கானல் போலீஸ் அறிக்கை","இராமேஸ்வரம் போலீஸ் அறிக்கை","Sivakasi police report kudu","London police report","Dubai police report","Singapore police report","துபாய் போலீஸ் அறிக்கை"],
  "BUG-005":["மாவட்ட நிலவரம்","மாவட்ட சுருக்கம்","சென்னை நிலவரம்","இன்றைய நிலவரம்","இன்றைய சுருக்கம்","நேற்று நிலவரம்","கடந்த வாரம் நிலவரம்","அடுத்த வாரம் நிலவரம்","இந்த மாதம் நிலவரம்","தினசரி நிலவரம்","தினசரி சுருக்கம்","மொத்த நிலவரம்","மாவட்ட ஆட்சியர் சுருக்கம்","ஆட்சியர் அறிக்கை","மாலை நிலவரம்","காலை சுருக்கம்","மாநகர நிலவரம்","inniku nilavaram","indha vaaram nilavaram","indha maasam nilavaram","maavatta nilavaram","aatchiyar summary","innaiku brief","nethu nilavaram","Manila report","Madhavan report","Kodungaiyur police report","Korattur status","Perungalathur status","Tambaram status","Ayanavaram status","Adyar bridge status","Marina status","Marina beach police report","Guindy status","Guindy police report","Nagar status","Thiru status","Royapettah status","Rayapuram status","Teynampet status","Tenampet police report","Kodambakam status"],
  "BUG-032":["விளக்கு புகார்கள் காட்டு","மின்விளக்கு புகார் அடையாறு","அடையாறு தெருவிளக்குகள் புகார்","தெருவிளக்கு விளக்கமா சொல்லு","அடையாறு தெருவிளக்கு விளக்குங்க","theru vilakku complaints Adyar la kaattu","street light complaint vilakkam sollu","explain the street light complaints in Adyar","explain the street light complaint in Adyar","அடையாறு குப்பை புகார்கள் விளக்குங்க","Adyar garbage complaints explain pannu","High Court report","Madras High Court status","high court cases","உயர் நீதிமன்ற அறிக்கை","high school complaints","high school report in Adyar","high tide in Royapuram","high tide warning","high rise building complaints","high rise fire report","high mast light complaints in Adyar","highway complaints in Adyar","low lying areas in Adyar","low lying area flooding","low lying areas la flooding complaints kaattu","low voltage complaints in Ambattur","low voltage complaint explain","low pressure area report","medium term plan","severe weather warning","severe rain report","கடுமையான மழை அறிக்கை","கடுமையான மழை நிலவரம்","கடுமையான வெயில்","kadumaiyana mazhai report","high priority school complaints","Highcourt la protest pathi sollu","High Court kitta protest","protest near High Court","உயர்நீதிமன்றம் அருகே போராட்டம்"],
  "BUG-024":["list severe overdue cases","severe and overdue","severe cases overdue this month","severe cases not resolved in time","கடுமையான புகார்கள் கெடு தாண்டியவை","severe cases deadline mudinjiduchu","kadumaiyana cases deadline thaandi","அடையாறு கடுமையான புகார்கள் கெடு தாண்டியவை","Adyar severe cases past deadline kaattu","overdue severe flooding cases in Adyar"],
  "BUG-022":["remind me to check the corporation update","note down police report","நாளை போலீஸ் அறிக்கை படிக்க நினைவூட்டு","மாநகராட்சி நிலவரம் பார்க்க ஞாபகப்படுத்து","corporation update paaka remind pannu","police report ah note pannu","police report note panni vai","save police report as a view","போலீஸ் அறிக்கையை சேமி","போலீஸ் அறிக்கையை குறித்து வை","remember to check the brief","remind me to read today's brief","remind me at 5 pm about the brief","remind me tomorrow to read the brief","make a note to check the corporation update","save the brief","remember to check the severe cases","remind me to check the severe cases","remind me at 5 pm to check the severe cases","remember to check the flooding complaints in Adyar","remind me to check the garbage complaints in Adyar","make a note to review the overdue cases","note: check the severe cases tomorrow","remind me to read the news","remember to check the reservoir level","remind me to check Poondi reservoir level","remind me to see the air quality report","கடுமையான புகார்கள் பார்க்க நினைவூட்டு","நாளை கடுமையான புகார்கள் பார்க்க ஞாபகப்படுத்து","அடையாறு வெள்ள புகார்கள் பார்க்க நினைவூட்டு","சுருக்கம் படிக்க நினைவூட்டு","severe cases paaka remind pannu","Adyar flooding complaints paaka remind pannu","severe cases paakanum nu nyabagam vechukko","brief paaka remind pannu","type severe cases in the search box","type flooding complaints in the search box"],
  "BUG-002":["filter Madurai corporation","மதுரை மாநகராட்சி பில்டர் போடு","Madurai corporation filter pannu","filter Coimbatore metrowater","filter Tambaram police","filter Avadi police","show Salem police complaints","சேலம் போலீஸ் புகார்கள் காட்டு","Salem police cases kaattu","filter Kumbakonam corporation","filter London police"],
  "BUG-003":["brief for the last 7 days","brief for the last 30 days","police report for the last 7 days","இந்த வாரத்தின் சுருக்கம்","இந்த மாதத்தின் சுருக்கம்","போன மாத சுருக்கம்","கடந்த மாத அறிக்கை","kadantha maasam brief","pona vaaram brief sollu","monthly brief","மாதாந்திர சுருக்கம்","மாதாந்திர போலீஸ் அறிக்கை","weekly police report","monthly police report","weekly corporation status","வார அறிக்கை","Adyar weekly brief"],
  "BUG-023":["explain the flood relief need in Ambattur","explain the relief need in Teynampet","explain the flood alert in Ambattur","explain the cyclone warning in Adyar","புயல் எச்சரிக்கை விளக்குங்க","நிவாரணம் தேவை புகார் விளக்குங்க","explain the accident on OMR","விபத்து புகார் விளக்கமா சொல்லுங்க","accident pathi simple ah sollu","fatal accident explain pannu"],
  "BUG-033":["explain the drain works complaint in Adyar","வடிகால் பணி புகார் விளக்குங்க","Adyar drain works complaint pathi simple ah sollu","explain the civic building complaint in Adyar","அடையாறு பொது கட்டிடம் புகார் விளக்குங்க","Adyar civic building complaint pathi simple ah sollu","explain the street complaint in Adyar","அடையாறு தெரு புகார் விளக்குங்க","Adyar street complaint pathi simple ah sollu","explain the tree complaint in Adyar","explain the street problem in Adyar","explain the tree on the street in Adyar","மரம் புகார் அடையாறு விளக்குங்க","Adyar la maram vizhundhadhu pathi sollu","explain the drain work site in Adyar","explain the building complaint in Adyar"]
};
const OPENS = { "police brief": "chennai city police report", "tamil police brief": "சென்னை காவல்துறை அறிக்கை", "corporation brief": "give me the corporation update", "metrowater brief": "Metrowater report", "Adyar brief": "Adyar brief this week", "district brief": "district brief this week", "severe list": "severe cases this week" };
const ASKED_WITH_OPEN = ["explain the flooding complaint in Adyar", "அடையாறு வெள்ள புகார் விளக்கமா சொல்லுங்க", "Adyar flooding complaint pathi explain pannu", "describe the flooding complaint in Adyar", "அடையாறு வெள்ள புகார் பத்தி சொல்லு", "Adyar flooding complaint pathi sollu", "and in Ambattur"];
const EXTRA = [...Object.entries(SETS).flatMap(([bug, list]) => list.map((s) => [bug, s, null])), ...Object.keys(OPENS).filter((k) => k !== "police brief").flatMap((k) => ASKED_WITH_OPEN.map((s) => ["BUG-020", s, k]))];

const col = accounts().find((a) => a.key === "collector");
const login = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: col.email, password: col.password }) });
if (login.status !== 200) throw new Error(`sign in ${login.status}`);
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

let n = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** One round, paced under the route's 90 a minute, waiting out a 429 rather than counting it as an answer. */
async function round(text, o = {}) {
  const body = { turnId: `audit-${Date.now()}-${n++}`, round: 0, text, state: { ...START, ...(o.state ?? {}) }, turns: o.turns ?? [], lastText: o.lastText ?? null, direct: o.direct ?? null, stage: o.stage ?? null, stageDigest: o.stageDigest ?? null };
  for (let tries = 0; ; tries++) {
    await pause(720);
    // a reused socket can be reset between requests: asked again, and never counted as an answer
    const r = await fetch(`${BASE}/api/collector/thunai/agent/round`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }).catch((e) => { if (tries < 3) return null; throw e; });
    if (!r) { await pause(1500); continue; }
    if (r.status === 429 && tries < 6) { await pause(15_000); continue; }
    return { http: r.status, body: await r.json().catch(() => null) };
  }
}

// no street or complaint wording is kept: a case screen is titled with the complaint's own words (OPEN-12)
const mask = (s) => String(s ?? "").replace(/^(None[^.]*\. )?(There('s| was| were)? .+?) at (.+?)\. (It|I'd|d)/, "$1$2 at [place]. $5");
/** the slots that decide the answer, without the empty ones */
const slotsOf = (s) => Object.fromEntries(["period", "dept", "org", "zones", "cat", "sev", "status", "name"].map((k) => [k, s?.[k]]).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));
function row(bug, said, stageOpen, a) {
  const r = a.body?.result ?? null;
  const st = r?.stage ?? null;
  const out = { bug, said, stage_open: stageOpen, http: a.http, lane: a.body?.lane ?? null, kind: r?.kind ?? null, note: r?.note ?? null, recipe: st?.recipe ?? null, title: st?.recipe === "case" ? "[the complaint title, not copied here]" : st?.title ?? null, slots: slotsOf(st?.slots) };
  if (r?.reply) out.reply = r.reply;
  const list = st?.blocks?.find((b) => b.kind === "CaseList");
  if (list) out.list = { total: list.total, shown: list.rows.length, overdue_shown: list.rows.filter((x) => x.overdue).length, cats: [...new Set(list.rows.map((x) => x.cat))].slice(0, 5) };
  const kpis = st?.blocks?.find((b) => b.kind === "Kpis");
  if (kpis) out.kpis = Object.fromEntries((kpis.items ?? []).map((k) => [k.key, k.value]));
  const c = st?.blocks?.find((b) => b.kind === "CaseDetail");
  if (c) out.case = { cat: c.incident.cat, zone: c.incident.zoneName, status: c.incident.status };
  if (st?.say) { out.say_en = mask(st.say.en).slice(0, 240); out.say_ta = String(st.say.ta ?? "").slice(0, 160); }
  return out;
}

const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : [];
// ONLY=extra drives just the sentences the file does not hold yet, and skips BUG-033's records
const ONLY_EXTRA = process.env.ONLY === "extra";
const list = [...old.map((r) => [r.bug, r.said, r.stage_open]), ...EXTRA];
const seen = new Set();
const have = new Set(old.map((r) => `${r.bug}|${r.said}|${r.stage_open}`));
const todo = list.filter(([b, s, o]) => { const k = `${b}|${s}|${o}`; if (seen.has(k) || (ONLY_EXTRA && have.has(k))) return false; seen.add(k); return true; });

// the same open Stage the real client sends for a follow-up
const idsOf = (b) => { switch (b.kind) { case "Filled": case "CaseList": return (b.rows ?? []).map((r) => r.id); case "NewsReader": return (b.items ?? []).map((x) => x.id); case "Readings": return (b.items ?? []).map((x) => x.name); case "Ranking": return (b.items ?? []).map((x) => x.label); case "Compare": return (b.sides ?? []).map((s) => s.label); case "CaseDetail": return [b.incident.id]; case "MapView": return (b.points ?? []).map((p) => p.id); default: return []; } };
const opened = new Map();
async function withOpen(k) {
  if (!opened.has(k)) {
    const doc = (await round(OPENS[k])).body.result.stage;
    opened.set(k, { stage: { recipe: doc.recipe, title: doc.title, focus: null, slots: doc.slots, blocks: doc.blocks.map((b) => ({ kind: b.kind, ids: idsOf(b).slice(0, 30) })) }, turns: [{ heard: OPENS[k], did: doc.title }], state: { lastPlace: null }, stageDigest: `${doc.title}. ${doc.say?.en ?? ""}`.slice(0, 1700) });
  }
  return opened.get(k);
}

const rows = ONLY_EXTRA ? [...old] : [];
for (const [bug, said, stageOpen] of todo) {
  rows.push(row(bug, said, stageOpen, await round(said, stageOpen ? await withOpen(stageOpen) : {})));
  if (rows.length % 40 === 0) fs.writeFileSync(FILE + ".partial", JSON.stringify(rows));
}
fs.rmSync(FILE + ".partial", { force: true });
fs.writeFileSync(FILE, JSON.stringify(rows, null, 1));

// what changed since the file's last run
const key = (r) => `${r.bug}|${r.said}|${r.stage_open}`;
const was = new Map(old.map((r) => [key(r), r]));
const shape = (r) => JSON.stringify([r.lane, r.kind, r.note, r.recipe, r.slots, r.reply ?? null, r.list?.total ?? null, r.case?.zone ?? null, r.say_en ?? null]);
const changed = rows.filter((r) => was.has(key(r)) && shape(was.get(key(r))) !== shape(r)).map((r) => ({ said: r.said, now: shape(r).slice(0, 300), was: shape(was.get(key(r))).slice(0, 300) }));
fs.writeFileSync(path.join(process.env.SCRATCH || OUT, "understanding-driven.changed.json"), JSON.stringify(changed, null, 1));

if (ONLY_EXTRA) { console.log(JSON.stringify({ rows: rows.length, added: todo.length, non200: rows.filter((r) => r.http !== 200).length })); process.exit(0); }

// BUG-033: up to three records of every category, by id, in both languages
// written from each category's own label, not copied from narrate.ts
const NAME = { FLOOD_WATERLOGGING: /standing water/, FLOOD_RELIEF: /flood relief/, WATERBODY_INFRA: /lake or bund/, FLOOD_RISK_SIGNAL: /weather or flood warning/, DRAINAGE_SEWAGE: /drainage or sewage/, DRAIN_WORKS_SAFETY: /drain worksite/, ROAD_DAMAGE: /damaged road/, ROAD_ACCIDENT: /road accident/, TRAFFIC_OBSTRUCTION: /traffic blockage/, ENCROACHMENT: /encroachment/, BUILDING_SAFETY: /unsafe building or wall/, SOLID_WASTE: /garbage/, SANITATION_TOILETS: /public toilet/, STREETLIGHT_ELECTRICAL: /street light or electrical/, DARK_SPOT_SAFETY: /dark spot/, VECTOR_DISEASE: /mosquito or water-borne/, FOOD_SAFETY: /food safety/, STRAY_ANIMALS: /stray animal/, HEALTH_SERVICES: /hospital or health/, AIR_POLLUTION: /bad air/, TREES_PARKS: /tree or park/, CRIME_PROPERTY: /crime report/, CRIME_VIOLENT: /crime report/, CRIMES_AGAINST_WOMEN: /crime report/, SUICIDE_SELF_HARM: /self-harm/, FIRE_EXPLOSION: /a fire/, MISSING_PERSON: /missing person/, DRUGS_LIQUOR: /drugs or illicit liquor/, PUBLIC_ORDER: /protest or public nuisance/, POLICE_OTHER: /police matter/, PUBLIC_WORKS: /public works or worksite/, WATER_SUPPLY: /drinking-water/, CIVIC_FACILITIES: /civic building/, ADMIN_SERVICES: /tax, certificate or election/, OTHER: /an issue/ };
const WRONG = /sewage overflow|structure that has given way|fallen tree/i;
const told = { driven: 0, categories: 0, wrong_name: [], not_its_name: [], no_tamil: 0, samples: {}, next_step_mismatch: [] };
for (const code of Object.keys(NAME)) {
  const l = await round("audit", { direct: { recipe: "cases", slots: { cat: code, zones: [], period: "quarterly", n: 30, fresh: true }, lang: "en" } });
  const rowsOf = l.body?.result?.stage?.blocks?.find((b) => b.kind === "CaseList")?.rows ?? [];
  if (rowsOf.length) told.categories++;
  for (const c of rowsOf.slice(0, 3)) {
    const d = await round("audit", { direct: { recipe: "case", slots: { id: c.id }, lang: "en" } });
    const en = d.body?.result?.stage?.say?.en ?? "", ta = d.body?.result?.stage?.say?.ta ?? "";
    told.driven++;
    if (WRONG.test(en)) told.wrong_name.push({ code, id: c.id, en: mask(en).slice(0, 140) });
    if (!NAME[code].test(en)) told.not_its_name.push({ code, id: c.id, en: mask(en).slice(0, 140) });
    if (!/[஀-௿]/.test(ta)) told.no_tamil++;
    for (const [re, fits] of [[/clear it/, ["SOLID_WASTE", "SANITATION_TOILETS"]], [/send a pump/, ["FLOOD_WATERLOGGING"]], [/repair date/, ["ROAD_DAMAGE"]], [/fogging/, ["VECTOR_DISEASE"]], [/Metrowater for a status/, ["WATER_SUPPLY", "DRAINAGE_SEWAGE"]]]) if (re.test(en) && !fits.includes(code)) told.next_step_mismatch.push({ code, id: c.id, en: mask(en).slice(0, 180) });
    told.samples[code] ??= mask(en).slice(0, 110);
  }
}
fs.writeFileSync(path.join(OUT, "understanding-driven-033.json"), JSON.stringify(told, null, 1));
console.log(JSON.stringify({ rows: rows.length, non200: rows.filter((r) => r.http !== 200).length, changed: changed.length, bug033: { driven: told.driven, categories: told.categories, wrong: told.wrong_name.length, notItsName: told.not_its_name.length, noTamil: told.no_tamil, nextStep: told.next_step_mismatch.length } }));
