/**
 * Official places for Ask the Map's facility layers (owner, 28 Nov 2026: "only official schools, colleges, hospitals, metro stations, fire
 * stations ... filter it out properly"). Each step re-runs on its own; run from the portal folder:
 *
 *   python scripts/fetch-official-pdfs.py           the lists published only as PDFs: schools.list.json (Textbook Corporation, UDISE codes) and
 *                                                    universities.list.json (UGC)
 *   node scripts/build-official-places.mjs --fetch   the lists on web pages and APIs into data/layers/official/<name>.list.json (polite, a pause
 *                                                    per call; --only fire,colleges,tndce,hospitals)
 *   node scripts/build-official-places.mjs --ai      ask the AI about the names no rule and no list settles (cached in ai-verdicts.json; --max-ai N
 *                                                    calls, many names a call)
 *   node scripts/build-official-places.mjs           filter the layers: data/layers/<layer>.geojson, official/<layer>.dropped.json, meta.json
 *
 * The OpenStreetMap features are read from data/layers/official/<layer>.osm.geojson (written by scripts/build-map-layers.mjs on a fresh OSM
 * build, or taken once from the layer file as it was before any check), so a re-filter never asks Overpass again and a place dropped today
 * comes back when a list improves. The rules and the matching are in scripts/lib/official-places.mjs.
 *
 * Node needs NODE_EXTRA_CA_CERTS on a PC whose antivirus inspects TLS. The data.gov.in key is DATA_GOV_API_KEY when set, else the portal's
 * published sample key (10 rows a call). The AI is Groq (GROQ_API_KEY): it only keeps or drops a name already on the map, never adds a place
 * or a number.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterLayer, haversineM, nameScore, railMetro, ruleVerdict } from "./lib/official-places.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAYERS = path.join(ROOT, "data", "layers");
const OFF = path.join(LAYERS, "official");
const UA = "DistrictIQ-official-places/1.0 (district administration prototype; polite, one request at a time)";
/** the IST date (a run at 4 a.m. IST is still the 28th, not UTC's 27th) */
const TODAY = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const OFFICIAL_LAYERS = ["schools", "colleges", "hospitals", "fire_stations", "rail_metro"];
/** the official lists each layer is matched against (data/layers/official/<file>) */
const LISTS = {
  schools: ["schools.list.json"],
  colleges: ["colleges.list.json", "colleges-tndce.list.json", "universities.list.json"],
  hospitals: ["hospitals.list.json"],
  fire_stations: ["fire_stations.list.json"]
};
/** a list whose "Chennai" is the Corporation's area, as the map's in_district is: matched only on its own side of the line */
const STRICT = { schools: true };

const readJson = (f, dflt = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return dflt; } };
const writeJson = (f, v, pretty = false) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, pretty ? 1 : 0)); };

async function get(url, { tries = 3 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.5" } });
      if (r.ok) return await r.text();
      if (i >= tries || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`HTTP ${r.status} for ${url}`);
    } catch (e) { if (i >= tries) throw e; }
    await sleep(5000 * i);
  }
}
const flat = (html) => html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, "|")
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#039;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/[  ]/g, " ")
  .replace(/\s+/g, " ").replace(/(\|\s*)+/g, "|");
const cell = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#039;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// ------------------------------------------------------------- the lists --

/** Hospitals: the National Hospital Directory (National Health Portal, MoHFW, on data.gov.in), Chennai district. */
async function fetchHospitals() {
  const key = process.env.DATA_GOV_API_KEY || "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b";
  const res = "98fa254e-c5f8-4910-a19b-4828939b477d";
  const entries = [];
  let total = Infinity;
  const step = process.env.DATA_GOV_API_KEY ? 500 : 10;
  for (let off = 0; off < total; off += step) {
    const u = `https://api.data.gov.in/resource/${res}?api-key=${key}&format=json&limit=${step}&offset=${off}&filters%5Bstate%5D=Tamil%20Nadu&filters%5Bdistrict%5D=Chennai`;
    const j = JSON.parse(await get(u));
    total = Number(j.total) || 0;
    for (const r of j.records ?? []) {
      const ll = String(r._location_coordinates ?? "").split(/[ ,]+/).map(Number);
      const ok = ll.length === 2 && ll.every(Number.isFinite) && ll[0] > 12.5 && ll[0] < 13.6 && ll[1] > 79.8 && ll[1] < 80.6;
      entries.push({ id: `nhp:${r._sr_no ?? `${off}-${entries.length}`}`, name: String(r.hospital_name ?? "").trim(), addr: String(r._location ?? r._address_original_first_line ?? "").trim() || null,
        category: r.hospital_category && r.hospital_category !== "0" ? String(r.hospital_category) : null, care: r._hospital_care_type && r._hospital_care_type !== "0" ? String(r._hospital_care_type) : null,
        system: r._discipline_systems_of_medicine && r._discipline_systems_of_medicine !== "0" ? String(r._discipline_systems_of_medicine) : null,
        district: "Chennai", lat: ok ? ll[0] : null, lon: ok ? ll[1] : null });
    }
    process.stdout.write(`\r  hospitals: ${entries.length} of ${total}`);
    await sleep(1200);
  }
  console.log();
  return { source: { id: "nhp", name: "National Hospital Directory with Geo Code (National Health Portal, MoHFW), on data.gov.in", url: `https://data.gov.in/resource/national-hospital-directory-geo-code-and-additional-parameters-updated-till-last-month`, api: `https://api.data.gov.in/resource/${res}`, checked: TODAY, filter: "State Tamil Nadu, District Chennai",
    note: "The directory gives no usable map point for Chennai's entries, so an entry OpenStreetMap does not hold is counted, never drawn." },
    entries: entries.filter((e) => e.name) };
}

/** Fire stations: Tamil Nadu Fire and Rescue Services, Northern Region (the Chennai South, North and Central fire districts). */
async function fetchFire() {
  const url = "https://www.tnfrs.tn.gov.in/subsubmenu_page_content.php?menu_id=NDM2&submenu_id=ODk5&thirdlvl_id=NDEx&dept_id=443&lang=MQ==";
  const t = flat(await get(url));
  const entries = [];
  const parts = t.split(/\|\d+\. (Chennai [A-Za-z]+ District)\|/);
  for (let i = 1; i < parts.length; i += 2) {
    const district = parts[i];
    for (const m of parts[i + 1].matchAll(/\|(\d+)\.\|([A-Za-z][A-Za-z .()'-]*?)\s*FS\s*\|/g)) {
      const place = m[2].replace(/\s+/g, " ").trim();
      entries.push({ id: `tnfrs:${district.split(" ")[1].toLowerCase()}-${m[1]}`, name: `${place} Fire Station`, place, district: "Chennai", fire_district: district, alt: [`${place} Fire and Rescue Station`, `${place} FS`] });
    }
  }
  if (!entries.length) throw new Error("the TNFRS page had no station rows: its layout changed");
  return { source: { id: "tnfrs", name: "Tamil Nadu Fire and Rescue Services: Fire and Rescue Stations, Northern Region (Chennai South, North and Central districts)", url, checked: TODAY,
    note: "Station names only; the page gives no map points, so a station OpenStreetMap does not hold is counted, never drawn." }, entries };
}

/** Engineering, technology and architecture colleges: Anna University's affiliated colleges by district (Centre for Affiliation of Institutions). */
async function fetchColleges() {
  const entries = [];
  const urls = [];
  for (const d of ["Chennai", "Chengalpattu", "Kancheepuram", "Thiruvallur"]) {
    const url = `https://annauniv.edu/cai/District%20wise/district/${d}.php`;
    let t;
    try { t = flat(await get(url)); } catch (e) { console.warn(`  ${d}: ${e.message}`); continue; }
    urls.push(url);
    // the closing bar is looked at, not taken: it opens the next row
    for (const m of t.matchAll(/\|(\d{1,3})\|(\d{4}|-)\|(\d{4}|-)\|([^|]{6,160})(?=\|)/g)) {
      const name = m[4].replace(/&ndash;|&mdash;/g, "-").replace(/\s+/g, " ").trim();
      if (/^name of the college$/i.test(name)) continue;
      entries.push({ id: `au:${m[2] !== "-" ? m[2] : m[3] !== "-" ? `t${m[3]}` : `${d.toLowerCase()}-${m[1]}`}`, name, district: d });
    }
    await sleep(1500);
  }
  const seen = new Set();
  return { source: { id: "anna-univ-cai", name: "Anna University, Centre for Affiliation of Institutions: affiliated colleges by district (Chennai, Chengalpattu, Kancheepuram, Thiruvallur)", url: urls[0] ?? null, urls, checked: TODAY,
    note: "Engineering, technology and architecture colleges. The full AISHE directory (dashboard.aishe.gov.in/hedirectory) answers only requests whose parameters its own page encrypts, so it was not read by program." },
    entries: entries.filter((e) => !seen.has(e.id) && seen.add(e.id)) };
}

/**
 * The name of a college as the TNDCE table prints it with its address ("AA Arts And Sci., College, Koyambedu, Chennai."): the parts up to the
 * one that holds the college word, and any "Of ..." / "For ..." that follows it; the next part (its locality) is kept as `place`.
 */
export function tndceName(s) {
  const segs = String(s).split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  const head = /\b(college|university|institute|school|academy|vidyalaya|vidyapeeth|mahavidyalaya)\b/i;
  let name = "", i = 0, got = false;
  for (; i < segs.length; i++) {
    if (got && !/^(of|for|and|&|\(|\[)/i.test(segs[i])) break;
    name = name ? `${name}, ${segs[i]}` : segs[i];
    if (head.test(segs[i])) got = true;
  }
  if (!got) { name = segs[0] ?? ""; i = 1; }
  const place = segs[i] && !/^(no\.?|plot|\d)/i.test(segs[i]) ? segs[i].replace(/[-–]\s*\d[\d\s]*$/, "").trim() : null;
  return { name: name.replace(/\s*\((autonomous|co-?ed|w|women)\)\s*/gi, " ").replace(/\s+/g, " ").replace(/[.,]+$/, "").trim(), place };
}

/** Arts and science colleges, colleges of education, schools of social work: the Directorate of Collegiate Education's list of colleges. */
async function fetchTndce() {
  const url = "https://tndce.tn.gov.in/Colleges";
  const html = await get(url);
  const want = /^(chennai|chengalpattu|kancheepuram|tiruvallur|thiruvallur)$/i;
  const seen = new Set();
  const entries = [];
  for (const m of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const c = [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((x) => cell(x[1]));
    if (c.length !== 5 || !/^\d+$/.test(c[0]) || !want.test(c[2])) continue;
    const key = `${c[1]}|${c[2]}`;
    if (seen.has(key)) continue; // the page prints its table twice
    seen.add(key);
    const { name, place } = tndceName(c[1]);
    entries.push({ id: `tndce:${c[0]}`, name, alt: place ? [`${name} ${place}`] : undefined, place, address: c[1], district: c[2], type: c[4] });
  }
  if (entries.length < 50) throw new Error(`only ${entries.length} colleges read from TNDCE: its layout changed`);
  return { source: { id: "tndce", name: "Directorate of Collegiate Education, Government of Tamil Nadu: list of colleges (arts and science, education, social work, physical education)", url, checked: TODAY,
    note: "Chennai, Chengalpattu, Kancheepuram and Tiruvallur districts as the Directorate lists them. No map points: a college OpenStreetMap does not hold is counted, never drawn." }, entries };
}

async function fetchAll(only) {
  fs.mkdirSync(OFF, { recursive: true });
  for (const [id, file, fn] of [["fire", "fire_stations", fetchFire], ["colleges", "colleges", fetchColleges], ["tndce", "colleges-tndce", fetchTndce], ["hospitals", "hospitals", fetchHospitals]]) {
    if (only && !only.includes(id)) continue;
    try {
      const l = await fn();
      writeJson(path.join(OFF, `${file}.list.json`), l, true);
      console.log(`${file}: ${l.entries.length} official entries from ${l.source.name}`);
    } catch (e) { console.error(`${file}: the official list could not be read: ${e.message} (the earlier file is kept)`); }
  }
}

/** A layer's official lists as one: every entry tagged with its list's id; null when none could be read. */
function listsOf(layer) {
  const lists = (LISTS[layer] ?? []).map((f) => readJson(path.join(OFF, f))).filter((l) => l?.entries?.length);
  if (!lists.length) return null;
  return { source: lists[0].source, sources: lists.map((l) => ({ ...l.source, entries: l.entries.length })),
    entries: lists.flatMap((l) => l.entries.map((e) => ({ ...e, src: l.source.id }))) };
}

// ------------------------------------------------------------------ AI --

function envKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : null;
  } catch { return null; }
}
const AI_FILE = path.join(OFF, "ai-verdicts.json");
/** Groq's larger free model, as the console's own careful calls use it (lib/ai/gateway.ts); 8,000 tokens a minute, so a pause between calls */
const AI_MODEL = process.env.GROQ_MAP_MODEL || "openai/gpt-oss-120b";
const AI_BATCH = 40, AI_PAUSE_MS = 25_000;
const WHAT = {
  schools: "a school (a place children attend for primary, middle, high or higher secondary classes; a special school counts). NOT: a pre-school, play school, day care, tuition or coaching centre, a dance, music, sports, driving or computer school, a college or university department",
  colleges: "a college or university (a degree-giving college, a university or deemed university, a polytechnic, a medical, dental, nursing, pharmacy, law, teacher-education or management college or institute). NOT: a coaching, tuition or exam-preparation centre, an exam centre, a training institute, an academy that is not a college, a research centre or laboratory, a school, a hostel or a campus building",
  hospitals: "a hospital, nursing home, clinic or health centre where people are treated (kind: hospital, clinic or health_centre). NOT: a pharmacy, a laboratory or scan centre, an optical shop, a veterinary clinic, a salon, spa or gym, an ambulance or a shop",
  fire_stations: "a public fire and rescue station of Tamil Nadu Fire and Rescue Services. NOT: a fire-safety shop or company, an airport's or a factory's own fire service, an office or training school"
};
async function askAi(layer, items, key) {
  const body = {
    model: AI_MODEL, temperature: 0, response_format: { type: "json_object" }, max_completion_tokens: 6000,
    ...(/gpt-oss/.test(AI_MODEL) ? { reasoning_effort: "low" } : {}),
    messages: [
      { role: "system", content: "You check names of places in Chennai, India, taken from OpenStreetMap. For each name, say whether it is the kind of place asked about, from the name alone and what you know of Chennai. When unsure, say keep false. Answer JSON only: {\"verdicts\":[{\"i\":<number>,\"keep\":true|false,\"kind\":\"<only for hospitals: hospital|clinic|health_centre>\",\"why\":\"<at most 8 words>\"}]}, one per name." },
      { role: "user", content: `The kind: ${WHAT[layer]}.\nNames:\n${items.map((f, i) => `${i}. ${f.properties.name}`).join("\n")}` }
    ]
  };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Groq HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return JSON.parse(j.choices?.[0]?.message?.content ?? "{}").verdicts ?? [];
}
/** The doubtful names (no rule, no list settles them) of each layer, many a call, cached: a re-run asks only about new names. */
async function runAi(maxCalls) {
  const key = envKey("GROQ_API_KEY");
  if (!key) { console.error("GROQ_API_KEY is not set: the doubtful names stay out of the layers"); return; }
  const cache = readJson(AI_FILE, { model: null, at: null, verdicts: {} });
  const places = readJson(path.join(LAYERS, "osm_places.geojson"), { features: [] }).features;
  let calls = 0;
  for (const layer of ["colleges", "schools", "hospitals", "fire_stations"]) {
    const raw = layer === "colleges" ? [...rawOf(layer), ...movedToColleges(rawOf(layer))] : rawOf(layer);
    const { unjudged } = filterLayer(layer, raw, listsOf(layer), new Map(), places, { strict: !!STRICT[layer] });
    const todo = unjudged.filter((f) => !cache.verdicts[`${layer}|${f.properties.id}`]);
    for (let i = 0; i < todo.length && calls < maxCalls; i += AI_BATCH) {
      const batch = todo.slice(i, i + AI_BATCH);
      if (calls) await sleep(AI_PAUSE_MS);
      let vs;
      try { vs = await askAi(layer, batch, key); } catch (e) { console.error(`  ${layer}: ${e.message}`); calls++; continue; }
      calls++;
      for (const v of vs) {
        const f = batch[Number(v.i)];
        if (!f) continue;
        cache.verdicts[`${layer}|${f.properties.id}`] = { name: f.properties.name, v: v.keep === true ? "keep" : "drop", why: `AI: ${String(v.why ?? "").slice(0, 80)}`, ...(layer === "hospitals" && ["hospital", "clinic", "health_centre"].includes(v.kind) ? { kind: v.kind } : {}) };
      }
      console.log(`  ${layer}: ${vs.length} verdicts for ${batch.length} names (call ${calls})`);
      writeJson(AI_FILE, { ...cache, model: AI_MODEL, at: new Date().toISOString() }, true);
    }
    if (calls >= maxCalls) break;
  }
  cache.model = AI_MODEL;
  cache.at = new Date().toISOString();
  writeJson(AI_FILE, cache, true);
  console.log(`AI: ${calls} calls; ${Object.keys(cache.verdicts).length} verdicts cached`);
}

// -------------------------------------------------------------- filter --

/** The layer's OpenStreetMap features before any check: the snapshot, or (first run) the layer file as built from Overpass. */
function rawOf(layer) {
  const snap = path.join(OFF, `${layer}.osm.geojson`);
  const s = readJson(snap);
  if (s) return s.features;
  const cur = readJson(path.join(LAYERS, `${layer}.geojson`), { features: [] }).features;
  if (cur.some((f) => f.properties.verified)) throw new Error(`${layer}: no OSM snapshot and the layer file is already filtered; run npm run layers:build -- --only ${layer}`);
  writeJson(snap, { type: "FeatureCollection", note: "OpenStreetMap features as built by scripts/build-map-layers.mjs, before the official check", features: cur });
  return cur;
}
/**
 * Colleges OpenStreetMap maps as schools ("KCG College of Technology", "Alpha Arts and Science College" under amenity=school): they leave the
 * schools layer and are checked as colleges, unless the colleges layer already has them (a like name within 500 m).
 */
function movedToColleges(collegeRaw) {
  let schools;
  try { schools = rawOf("schools"); } catch { return []; }
  return schools.filter((f) => f.properties.name && ruleVerdict("schools", f.properties.name).why === "a college or university, not a school")
    .filter((f) => !collegeRaw.some((c) => haversineM(c.geometry.coordinates, f.geometry.coordinates) <= 500 && nameScore(c.properties.name ?? "", f.properties.name) >= 0.5))
    .map((f) => ({ ...f, properties: { ...f.properties, kind: /university/i.test(f.properties.name) ? "university" : "college", mapped_as: "school" } }));
}

/** build-map-layers.mjs: a fresh OSM build of a layer is kept as its snapshot before the check */
export function saveSnapshot(layer, feats) {
  writeJson(path.join(OFF, `${layer}.osm.geojson`), { type: "FeatureCollection", note: "OpenStreetMap features as built by scripts/build-map-layers.mjs, before the official check", features: feats });
}

let wardsCache = null;
function wardAt(lon, lat) {
  wardsCache ??= readJson(path.join(ROOT, "data", "boundaries", "gcc-wards.geojson")).features.map((f) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const xs = polys.flatMap((p) => p[0].map((c) => c[0])), ys = polys.flatMap((p) => p[0].map((c) => c[1]));
    return { ward: f.properties.ward_no, polys, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });
  const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  for (const w of wardsCache) {
    if (lon < w.b[0] || lon > w.b[2] || lat < w.b[1] || lat > w.b[3]) continue;
    for (const p of w.polys) if (inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h))) return w.ward;
  }
  return null;
}

const NOTE = {
  schools: "Matched to the Textbook Corporation's list of government and Corporation high and higher secondary schools (UDISE codes) where possible. UDISE+, the full school directory, needs a CAPTCHA for every search, so private, aided, primary and middle schools are kept on their names (rules, then the AI for doubtful names).",
  colleges: "Matched to the Directorate of Collegiate Education's college list, Anna University's affiliated colleges and the UGC's university lists where possible; the AISHE directory could not be read by program. Others are kept only when their names say they are colleges (rules, then the AI). Coaching and exam centres, training institutes, research centres and campus buildings are left out.",
  hospitals: "Matched to the National Hospital Directory (data.gov.in) where possible; others are kept when their names say they treat people. Each is a hospital, a clinic or a health centre: a question about hospitals leaves clinics out.",
  fire_stations: "Tamil Nadu Fire and Rescue Services lists more stations than OpenStreetMap maps: those with no map point are named in unmapped_official, never drawn.",
  rail_metro: "Stations from the operators' timetables (CMRL, Southern Railway suburban and MRTS), with the metro stretch opened on 11 Oct 2026 and the long-distance stations OpenStreetMap holds. Metro stations still being built are left out."
};

/**
 * Filters one layer and writes it: the layer file (kept features, sorted by id as before), the dropped ones with reasons, and the layer's
 * meta.json entry (its counts, and `official`: the lists, the counts kept and dropped, examples, the official places with no map point).
 * Exported for scripts/build-map-layers.mjs, which calls it right after a fresh OSM build of the layer.
 */
export function applyOfficial(layer, rawFeats, meta) {
  const ai = new Map(Object.entries(readJson(AI_FILE, { verdicts: {} }).verdicts));
  let kept, dropped, unjudged = [], unmapped = [], matched = 0, sources;
  if (layer === "rail_metro") {
    const gtfs = readJson(path.join(LAYERS, "transit.json"));
    const opened = readJson(path.join(OFF, "rail_metro.opened.json"), { stations: [], no_halt: [], sources: [] });
    ({ kept, dropped } = railMetro(gtfs, rawFeats, wardAt, opened));
    matched = kept.filter((f) => f.properties.verified === "official").length;
    sources = [{ id: "chennai-gtfs", name: gtfs.meta.source, url: "https://github.com/ungalsoththu/ChennaiGTFS", checked: String(gtfs.meta.built_at).slice(0, 10), note: gtfs.meta.note },
      ...(opened.sources ?? []).map((s) => ({ id: s.id, name: s.name, url: s.url, checked: s.checked }))];
  } else {
    const places = readJson(path.join(LAYERS, "osm_places.geojson"), { features: [] }).features;
    const list = listsOf(layer);
    if (layer === "colleges") rawFeats = [...rawFeats, ...movedToColleges(rawFeats)];
    ({ kept, dropped, unjudged, unmapped, matched } = filterLayer(layer, rawFeats, list, ai, places, { strict: !!STRICT[layer] }));
    sources = list?.sources.map((s) => ({ id: s.id, name: s.name, url: s.url, urls: s.urls, checked: s.checked, entries: s.entries, note: s.note })) ?? [];
    // a doubtful name the AI has not judged: left out (and said), never kept on a guess
    for (const f of unjudged) dropped.push({ ...f, properties: { ...f.properties, dropped: "its name does not say what it is, and no AI verdict was available", dropped_by: "none" } });
  }
  kept.sort((a, b) => String(a.properties.id).localeCompare(String(b.properties.id)));
  fs.writeFileSync(path.join(LAYERS, `${layer}.geojson`), JSON.stringify({ type: "FeatureCollection", features: kept }));
  writeJson(path.join(OFF, `${layer}.dropped.json`), { layer, at: new Date().toISOString(), count: dropped.length,
    features: dropped.map((f) => ({ id: f.properties.id, name: f.properties.name ?? null, kind: f.properties.kind, ward: f.properties.ward ?? null, why: f.properties.dropped, by: f.properties.dropped_by, lonlat: f.geometry.coordinates })) }, true);
  const why = {};
  for (const f of dropped) why[f.properties.dropped] = (why[f.properties.dropped] ?? 0) + 1;
  const m = meta.layers[layer] ?? { id: layer };
  const byName = kept.filter((f) => f.properties.verified === "name");
  Object.assign(m, {
    count: kept.length, in_district: kept.filter((f) => f.properties.in_district).length,
    // the map's attribution and the gap notes look for "OpenStreetMap" here; the official check is described under `official`
    source: "OpenStreetMap",
    ...(layer === "rail_metro" ? { licence: "ODbL / PDDL (ChennaiGTFS); ODbL 1.0 (OpenStreetMap)", attribution: "CMRL, Southern Railway (via ChennaiGTFS / CUMTA); © OpenStreetMap contributors" } : {}),
    official: {
      checked_at: new Date().toISOString(), sources, osm_features: rawFeats.length, kept: kept.length, matched_to_official: matched,
      kept_by_name_rule: byName.filter((f) => f.properties.verified_by === "rule").length, kept_by_ai: byName.filter((f) => f.properties.verified_by === "ai").length,
      ...(layer === "rail_metro" ? { kept_reported_open: kept.filter((f) => f.properties.verified === "reported").length, added_from_timetable: kept.filter((f) => f.properties.verified === "official" && !f.properties.osm).length } : {}),
      dropped: dropped.length, dropped_by_reason: why,
      dropped_examples: dropped.filter((f) => f.properties.name).slice(0, 12).map((f) => `${f.properties.name}: ${f.properties.dropped}`),
      unmapped_official: unmapped,
      note: NOTE[layer] ?? null
    }
  });
  meta.layers[layer] = m;
  return { kept: kept.length, dropped: dropped.length, matched, unjudged: unjudged.length, unmapped: unmapped.length };
}

function applyAll(only) {
  const metaFile = path.join(LAYERS, "meta.json");
  const meta = readJson(metaFile);
  for (const layer of OFFICIAL_LAYERS) {
    if (only && !only.includes(layer)) continue;
    const r = applyOfficial(layer, rawOf(layer), meta);
    console.log(`${layer}: kept ${r.kept} (matched to an official list ${r.matched}), dropped ${r.dropped}${r.unjudged ? ` (${r.unjudged} doubtful, no AI verdict)` : ""}${r.unmapped ? `; ${r.unmapped} official with no map point` : ""}`);
  }
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (k) => process.argv.includes(k);
  const val = (k) => (arg(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
  (async () => {
    if (arg("--fetch")) await fetchAll(val("--only")?.split(","));
    if (arg("--ai")) await runAi(Number(val("--max-ai") ?? 12));
    if (!arg("--fetch") && !arg("--ai") || arg("--apply")) applyAll(arg("--fetch") || arg("--ai") ? null : val("--only")?.split(","));
  })().catch((e) => { console.error(e.stack || e.message || e); process.exit(1); });
}
