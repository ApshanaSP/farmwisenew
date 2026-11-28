/**
 * What a search names (pure, no store): its dates (when.ts), its subject and the readings it asks for (intent.ts); and which readings an
 * officer's console uses (lib/officer/insights.ts MODULES), the officer lock of the search box (history.ts).
 */
import { readSearch, type When } from "@/lib/search/when";
import { readIntent, type Intent, type ValueKind } from "@/lib/search/intent";

export interface SearchQuery {
  /** the search as typed (spaces tidied) */
  raw: string;
  when: When | null;
  /** a time was named that the search could not place: every day is searched, and the box says so */
  unread: boolean;
  /** the search without its time words */
  topic: string;
  intent: Intent;
}

/** an id or a complaint number ("INC-2026-0412", "2611-4F9K2Q") is searched as written, never read as a date */
const ID_LIKE = /^(?=[^ ]*[a-z])(?=[^ ]*\d)[a-z0-9]+(?:[-_/][a-z0-9]+)+$/i;

/** What a search names: its dates, its subject, and the kinds of readings it asks for. `now` is the store's IST wall clock. */
export function readQuery(text: string, now: string): SearchQuery {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (ID_LIKE.test(raw)) return { raw, when: null, unread: false, topic: raw, intent: { kinds: [], order: null, newsOnly: false, text: raw, words: [] } };
  const sw = readSearch(raw, now);
  return { raw, when: sw.when, unread: sw.unread, topic: sw.topic, intent: readIntent(sw.topic) };
}

/** The readings each module of the officer's console (lib/officer/insights.ts MODULES) stands for. */
export const MODULE_KINDS: Record<string, ValueKind[]> = { weather: ["rain", "gauge"], air: ["aqi"], lakes: ["lake"], markets: ["price"] };
/** The readings a department's console uses: those, and no other, are in its search. */
export function kindsForModules(modules: readonly string[]): ValueKind[] {
  return [...new Set(modules.flatMap((m) => MODULE_KINDS[m] ?? []))];
}
export const KIND_WORD: Record<ValueKind, string> = { aqi: "Air-quality", price: "Market price", lake: "Reservoir", rain: "Rain", gauge: "River gauge" };
