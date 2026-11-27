/**
 * What the news desk (newsdesk.ts) decided, kept on disk and looked up by headline. No model and no database here, so the build
 * hooks (derive.ts), the news list (intel.ts) and the stories (threads.ts) can all read it.
 */
import fs from "fs";
import path from "path";
import type { ReportKind } from "./reporttype";

// ---------------------------------------------------------------- verdicts --

export const AREAS = ["Disaster & weather", "Law & order", "Accidents & fire", "Health", "Water & drainage", "Roads & transport", "Power", "Environment",
  "Works & projects", "Land & encroachment", "Welfare & labour", "Education", "Elections & governance", "Courts", "Crowds & events"] as const;
export type Area = (typeof AREAS)[number];
export const SKIPS = ["entertainment", "sport", "business", "party politics", "petty crime", "elsewhere", "feature", "listing", "religion", "personal", "promotion", "other"] as const;
export type SkipReason = (typeof SKIPS)[number];
/** the reasons in words, for the Left out list */
export const SKIP_LABEL: Record<SkipReason, string> = {
  entertainment: "Films, games or celebrities", sport: "Sport", business: "Business or real estate", "party politics": "Party politics", "petty crime": "Petty crime",
  elsewhere: "Another district or state", feature: "Feature or opinion", listing: "Daily listing or price", religion: "Religious programme", personal: "A private matter",
  promotion: "Promotion or event listing", other: "Not district work"
};

export interface Verdict {
  v: "act" | "know" | "skip";
  area: Area | "";
  skip: SkipReason | "";
  /** a plain English headline */
  head: string;
  /** what happened, one or two sentences; empty when the report is only a headline */
  gist: string;
  /** why it matters to the administration */
  why: string;
  /** the department's category (ref_categories), or "" */
  cat: string;
  /** something really happened in the district that a department records (not a game, a film, a match or an article about one) */
  real: boolean;
  /**
   * What the report is (27 Nov 2026): an incident (something happened to people or property), or news that is not one: a forecast
   * (alert), government work or an order, the end of an earlier event, a roundup, an opinion, other. It decides whether a news-only
   * incident stays in the build (derive.ts), in place of the word rules (reporttype.ts). Absent on a verdict from before it was asked.
   */
  kind?: ReportKind;
  /** the deskKey of the report the headline was written from: it is that report's translation, and the story's headline, never another report's */
  of?: string;
  at: number;
  by: string;
}

/** Bump when the instructions change in a way that should judge the recent news again. 2 (27 Nov 2026): every verdict carries the report's kind. */
const DESK_V = 2;
// unit tests start empty and write nothing; a live probe names its own file
const FILE = process.env.NEWS_DESK_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "newsdesk.json"));
const KEEP = 9000;

interface Book { cache: Map<string, Verdict> | null; saving: NodeJS.Timeout | null; /** windows (days) a page asked for that reach further back than the daily sweep */ want: number }
declare global {
  // eslint-disable-next-line no-var
  var __deskBook: Book | undefined;
}
const g: Book = (global.__deskBook ??= { cache: null, saving: null, want: 0 });

/** deskKey of the headlines seen lately: each build step and each sweep asks again for the same twenty thousand (27 Nov 2026: 0.6 s a time) */
const keyMemo = new Map<string, string>();
/** One headline however it is spaced or cased: what a verdict is kept under. */
export const deskKey = (title: unknown): string => {
  const s = String(title ?? "");
  let k = keyMemo.get(s);
  if (k === undefined) {
    k = s.toLowerCase().replace(/[\s\u200b]+/g, " ").trim().replace(/^(.{25,}?)\s+[|–-]\s+([^|–-]{2,32})$/u, (m, a, b) => (/\d/.test(b) ? m : a)).replace(/["'‘’“”.,!?…]+/g, "").trim().slice(0, 180);
    if (keyMemo.size >= 60_000) keyMemo.clear();
    keyMemo.set(s, k);
  }
  return k;
};

/** Every verdict kept, by deskKey. */
export function deskBook(): Map<string, Verdict> {
  if (g.cache) return g.cache;
  try {
    const j = FILE ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
    g.cache = new Map(j.v === DESK_V ? Object.entries(j.items as Record<string, Verdict>) : []);
  } catch { g.cache = new Map(); }
  return g.cache;
}
/** Written to disk shortly (several verdicts, one write). */
export function saveDesk(): void {
  if (g.saving || !FILE) return;
  g.saving = setTimeout(() => {
    g.saving = null;
    const c = deskBook();
    while (c.size > KEEP) c.delete(c.keys().next().value!);
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ v: DESK_V, items: Object.fromEntries(c) })); } catch { /* read-only disk: memory only */ }
  }, 400);
  g.saving.unref?.();
}
/** tests and live probes */
export function setVerdict(title: string, v: Partial<Verdict> & Pick<Verdict, "v">): void {
  deskBook().set(deskKey(title), { area: "", skip: "", head: "", gist: "", why: "", cat: "", real: v.v !== "skip", at: Date.now(), by: "test", ...v });
}
export function clearDesk(): void { g.cache = new Map(); }

/** The verdict on a report, by any of its headlines (as published, then its translation). Null: not judged yet. */
export function deskOf(...titles: unknown[]): Verdict | null {
  const c = deskBook();
  for (const t of titles) {
    const k = t == null ? "" : deskKey(t);
    const v = k ? c.get(k) : undefined;
    if (v) return v;
  }
  return null;
}
const RANK = { act: 2, know: 1, skip: 0 } as const;
/** The verdict on a story: the strongest of its reports', the newest first among equals. Null when none is judged. */
export function deskOfDocs(docs: { title?: unknown; title_en?: unknown }[]): Verdict | null {
  let best: Verdict | null = null;
  for (const d of docs) {
    const v = deskOf(d.title, d.title_en);
    if (v && (!best || RANK[v.v] > RANK[best.v])) best = v;
  }
  return best;
}
/** The desk's own English headline for this very report (a Tamil one translated from its Tamil words); "" when it was written from another report of the story. */
export function headOf(title: unknown): string {
  const v = deskOf(title);
  return v?.head && v.of === deskKey(title) ? v.head : "";
}

/** Judged as not the district administration's business. */
export const deskSkips = (...titles: unknown[]): boolean => deskOf(...titles)?.v === "skip";

/** A page shows a window this long: its news is judged too, in the background. */
export function wantDays(days: number): void {
  if (days > g.want) g.want = Math.min(95, Math.round(days));
}
export const wantedDays = (): number => g.want;

/** Headlines that are a daily listing whatever the outlet: never asked about, never shown. */
const LISTING = /\b(gold|silver)\s+(price|rate)|\b(petrol|diesel|fuel)\b.{0,12}\b(price|rate)|rasi ?palan|horoscope|panchang|today'?s (price|rate)|தங்கம் விலை|ஆபரணத் ?தங்க|பெட்ரோல்,? ?டீசல்|ராசிபலன்|இன்றைய ராசி/i;
export const isListing = (...t: unknown[]) => t.some((x) => x != null && LISTING.test(String(x)));
