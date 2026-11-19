/**
 * v10: the whole dashboard by voice (docs/jarvis/JARVIS_V10.md 4.7; the inventory: docs/jarvis/v10-research/60-controls-inventory.json; the
 * registry design: 40-voice-ui-map-reading.md 5.1). A sentence names one console control, in English, Tamil or Tanglish: the control's id, and
 * how it is done (console steps, or pressing the control itself), or a question back when two controls match. Pure: no React, no network.
 *
 * STUB until the controls work lands: returns null for every sentence.
 */
import type { Lang, ScreenState, Step } from "../types";

export interface ControlHit {
  /** the control's id in the registry (the inventory's ids) */
  id: string;
  /** console steps that do it (types.ts Step), when one exists */
  steps?: Step[];
  /** else the control pressed by its registry selector (dom.ts), never a send, approve or delete */
  press?: string | null;
  /** two or more controls match: the question back and its choices (by region) */
  which?: { en: string; ta: string; ids: string[] } | null;
  level: "A" | "B" | "C" | "never";
}

export interface ControlCtx10 { state: ScreenState; lang: Lang; /** the controls visible now, by registry id (the console's walk), if known */ visible?: string[] | null }

/** The control a sentence names, or null (not a control's: the other lanes take it). */
export function controlCommand10(text: string, c: ControlCtx10): ControlHit | null {
  void text; void c;
  return null;
}
