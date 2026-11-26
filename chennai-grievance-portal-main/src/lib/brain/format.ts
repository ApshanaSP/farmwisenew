/**
 * Results as the model reads them: short tables with their ids, the window, the rule and the sources. Pure.
 */
import type { Cell, Col, Evidence, Part, Rec, ToolOut } from "./types";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-25 18:05:00" -> "25 Nov 2026, 6:05 PM"; a day alone stays a day; anything else as it is */
export function istWords(t: unknown, withYear = true): string {
  const s = String(t ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return s;
  const day = `${Number(m[3])} ${MON[Number(m[2]) - 1]}${withYear ? ` ${m[1]}` : ""}`;
  if (m[4] == null) return day;
  const h = Number(m[4]);
  return `${day}, ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
}

/** how long ago, in words ("3 hours 5 min ago", "2 days ago") */
export function agoWords(t: unknown, now: string): string | null {
  const a = Date.parse(`${String(t ?? "").slice(0, 19).replace(" ", "T")}Z`), b = Date.parse(`${now.slice(0, 19).replace(" ", "T")}Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const min = Math.round((b - a) / 60_000);
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ${min % 60} min ago`;
  return `${Math.floor(min / 1440)} days ago`;
}

const cell = (v: Cell | undefined, max = 160): string => {
  if (v == null || v === "") return "-";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = v.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** what a list of cases adds up to, worked out here: a model that counts rows itself counts wrong now and then */
export function tally(p: Part): string {
  if (p.of !== "cases" || p.rows.length < 2) return "";
  const split = (k: string): string | null => {
    const m = new Map<string, number>();
    for (const r of p.rows) { const v = r[k]; if (v == null || v === "") continue; m.set(String(v), (m.get(String(v)) ?? 0) + 1); }
    if (!m.size || (m.size > 8 && m.size >= p.rows.length * 0.8)) return null;
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${v} ${n}`).join(", ");
  };
  const out: string[] = [];
  for (const [k, l] of [["severity", "by severity"], ["status", "by status"], ["kind", "by kind"], ["dept", "by department"], ["department", "by department"], ["zone", "by zone"]] as const) { const t = split(k); if (t) out.push(`${l}: ${t}`); }
  const yes = p.rows.filter((r) => r.overdue === "yes" || r.past_deadline === "yes" || r.overdue === 1 || r.overdue === true).length;
  if (p.cols.some((c) => c.key === "overdue" || c.key === "past_deadline")) out.push(`past deadline ${yes}`);
  return out.length ? `\nOf these ${p.rows.length}${p.total != null && p.total > p.rows.length ? ` (not of all ${p.total})` : ""}: ${out.join("; ")}` : "";
}
/**
 * A split by time and one other thing (month x kind) put to the model as one row per thing and one column per month: as a long list its first
 * 40 rows held two months, and the model said the trend was not complete (26 Nov). Null when the part is no such split.
 */
export function pivotText(p: Part): string | null {
  if (p.of !== "series" || p.rows.length <= 12) return null;
  const T = ["month", "week", "day", "hour", "weekday"].find((k) => p.cols.some((c) => c.key === k));
  const M = ["reported", "count", "value", "open", "total"].find((k) => p.cols.some((c) => c.key === k));
  const D = p.cols.find((c) => c.key !== T && c.key !== M && !/^(rank|n|before|change|change_pct|.*_key)$/.test(c.key) && p.rows.some((r) => typeof r[c.key] === "string"))?.key;
  if (!T || !M || !D) return null;
  const times = [...new Set(p.rows.map((r) => String(r[T])))];
  const things = [...new Set(p.rows.map((r) => String(r[D])))];
  if (times.length > 16 || things.length > 40) return null;
  const at = new Map(p.rows.map((r) => [`${r[D]}|${r[T]}`, r[M]]));
  // (a split cut short leaves a cell unknown, never 0)
  const whole = p.total == null || p.total <= p.rows.length;
  const cellOf = (x: string, t: string) => at.get(`${x}|${t}`) ?? (whole ? 0 : "?");
  const sum = (x: string) => times.reduce((s, t) => s + (Number(at.get(`${x}|${t}`)) || 0), 0);
  things.sort((a, b) => sum(b) - sum(a));
  return [`[${p.key}] ${p.title} (every ${D} by ${T}: ${M}; ${whole ? `all ${p.rows.length} rows, nothing left out` : `${p.rows.length} of ${p.total} rows; ? = not in these rows`})${p.note ? `; ${p.note}` : ""}`, `${D} | ${times.join(" | ")} | all`,
    ...things.map((x) => `${x} | ${times.map((t) => cellOf(x, t)).join(" | ")} | ${sum(x)}`)].join("\n");
}
export function partText(p: Part, rows = 40): string {
  const pv = pivotText(p);
  if (pv) return pv;
  const cols = p.cols.filter((c) => p.rows.some((r) => r[c.key] != null && r[c.key] !== ""));
  if (!p.rows.length) return `[${p.key}] ${p.title}: no rows${p.note ? ` (${p.note})` : ""}`;
  const shown = p.rows.slice(0, rows);
  const head = `[${p.key}] ${p.title}${p.total != null && p.total > shown.length ? ` (${shown.length} of ${p.total} rows shown)` : ` (${p.rows.length} row${p.rows.length === 1 ? "" : "s"})`}${p.note ? `; ${p.note}` : ""}`;
  const line = cols.map((c) => `${c.key}${c.unit ? ` (${c.unit})` : ""}`).join(" | ");
  return [head, line, ...shown.map((r) => cols.map((c) => cell(r[c.key], p.cols.length <= 3 ? 400 : 160)).join(" | "))].join("\n") + tally(p);
}

export function outText(id: string, o: ToolOut, rows = 40): string {
  return [
    `${id}: ${o.about}${o.when ? ` | time counted: ${o.when}` : ""}${o.asOf ? ` | data as of ${istWords(o.asOf)} IST` : ""}`,
    ...(o.facts ?? []).map((f) => `- ${f}`),
    ...o.parts.map((p) => partText(p, rows)),
    ...(o.text ? [`<text>\n${o.text.slice(0, 9000)}\n</text>`] : []),
    ...(o.method ? [`How it is counted: ${o.method}`] : []),
    ...(o.limits?.length ? [`Limits: ${o.limits.join(" ")}`] : []),
    `Source: ${o.sources.join("; ") || "the console"}`
  ].join("\n");
}

/** an earlier turn's results, short, so a follow-up ("the second one", "why") is answered without asking for them again */
export function digestOf(ev: Evidence[], max = 2600): string {
  const out: string[] = [];
  let left = max;
  for (const e of ev) {
    const t = `${e.id} ${e.tool}(${JSON.stringify(e.input).slice(0, 220)}): ${outText(e.id, e.out, 8).split("\n").slice(0, 26).join("\n")}`;
    const s = t.length > left ? t.slice(0, Math.max(0, left)) : t;
    if (!s) break;
    out.push(s);
    left -= s.length;
    if (left <= 80) break;
  }
  return out.join("\n");
}

/** rows of any objects as a Part: the columns named, values flattened to cells */
export function toPart(key: string, title: string, rows: Record<string, unknown>[], cols: (Col | string)[], o: Partial<Part> = {}): Part {
  const cs: Col[] = cols.map((c) => (typeof c === "string" ? { key: c, label: c.replace(/_/g, " ") } : c));
  return { key, title, cols: cs, rows: rows.map((r) => Object.fromEntries(cs.map((c) => [c.key, flat(r[c.key])])) as Rec), ...o };
}
export function flat(v: unknown): Cell {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean") return Number.isNaN(v as number) ? null : v;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? String((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).title ?? (x as Record<string, unknown>).text ?? "") : String(x))).filter(Boolean).join("; ");
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).filter(([, x]) => x != null && typeof x !== "object").map(([k, x]) => `${k}: ${x}`).join(", ");
  return String(v);
}
