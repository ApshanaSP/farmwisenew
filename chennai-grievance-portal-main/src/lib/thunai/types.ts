/**
 * Thunai (துணை), the Collector console's voice pilot: the shapes shared by its understanding engine (plain TypeScript,
 * no React, unit-tested) and its hands in the console (components/collector/app/thunai).
 *
 * A sentence becomes a plan of steps; every step is one of the allowed actions below and nothing else, so neither the
 * rules nor the AI can invent an action. Every step carries a risk level (risk.ts): A runs at once with an undo, B needs
 * one tap, C needs "confirm" plus the count.
 */

export type PageKey = "overview" | "briefing" | "trends" | "environment" | "studio";
export type PeriodKey = "daily" | "weekly" | "monthly" | "quarterly";
export type Sev = "Severe" | "High" | "Medium" | "Low";
export type Lang = "en" | "ta";
export type OutMode = "voice" | "visual" | "quiet";

/** Panels Thunai can open; each maps to one console action. */
export const PANELS = ["news", "stories", "conflicts", "gaps", "nextdoor", "markets", "zones", "depts", "sources", "review",
  "workspace", "export", "customize", "palette", "assistant", "map", "trail", "memory"] as const;
export type Panel = (typeof PANELS)[number];

/** The filters one sentence may set together: one transaction, one render, one undo. undefined = unchanged. */
export interface View { zone?: number | null; dept?: string | null; cat?: string | null; taluk?: string | null; sev?: Sev | null }

export type Step =
  | { a: "page"; page: PageKey }
  | { a: "period"; period: PeriodKey }
  | { a: "view"; view: View }
  | { a: "mapMode"; mode: "zones" | "taluks" }
  | { a: "layer"; layer: string; on: boolean | null }
  | { a: "panel"; panel: Panel }
  | { a: "close"; all: boolean }
  /** an item of the visible list: 1-based rank, or worst (= 1), next / previous of the focused one */
  | { a: "item"; which: number | "next" | "prev" }
  | { a: "draft" }
  /** fly the map closer: to the open incident, else to the last place named */
  | { a: "zoom"; target: string | null }
  | { a: "ask"; q: string }
  | { a: "map"; q: string }
  | { a: "theme"; theme: "dark" | "light" }
  | { a: "lang"; lang: Lang }
  | { a: "mode"; mode: OutMode }
  | { a: "speed"; faster: boolean }
  | { a: "handsfree"; on: boolean }
  | { a: "workspace"; op: "save" | "open"; name: string | null }
  | { a: "undo"; n: number }
  | { a: "stop" }
  | { a: "off" }
  | { a: "repeat" }
  | { a: "whatDid" }
  | { a: "whereAmI" }
  | { a: "explain" }
  | { a: "numbers"; show: boolean; names: boolean }
  | { a: "click"; n: number | null; name: string | null }
  | { a: "scroll"; dir: "up" | "down" | "top" | "bottom" }
  | { a: "type"; text: string }
  | { a: "clearText" }
  | { a: "remember"; text: string }
  | { a: "recall" }
  | { a: "forget"; all: boolean }
  | { a: "remind"; text: string; at: string }
  | { a: "send" }
  | { a: "confirm"; n: number | null }
  | { a: "mission"; name: "brief" | "rain" }
  | { a: "read"; what: "reservoir" | "rain" | "air" | "worstZone"; name: string | null }
  | { a: "help" };

export type ActionName = Step["a"];

/** What Thunai "sees": published by the console after every change. Never pixels. */
export interface ScreenState {
  page: PageKey;
  period: PeriodKey;
  zone: number | null;
  dept: string | null;
  cat: string | null;
  taluk: string | null;
  sev: Sev | null;
  mapMode: "zones" | "taluks";
  /** the open overlay (a panel kind, "incident", "assistant") or null */
  panel: string | null;
  /** the incident open or highlighted, for "this", "draft action for this" */
  incident: string | null;
  /** ids of the visible list in its visible order (the priority list on the Overview), for "the third one" */
  list: string[];
  /** the last filter the Collector or Thunai touched, and when (ms), for "change filter to 7" */
  lastFilter: { slot: keyof View | "period"; at: number } | null;
  /** the last place named or flown to, for "there" */
  lastPlace: string | null;
  /** numbered badges are showing ("show numbers"), so a bare number means "click it" */
  numbers?: boolean;
  now: number;
}

export interface World {
  zones: { n: number; name: string; ta?: string | null }[];
  depts: { code: string; name: string }[];
  cats: { code: string; label: string }[];
  taluks: { code: string; name: string; ta?: string | null }[];
  places: { name: string; aliases: string[]; zone: number | null }[];
  reservoirs: { id: string; name: string }[];
  /** zones from worst to best by the console's own zone table (severe, then open), for "the worst zone" */
  zoneRank?: number[];
  /** the Collector's learned aliases: heard words to a canonical phrase ("marina side" -> "zone 9") */
  aliases?: Record<string, string>;
}

export interface Bilingual { en: string; ta: string }

export type Understood =
  | { kind: "do"; steps: Step[]; confidence: number; lang: Lang; heard: string; by: "rules" | "ai"; note?: Bilingual }
  | { kind: "ask"; question: Bilingual; choices: { label: Bilingual; steps: Step[] }[]; lang: Lang; heard: string }
  | { kind: "refuse"; why: Bilingual; lang: Lang; heard: string }
  | { kind: "unknown"; lang: Lang; heard: string; suggestions: string[] };
