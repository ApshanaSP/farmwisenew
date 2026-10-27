/**
 * Adjustments made to each pipeline build once it is loaded on this server (AWS store only; see onBuild in
 * lib/aws/store.ts). They change the in-memory build, never the pipeline's files or the durable store:
 *
 *   reservoirs   the simulated PWD lake figures are replaced by Chennai Metro Water's published storage of the six
 *                reservoirs (lakes.ts), in observations and observation_signals, so the briefing, the Environment
 *                page and Ask District IQ all read real numbers; the simulated "lake nearly full" alerts go.
 *   headlines    the pipeline titles every incident "<category> – <place>". Each one gets a readable headline from
 *                its own reports in incidents.headline: the police report ("A cab hit a two-wheeler on ..."), the
 *                citizen's complaint in their words, the PWD field note. `title` is kept (the search index uses it).
 *   places       an open incident with no zone whose place is named in its reports (the headline, its English
 *                translation, the AI's place, another outlet's article of the same story, or the opening of the
 *                article) is given that place's ward, zone, taluk and point, so it is on the map and in the zone's
 *                counts. Each is noted in _placed with how it was found, for the Trends page.
 *   news media   an incident known only from the news, and only from sites that are not news media (property blogs,
 *                trading apps, aggregators, content farms: newsrel.isNewsMedia), is taken out of the build, so the
 *                console's counts, map, lists and assistant follow official news media only.
 *   report kinds a news article that is a forecast, government work, a rescue, a roundup, an opinion or a promotion
 *                (reporttype.ts) is news, not an incident: its news-only incident leaves the build (LT-03).
 *   news sanity  history items, gas deaths, one story filed as many incidents, death counts said again by the
 *                fixed rule (LT-04), animal deaths, one-outlet death tolls (newssanity.ts).
 *   clusters     incidents that are the same problem in the same area (neighbouring streets, the same street or
 *                locality, the same citizen again, days apart, or one event covered by many outlets) share incidents.cluster_id (cluster.ts), so the console lists each group once
 *                with all its sources. Runs after places, so an incident placed from its reports groups by its place.
 */
import type { DatabaseSync as DB } from "node:sqlite";
import { onBuild } from "@/lib/aws/store";
import { cmwssbLakes } from "@/lib/collector/lakes";
import { placeResolver, type Placed } from "@/lib/collector/nlp";
import { judgeLocation, landmark, outsidePlace, type Ward } from "@/lib/collector/locreview";
import { clusterNews, isNewsMedia, type NewsGroup } from "@/lib/collector/newsrel";
import { cleanTitle } from "@/lib/collector/threads";
import { NON_INCIDENT_KINDS, reportKind, type ReportKind } from "@/lib/collector/reporttype";
import { CITY_ONLY, clusterIncidents, placeKey } from "@/lib/collector/cluster";
import { MASS_DEATHS, animalDeathsOnly, casualties, casualtyMerges, isArchival, isGasNotDisease, notAnIncident, storyMerges, type NewsIncident } from "@/lib/collector/newssanity";

type Row = Record<string, any>;
const istNow = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
const has = (db: DB, table: string, col?: string) => {
  const cols = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as Row[];
  return col ? cols.some((c) => c.name === col) : cols.length > 0;
};
function tx(db: DB, run: () => void) {
  db.exec("BEGIN");
  try { run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
}

// ------------------------------------------------------------- reservoirs --

async function reservoirs(db: DB) {
  if (!has(db, "observations")) return;
  const l = await cmwssbLakes(istNow(), 30);
  if (!l?.stations.length) return; // CMWSSB never reached: the build keeps its own figures
  const LAKE = ["lake_pct_full", "lake_storage_mcft", "lake_outflow_cusec"];
  tx(db, () => {
    db.prepare(`DELETE FROM observations WHERE metric IN (${LAKE.map(() => "?").join(", ")})`).run(...LAKE);
    const ins = db.prepare(`INSERT INTO observations (metric, value, unit, place_type, place_id, place_name, lat, lon, ward_no, zone_no, taluk_code,
      observed_at, period, source, quality, is_synthetic, detail) VALUES (?, ?, ?, 'facility', ?, ?, ?, ?, NULL, NULL, NULL, ?, 'day', 'cmwssb', 'ok', 0, ?)`);
    for (const s of l.stations) {
      s.times.forEach((t, k) => {
        ins.run("lake_pct_full", s.series[k], "%", s.id, s.name, s.lat, s.lon, `${t} 06:00:00`, l.source);
        ins.run("lake_storage_mcft", s.storage[k], "mcft", s.id, s.name, s.lat, s.lon, `${t} 06:00:00`, l.source);
      });
      if (s.outflow != null) ins.run("lake_outflow_cusec", s.outflow, "cusec", s.id, s.name, s.lat, s.lon, `${l.asOn} 06:00:00`, l.source);
    }
    if (has(db, "observation_signals")) {
      db.prepare(`DELETE FROM observation_signals WHERE metric IN (${LAKE.map(() => "?").join(", ")})`).run(...LAKE);
      const sig = db.prepare(`INSERT INTO observation_signals (metric, place_id, place_name, lat, lon, taluk_code, observed_at, value, unit, ewma7, mean28,
        zscore, slope_per_day, n_points, detail, source, anomaly, days_to_full) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, 'cmwssb', 0, ?)`);
      for (const s of l.stations) {
        const n = s.series.length, v = s.series[n - 1];
        const days = n > 1 ? (Date.parse(s.times[n - 1]) - Date.parse(s.times[0])) / 864e5 : 0;
        const slope = days ? Math.round(((v - s.series[0]) / days) * 1000) / 1000 : 0;
        const mean = Math.round((s.series.reduce((a, x) => a + x, 0) / n) * 10) / 10;
        const toFull = slope > 0.05 ? Math.round((100 - v) / slope) : null;
        const note = `CMWSSB lake level ${l.asOn}: ${s.storage[n - 1]} of ${s.capacity} mcft` + (s.lastYear != null ? `; ${s.lastYear} mcft on the same day last year` : "");
        sig.run("lake_pct_full", s.id, s.name, s.lat, s.lon, `${l.asOn} 06:00:00`, v, "%", mean, slope, n, note, toFull);
      }
    }
    if (has(db, "alerts")) {
      db.prepare(`DELETE FROM alerts WHERE type = 'lake_level'`).run();
      // only the columns this build's alerts table has: an export leaves out a column that is empty in every row
      // (category_code was, and the whole insert failed, so no lake alert reached the console)
      const optional = ["zone_no", "category_code", "incident_ids"].filter((c) => has(db, "alerts", c));
      const add = db.prepare(`INSERT INTO alerts (alert_id, type, severity, title, message, explanation, place, date, created_at, status${optional.map((c) => `, ${c}`).join("")})
        VALUES (?, 'lake_level', ?, ?, ?, ?, ?, ?, ?, 'open'${optional.map(() => ", NULL").join("")})`);
      for (const s of l.stations) {
        const v = s.series[s.series.length - 1];
        if (v < 85) continue;
        add.run(`ALR-CMWSSB-${s.id}`, v >= 95 ? "High" : "Medium", `${s.name} at ${v}% of capacity`,
          `${s.storage[s.storage.length - 1]} of ${s.capacity} mcft; outflow ${s.outflow ?? 0} cusec`, "Chennai Metro Water's daily lake level", s.name, l.asOn, istNow());
      }
    }
  });
}

// -------------------------------------------------------------- headlines --

const SOURCE_RANK: Record<string, number> = { police: 0, pwd: 1, grievance: 2, hospital: 3, imd: 4, news: 5 };

/** One readable line: the first sentence (or two short ones), road-name capitals fixed ("42Nd" -> "42nd"). */
export function headlineOf(text: string): string {
  let s = String(text ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, x) => n + x.toLowerCase()).replace(/\b(Ii|Iii|Iv|Vi|Vii)\b/g, (x) => x.toUpperCase());
  s = s.replace(/\b(no|dr|mr|mrs|ms)\.\s*(?=\S)/gi, (_m, w) => `${w} `); // "door no. 51" is not the end of a sentence
  // a complaint often opens with who is writing ("I live at door no. 51, ...", "We are tenants in ..."): the problem comes next
  for (let k = 0; k < 2; k++) {
    const m = s.match(/^((we are|i am|i run|i use|i live|i stay|we live|my (elderly )?(parents|mother|father|family)|writing on behalf|complaint from the|this is about)\b.*?[.!?])\s+(?=\S)/i);
    if (!m || s.length - m[0].length < 20) break;
    s = s.slice(m[0].length);
  }
  const first = s.match(/^.{20,}?[.!?](?=\s|$)/)?.[0] ?? s;
  let out = first.length < 45 && s.length > first.length ? (s.match(/^.{20,}?[.!?](?=\s|$).{10,}?[.!?](?=\s|$)/)?.[0] ?? first) : first;
  if (out.length > 140) out = out.slice(0, 137).replace(/[\s,;:-]+\S*$/, "") + "…";
  return out.replace(/[.\s]+$/, "");
}

function headlines(db: DB) {
  if (!has(db, "incidents") || !has(db, "events")) return;
  if (!has(db, "incidents", "headline")) db.exec(`ALTER TABLE incidents ADD COLUMN headline TEXT`);
  const gen = new Set((db.prepare(`SELECT incident_id AS id FROM incidents
    WHERE category_label IS NOT NULL AND substr(title, 1, length(category_label) + 3) = category_label || ' – '`).all() as Row[]).map((r) => String(r.id)));
  if (!gen.size) return;
  const best = new Map<string, { rank: number; text: string }>();
  for (const e of db.prepare(`SELECT incident_id AS id, source, title, text, lang FROM events WHERE incident_id IS NOT NULL ORDER BY reported_at`).all() as Row[]) {
    const id = String(e.id);
    if (!gen.has(id)) continue;
    const src = String(e.source);
    // police, hospital and IMD titles are already a sentence; complaints and field notes say it in their text
    const raw = src === "police" || src === "hospital" || src === "imd" || src === "news" ? e.title || e.text : e.text || e.title;
    if (!raw || String(raw).length < 12) continue;
    const rank = (SOURCE_RANK[src] ?? 6) * 2 + (e.lang === "en" || !/[஀-௿]/.test(String(raw)) ? 0 : 1);
    const cur = best.get(id);
    if (!cur || rank < cur.rank) best.set(id, { rank, text: headlineOf(String(raw)) });
  }
  tx(db, () => {
    const up = db.prepare(`UPDATE incidents SET headline = ? WHERE incident_id = ?`);
    for (const [id, b] of best) up.run(b.text, id);
  });
}

// ---------------------------------------------------------- news headlines --

/**
 * An incident that official news media reported is headed by the article's own headline (an English one first, else
 * the English translation of a Tamil one; then the earliest), not a citizen's complaint text: the reports themselves
 * still show in "How it unfolded".
 */
function newsHeadlines(db: DB) {
  if (!has(db, "incidents", "headline") || !has(db, "documents", "publisher_domain")) return;
  const best = new Map<string, { rank: number; t: string; text: string }>();
  for (const d of db.prepare(`SELECT linked_incident_id AS id, title, title_en, lang, publisher, publisher_domain AS dom, publisher_tier AS tier,
      published_at AS t FROM documents WHERE linked_incident_id IS NOT NULL AND title IS NOT NULL`).all() as Row[]) {
    if (!isNewsMedia(d.publisher, d.dom, d.tier)) continue;
    const english = d.lang === "en" ? String(d.title) : d.title_en ? String(d.title_en) : null;
    const text = cleanTitle(String(english ?? d.title)).replace(/\s*#\S+/g, "").trim();
    if (text.length < 12) continue;
    const rank = d.lang === "en" ? 0 : english ? 1 : 2;
    const cur = best.get(d.id);
    if (!cur || rank < cur.rank || (rank === cur.rank && String(d.t) < cur.t)) best.set(String(d.id), { rank, t: String(d.t), text });
  }
  tx(db, () => {
    const up = db.prepare(`UPDATE incidents SET headline = ? WHERE incident_id = ?`);
    for (const [id, b] of best) up.run(b.text, id);
  });
}

// ----------------------------------------------------------------- places --

const GENERIC = /^\s*(chennai|chennai district|chennai city|greater chennai|tamil ?nadu|tn|india)?\s*$/i;
/** City-wide reports (totals, schedules, campaigns) stay unplaced even when their article names a locality. */
const CITYWIDE = /dengue|cases|power (cut|shutdown)|மின்தடை|மின் தடை|டெங்கு|முகாம்|camps?|drive|across|statistics|schedule|forecast|warning/i;

async function places(db: DB) {
  if (!has(db, "incidents") || !has(db, "documents") || !has(db, "ref_wards")) return;
  const since = new Date(Date.now() + 330 * 60_000 - 120 * 864e5).toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT incident_id AS id, title, place_text AS loc, lat, lon, sources, dead, injured FROM incidents
    WHERE zone_no IS NULL AND first_reported_at >= ?`).all(since) as Row[];
  if (!rows.length) return;
  const wardRows = db.prepare(`SELECT ward_no, zone_no, zone_name, taluk_code, centroid_lat AS lat, centroid_lon AS lon FROM ref_wards`).all() as Row[];
  const wards: Ward[] = wardRows.map((w) => ({ ward_no: Number(w.ward_no), zone_no: Number(w.zone_no), lat: Number(w.lat), lon: Number(w.lon) }));
  const zoneName = new Map(wardRows.map((w) => [Number(w.zone_no), String(w.zone_name)]));
  const wardOf = new Map(wardRows.map((w) => [Number(w.ward_no), w]));
  const resolve = await placeResolver();
  const docs = new Map<string, Row[]>();
  const ids = rows.map((r) => r.id);
  for (let k = 0; k < ids.length; k += 400) {
    const part = ids.slice(k, k + 400);
    for (const d of db.prepare(`SELECT linked_incident_id AS inc, story_id, title, title_en, ai_place, place_text, geo_level, substr(COALESCE(body, summary, ''), 1, 900) AS lead
      FROM documents WHERE linked_incident_id IN (${part.map(() => "?").join(", ")})`).all(...part) as Row[])
      (docs.get(d.inc) ?? docs.set(d.inc, []).get(d.inc)!).push(d);
  }
  const stories = [...new Set([...docs.values()].flat().map((d) => d.story_id).filter(Boolean))] as string[];
  const sibs = new Map<string, Row[]>();
  for (let k = 0; k < stories.length; k += 400) {
    const part = stories.slice(k, k + 400);
    for (const d of db.prepare(`SELECT story_id, title, title_en, ai_place, place_text, geo_level FROM documents WHERE story_id IN (${part.map(() => "?").join(", ")})`).all(...part) as Row[])
      (sibs.get(d.story_id) ?? sibs.set(d.story_id, []).get(d.story_id)!).push(d);
  }
  const fromEvent = eventPlaces(db, new Date(Date.now() + 330 * 60_000 - 45 * 864e5).toISOString().slice(0, 10), resolve);
  const placed: { id: string; p: Placed; how: string }[] = [];
  for (const i of rows) {
    const v = judgeLocation(i, wards, resolve);
    if (v.kind === "district" || v.kind === "outside") continue;
    // its own map point is near a ward: only the zone was missing
    if (v.kind === "located" && v.zone && v.how.startsWith("its map point")) {
      placed.push({ id: i.id, p: { place: i.loc || zoneName.get(v.zone) || "", ward: null, zone: v.zone, taluk: null, conf: 0.8, lat: Number(i.lat), lon: Number(i.lon) }, how: v.how });
      continue;
    }
    const ds = docs.get(i.id) ?? [];
    const title = String(i.title ?? "");
    const tries: [string, string][] = [];
    if (v.kind === "located" && v.place) tries.push([v.place, v.how]);
    for (const d of ds) if (d.ai_place && !GENERIC.test(d.ai_place)) tries.push([d.ai_place, `the article places it at ${d.ai_place}`]);
    for (const d of ds) if (d.title_en) tries.push([d.title_en, "the headline (English translation) names it"]);
    if (!CITYWIDE.test(title)) {
      for (const d of ds.flatMap((x) => sibs.get(x.story_id) ?? [])) {
        if (d.ai_place && !GENERIC.test(d.ai_place)) tries.push([d.ai_place, `another outlet's report places it at ${d.ai_place}`]);
        if (d.place_text && !GENERIC.test(d.place_text) && d.geo_level === "locality") tries.push([d.place_text, `another outlet's report places it in ${d.place_text}`]);
        tries.push([String(d.title_en ?? d.title ?? ""), "another outlet's headline names it"]);
      }
      for (const d of ds) if (d.lead) tries.push([String(d.lead), "the article's opening names it"]);
    }
    let done = false;
    for (const [text, how] of tries) {
      if (!text || outsidePlace(text)) continue;
      const lm = landmark(text, resolve);
      const p = lm?.p ?? resolve(text);
      if (p?.zone && p.lat != null) {
        placed.push({ id: i.id, p, how: how.includes("names it") ? how.replace("names it", `names ${lm ? `${lm.named} (${p.place})` : p.place}`) : how });
        done = true;
        break;
      }
    }
    // other outlets' reports of the same event (the nurses' protest, a derailment) often name the place
    const ev = !done && !CITYWIDE.test(title) ? fromEvent.get(i.id) : undefined;
    if (ev) placed.push({ id: i.id, p: ev.p, how: `${ev.n} other report${ev.n === 1 ? "" : "s"} of the same event name ${ev.named}` });
  }
  db.exec(`CREATE TABLE IF NOT EXISTS _placed (incident_id TEXT PRIMARY KEY, place TEXT, how TEXT)`);
  tx(db, () => {
    const up = db.prepare(`UPDATE incidents SET zone_no = ?, zone_name = ?, ward_no = COALESCE(?, ward_no), taluk_code = COALESCE(?, taluk_code),
      lat = ?, lon = ?, loc_precision_m = ?, place_text = CASE WHEN place_text IS NULL OR place_text IN ('Chennai', 'Chennai district', '') THEN ? ELSE place_text END
      WHERE incident_id = ?`);
    const note = db.prepare(`INSERT OR REPLACE INTO _placed VALUES (?, ?, ?)`);
    for (const { id, p, how } of placed) {
      const w = p.ward != null ? wardOf.get(p.ward) : null;
      up.run(p.zone, zoneName.get(p.zone!) ?? null, p.ward, p.taluk ?? w?.taluk_code ?? null, p.lat, p.lon, how.startsWith("its map point") ? 300 : p.ward != null ? 800 : 3000, p.place, id);
      note.run(id, p.place, how);
    }
  });
}

/**
 * The place of each news event of the last weeks, from all its reports: reports are grouped into events the way the
 * console's news list groups them (newsrel.ts), and each report's place (the AI's, the monitor's locality, or a
 * landmark or locality in its headline) is a vote. An event whose votes mostly agree gives its place to every
 * incident linked to one of its reports. Returns incident id -> place.
 */
function eventPlaces(db: DB, since: string, resolve: (t: string) => Placed | null) {
  const docs = db.prepare(`SELECT doc_id, story_id, title, title_en, lang, ai_place, place_text, geo_level, linked_incident_id,
      strftime('%Y-%m-%d %H:%M:%S', published_at) AS t
    FROM documents WHERE is_district = 1 AND title IS NOT NULL AND published_at >= ? ORDER BY published_at DESC`).all(since) as Row[];
  const by = new Map<string, Row[]>();
  for (const d of docs) { const k = String(d.story_id ?? d.doc_id); (by.get(k) ?? by.set(k, []).get(k)!).push(d); }
  const english = (d: Row) => String((d.lang !== "en" && d.title_en) || d.title || "");
  const groups: NewsGroup[] = [...by.entries()].map(([key, g]) => ({ key, docs: g, english: english(g[0]),
    ms: Date.parse(String(g[0].t).replace(" ", "T") + "+05:30"), incident: (g.find((d) => d.linked_incident_id)?.linked_incident_id as string) ?? null }));
  const out = new Map<string, { p: Placed; named: string; n: number }>();
  for (const cl of clusterNews(groups)) {
    const all = cl.flatMap((g) => g.docs);
    const incs = [...new Set(all.map((d) => d.linked_incident_id).filter(Boolean))] as string[];
    if (!incs.length || all.length < 2) continue;
    const votes = new Map<string, { p: Placed; named: string; n: number }>();
    for (const d of all) {
      const texts = [d.ai_place && !GENERIC.test(d.ai_place) ? d.ai_place : null, d.geo_level === "locality" && d.place_text && !GENERIC.test(d.place_text) ? d.place_text : null,
        english(d), String(d.title ?? "")].filter(Boolean) as string[];
      for (const t of texts) {
        if (outsidePlace(t)) break;
        const lm = landmark(t, resolve);
        const p = lm?.p ?? resolve(t);
        if (!p?.zone || p.lat == null) continue;
        const v = votes.get(p.place) ?? { p, named: lm ? `${lm.named} (${p.place})` : p.place, n: 0 };
        v.n++;
        votes.set(p.place, v);
        break; // one vote per report
      }
    }
    const ranked = [...votes.values()].sort((a, b) => b.n - a.n);
    const total = ranked.reduce((a, v) => a + v.n, 0);
    // the reports must mostly agree: one place, or one place named by twice as many reports as the next
    if (!ranked.length || ranked[0].n < Math.max(1, 0.6 * total) || (ranked[1] && ranked[0].n < 2 * ranked[1].n)) continue;
    for (const id of incs) out.set(id, ranked[0]);
  }
  return out;
}

// ------------------------------------------------------------- news media --

function newsMedia(db: DB) {
  if (!has(db, "incidents", "media_only") || !has(db, "documents", "publisher_domain")) return;
  const seen = new Set<string>(), ok = new Set<string>();
  for (const d of db.prepare(`SELECT linked_incident_id AS id, publisher, publisher_domain AS dom, publisher_tier AS tier FROM documents
      WHERE linked_incident_id IS NOT NULL`).all() as Row[]) {
    seen.add(d.id);
    if (isNewsMedia(d.publisher, d.dom, d.tier)) ok.add(d.id);
  }
  const drop = (db.prepare(`SELECT incident_id AS id FROM incidents WHERE media_only = 1`).all() as Row[])
    .map((r) => String(r.id)).filter((id) => seen.has(id) && !ok.has(id));
  if (!drop.length) return;
  tx(db, () => {
    const del = db.prepare(`DELETE FROM incidents WHERE incident_id = ?`);
    for (const id of drop) del.run(id);
    if (has(db, "incident_members")) {
      const dm = db.prepare(`DELETE FROM incident_members WHERE incident_id = ?`);
      for (const id of drop) dm.run(id);
    }
  });
  console.log(`[derive] ${drop.length} news-only incidents from sites that are not news media left out`);
}

// ------------------------------------------------------------- news sanity --

/** Takes incidents out of the build with their members, timeline, actions and gaps; their articles stay, unlinked. */
function dropIncidents(db: DB, ids: string[]) {
  for (const [table, col] of [["incidents", "incident_id"], ["incident_members", "incident_id"], ["incident_timeline", "incident_id"],
    ["actions", "incident_id"], ["gaps", "incident_id"]] as const) {
    if (!has(db, table, col)) continue;
    const del = db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`);
    for (const id of ids) del.run(id);
  }
  if (has(db, "events", "incident_id")) {
    const up = db.prepare(`UPDATE events SET incident_id = NULL WHERE incident_id = ?`);
    for (const id of ids) up.run(id);
  }
  if (has(db, "documents", "linked_incident_id")) {
    const up = db.prepare(`UPDATE documents SET linked_incident_id = NULL${has(db, "documents", "is_incident") ? ", is_incident = 0" : ""} WHERE linked_incident_id = ?`);
    for (const id of ids) up.run(id);
  }
}

/** Moves everything that points at `from` to `to`, then removes `from`. */
function mergeInto(db: DB, from: string, to: string) {
  // one row per incident (its news gap, its drafted playbook): the duplicate's go when the kept incident has its own
  for (const table of ["actions", "gaps"])
    if (has(db, table, "incident_id") && db.prepare(`SELECT 1 FROM ${table} WHERE incident_id = ? LIMIT 1`).get(to))
      db.prepare(`DELETE FROM ${table} WHERE incident_id = ?`).run(from);
  for (const [table, col] of [["documents", "linked_incident_id"], ["incident_members", "incident_id"], ["incident_timeline", "incident_id"],
    ["events", "incident_id"], ["actions", "incident_id"], ["gaps", "incident_id"]] as const)
    if (has(db, table, col)) {
      // a row the kept incident already has (same key) is not copied twice; what is left is the duplicate's own
      db.prepare(`UPDATE OR IGNORE ${table} SET ${col} = ? WHERE ${col} = ?`).run(to, from);
      if (table !== "documents" && table !== "events") db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(from);
    }
  if (has(db, "alerts", "incident_ids"))
    // matched on the old list itself: the store's keyed tables have no rowid (WITHOUT ROWID)
    for (const a of db.prepare(`SELECT DISTINCT incident_ids AS ids FROM alerts WHERE incident_ids LIKE ?`).all(`%${from}%`) as Row[])
      db.prepare(`UPDATE alerts SET incident_ids = ? WHERE incident_ids = ?`).run(String(a.ids).split(from).join(to), a.ids);
  db.prepare(`DELETE FROM incidents WHERE incident_id = ?`).run(from);
}

// ------------------------------------------------------------ report kinds --

/**
 * Each news article's kind from its headline (reporttype.ts): a forecast, government work, a rescue, a roundup, an
 * opinion or a promotion is news, not an incident. The article keeps its place in the news lists with report_type set
 * to that kind and is_incident = 0 (alerts reach the alerts lane through it); a news-only incident whose every article
 * is such a report is taken out of the build, so only incidents carry a severity and reach the counts.
 */
export function reportKinds(db: DB) {
  if (!has(db, "documents", "report_type") || !has(db, "documents", "is_incident")) return;
  const en = has(db, "documents", "title_en") ? "title_en" : "NULL";
  const docs = db.prepare(`SELECT doc_id AS id, linked_incident_id AS inc, title, ${en} AS en FROM documents WHERE source_kind = 'news'`).all() as Row[];
  const kinds = new Map<string, ReportKind>();
  for (const d of docs) {
    const k = reportKind(d.en, d.title);
    if (k && NON_INCIDENT_KINDS.includes(k)) kinds.set(String(d.id), k);
  }
  const byInc = new Map<string, Row[]>();
  for (const d of docs) if (d.inc) (byInc.get(d.inc) ?? byInc.set(d.inc, []).get(d.inc)!).push(d);
  const media = has(db, "incidents", "media_only")
    ? (db.prepare(`SELECT incident_id AS id FROM incidents WHERE media_only = 1`).all() as Row[]).map((r) => String(r.id)) : [];
  const notIncidents = media.filter((id) => byInc.get(id)?.length && byInc.get(id)!.every((d) => kinds.has(String(d.id))));
  tx(db, () => {
    const up = db.prepare(`UPDATE documents SET report_type = ?, is_incident = 0 WHERE doc_id = ?`);
    for (const [id, k] of kinds) up.run(k, id);
    if (notIncidents.length) dropIncidents(db, notIncidents);
  });
  const by = [...kinds.values()].reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});
  console.log(`[derive] news kinds: ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(", ") || "none"}; `
    + `${notIncidents.length} news-only incidents that were not incidents taken out`);
}

/**
 * 0. death counts said again by the fixed rule (newssanity.casualties): an article's pattern count that read a label
 * ("Class 12", "19 year old", "diesel") is lowered, and a news-only incident takes the largest corrected count of its
 * articles. Counts only go down here; an LLM count stays unless it is one of the text's label numbers.
 */
function recountDeaths(db: DB): number {
  if (!has(db, "documents", "dead")) return 0;
  const aiCol = has(db, "documents", "ai_dead") ? "ai_dead" : "NULL";
  const enCol = has(db, "documents", "title_en") ? "title_en" : "NULL";
  const rows = db.prepare(`SELECT doc_id AS id, linked_incident_id AS inc, dead, ${aiCol} AS ai, title, ${enCol} AS en, summary, body
    FROM documents WHERE COALESCE(dead, 0) > 0`).all() as Row[];
  const LABEL = /\b(?:class|std|standard|grade|route|bus|ward|no|platform|aged|age)\.?\s*(\d{1,3})\b|\b(\d{1,3})[-\s]years?[-\s]old\b/gi;
  const fixed = new Map<string, number>();
  for (const r of rows) {
    const text = [r.title, r.en, r.summary, String(r.body ?? "").slice(0, 4000)].filter(Boolean).join(". ");
    const now = Number(r.dead), ai = r.ai == null ? null : Number(r.ai);
    const labels = new Set([...text.matchAll(LABEL)].map((m) => Number(m[1] ?? m[2])));
    const said = casualties(text)[0];
    const want = ai != null && Number.isFinite(ai) && !(ai > 1 && labels.has(ai) && ai !== said) ? ai : Math.min(now, said);
    if (want < now) fixed.set(String(r.id), want);
  }
  if (!fixed.size) return 0;
  tx(db, () => {
    const up = db.prepare(`UPDATE documents SET dead = ? WHERE doc_id = ?`);
    for (const [id, v] of fixed) up.run(v, id);
    // a news-only incident: the largest count its articles now give
    const incs = [...new Set(rows.filter((r) => fixed.has(String(r.id)) && r.inc).map((r) => String(r.inc)))];
    const most = db.prepare(`SELECT MAX(COALESCE(dead, 0)) AS d FROM documents WHERE linked_incident_id = ?`);
    const set = db.prepare(`UPDATE incidents SET dead = ? WHERE incident_id = ? AND media_only = 1 AND COALESCE(dead, 0) > ?`);
    for (const id of incs) { const d = Number((most.get(id) as Row | undefined)?.d ?? 0); set.run(d || null, id, d); }
  });
  return fixed.size;
}

export function newsSanity(db: DB) {
  if (!has(db, "incidents", "media_only") || !has(db, "documents", "linked_incident_id")) return;
  const recounted = recountDeaths(db);
  if (recounted) console.log(`[derive] news: ${recounted} article death counts lowered (a class, age, route or price read as a toll)`);
  const docs = db.prepare(`SELECT linked_incident_id AS id, story_id AS story, title, ${has(db, "documents", "title_en") ? "title_en" : "NULL AS title_en"},
    published_at AS pub, publisher FROM documents WHERE linked_incident_id IS NOT NULL`).all() as Row[];
  const byInc = new Map<string, Row[]>();
  for (const d of docs) (byInc.get(d.id) ?? byInc.set(d.id, []).get(d.id)!).push(d);
  const media = db.prepare(`SELECT incident_id AS id, first_reported_at AS t, zone_no AS zone, category_code AS cat, title,
    ${has(db, "incidents", "place_text") ? "place_text" : "NULL"} AS place,
    COALESCE(dead, 0) AS dead FROM incidents WHERE media_only = 1`).all() as Row[];

  // 1. history columns and articles about long-past events; horoscopes and obituaries of natural deaths (news, not incidents)
  const archival = media.filter((i) => byInc.get(i.id)?.length && byInc.get(i.id)!.every((d) => isArchival(d.title, d.pub) || notAnIncident(d.title)))
    .map((i) => String(i.id));
  const gone = new Set(archival);

  // 2. gas deaths read as disease
  const ref = has(db, "ref_categories") ? db.prepare(`SELECT category_code, label, family, lead_dept FROM ref_categories WHERE category_code = 'DRAIN_WORKS_SAFETY'`).get() as Row | undefined : undefined;
  const gas = ref ? media.filter((i) => i.cat === "VECTOR_DISEASE" && !gone.has(String(i.id))
    && isGasNotDisease(i.title, ...(byInc.get(i.id) ?? []).flatMap((d) => [d.title, d.title_en]))).map((i) => String(i.id)) : [];

  // 3. news-only incidents of one story
  const stories = new Map<string, NewsIncident[]>();
  for (const i of media) {
    if (gone.has(String(i.id))) continue;
    for (const s of new Set((byInc.get(i.id) ?? []).map((d) => d.story).filter(Boolean)))
      (stories.get(s) ?? stories.set(s, []).get(s)!).push({ id: String(i.id), t: String(i.t), zone: i.zone ?? null, mediaOnly: true });
  }
  // an incident can be in two stories: the merges form groups (union-find), each kept as its earliest placed incident
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const [a, b] of storyMerges(stories)) join(a, b);
  // 4. the same deaths at the same place reported under different stories
  for (const [a, b] of casualtyMerges(media.filter((i) => !gone.has(String(i.id))).map((i) => ({ id: String(i.id), t: String(i.t),
    zone: i.zone ?? null, place: placeKey(i.place), dead: Number(i.dead) })))) join(a, b);
  const comps = new Map<string, string[]>();
  for (const id of parent.keys()) (comps.get(find(id)) ?? comps.set(find(id), []).get(find(id))!).push(id);
  const info = new Map(media.map((i) => [String(i.id), i]));
  const groups = new Map<string, string[]>();
  for (const ids of comps.values()) {
    const all = [...new Set([...ids, ...ids.map(find)])].sort((a, b) => String(info.get(a)?.t).localeCompare(String(info.get(b)?.t)) || a.localeCompare(b));
    if (new Set(all.map((id) => info.get(id)?.zone).filter((z) => z != null)).size > 1) continue; // two stories chained across zones
    const keep = all.find((id) => info.get(id)?.zone != null) ?? all[0];
    groups.set(keep, all.filter((id) => id !== keep));
  }

  tx(db, () => {
    if (archival.length) dropIncidents(db, archival);
    const setCat = db.prepare(`UPDATE incidents SET category_code = ?, category_label = ?${has(db, "incidents", "family") ? ", family = ?" : ""},
      lead_dept = ? WHERE incident_id = ?`);
    for (const id of gas) setCat.run(...[ref!.category_code, ref!.label, ...(has(db, "incidents", "family") ? [ref!.family] : []), ref!.lead_dept, id]);

    const get = db.prepare(`SELECT incident_id AS id, first_reported_at AS t, last_update_at AS u, dead, injured, member_count AS m FROM incidents WHERE incident_id = ?`);
    for (const [to, from] of groups) {
      const all = [to, ...from].map((id) => get.get(id) as Row | undefined).filter(Boolean) as Row[];
      if (all.length < 2) continue;
      const max = (k: string) => { const v = all.map((r) => Number(r[k])).filter((x) => Number.isFinite(x) && x > 0); return v.length ? Math.max(...v) : null; };
      for (const id of from) if (all.some((r) => r.id === id)) mergeInto(db, id, to);
      const outlets = new Set([to, ...from].flatMap((id) => byInc.get(id) ?? []).map((d) => d.publisher).filter(Boolean)).size;
      db.prepare(`UPDATE incidents SET dead = ?, injured = ?, first_reported_at = ?, last_update_at = ?, member_count = ?, outlet_count = ? WHERE incident_id = ?`)
        .run(max("dead"), max("injured"), all.map((r) => String(r.t)).sort()[0], all.map((r) => String(r.u ?? r.t)).sort().pop()!,
          all.reduce((s, r) => s + (Number(r.m) || 1), 0), Math.max(1, outlets), to);
    }

    // 5. deaths of animals ("17 stray dogs found dead"): the incident stays, the animals are not counted as people who died
    if (!has(db, "incidents", "dead_reported")) db.exec(`ALTER TABLE incidents ADD COLUMN dead_reported REAL`);
    const animals = (db.prepare(`SELECT incident_id AS id, title FROM incidents WHERE media_only = 1 AND COALESCE(dead, 0) > 0`).all() as Row[])
      .filter((r) => animalDeathsOnly(r.title, ...(byInc.get(r.id) ?? []).flatMap((d) => [d.title, d.title_en])));
    for (const r of animals) db.prepare(`UPDATE incidents SET dead_reported = dead, dead = NULL WHERE incident_id = ?`).run(r.id);

    // 6. a mass death toll from one outlet only: kept, not counted until confirmed
    const hold = (db.prepare(`SELECT i.incident_id AS id, i.dead FROM incidents i WHERE i.media_only = 1 AND COALESCE(i.dead, 0) >= ?`).all(MASS_DEATHS) as Row[])
      .filter((r) => new Set((db.prepare(`SELECT publisher FROM documents WHERE linked_incident_id = ?`).all(r.id) as Row[]).map((d) => d.publisher)).size < 2);
    const review = has(db, "incidents", "needs_review") && has(db, "incidents", "review_reason");
    for (const r of hold)
      db.prepare(`UPDATE incidents SET dead_reported = dead, dead = NULL${review ? ", needs_review = 1, review_reason = ?" : ""} WHERE incident_id = ?`)
        .run(...(review ? [`${r.dead} deaths reported by one news outlet only: confirm before counting`, r.id] : [r.id]));
    if (archival.length || gas.length || groups.size || hold.length || animals.length)
      console.log(`[derive] news: ${archival.length} history, horoscope or obituary items left out, ${gas.length} gas deaths recategorised, ${animals.length} animal deaths not counted as people, `
        + `${[...groups.values()].reduce((s, f) => s + f.length, 0)} same-event incidents merged into ${groups.size}, ${hold.length} death tolls held for confirmation`);
  });
}

// --------------------------------------------------------------- clusters --

function clusters(db: DB) {
  if (!has(db, "incidents")) return;
  if (!has(db, "incidents", "cluster_id")) db.exec(`ALTER TABLE incidents ADD COLUMN cluster_id TEXT`);
  if (!has(db, "incidents", "cluster_size")) db.exec(`ALTER TABLE incidents ADD COLUMN cluster_size INTEGER`);
  // a Tamil headline is compared through its English translation
  const en = new Map<string, string>();
  if (has(db, "documents", "title_en"))
    for (const d of db.prepare(`SELECT linked_incident_id AS id, title_en FROM documents
        WHERE linked_incident_id IS NOT NULL AND lang <> 'en' AND title_en IS NOT NULL`).all() as Row[])
      if (!en.has(d.id)) en.set(d.id, String(d.title_en));
  // who filed the citizen complaints in each incident: the same person reporting a problem again is the same problem
  const reporters = new Map<string, string[]>();
  if (has(db, "events", "reporter_hash"))
    for (const e of db.prepare(`SELECT DISTINCT incident_id AS id, reporter_hash AS r FROM events
        WHERE incident_id IS NOT NULL AND reporter_hash IS NOT NULL AND source = 'grievance'`).all() as Row[])
      (reporters.get(e.id) ?? reporters.set(e.id, []).get(e.id)!).push(String(e.r));
  const text = has(db, "incidents", "headline") ? "COALESCE(headline, title)" : "title";
  const rows = db.prepare(`SELECT incident_id AS id, category_code AS cat, first_reported_at AS t, lat, lon, place_text AS place,
    zone_no AS zone, citizen_complaints AS complaints, sources, ${text} AS text, title FROM incidents`).all() as Row[];
  const wall = (t: string) => Date.parse(String(t).replace(" ", "T") + "+05:30");
  const group = clusterIncidents(rows.map((r) => ({
    id: String(r.id), cat: String(r.cat ?? "OTHER"), t: wall(r.t), lat: r.lat ?? null, lon: r.lon ?? null,
    placed: !CITY_ONLY.test(String(r.place ?? "")), text: en.get(r.id) ?? String(r.text ?? ""), original: String(r.title ?? ""),
    zone: r.zone ?? null, place: r.place ?? null, reporters: reporters.get(r.id) ?? [], civic: Number(r.complaints) > 0,
    official: !/grievance|news/.test(String(r.sources ?? ""))
  })));
  const size = new Map<string, number>();
  for (const g of group.values()) size.set(g, (size.get(g) ?? 0) + 1);
  tx(db, () => {
    const up = db.prepare(`UPDATE incidents SET cluster_id = ?, cluster_size = ? WHERE incident_id = ?`);
    for (const [id, g] of group) up.run(g, size.get(g) ?? 1, id);
  });
  db.exec(`CREATE INDEX IF NOT EXISTS ix_incidents_cluster ON incidents (cluster_id)`);
}

onBuild("cmwssb-reservoirs@1", reservoirs);
onBuild("readable-headlines@3", headlines);
onBuild("news-headlines@1", newsHeadlines);
onBuild("places-from-reports@2", places);
onBuild("news-media-only@1", newsMedia);
onBuild("report-kinds@1", reportKinds);
onBuild("news-sanity@6", newsSanity);
onBuild("incident-clusters@4", clusters);
