// QA pass 4, golden master: which requests a recording makes. The routes and their parameters come from the inventory (route files); the values come
// from the pinned snapshot, picked with a fixed seed, so the same requests are made every time. A parameter or a dynamic segment with no values here is
// reported as a gap in the manifest (and fails the recording), so a new route cannot slip past unnoticed.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PIN_DIR } from "./env.mjs";
import { uuidsIn } from "./golden-normalise.mjs";

const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, f))).toString("utf8"));
function table(name) {
  const j = gz(`tables/${name}.json.gz`);
  const cols = j.columns.map((c) => c[0]);
  return j.rows.map((r) => Object.fromEntries(cols.map((k, i) => [k, r[i]])));
}

/** A small seeded generator (mulberry32), so a sample never depends on chance. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20261106;
const NO_SESSION = "00000000-0000-4000-8000-000000000000";

/** The real values a recording uses, from the pinned snapshot. */
export function loadSamples() {
  const rnd = seeded(SEED);
  const pick = (list, n) => {
    const pool = [...list].sort();
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };
  const incidents = table("incidents");
  const ids = (f, n) => pick(incidents.filter(f).map((i) => i.incident_id), n);
  const inc = {
    swmOpen: ids((i) => i.lead_dept === "GCC-SWM" && i.is_open, 3),
    swmClosed: ids((i) => i.lead_dept === "GCC-SWM" && !i.is_open, 1),
    eleOpen: ids((i) => i.lead_dept === "GCC-ELE" && i.is_open, 2),
    eleClosed: ids((i) => i.lead_dept === "GCC-ELE" && !i.is_open, 1),
    otherOpen: ids((i) => !["GCC-SWM", "GCC-ELE"].includes(i.lead_dept) && i.is_open, 2),
    severeOpen: ids((i) => i.severity_level === "Severe" && i.is_open && i.lead_dept !== "GCC-SWM", 3),
    severeOwn: ids((i) => i.severity_level === "Severe" && i.is_open && i.lead_dept === "GCC-ELE", 1),
    awaiting: ids((i) => i.awaiting_collector, 2),
    missing: ["INC-00000000-000000"]
  };
  const docs = table("documents");
  const withBody = pick(docs.filter((d) => String(d.body ?? "").length > 200).map((d) => d.doc_id), 2);
  const noBody = pick(docs.filter((d) => !String(d.body ?? "").trim()).map((d) => d.doc_id), 2);
  const stories = docs.filter((d) => d.story_id && Number(d.outlet_count) >= 3);
  const story = pick([...new Set(stories.map((d) => d.story_id))], 2).map((s) => stories.filter((d) => d.story_id === s).map((d) => d.doc_id).sort().slice(0, 6));
  const durable = gz("rows.seeded.json.gz").rows;
  const reference = gz("reference.json.gz").rows;
  const allCats = table("ref_categories");
  const cats = [...new Set([...allCats.filter((c) => c.lead_dept === "GCC-SWM").map((c) => c.category_code).sort().slice(0, 1),
    ...allCats.filter((c) => c.lead_dept === "GCC-ELE").map((c) => c.category_code).sort().slice(0, 1), ...pick(allCats.map((c) => c.category_code), 4)])];
  const depts = [...new Set(["GCC-SWM", "GCC-ELE", "CMWSSB", "POL-GCP", ...pick(table("ref_departments").map((d) => d.code), 2)])];
  const taluks = pick(table("ref_taluks").filter((t) => t.in_district).map((t) => t.taluk_code), 4);
  const facilities = pick(table("ref_facilities").map((f) => f.facility_id), 3);
  const hotspots = pick(table("hotspots").map((h) => h.hotspot_id), 2);
  const spikes = table("anomalies").slice(0, 2);
  const reports = [...durable.officer_reports].sort((a, b) => a.report_id - b.report_id).map((r) => ({ dir: r.photo_dir, name: JSON.parse(r.photos || "[]")[0] ?? "1.jpg" }));
  const media = pick(durable.complaints.filter((c) => c.media_path).map((c) => String(c.media_path).split("/").pop()), 2);
  const areas = pick([...new Set(reference.gcc_localities.map((l) => l.area_id))].filter((a) => a != null), 2); // areas with localities under them
  const localities = pick(reference.gcc_localities.map((l) => l.id), 2);
  return {
    inc, withBody, noBody, story, cats, depts, taluks, facilities, hotspots, spikes, reports, media, areas, localities,
    complaintCodes: pick(durable.complaints.map((c) => c.complaint_code), 3),
    sessions: pick(durable.assistant_sessions.map((s) => s.session_id), 2),
    workspaces: [...new Set(durable.workspaces.map((w) => w.workspace_id))].sort((a, b) => a - b),
    sources: pick(durable.sources.map((s) => s.source_id), 2),
    oldZoneLocalities: pick(reference.localities.map((l) => l.id), 2),
    subtype: reference.complaint_subtypes.filter((s) => s.is_active && s.department_id != null).sort((a, b) => a.id - b.id)[0],
    knownPhotoDirs: new Set(durable.officer_reports.map((r) => r.photo_dir)),
    knownUuids: new Set([...uuidsIn(JSON.stringify(durable)), NO_SESSION])
  };
}

const PERIODS = ["daily", "weekly", "monthly", "quarterly"];

/** The spread of values for each query parameter. */
function spreads(s) {
  return {
    period: [...PERIODS, "bogus"],
    zone: ["5", "13", "1", "8", "15", "99", "abc"],
    dept: [...s.depts, "not a dept"],
    taluk: [...s.taluks, "TLK-XXX"],
    cat: [...s.cats, "NOT_A_CATEGORY"],
    sev: ["Severe", "High", "Medium", "Low", "bogus"],
    status: ["open", "awaiting", "unverified", "verified", "critical", "overdue", "Open", "Under review", "Assigned", "In progress", "Awaiting verification", "Resolved", "Rejected", "Lapsed", "bogus"],
    q: ["Adyar", "garbage", "kuppai", "குப்பை", "x", s.inc.swmOpen[0]],
    sort: ["sev", "c", "r", "d"],
    dir: ["1"],
    page: ["1", "9999"],
    per: ["3", "100"],
    scope: ["all", "30d"],
    place: ["unlocated", "nozone", "notaluk"],
    tab: ["all", "new", "action", "sent", "verified", "bogus"],
    flag: ["open", "serious", "overdue", "due"],
    meta: ["1"],
    part: ["briefing", "trends", "environment", "bogus"],
    render: ["1"]
  };
}

/** Filters together, on the routes that take them all. */
function combos(s) {
  const [z1, z2, z3] = ["5", "13", "1"];
  const [c0, c1] = s.cats;
  const [t0] = s.taluks;
  return [
    { period: "weekly", zone: z1 }, { period: "monthly", zone: z2 }, { period: "quarterly", zone: z3 },
    { period: "weekly", dept: "GCC-SWM" }, { period: "monthly", dept: "CMWSSB" }, { zone: "8", dept: "GCC-ELE" },
    { period: "monthly", zone: z2, cat: c0 }, { period: "weekly", taluk: t0 }, { dept: "GCC-SWM", taluk: t0 },
    { period: "quarterly", zone: z1, dept: "GCC-SWM", cat: c0 }, { period: "weekly", cat: c1, sev: "High" }, { period: "monthly", zone: z1, status: "open" },
    { period: "quarterly", sev: "Severe", status: "overdue" }, { period: "monthly", tab: "all", sev: "High" }, { period: "monthly", tab: "all", cat: c0 }
  ];
}

const query = (o) => {
  const u = new URLSearchParams(o).toString();
  return u ? `?${u}` : "";
};

/** Routes whose parameters only make sense together, or whose dynamic segments need real ids. */
function special(s) {
  const allInc = [...s.inc.swmOpen, ...s.inc.swmClosed, ...s.inc.eleOpen, ...s.inc.eleClosed, ...s.inc.otherOpen, ...s.inc.severeOpen.slice(0, 1), ...s.inc.severeOwn, ...s.inc.awaiting, ...s.inc.missing];
  const reports = s.reports.map((r) => `${r.dir}/${r.name}`);
  const spike = s.spikes[0];
  const pct = (x) => encodeURIComponent(x);
  return {
    "/api/collector/incidents/[id]": allInc.map((id) => `/api/collector/incidents/${id}`),
    "/api/collector/incidents/[id]/analysis": allInc.slice(0, 6).map((id) => `/api/collector/incidents/${id}/analysis`),
    "/api/collector/incidents/[id]/action": [...s.inc.severeOpen, ...s.inc.swmOpen.slice(0, 1), ...s.inc.missing].map((id) => `/api/collector/incidents/${id}/action`),
    "/api/officer/grievances/[id]": allInc.map((id) => `/api/officer/grievances/${id}`),
    "/api/complaints/[code]": [...s.complaintCodes, "2026-000AAA"].map((c) => `/api/complaints/${c}`),
    "/api/complaints/media/[name]": [...s.media, "c-20260101-0000000000000000.jpg", "..%2F..%2Fsecret"].map((n) => `/api/complaints/media/${n}`),
    "/api/officer/photos/[dir]/[name]": [...reports, "20260101-0000000000000000/1.jpg", "bad/1.jpg"].map((r) => `/api/officer/photos/${r}`),
    "/api/rehearsal/photo/[dir]/[name]": [...reports.slice(0, 1), "20260101-0000000000000000/1.jpg"].map((r) => `/api/rehearsal/photo/${r}`),
    "/api/collector/assistant/sessions/[id]": [...s.sessions, NO_SESSION, "bad"].map((i) => `/api/collector/assistant/sessions/${i}`),
    "/api/collector/workspaces/[id]": [...s.workspaces, 999999, "bad"].map((i) => `/api/collector/workspaces/${i}`),
    "/api/collector/studio/[id]": ["no-such-dataset", "bad id"].map((i) => `/api/collector/studio/${pct(i)}`),
    "/api/map/layers/[id]": ["schools", "colleges", "hospitals", "fire_stations", "police", "water_bodies", "waterways", "rail_metro", "lakes_store", "gauges", "news", "live_rain", "live_lakes", "live_air", "live_hospitals", "live_works", "no_such_layer"].map((i) => `/api/map/layers/${i}`),
    "/api/rehearsal/traffic/[z]/[x]/[y]": ["12/2892/1855.png", "12/0/0.png", "3/1/1.png", "12/2892/bad.png"].map((t) => `/api/rehearsal/traffic/${t}`),
    "/api/collector/brief": [
      "", "?kind=bogus",
      ...["daily", "weekly", "monthly", "quarterly"].map((p) => `?kind=day&period=${p}`),
      "?kind=day&period=weekly&zone=5", "?kind=day&period=monthly&dept=GCC-SWM", `?kind=day&period=monthly&taluk=${s.taluks[0]}`,
      "?kind=dept&code=GCC-SWM", "?kind=dept&code=CMWSSB&period=weekly", "?kind=dept", "?kind=trends",
      `?kind=pattern&what=spike&cat=${spike.category_code}&zone=${spike.zone_no}&date=${spike.date}`, `?kind=pattern&what=hotspot&id=${s.hotspots[0]}`,
      `?kind=pattern&what=category&cat=${s.cats[0]}`, "?kind=pattern&what=bogus"
    ].map((q) => `/api/collector/brief${q}`),
    "/api/collector/pattern": [
      "", "?kind=bogus",
      ...s.spikes.map((a) => `?kind=spike&cat=${a.category_code}&zone=${a.zone_no}&date=${a.date}`),
      "?kind=spike&cat=FLOOD_WATERLOGGING&date=bad",
      ...s.hotspots.map((h) => `?kind=hotspot&id=${h}`), "?kind=hotspot&id=HOT-NOPE-000",
      ...s.cats.slice(0, 3).map((c) => `?kind=category&cat=${c}`)
    ].map((q) => `/api/collector/pattern${q}`),
    "/api/collector/conflicts": [
      "", ...PERIODS.map((p) => `?period=${p}`),
      ...s.story.map((ids) => `?ids=${ids.join(",")}&title=${pct("Story")}&id=${ids[0]}`), `?ids=${pct("bad id!")}`
    ].map((q) => `/api/collector/conflicts${q}`),
    "/api/collector/news": ["", ...s.story.map((ids) => `?ids=${ids.join(",")}`), `?ids=${s.withBody[0]}`, `?ids=${s.noBody[0]}`, "?ids=NOPE-1", `?ids=${pct("bad id!")}`].map((q) => `/api/collector/news${q}`),
    "/api/collector/news/analysis": ["", ...s.story.slice(0, 1).map((ids) => `?ids=${ids.join(",")}`), "?ids=NOPE-1"].map((q) => `/api/collector/news/analysis${q}`),
    "/api/collector/news/article": ["", ...s.withBody.map((d) => `?id=${d}`), ...s.noBody.map((d) => `?id=${d}`), "?id=NOPE-1", `?id=${pct("bad id!")}`].map((q) => `/api/collector/news/article${q}`),
    "/api/collector/nearby": ["", "?event=no-such-event"].map((q) => `/api/collector/nearby${q}`),
    "/api/collector/sources": ["", ...s.sources.map((i) => `?items=${i}`), "?items=999999"].map((q) => `/api/collector/sources${q}`),
    "/api/collector/studio/pick": ["", "?token=no-such-token", "?token=no-such-token&id=x"].map((q) => `/api/collector/studio/pick${q}`),
    "/api/collector/assistant/tools": ["", "?render=1"].map((q) => `/api/collector/assistant/tools${q}`),
    "/api/complaints": ["", "?status=Complaint%20Filed", "?status=bogus", `?code=${s.complaintCodes[0]}`, "?code=NOPE"].map((q) => `/api/complaints${q}`),
    "/api/dev/thunai/draft": ["", `?id=${s.inc.swmOpen[0]}`].map((q) => `/api/dev/thunai/draft${q}`),
    "/api/locations/gcc-localities": ["", "?areaId=abc", ...s.areas.map((a) => `?areaId=${a}`)].map((q) => `/api/locations/gcc-localities${q}`),
    "/api/locations/gcc-streets": ["", "?zoneId=13", ...s.areas.slice(0, 1).map((a) => `?areaId=${a}`), ...s.localities.slice(0, 1).map((l) => `?localityId=${l}`)].map((q) => `/api/locations/gcc-streets${q}`),
    "/api/locations/localities": ["", "?zoneId=abc", "?zoneId=5", "?zoneId=13"].map((q) => `/api/locations/localities${q}`),
    "/api/locations/streets": ["", "?localityId=abc", ...s.oldZoneLocalities.map((l) => `?localityId=${l}`)].map((q) => `/api/locations/streets${q}`),
    "/api/locations/wards": ["", "?zoneId=5", "?zoneId=13", "?zoneId=abc"].map((q) => `/api/locations/wards${q}`),
    "/api/locations/resolve-ward": ["", "?lat=13.0067&lng=80.2206", "?lat=13.0827&lng=80.2707", "?lat=12.9249&lng=80.1000", "?lat=28.6&lng=77.2", "?lat=500&lng=80"].map((q) => `/api/locations/resolve-ward${q}`),
    "/api/rehearsal/dev": ["", "?kind=rains", "?kind=geo"].map((q) => `/api/rehearsal/dev${q}`),
    "/api/rehearsal/impacts": ["", "?lens=traffic", "?lens=power", "?lens=metro", "?lens=bogus"].map((q) => `/api/rehearsal/impacts${q}`),
    // ref_facilities ids are not the rehearsal's: real ones come from its own answer (golden.mjs, "ids only a response can give"). These are the refusals
    "/api/rehearsal/reach": ["", ...s.facilities.slice(0, 1).map((f) => `?id=${f}`), "?id=NOPE-1", `?id=${s.facilities[0]}&replay=bad`].map((q) => `/api/rehearsal/reach${q}`),
    "/api/rehearsal/state": ["", "?manual=1", "?t=5", "?t=15", "?t=30", "?replay=bad", "?replay=rain-1999-01-01"].map((q) => `/api/rehearsal/state${q}`)
  };
}

const ROLES = ["anonymous", "citizenA", "officerA", "officerB", "collector"];

/**
 * The slowest routes take fewer values of each filter (the first ones of the spread), so one recording stays under 5 minutes. Each still sees every kind of filter,
 * and collector/list and collector/overview, built from the same data, keep a wider spread.
 */
const THIN = { period: 4, zone: 3, dept: 2, taluk: 2, cat: 2, sev: 2, combos: 4 };
const MEDIUM = { period: 5, zone: 5, dept: 4, taluk: 3, cat: 4, combos: 8 };
const CUT = { "/api/collector/insights": THIN, "/api/collector/report": THIN, "/api/officer/overview": THIN, "/api/officer/insights": THIN, "/api/collector/overview": MEDIUM, "/api/collector/stories": MEDIUM };

/**
 * Every GET route, for each of the five roles, with its spread of scopes. Returns the URLs for one role and the gaps: parameters or segments with no values.
 * The same URLs go to every role: a role that may not see a route shows its refusal here, for every scope.
 */
export function getPlan(inv, s) {
  const spread = spreads(s), together = combos(s), own = special(s);
  const urls = [], gaps = [];
  for (const r of inv.filter((x) => x.methods.includes("GET"))) {
    if (own[r.route]) { urls.push(...own[r.route].map((url) => ({ route: r.route, url }))); continue; }
    if (r.segments.length) { gaps.push(`${r.route}: no ids for its dynamic segments`); continue; }
    const missing = r.params.filter((p) => !spread[p]);
    for (const p of missing) gaps.push(`${r.route}: no values for ?${p}`);
    const taken = r.params.filter((p) => spread[p]);
    const seen = new Set([""]);
    const scopes = [""];
    const add = (o) => { const q = query(o); if (!seen.has(q)) { seen.add(q); scopes.push(q); } };
    const cut = CUT[r.route] ?? {};
    for (const p of taken) for (const v of spread[p].slice(0, cut[p] ?? Infinity)) add({ [p]: v });
    for (const c of together.filter((x) => Object.keys(x).every((k) => taken.includes(k))).slice(0, cut.combos ?? Infinity)) add(c);
    urls.push(...scopes.map((q) => ({ route: r.route, url: `${r.route}${q}` })));
  }
  return { urls, gaps, roles: ROLES };
}

/** A blank page state for Jarvis's routes. */
export const SCREEN = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0 };
