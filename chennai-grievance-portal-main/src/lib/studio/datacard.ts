/**
 * Trust, made visible: a data card for every dataset (where it came from and when, its terms, what was read, removed
 * and used, what the Data Detective fixed, how much of it is on the map, its dates and freshness, its family, who read
 * it (an AI model or the rules), the checks it passed, its Live Connector) and a change log of every refresh (rows
 * added and removed, columns changed, big jumps, quarantines, approvals). All of it read from what the run recorded.
 */
import type { Connector } from "@/lib/studio/connectors";
import type { DatasetMeta, RefreshRun } from "@/lib/studio/types";
import { daysBetween, todayIST } from "@/lib/studio/values";

export interface ChangeEntry { at: string; kind: "refresh" | "failed" | "same" | "columns" | "jump" | "quarantine" | "approved" | "rejected" | "late" | "watch" | "created" | "paused"; text: string; ok: boolean }

export interface DataCard {
  source: { kind: string; name: string; url: string | null; fetchedAt: string | null; how: string; terms: string };
  rows: { read: number; removed: { why: string; n: number }[]; used: number };
  fixes: { what: string; n: number; action: string }[];
  places: { share: number | null; unmatched: { v: string; n: number }[] };
  dates: { from: string | null; to: string | null; ageDays: number | null };
  family: { name: string; confidence: number; by: string } | null;
  reading: { by: "ai" | "rules"; model: string | null; steps: { step: string; by: string; model: string | null }[] };
  checks: { label: string; ok: boolean; detail: string }[];
  connector: { status: string; every: string; at: string; lastOkAt: string | null; mode: string } | null;
  changes: ChangeEntry[];
}

const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : null; } catch { return null; } };

/** The change log: the link's refreshes and its Live Connector's runs, newest first. */
export function changeLog(meta: DatasetMeta, conn: Connector | null): ChangeEntry[] {
  const out: ChangeEntry[] = [];
  for (const h of (meta.source.connect?.history ?? []) as (RefreshRun & { added?: number; removed?: number; columns?: { added: string[]; removed: string[] } | null; jump?: string | null })[]) {
    if (!h.ok) { out.push({ at: h.at, kind: "failed", text: h.note, ok: false }); continue; }
    if (!h.changed) { out.push({ at: h.at, kind: "same", text: "Fetched again: nothing had changed.", ok: true }); continue; }
    if (h.columns && (h.columns.added.length || h.columns.removed.length))
      out.push({ at: h.at, kind: "columns", ok: true, text: `Columns changed:${h.columns.added.length ? ` added ${h.columns.added.join(", ")}` : ""}${h.columns.removed.length ? `; removed ${h.columns.removed.join(", ")}` : ""}.` });
    if (h.jump) out.push({ at: h.at, kind: "jump", ok: true, text: h.jump });
    out.push({ at: h.at, kind: "refresh", ok: true, text: h.added != null || h.removed != null ? `Refreshed: +${(h.added ?? 0).toLocaleString("en-IN")} rows, −${(h.removed ?? 0).toLocaleString("en-IN")} rows · ${h.rows?.toLocaleString("en-IN") ?? "?"} in all. ${h.note}` : h.note });
  }
  const KIND: Record<string, ChangeEntry["kind"]> = { quarantine: "quarantine", approved: "approved", rejected: "rejected", late: "late", watch: "watch", created: "created", paused: "paused", resumed: "paused", drift: "columns", error: "failed" };
  for (const h of conn?.history ?? []) if (KIND[h.kind]) out.push({ at: h.at, kind: KIND[h.kind], text: h.note, ok: h.ok });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
}

export function dataCard(meta: DatasetMeta, opts: { conn: Connector | null; lintFixes: number; panels: number; family?: DataCard["family"] }): DataCard {
  const d = meta.detective;
  const removed = d.issues.filter((i) => i.action === "removed").map((i) => ({ why: i.label, n: i.count }));
  const cx = meta.source.connect;
  const h = host(meta.source.url);
  const ai = meta.steps.find((s) => s.step === "understand");
  const placeCol = meta.spec.columns.some((c) => ["place", "ward", "zone", "taluk", "lat"].includes(c.role));
  const rel = meta.relevance;
  const age = meta.window.to ? daysBetween(meta.window.to.slice(0, 10), todayIST()) : null;
  const masked = d.issues.find((i) => i.kind === "masked");
  return {
    source: {
      kind: meta.source.kind, name: meta.source.file, url: meta.source.url, fetchedAt: cx?.fetchedAt ?? meta.createdAt,
      how: meta.source.kind === "sample" ? "A sample that ships with District IQ" : meta.source.kind === "file" ? "A file added by hand" : `${cx?.method === "browser" ? "Read in a browser" : "Downloaded"} from ${h}${cx?.via ? ` (${cx.via})` : ""}`,
      terms: meta.source.kind === "link" ? `Published by ${h}. Its own terms apply: check them before sharing these figures outside the Collectorate.` : meta.source.kind === "sample" ? "Synthetic sample data for demonstration." : "The department's own file."
    },
    rows: { read: d.rowsIn, removed, used: d.rowsOut },
    fixes: d.issues.filter((i) => i.action !== "removed" && i.action !== "info").map((i) => ({ what: i.label, n: i.count, action: i.action === "fixed" ? "Fixed" : "Flagged" })),
    places: { share: placeCol || d.placed ? Math.round((d.placed / Math.max(1, d.rowsOut)) * 100) : null, unmatched: d.unplaced.slice(0, 10) },
    dates: { from: meta.window.from, to: meta.window.to, ageDays: age },
    family: opts.family ?? null,
    reading: { by: ai?.by === "ai" ? "ai" : "rules", model: ai?.model ?? null, steps: meta.steps.map((s) => ({ step: s.step, by: s.by, model: s.model })) },
    checks: [
      { label: "Chennai's data", ok: rel?.verdict !== "unrelated" || !!rel?.forced, detail: rel ? `${rel.verdict === "district" ? "Chennai district data" : rel.verdict === "partly" ? "Partly Chennai" : "Not Chennai's (added anyway)"}: ${rel.why}` : "Not checked (added before the check existed)" },
      { label: "Cleaned before counting", ok: true, detail: `Data health ${d.before} → ${d.after}; ${removed.reduce((s, r) => s + r.n, 0).toLocaleString("en-IN")} rows left out, every change listed` },
      { label: "Every chart checked", ok: true, detail: `${opts.panels} panels through the Chart Doctor${opts.lintFixes ? `; ${opts.lintFixes} fixed (shown on each)` : "; none needed a fix"}` },
      { label: "Numbers from the rows", ok: true, detail: "Every number is computed from these rows; the AI only chooses and explains" },
      { label: "Personal details masked", ok: true, detail: masked ? `${masked.count.toLocaleString("en-IN")} values masked before any AI saw a sample` : "No personal columns found" }
    ],
    connector: opts.conn ? { status: opts.conn.status, every: opts.conn.schedule.every, at: opts.conn.schedule.at, lastOkAt: opts.conn.lastOkAt, mode: opts.conn.mode } : null,
    changes: changeLog(meta, opts.conn)
  };
}

/** What a refresh changed, row by row: rows added and removed (by content), columns added and removed, a big jump. */
export function diffTables(prev: { headers: string[]; rows: unknown[][] } | null, next: { headers: string[]; rows: unknown[][] }, measure: string | null): { added: number; removed: number; columns: { added: string[]; removed: string[] } | null; jump: string | null } {
  if (!prev) return { added: next.rows.length, removed: 0, columns: null, jump: null };
  const keyOf = (t: { headers: string[] }, r: unknown[]) => JSON.stringify(next.headers.map((h) => { const i = t.headers.indexOf(h); return i >= 0 ? r[i] ?? null : null; }));
  const before = new Map<string, number>();
  for (const r of prev.rows) { const k = keyOf(prev, r); before.set(k, (before.get(k) ?? 0) + 1); }
  let added = 0;
  for (const r of next.rows) { const k = keyOf(next, r); const n = before.get(k) ?? 0; if (n > 0) before.set(k, n - 1); else added++; }
  const removed = [...before.values()].reduce((s, n) => s + n, 0);
  const cols = { added: next.headers.filter((h) => !prev.headers.includes(h)), removed: prev.headers.filter((h) => !next.headers.includes(h)) };
  let jump: string | null = null;
  if (measure) {
    const sum = (t: { headers: string[]; rows: unknown[][] }) => { const i = t.headers.indexOf(measure); return i < 0 ? null : t.rows.reduce<number>((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : Number(String(r[i] ?? "").replace(/,/g, "")) || 0), 0); };
    const a = sum(prev), b = sum(next);
    if (a != null && b != null && a >= 20 && Math.abs(b - a) / a >= 0.5) jump = `${measure} ${b > a ? "rose" : "fell"} from ${Math.round(a).toLocaleString("en-IN")} to ${Math.round(b).toLocaleString("en-IN")} (${b > a ? "+" : "−"}${Math.round((Math.abs(b - a) / a) * 100)}%) in one refresh: worth checking.`;
  }
  return { added, removed, columns: cols.added.length || cols.removed.length ? cols : null, jump };
}
