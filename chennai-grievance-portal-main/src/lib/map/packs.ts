/**
 * Meeting packs (Ask the Map final): one click makes the brief for a meeting the Collector chairs, from fixed plans run on the server:
 *   weekly   the weekly review: open cases by ward, the wards that got worse, past deadline, severe
 *   monsoon  the pre-monsoon meeting: flooding by ward over 90 days, wards far from a fire station, drainage by zone, PWD works behind plan
 * Every number is the executor's (or a count over the world's own records). The words: Claude Haiku 5.5 may write up to four short
 * sentences from the facts, and a sentence with any number that is not a fact is dropped (the number gate, as ai.ts aiReword); without
 * Claude the sentences are templates. The pack prints as one page: an SVG map of the wards (no tiles), the top 10 lists and the numbers.
 * v3 (owner, 22 Nov 2026): the quarterly bank meeting is gone ("I don't understand the need"); the weekly review is an interactive page
 * (weeklyHtml): every ward shaded on its own map, a day-by-day chart, the kinds of problem, zones and departments, each one a click
 * away from the others. Its figures are counted on the server from the executor's own collections (weeklyData); the page only draws.
 */
import { z } from "zod";
import { claudeConfigured, claudeJson } from "@/lib/ai/claude";
import { extractNumbers } from "@/lib/assistant/verify";
import { PlanError, runMapPlan, type Ctx, type RunResult } from "./execute";
import { fmtDistance } from "./geom";
import { checkPlan, type Plan, type Step } from "./plan";
import type { World } from "./types";
import { weeklyData, weeklyHtml, type WeeklyData } from "./weekly";

export type PackKind = "weekly" | "monsoon";
export const PACK_KINDS: PackKind[] = ["weekly", "monsoon"];

export interface PackRow { key: string; label: string; value: number; text: string; lat: number; lon: number }
export interface PackSection { id: string; title: string; note: string | null; rows: PackRow[]; plan: Plan | null; unit: "count" | "metres" | "delta" }
export interface Pack {
  kind: PackKind; title: string; subtitle: string; asOf: string; numbers: { label: string; value: number }[];
  sections: PackSection[]; sentences: string[]; wordsBy: "claude" | "template"; notes: string[]; svg: string;
  /** v3: the weekly review's figures for its interactive page */
  weekly?: WeeklyData;
}

const n = (x: number) => x.toLocaleString("en-IN");
const inc = (as: string, f: Partial<NonNullable<Extract<Step, { op: "take" }>["filter"]>>): Step => ({ op: "take", as, layer: "incidents", where: null,
  filter: { category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null, ...f } });
const fac = (as: string, layer: Extract<Step, { op: "take" }>["layer"]): Step => ({ op: "take", as, layer, filter: null, where: null });
const P = (steps: Step[], show: string): Plan => ({ steps, show, language: "en" });

function run(p: Plan, w: World, ctx: Ctx, lock: string | null): RunResult {
  const c = checkPlan(p);
  if (!c.ok) throw new Error(`pack plan refused: ${c.problems[0]}`);
  return runMapPlan(c.plan, w, ctx, lock);
}

/** The top rows of a count_by, farthest or rank answer, as pack rows. */
function rowsOf(r: RunResult, k = 10): { rows: PackRow[]; unit: PackSection["unit"] } {
  const s = r.show;
  if (s.type === "groups") return { unit: "count", rows: s.groups.slice(0, k).map((g) => ({ key: g.key, label: g.label, value: g.n, text: n(g.n), lat: g.lat, lon: g.lon })) };
  if (s.type === "areas") return { unit: "metres", rows: s.areas.slice(0, k).map((a) => ({ key: a.key, label: a.label, value: Math.round(a.p90), text: fmtDistance(a.p90), lat: a.lat, lon: a.lon })) };
  if (s.type === "ranked") return { unit: "delta", rows: s.rows.filter((x) => (s.order === "rise" ? x.delta > 0 : x.delta < 0)).slice(0, k)
    .map((x) => ({ key: x.key, label: x.label, value: x.delta, text: `${n(x.before)} → ${n(x.now)} (${x.delta > 0 ? "+" : ""}${n(x.delta)})`, lat: x.lat, lon: x.lon })) };
  return { unit: "count", rows: [] };
}

function partial(w: World, layer: string): string | null {
  const m = w.meta[layer];
  return m?.partial ? `${m.name_en}: OpenStreetMap lists ${n(m.count)} ${m.partial.what}, not the full list; ${m.partial.owner} holds the full one.` : null;
}

/** The pack's facts and lists, all from the server. */
export function buildPack(kind: PackKind, w: World, ctx: Ctx, lock: string | null): Omit<Pack, "sentences" | "wordsBy" | "svg"> {
  const sections: PackSection[] = [];
  const numbers: Pack["numbers"] = [];
  const notes: string[] = ["Straight-line distances. Ward boundaries: DataMeet community data, not an official GCC map."];
  const add = (id: string, title: string, plan: Plan, note: string | null = null): RunResult | null => {
    try {
      const r = run(plan, w, ctx, lock);
      const { rows, unit } = rowsOf(r);
      sections.push({ id, title, note, rows, plan, unit });
      return r;
    } catch (e) {
      // a plan that cannot run on today's data (no fire station on the map, say): the section says so, the pack is still made
      if (!(e instanceof PlanError)) throw e;
      sections.push({ id, title, note: e.message, rows: [], plan, unit: "count" });
      return null;
    }
  };
  if (kind === "weekly") {
    const open = add("open_by_ward", "Open cases by ward, last 7 days", P([inc("a", {}), { op: "count_by", as: "by", of: "a", by: "ward" }], "by"));
    const hits = open?.hits ?? [];
    numbers.push({ label: "open cases reported in the last 7 days", value: hits.length }, { label: "of these open cases, already past their deadline", value: hits.filter((h) => h.inc.breached).length },
      { label: "of these open cases, severe", value: hits.filter((h) => h.inc.sev === "Severe").length });
    const rk = add("worse", "Wards that got worse: this week against the week before (all statuses)", P([inc("a", { status: "any" }),
      { op: "change", as: "chg", of: "a", now: { kind: "last_days", days: 7, offset: 0 }, before: { kind: "last_days", days: 7, offset: 1 } },
      { op: "rank", as: "rank", of: "chg", by: "ward", order: "rise" }], "rank"));
    if (rk?.show.type === "ranked") numbers.push({ label: "wards with more reports than the week before", value: rk.show.rows.filter((x) => x.delta > 0).length });
    add("overdue_zone", "Past deadline, by zone", P([inc("a", { overdue: true, period: null }), { op: "count_by", as: "by", of: "a", by: "zone" }], "by"));
  } else {
    const fl = add("flood_ward", "Flooding reports by ward, last 90 days (all statuses)", P([inc("a", { family: ["FLOOD"], status: "any", period: { kind: "last_days", days: 90, offset: 0 } }), { op: "count_by", as: "by", of: "a", by: "ward" }], "by"));
    numbers.push({ label: "flooding reports in the last 90 days", value: fl?.hits.length ?? 0 });
    const fs = add("far_fire", "Wards farthest from a fire station (90 % of the ground within)", P([fac("f1", "fire_stations"), { op: "farthest", as: "far", areas: "ward", from: "f1", beyond_m: null }], "far"));
    if (fs?.show.type === "areas" && fs.show.areas[0]) numbers.push({ label: "metres, the farthest ward's distance to a fire station", value: Math.round(fs.show.areas[0].p90) });
    const dr = add("drain_zone", "Open drainage and sewage cases by zone, last 30 days", P([inc("a", { category: ["DRAINAGE_SEWAGE"], period: { kind: "last_days", days: 30, offset: 0 } }), { op: "count_by", as: "by", of: "a", by: "zone" }], "by"));
    numbers.push({ label: "open drainage and sewage cases in the last 30 days", value: dr?.hits.length ?? 0 });
    const works = (w.conds?.works ?? []).filter((x) => (x.gap ?? 0) < -10).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
    numbers.push({ label: "PWD works more than 10 points behind plan", value: works.length });
    sections.push({ id: "works_late", title: "PWD works furthest behind plan", note: "PWD works register.", unit: "count", plan: null,
      rows: works.slice(0, 10).map((x) => ({ key: x.id, label: x.title, value: Math.round(-(x.gap ?? 0)), text: `${Math.round(-(x.gap ?? 0))} points behind${x.progress != null ? ` · ${Math.round(x.progress)} % done` : ""}${x.target ? ` · due ${x.target}` : ""}`, lat: x.lat, lon: x.lon })) });
    const lakes = (w.conds?.places ?? []).filter((p) => p.kind === "lake" && (p.m.lake_pct_full?.v ?? 0) >= 90).length;
    numbers.push({ label: "lakes 90 % full or more", value: lakes });
  }
  const title = { weekly: "Weekly review", monsoon: "Pre-monsoon meeting" }[kind];
  const subtitle = { weekly: "Open cases, where they grew, and what is past its deadline.",
    monsoon: "Where flooding has been reported, how far help is, drains, and works behind plan." }[kind];
  return { kind, title, subtitle, asOf: w.dataAsOf || w.now, numbers, sections, notes, ...(kind === "weekly" ? { weekly: weeklyData(w, ctx, lock) } : {}) };
}

/** Sentences whose every number is a fact of the pack (or a row's), else null. */
export function gateSentence(s: string, allowed: Set<number>): boolean {
  return extractNumbers(s).every((x) => allowed.has(x.value));
}
export function allowedNumbers(p: Omit<Pack, "sentences" | "wordsBy" | "svg">): Set<number> {
  const out = new Set<number>([2, 7, 10, 30, 90]);
  for (const x of p.numbers) out.add(x.value);
  for (const s of p.sections) for (const r of s.rows) { out.add(r.value); for (const m of extractNumbers(`${r.label} ${r.text}`)) out.add(m.value); }
  return out;
}

function templateSentences(p: Omit<Pack, "sentences" | "wordsBy" | "svg">): string[] {
  const out = p.numbers.slice(0, 3).map((x) => `${n(x.value)} ${x.label}.`);
  const first = p.sections.find((s) => s.rows.length);
  if (first) out.push(`${first.title}: first ${first.rows[0].label} (${first.rows[0].text}).`);
  return out;
}

const Words = z.object({ sentences: z.array(z.string().max(300)).max(4) });
/** Up to four plain sentences from the facts by Claude Haiku 5.5; any sentence with a number not in the facts is dropped. */
export async function packWords(p: Omit<Pack, "sentences" | "wordsBy" | "svg">, signal?: AbortSignal): Promise<{ sentences: string[]; by: "claude" | "template" }> {
  const allowed = allowedNumbers(p);
  if (claudeConfigured()) {
    try {
      const facts = [...p.numbers.map((x) => `${x.label}: ${x.value}`), ...p.sections.flatMap((s) => [`${s.title}:`, ...s.rows.slice(0, 5).map((r) => `  ${r.label}: ${r.text}`)])].join("\n");
      const r = await claudeJson({
        name: "map-pack", role: "fast", model: process.env.AI_MAP_CLAUDE_MODEL?.trim() || "claude-haiku-5-5", effort: "low", think: false, schema: Words,
        system: "You write the opening of a meeting brief for a District Collector in India: at most four short, plain sentences, in British English. Say what matters most and where. Use only the facts given, and copy every number exactly as given. Add no number, cause, forecast or recommendation that the facts do not state.",
        prompt: `MEETING: ${p.title}\nFACTS:\n${facts}`, maxOutputTokens: 500, timeoutMs: 20_000, abortSignal: signal
      });
      const kept = r.object.sentences.map((s) => s.trim()).filter((s) => s && gateSentence(s, allowed));
      if (kept.length) return { sentences: kept, by: "claude" };
    } catch (e) { console.warn("[map] pack words:", (e as Error).message?.slice(0, 160)); }
  }
  return { sentences: templateSentences(p), by: "template" };
}

/** A plain SVG of the wards with the pack's top places marked (prints without map tiles). */
export function packSvg(w: World, rows: PackRow[], width = 520, height = 620): string {
  const b = w.district;
  const kx = Math.cos(((b.s + b.n) / 2) * Math.PI / 180);
  const sx = (width - 20) / ((b.e - b.w) * kx), sy = (height - 20) / (b.n - b.s);
  const sc = Math.min(sx, sy);
  const X = (lon: number) => 10 + (lon - b.w) * kx * sc, Y = (lat: number) => 10 + (b.n - lat) * sc;
  const hot = new Set(rows.map((r) => r.key));
  const wards = w.wards.map((wd) => wd.rings.map((ring) => `<path d="M${ring.map(([la, lo]) => `${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join("L")}Z" class="${hot.has(String(wd.ward)) ? "hot" : "w"}"/>`).join("")).join("");
  const marks = rows.filter((r) => r.lat || r.lon).slice(0, 10).map((r, i) => `<g transform="translate(${X(r.lon).toFixed(1)},${Y(r.lat).toFixed(1)})"><circle r="9"/><text y="3.5">${i + 1}</text></g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Map of the wards with the top places numbered"><style>.w{fill:#F1F5F9;stroke:#94A3B8;stroke-width:.5}.hot{fill:#FDE68A;stroke:#B45309;stroke-width:.8}circle{fill:#B91C1C;stroke:#fff;stroke-width:1.5}text{fill:#fff;font:700 10px system-ui;text-anchor:middle}</style>${wards}${marks}</svg>`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
/** The pack as one printable page. */
export function packHtml(p: Pack): string {
  if (p.weekly) return weeklyHtml({ ...p, weekly: p.weekly });
  const sec = (s: PackSection) => `<section><h2>${esc(s.title)}</h2>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}${s.rows.length
    ? `<ol>${s.rows.map((r) => `<li><b>${esc(r.label)}</b><span>${esc(r.text)}</span></li>`).join("")}</ol>` : `<p class="note">None.</p>`}</section>`;
  const first = p.sections.find((s) => s.rows.length && s.rows.some((r) => r.lat || r.lon));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.title)} · District IQ</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{color-scheme:light}html{background:#fff}body{font:14px/1.45 system-ui,Segoe UI,sans-serif;color:#0F172A;background:#fff;margin:24px auto;max-width:1040px;padding:0 16px}h1{font-size:22px;margin:0}h2{font-size:15px;margin:18px 0 6px}
.sub{color:#475569;margin:2px 0 14px}.grid{display:grid;grid-template-columns:minmax(0,1fr) 540px;gap:20px}@media (max-width:900px){.grid{grid-template-columns:1fr}svg{max-width:100%;height:auto}}
.nums{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.nums div{border:1px solid #CBD5E1;border-radius:8px;padding:8px 10px;min-width:140px}.nums b{display:block;font-size:20px}
ol{margin:0;padding-left:22px}li{margin:3px 0}li span{color:#334155;margin-left:8px}.note{color:#64748B;font-size:12px;margin:2px 0 6px}.lead p{margin:4px 0}
footer{margin-top:20px;color:#64748B;font-size:12px;border-top:1px solid #E2E8F0;padding-top:8px}button{font:inherit;padding:6px 12px;margin:0 0 12px;cursor:pointer}@media print{button{display:none}body{margin:0}}</style></head>
<body><button onclick="window.print()">Print</button><h1>${esc(p.title)}</h1><p class="sub">${esc(p.subtitle)} As of ${esc(p.asOf.slice(0, 16))} IST.</p>
<div class="lead">${p.sentences.map((s) => `<p>${esc(s)}</p>`).join("")}<p class="note">${p.wordsBy === "claude" ? "Sentences written by Claude Haiku 5.5 from the figures below; any sentence with a number not in them was dropped." : "Sentences from templates."} Every figure is counted by District IQ from its own records.</p></div>
<div class="nums">${p.numbers.map((x) => `<div><b>${n(x.value)}</b>${esc(x.label)}</div>`).join("")}</div>
<div class="grid"><div>${p.sections.map(sec).join("")}</div><div><h2>Map${first ? `: ${esc(first.title)}` : ""}</h2>${p.svg}</div></div>
<footer>${p.notes.map(esc).join(" ")} Facilities © OpenStreetMap contributors (ODbL). District IQ · Ask the Map.</footer></body></html>`;
}

export async function makePack(kind: PackKind, w: World, ctx: Ctx, lock: string | null, signal?: AbortSignal): Promise<Pack> {
  const base = buildPack(kind, w, ctx, lock);
  const words = await packWords(base, signal);
  const first = base.sections.find((s) => s.rows.some((r) => r.lat || r.lon));
  return { ...base, sentences: words.sentences, wordsBy: words.by, svg: packSvg(w, first?.rows ?? []) };
}
