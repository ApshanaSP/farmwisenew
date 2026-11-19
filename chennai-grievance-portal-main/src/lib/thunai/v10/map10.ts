/**
 * v10: Ask the Map, all of it, by voice (docs/jarvis/JARVIS_V10.md 4.6; the anatomy: docs/jarvis/v10-research/50-askmap-anatomy.md; the grammar:
 * 40-voice-ui-map-reading.md 5.2). A sentence becomes one map operation, or null (not the map's). Pure: no React, no network; the console runs the
 * operation (components/collector/app/thunai/mapops.ts), the runner scores it (eval10.live.ts).
 *
 * STUB until the map work lands: returns null for every sentence.
 */
import type { Lang } from "../types";

export type MapOp = "ask" | "followup" | "chip" | "circle" | "layer" | "shot" | "export" | "save" | "visit" | "insight" | "send" | "suggest" | "rain" | "tour";
export interface MapCmd {
  op: MapOp;
  /** the question for ask / followup / a suggested question asked */
  question?: string | null;
  /** a place (circle, visit, a tour's "go deeper here") */
  place?: string | null;
  /** a circle's radius in km */
  km?: number | null;
  format?: "csv" | "geojson" | null;
  layer?: string | null;
  on?: boolean | null;
  shot?: "next" | "replay" | "previous" | null;
  /** a chip's own label or index */
  chip?: string | number | null;
  /** send to a department: its name as said (drafts only; the Collector's own tap sends) */
  dept?: string | null;
  /** Rain & flooding: a tab or a past rain */
  tab?: "flooding" | "traffic" | "power" | "metro" | null;
  rain?: string | null;
  /** a tour's step: start, next, back, stop, deeper, repeat */
  tour?: "start" | "next" | "back" | "stop" | "deeper" | "repeat" | null;
}

/** what the browser knows of Ask the Map when a sentence comes (the console's snapshot, published into Jarvis's state) */
export interface MapCtx10 {
  /** Ask the Map grown and showing */
  open: boolean;
  /** an answer with a plan on the map */
  hasAnswer: boolean;
  question?: string | null;
  /** the answer's camera shots, and which one shows */
  shots?: number;
  shot?: number;
  /** the answer's chips' labels */
  chips?: string[];
  /** the suggested questions showing */
  suggest?: string[];
  /** Rain & flooding open */
  rainOpen?: boolean;
  /** a narrated tour running */
  tour?: boolean;
  lang: Lang;
}

/** The map operation a sentence asks for, or null. */
export function mapCommand10(text: string, c: MapCtx10): MapCmd | null {
  void text; void c;
  return null;
}
