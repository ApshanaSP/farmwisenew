/**
 * What the model wrote for a tool, made to fit the tool's own schema before it runs. A field the tool does not have is never dropped in silence:
 * on 26 Nov "when": {"last_90_days": true} was read as no window at all, and a quarter's question was answered from the day. Plain slips are put
 * right here ({"last_90_days": true}, "last_7_days", "zone" for "zones", a list where one word goes); what cannot be is refused with the fields
 * the tool has, so the model writes it again. Pure.
 */
import { NAMED, type WhenIn } from "./when";
import { ToolProblem, type BrainTool } from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const NAMED_SET = new Set<string>(NAMED);
const SAME: Record<string, string> = { daily: "today", day: "today", now: "today", weekly: "last_7_days", week: "last_7_days", past_week: "last_7_days", monthly: "last_30_days", month: "last_30_days", past_month: "last_30_days", quarterly: "last_90_days", quarter: "last_90_days", past_quarter: "last_90_days", everything: "all", all_time: "all", any: "all" };

/** a window in any of the ways it gets written */
export function whenFit(v: unknown): WhenIn | null {
  if (v == null || v === "" || v === "null") return null;
  if (typeof v === "number") return { last_days: v };
  if (typeof v === "string") {
    const t = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (NAMED_SET.has(t)) return { named: t };
    if (SAME[t]) return { named: SAME[t] };
    const m = t.match(/^(?:last|past)_(\d{1,4})_(hours?|days?|weeks?|months?)$/);
    if (m) return m[2].startsWith("hour") ? { last_hours: Number(m[1]) } : { last_days: Number(m[1]) * (m[2].startsWith("week") ? 7 : m[2].startsWith("month") ? 30 : 1) };
    if (/^\d{4}-\d{2}-\d{2}/.test(v.trim())) { const [a, b] = v.trim().split(/\s*(?:\bto\b|\/|\.\.)\s*/); return { from: a, to: b ?? a }; }
    throw new ToolProblem(`"${v}" is not a window. Give when as one of: {"named":"..."} (${NAMED.join(", ")}), {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}, {"last_hours":n}, {"last_days":n}.`);
  }
  if (!isObj(v)) throw new ToolProblem('Give when as an object: {"named":"last_7_days"}, {"from":"...","to":"..."}, {"last_hours":n} or {"last_days":n}.');
  const out: WhenIn = {}, odd: string[] = [];
  for (const [k, x] of Object.entries(v)) {
    if (x == null || x === "" || x === false) continue;
    const key = k.trim().toLowerCase();
    if (key === "named" || key === "name" || key === "period" || key === "window") { const w = whenFit(x); if (w) Object.assign(out, w); }
    else if (key === "from" || key === "start" || key === "since") out.from = String(x);
    else if (key === "to" || key === "end" || key === "until") out.to = String(x);
    else if (key === "last_hours" || key === "hours") out.last_hours = Number(x);
    else if (key === "last_days" || key === "days") out.last_days = Number(x);
    else if (key === "on" || key === "date" || key === "day") { out.from = String(x); out.to = String(x); }
    else if (NAMED_SET.has(key) || SAME[key] || /^(?:last|past)_\d+_(?:hours?|days?|weeks?|months?)$/.test(key)) Object.assign(out, whenFit(key));
    else odd.push(k);
  }
  if (odd.length) throw new ToolProblem(`when has no field ${odd.join(", ")}: give one of named, from + to, last_hours, last_days.`);
  if ((out.last_hours != null && !(out.last_hours > 0)) || (out.last_days != null && !(out.last_days > 0))) throw new ToolProblem("last_hours and last_days are numbers above 0.");
  return Object.keys(out).length ? out : null;
}

/** other words for a field */
const ALIAS: Record<string, string[]> = {
  zone: ["zones"], zones: ["zone"], area: ["place", "zones", "zone"], areas: ["zones", "place"], taluk: ["taluks"], taluks: ["taluk"], dept: ["depts"], depts: ["dept"], department: ["dept", "depts"], departments: ["depts", "dept"],
  kind: ["kinds"], kinds: ["kind"], category: ["kinds", "kind"], categories: ["kinds", "kind"], severity: ["severities"], severities: ["severity"], period: ["when"], window: ["when"], time: ["when"], date: ["when"], metric: ["metrics"], topic: ["topics"], topics: ["topic"],
  word: ["words"], query: ["words", "q", "text", "about"], q: ["words", "query", "text"], text: ["words", "q"], n: ["limit"], top: ["limit"], count: ["limit"], group: ["group_by"], by: ["group_by", "rank_by"], rank: ["rank_by"], sort_by: ["sort", "rank_by"], named: ["when"], last_days: ["when"], last_hours: ["when"], from: ["when"], to: ["when"]
};

interface Prop { type?: string | readonly string[]; enum?: readonly unknown[]; items?: { type?: string | readonly string[]; enum?: readonly unknown[] } }
const types = (p: Prop): string[] => (Array.isArray(p.type) ? [...p.type] : p.type ? [String(p.type)] : []);
/** "\"reported\"" is the word, not a quotation */
const bare = (x: unknown): unknown => (typeof x === "string" ? x.trim().replace(/^(["'`])([\s\S]*)\1$/, "$2") : x);

/** one enum word, forgiving its case, its spaces and a plural */
function word(x: unknown, allowed: readonly unknown[]): unknown {
  if (typeof x !== "string" || allowed.includes(x)) return x;
  const f = (t: string) => t.toLowerCase().replace(/[\s_-]+/g, "");
  const want = f(x);
  return allowed.find((a) => typeof a === "string" && (f(a) === want || `${f(a)}s` === want || f(a) === `${want}s`)) ?? x;
}

export function fitInput(t: BrainTool, raw: Obj): Obj {
  const schema = t.input as { properties?: Record<string, Prop>; required?: readonly string[] };
  const props = schema.properties ?? {};
  const out: Obj = {}, odd: string[] = [], whenBits: Obj = {};
  for (const [k0, v0] of Object.entries(raw)) {
    let v = bare(v0);
    if (typeof v === "string" && /^\s*[[{]/.test(v)) { try { v = JSON.parse(v); } catch { /* the words themselves */ } }
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    let k = k0;
    if (!props[k]) {
      if (props.when && ["named", "last_days", "last_hours", "from", "to"].includes(k)) { whenBits[k] = v; continue; }
      const to = (ALIAS[k.toLowerCase()] ?? []).find((x) => props[x] && raw[x] == null);
      if (!to) { odd.push(k0); continue; }
      k = to;
    }
    if (k === "when") { const w = whenFit(v); if (w) out.when = w; continue; }
    const p = props[k], ty = types(p);
    if (ty.includes("array") && !ty.includes("string")) {
      let xs = (Array.isArray(v) ? v : typeof v === "string" && /[,;]/.test(v) && !/[()]/.test(v) ? v.split(/\s*[,;]\s*/) : [v]).map(bare).filter((x) => x != null && x !== "");
      if (p.items?.enum) xs = xs.map((x) => word(x, p.items!.enum!));
      if (xs.length) out[k] = xs;
      continue;
    }
    if (Array.isArray(v) && !ty.includes("array")) v = bare(v[0]);
    if (p.enum) v = word(v, p.enum);
    if (ty.length && !ty.includes("string")) {
      if ((ty.includes("integer") || ty.includes("number")) && typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v)) v = Number(v);
      if (ty.includes("boolean") && typeof v === "string" && /^(?:true|false|yes|no)$/i.test(v)) v = /^(?:true|yes)$/i.test(v);
    }
    if (p.enum && !p.enum.includes(v)) throw new ToolProblem(`${k} "${String(v)}" is not one of: ${p.enum.join(", ")}.`);
    out[k] = v;
  }
  if (Object.keys(whenBits).length && out.when == null) { const w = whenFit(whenBits); if (w) out.when = w; }
  if (odd.length) throw new ToolProblem(`${t.name} has no field ${odd.join(", ")}. Its fields: ${Object.keys(props).join(", ")}.`);
  const missing = (schema.required ?? []).filter((k) => out[k] == null);
  if (missing.length) throw new ToolProblem(`${t.name} needs ${missing.join(", ")}.`);
  return out;
}
