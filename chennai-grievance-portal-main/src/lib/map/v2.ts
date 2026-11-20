/**
 * Ask the Map v2's features, computed on the server from the executor's own rows (no number is made in the browser):
 *   timelineOf   "Play the period": an answer's incidents by the day they were first reported, every day of its window
 *   scorecard    the ward scorecard: the area brief's counts, the ward's rank among all wards, the 30 days against the 30 before
 *   briefHtml    a printable one-page brief of any answer: the question, the headline, the numbers, a map of the places, the top rows
 * Pure: the caller passes the world and the run.
 */
import { areaBrief, type Brief } from "./brief";
import type { Ctx, Hit } from "./execute";
import type { Plan } from "./plan";
import type { Inc, World } from "./types";

// ------------------------------------------------------------------ the period, day by day --

export interface Timeline { days: { day: string; n: number; ids: string[] }[]; total: number; from: string; to: string }

const dayOf = (wall: string) => wall.slice(0, 10);
const addDays = (day: string, k: number) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);

/**
 * The incidents of an answer by the day they were first reported (IST), every day from the first to `now` (empty days
 * kept, so the bar is a true calendar). Null when the answer has fewer than two days or more than 120 (a bar of 120
 * days is the most that stays readable), or no incidents.
 */
export function timelineOf(hits: Hit[], now: string): Timeline | null {
  if (!hits.length) return null;
  const by = new Map<string, string[]>();
  for (const h of hits) { const d = dayOf(h.inc.first); by.set(d, [...(by.get(d) ?? []), h.inc.id]); }
  const days = [...by.keys()].sort();
  const from = days[0], to = dayOf(now) > days[days.length - 1] ? dayOf(now) : days[days.length - 1];
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (span < 2 || span > 120) return null;
  const out: Timeline["days"] = [];
  for (let k = 0; k < span; k++) { const d = addDays(from, k); const ids = by.get(d) ?? []; out.push({ day: d, n: ids.length, ids }); }
  return { days: out, total: hits.length, from, to };
}

// ------------------------------------------------------------------ the ward scorecard --

export interface Scorecard {
  ward: number;
  zone: number | null;
  label: { en: string; ta: string };
  open: number;
  overdue: number;
  severe: number;
  citizen: number;
  /** open issues: this ward's place among all wards with any (1 = the most) */
  rank: { k: number; of: number };
  /** the median open count over all wards, for comparison */
  median: number;
  change: Brief["change"];
  top: Brief["byType"];
  depts: Brief["depts"];
  facilities: Brief["facilities"];
  brief: Brief;
}

/** Open issues by ward, as the brief counts them (by record: the incident's own ward), for every ward on the map. */
function openByWard(w: World, lock: string | null): Map<number, number> {
  const m = new Map<number, number>();
  for (const wd of w.wards) m.set(wd.ward, 0);
  for (const i of w.incidents) if (i.ward != null && i.open && (!lock || i.dept === lock)) m.set(i.ward, (m.get(i.ward) ?? 0) + 1);
  return m;
}

export function scorecard(ward: number, w: World, ctx: Ctx, lock: string | null): Scorecard | null {
  const wd = w.wards.find((x) => x.ward === ward);
  if (!wd) return null;
  const brief = areaBrief({ kind: "ward", id: ward }, w, ctx, lock);
  const counts = openByWard(w, lock);
  const mine = counts.get(ward) ?? 0;
  const all = [...counts.values()];
  const sorted = [...all].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)) : 0;
  const openIds = new Set(brief.open.ids);
  const incs = w.incidents.filter((i) => openIds.has(i.id));
  return {
    ward, zone: wd.zone, label: brief.label, open: brief.open.n,
    overdue: incs.filter((i) => i.breached).length, severe: incs.filter((i) => i.sev === "Severe").length, citizen: brief.citizen.n,
    // the rank counts wards with more open issues than this one (ties share a place)
    rank: { k: all.filter((n) => n > mine).length + 1, of: all.length }, median,
    change: brief.change, top: brief.byType.slice(0, 5), depts: brief.depts, facilities: brief.facilities, brief
  };
}

/** "scorecard for ward 178", "ward 178 report card", "வார்டு 178 மதிப்பெண் அட்டை": the ward asked about, or null. */
export function scorecardWard(text: string): number | null {
  if (!/\b(score\s?card|report\s?card|ward\s+card|ward\s+report)\b|மதிப்பெண்\s*அட்டை|அறிக்கை\s*அட்டை/i.test(text)) return null;
  const m = text.match(/\bward\s*(?:no\.?|number)?\s*(\d{1,3})\b|\b(\d{1,3})(?:st|nd|rd|th)?\s+ward\b|வார்டு\s*(\d{1,3})|(\d{1,3})\s*(?:வது)?\s*வார்டு/i);
  const n = m ? Number(m[1] ?? m[2] ?? m[3] ?? m[4]) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------ printing --

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const n = (x: number) => x.toLocaleString("en-IN");

/** The district's wards and the answer's places, as a small SVG map (the same drawing as the meeting packs). */
export function pointsSvg(w: World, pts: { lat: number; lon: number }[], hot: Set<number> = new Set(), width = 460, height = 540): string {
  const b = w.district;
  const kx = Math.cos(((b.s + b.n) / 2) * Math.PI / 180);
  const sc = Math.min((width - 20) / ((b.e - b.w) * kx), (height - 20) / (b.n - b.s));
  const X = (lon: number) => 10 + (lon - b.w) * kx * sc, Y = (lat: number) => 10 + (b.n - lat) * sc;
  const wards = w.wards.map((wd) => wd.rings.map((ring) => `<path d="M${ring.map(([la, lo]) => `${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join("L")}Z" class="${hot.has(wd.ward) ? "hot" : "w"}"/>`).join("")).join("");
  const dots = pts.slice(0, 2000).map((p) => `<circle cx="${X(p.lon).toFixed(1)}" cy="${Y(p.lat).toFixed(1)}" r="2.6"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Map of the district with the answer's places"><style>.w{fill:#F1F5F9;stroke:#94A3B8;stroke-width:.5}.hot{fill:#FDE68A;stroke:#B45309;stroke-width:.9}circle{fill:#B91C1C;fill-opacity:.8;stroke:#fff;stroke-width:.6}</style>${wards}${dots}</svg>`;
}

const PAGE_CSS = `body{font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;color:#0F172A;background:#fff;margin:24px auto;max-width:1060px;padding:0 18px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:18px 0 6px}.sub{color:#475569;margin:2px 0 14px}.q{font-size:13px;color:#334155;background:#F1F5F9;border-radius:8px;padding:6px 10px;display:inline-block}
.big{font-size:20px;font-weight:700;margin:12px 0 4px}.grid{display:grid;grid-template-columns:minmax(0,1fr) 470px;gap:22px}@media (max-width:900px){.grid{grid-template-columns:1fr}svg{max-width:100%;height:auto}}
.tiles{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}.tile{border:1px solid #CBD5E1;border-radius:10px;padding:8px 12px;min-width:110px}.tile b{display:block;font-size:20px}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border-bottom:1px solid #E2E8F0;padding:5px 6px;text-align:left;vertical-align:top}th{background:#F8FAFC}
.foot{color:#64748B;font-size:11.5px;margin-top:18px}.noprint{margin:0 0 14px}@media print{.noprint{display:none}body{margin:0}}
@media (prefers-color-scheme:dark){body{background:#fff;color:#0F172A}}`;

export interface BriefInput {
  question: string | null;
  headline: string;
  meaning: string | null;
  facts: string[];
  tiles: { label: string; n: number }[];
  rows: { title: string; cat: string; status: string; sev: string; place: string; first: string; dept: string }[];
  total: number;
  pts: { lat: number; lon: number }[];
  asOf: string;
  sources: string[];
}

/** One printable page for an answer: what was asked, what the map found, a map, the top rows. Every value is passed in from the server's answer. */
export function briefHtml(w: World, b: BriefInput): string {
  const tiles = b.tiles.map((t) => `<div class="tile"><b>${n(t.n)}</b>${esc(t.label)}</div>`).join("");
  const rows = b.rows.slice(0, 25).map((r, k) => `<tr><td>${k + 1}</td><td>${esc(r.title)}</td><td>${esc(r.cat)}</td><td>${esc(r.sev)}</td><td>${esc(r.status)}</td><td>${esc(r.place)}</td><td>${esc(r.dept)}</td><td>${esc(r.first.slice(0, 16))}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ask the Map brief</title><style>${PAGE_CSS}</style></head><body>
<p class="noprint"><button onclick="print()">Print</button></p>
<h1>Ask the Map: brief</h1><p class="sub">District IQ, Chennai · data as of ${esc(b.asOf)}</p>
${b.question ? `<p class="q">Question: ${esc(b.question)}</p>` : ""}
<div class="grid"><div>
<p class="big">${esc(b.headline)}</p>${b.meaning ? `<p>${esc(b.meaning)}</p>` : ""}
${tiles ? `<div class="tiles">${tiles}</div>` : ""}
${b.facts.length ? `<h2>How it was worked out</h2><ul>${b.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
${rows ? `<h2>Top ${Math.min(25, b.rows.length)} of ${n(b.total)}</h2><table><tr><th>#</th><th>What</th><th>Type</th><th>Severity</th><th>Status</th><th>Where</th><th>Department</th><th>First reported</th></tr>${rows}</table>` : ""}
</div><div><h2>Map</h2>${pointsSvg(w, b.pts)}</div></div>
<p class="foot">Counts from District IQ's records, worked out by the server; no personal details. Sources: ${esc(b.sources.join("; ") || "District IQ")}.</p>
</body></html>`;
}

/** The ward scorecard as a printable page. */
export function scorecardHtml(w: World, s: Scorecard, asOf: string): string {
  const trend = s.change.pct == null ? `${n(s.change.now)} in the last 30 days, ${n(s.change.before)} in the 30 before` : `${n(s.change.now)} in the last 30 days against ${n(s.change.before)} in the 30 before (${s.change.pct > 0 ? "+" : ""}${s.change.pct} %)`;
  const top = s.top.map((t) => `<tr><td>${esc(t.en)}</td><td>${n(t.n)}</td></tr>`).join("");
  const depts = s.depts.map((d) => `<tr><td>${esc(d.name)}</td><td>${n(d.open)}</td><td>${n(d.overdue)}</td></tr>`).join("");
  const fac = s.facilities.filter((f) => f.n > 0).map((f) => `<li>${esc(f.en)}: ${n(f.n)}${f.items[0] ? ` (nearest: ${esc(f.items[0].name ?? "unnamed")})` : ""}</li>`).join("");
  const pts = w.incidents.filter((i) => s.brief.open.ids.includes(i.id) && i.pinnable).map((i) => ({ lat: i.lat, lon: i.lon }));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ward ${s.ward} scorecard</title><style>${PAGE_CSS}</style></head><body>
<p class="noprint"><button onclick="print()">Print</button></p>
<h1>${esc(s.label.en)}: scorecard</h1><p class="sub">District IQ, Chennai${s.zone ? ` · Zone ${s.zone}` : ""} · data as of ${esc(asOf)}</p>
<div class="grid"><div>
<div class="tiles"><div class="tile"><b>${n(s.open)}</b>open issues</div><div class="tile"><b>${n(s.overdue)}</b>past deadline</div><div class="tile"><b>${n(s.severe)}</b>severe</div><div class="tile"><b>${n(s.citizen)}</b>from citizens</div></div>
<p><b>Rank ${n(s.rank.k)} of ${n(s.rank.of)} wards</b> by open issues (1 = the most). The middle ward has ${n(s.median)}.</p>
<p>${esc(trend)}.</p>
${top ? `<h2>Top issues</h2><table><tr><th>Type</th><th>Open</th></tr>${top}</table>` : ""}
${depts ? `<h2>Departments</h2><table><tr><th>Department</th><th>Open</th><th>Past deadline</th></tr>${depts}</table>` : ""}
${fac ? `<h2>In and around the ward</h2><ul>${fac}</ul>` : ""}
</div><div><h2>Map</h2>${pointsSvg(w, pts, new Set([s.ward]))}</div></div>
<p class="foot">${esc(s.brief.rule_en)} Counts from District IQ's records, worked out by the server; no personal details.</p>
</body></html>`;
}

export type { Inc, Plan };
