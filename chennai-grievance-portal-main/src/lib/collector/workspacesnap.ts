/**
 * A saved workspace's Briefing (28 Nov 2026). The owner: "when I open the saved workspace, the second (Briefing) page key points change
 * into a different format". A version kept only the briefing's markdown, which reopened as the old written briefing (Insights.tsx
 * BriefingPage). A version now keeps what the live Briefing page drew (BriefingBook.tsx freezeBook): the key points as they were composed,
 * the AI headline as it was checked, the last 7 days, each department's line, the stories still developing and what was only in the news.
 * It reopens in the live page's own layout, drawn from this copy only, so newer data never reaches it.
 *
 * The copy goes in the archived briefing's fact pack (facts.view): no table changes. Versions saved before 28 Nov have only their
 * markdown; readSavedBrief gives them as "text", drawn in the same page layout with a note that they were saved in the written format.
 * Pure (no browser, no database): only types come from the live modules.
 */
import type { Glance } from "./glance";
import type { BriefingBook as Book } from "./briefbook";
import type { StoryConflicts } from "./conflicts";
import type { Overview } from "./intel";
import type { Stories } from "./storyai";
import type { Period } from "@/lib/period/day";

export const BRIEF_VIEW_V = 2;
/** the copy is kept well under one DynamoDB row (400 KB, with the markdown beside it): bytes of its JSON */
export const VIEW_MAX_BYTES = 120_000;

/** a line of "Only in the news" */
export interface FrozenGap { id: string; title: string | null; type: string | null; sev: string | null; zone_name: string | null; dept_name: string | null; t: string | null }
/** a story still developing, as its card shows it */
export interface FrozenThread {
  id: string; title: string; outlets: string[]; last: string;
  ai: { now: string; status: "ongoing" | "waiting" | "settled" } | null;
  events: { t: string; label: string; what: string }[];
}
/** a department's line */
export interface FrozenDept { code: string; name: string; n: number; open: number; dead: number; severe: number; overdue: number }
export type FrozenNews = NonNullable<Overview["allNews"]>[number];

/** What the live Briefing page drew, for the filters in force when the version was saved. */
export interface FrozenBook {
  v: typeof BRIEF_VIEW_V;
  /** when the data was read (the briefing's own time) */
  now: string;
  period: Period;
  /** the period and the filters in words, as the page said them ("Today", "Adyar · Police") */
  periodLabel: string;
  scopeName: string;
  /** no filter but the period */
  whole: boolean;
  status: { level: "normal" | "watchful" | "alert"; reasons: string[] };
  /** the district's warning, named as the district's under a filter */
  warned: string | null;
  /** the key points, the figures and the opening sentence, exactly as composed (glance.ts) */
  glance: Glance;
  /** the AI's one-line headline as it was checked against the figures, or null when the code's sentence was shown */
  ai: { en: string; ta: string | null } | null;
  days: { day: string; reported: number; resolved: number }[];
  oldest: { id: string; title: string; t: string } | null;
  departments: FrozenDept[];
  /** null: the stories had not loaded when it was saved */
  stories: { threads: FrozenThread[] } | null;
  gaps: FrozenGap[];
  /** what the glance's news point and its "outlets differ" point open */
  news: FrozenNews | null;
  differ: StoryConflicts | null;
}

export type SavedBrief =
  | { kind: "view"; view: FrozenBook; asOf: string | null; issuedAt: string | null }
  | { kind: "text"; md: string; headline: string | null; asOf: string | null; issuedAt: string | null };

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const bytes = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;

// ------------------------------------------------------------------------------------------------------------ making the copy --

/** A story's card fields only (a story carries its every report; the card shows its events). */
export function trimThread(s: Stories["threads"][number] | FrozenThread): FrozenThread {
  return {
    id: String(s.id), title: String(s.title), outlets: arr<string>(s.outlets).map(String), last: String(s.last),
    ai: s.ai ? { now: String(s.ai.now ?? ""), status: s.ai.status } : null,
    events: arr<{ t: string; label: string; what: string }>(s.events).map((m) => ({ t: String(m.t), label: String(m.label ?? ""), what: String(m.what ?? "") }))
  };
}
export function trimGap(g: Obj): FrozenGap {
  const s = (k: string) => (g[k] == null ? null : String(g[k]));
  return { id: String(g.id), title: s("title"), type: s("type"), sev: s("sev"), zone_name: s("zone_name"), dept_name: s("dept_name"), t: s("t") };
}
export function trimDept(d: Book["departments"][number] | FrozenDept): FrozenDept {
  return { code: String(d.code), name: String(d.name ?? d.code), n: num(d.n), open: num(d.open), dead: num(d.dead), severe: num(d.severe), overdue: num(d.overdue) };
}

/**
 * The copy within VIEW_MAX_BYTES: a very long list loses its last lines first (only-in-the-news beyond 30, stories beyond 12 with their
 * events' words shortened), then the stories and the lines altogether. The key points, the figures and the departments always stay.
 */
export function capView(v: FrozenBook, max = VIEW_MAX_BYTES): FrozenBook {
  if (bytes(v) <= max) return v;
  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  let out: FrozenBook = {
    ...v, gaps: v.gaps.slice(0, 30),
    stories: v.stories ? { threads: v.stories.threads.slice(0, 12).map((s) => ({ ...s, outlets: s.outlets.slice(0, 6), events: s.events.map((e) => ({ ...e, what: cut(e.what, 220) })) })) } : null
  };
  if (bytes(out) <= max) return out;
  out = { ...out, stories: null, gaps: out.gaps.slice(0, 10), news: out.news ? { ...out.news, docIds: (out.news.docIds ?? []).slice(0, 20) } as FrozenNews : null };
  if (bytes(out) <= max) return out;
  return { ...out, gaps: [], news: null, differ: null };
}

// ------------------------------------------------------------------------------------------------------- reading it back --

const isGlance = (g: unknown): g is Glance => {
  const x = g as Obj | null;
  return !!x && typeof x === "object" && Array.isArray(x.figures) && Array.isArray(x.happening) && Array.isArray(x.needs) && Array.isArray(x.next)
    && !!x.situation && typeof x.situation === "object";
};

/** A saved copy as the page reads it: whatever is missing from an older or partial copy is an empty list, never a broken page. */
export function normalizeView(x: Obj): FrozenBook | null {
  if (num(x.v) !== BRIEF_VIEW_V || !isGlance(x.glance) || !str(x.now)) return null;
  const st = (x.status ?? {}) as Obj;
  const level = st.level === "alert" || st.level === "watchful" ? st.level : "normal";
  const ai = x.ai && typeof x.ai === "object" && str((x.ai as Obj).en) ? { en: String((x.ai as Obj).en), ta: str((x.ai as Obj).ta) } : null;
  const o = x.oldest as Obj | null;
  const stories = x.stories && typeof x.stories === "object" ? { threads: arr<FrozenThread>((x.stories as Obj).threads).map(trimThread) } : null;
  return {
    v: BRIEF_VIEW_V, now: String(x.now), period: (str(x.period) ?? "daily") as Period, periodLabel: str(x.periodLabel) ?? "", scopeName: str(x.scopeName) ?? "District-wide",
    whole: x.whole !== false, status: { level, reasons: arr<unknown>(st.reasons).map(String) }, warned: str(x.warned),
    glance: x.glance as Glance, ai,
    days: arr<Obj>(x.days).map((d) => ({ day: String(d.day), reported: num(d.reported), resolved: num(d.resolved) })),
    oldest: o && str(o.id) ? { id: String(o.id), title: String(o.title ?? ""), t: String(o.t ?? "") } : null,
    departments: arr<FrozenDept>(x.departments).map(trimDept), stories, gaps: arr<Obj>(x.gaps).map(trimGap),
    news: x.news && typeof x.news === "object" && str((x.news as Obj).id) ? x.news as FrozenNews : null,
    differ: x.differ && typeof x.differ === "object" && Array.isArray((x.differ as Obj).items) ? x.differ as StoryConflicts : null
  };
}

/**
 * The briefing of a saved version (GET /api/collector/workspaces/[id] `briefing`), whatever it was saved as. Saved since 28 Nov: the page's
 * own copy (`view`). Saved before (the migration): only the markdown, given as `text`. Nothing saved, or nothing readable: null.
 */
export function readSavedBrief(b: unknown): SavedBrief | null {
  if (!b || typeof b !== "object") return null;
  const r = b as Obj;
  let facts: unknown = r.facts ?? r.fact_pack;
  if (typeof facts === "string") { try { facts = JSON.parse(facts); } catch { facts = null; } }
  const f = (facts && typeof facts === "object" ? facts : {}) as Obj;
  const asOf = str(r.as_of), issuedAt = str(r.issued_at);
  const view = f.view && typeof f.view === "object" ? normalizeView(f.view as Obj) : null;
  if (view) return { kind: "view", view, asOf: asOf ?? view.now, issuedAt };
  const md = typeof r.markdown === "string" ? r.markdown : "";
  if (!md.trim()) return null;
  return { kind: "text", md, headline: str(f.headline), asOf, issuedAt };
}
