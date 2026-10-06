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
 */
import type { DatabaseSync as DB } from "node:sqlite";
import { onBuild } from "@/lib/aws/store";
import { cmwssbLakes } from "@/lib/collector/lakes";
import { placeResolver, type Placed } from "@/lib/collector/nlp";
import { judgeLocation, landmark, outsidePlace, type Ward } from "@/lib/collector/locreview";
import { clusterNews, type NewsGroup } from "@/lib/collector/newsrel";

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
      const add = db.prepare(`INSERT INTO alerts (alert_id, type, severity, title, message, explanation, place, zone_no, date, category_code, incident_ids, created_at, status)
        VALUES (?, 'lake_level', ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, 'open')`);
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

onBuild("cmwssb-reservoirs@1", reservoirs);
onBuild("readable-headlines@3", headlines);
onBuild("places-from-reports@2", places);
