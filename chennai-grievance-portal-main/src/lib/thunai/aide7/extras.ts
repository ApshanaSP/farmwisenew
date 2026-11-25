/**
 * v7: what a recipe knows for the aide beyond its screen (a case's assignment, deadline and news report; a news item's article), kept on the
 * server for the screen it built, by the screen's id, recipe and title (the last 64). Browser-safe (screens.ts imports it and sits in the
 * console's bundle; in the browser nothing is ever kept here, as the aide runs only on the server). Never sent to the browser.
 */
import type { BriefFacts } from "../brief6";
import type { StageDocT } from "../stage";

export interface AideExtras {
  /** a case: the briefing's own facts (brief6.ts), from the record's assignment, deadline and reports */
  brief?: BriefFacts & { label?: string };
  /** a news item read for the Collector: the outlet's text (the stored article, or the page read), its outlet and time */
  article?: { outlet: string | null; outletTa?: string | null; title: string; publishedAt: string | null; text: string; incident?: string | null; url?: string | null };
  /** other outlets on the same event (v6 related coverage), each a headline and when */
  related?: { outlet: string; title: string; publishedAt: string | null }[];
  /** facts code computed beyond the blocks (a ranked comparison's statements, say) */
  /** v19: the analyst's results as its writer reads them (v19/doc.ts factsOf) */
  ask?: string;
  /** v19: what the answer's sentences are held to (doc.ts checkOf) */
  askCheck?: import("../v19/doc").AskCheck;
  lines?: { text: string; dir?: "up" | "down" | null; rank?: boolean; ratios?: number[]; cause?: boolean; src?: string }[];
}

const KEEP = 64;
const kept = new Map<string, AideExtras>();
const keyOf = (doc: Pick<StageDocT, "id" | "recipe" | "title">) => `${doc.id}|${doc.recipe}|${doc.title}`;
/** A recipe hands its extras for the screen it built (screens.ts buildScreen). */
export function keepExtras(doc: Pick<StageDocT, "id" | "recipe" | "title">, x: AideExtras): void {
  kept.set(keyOf(doc), x);
  while (kept.size > KEEP) kept.delete(kept.keys().next().value as string);
}
export function extrasOf(doc: Pick<StageDocT, "id" | "recipe" | "title">): AideExtras | null { return kept.get(keyOf(doc)) ?? null; }
export function addExtras(doc: Pick<StageDocT, "id" | "recipe" | "title">, x: AideExtras): void { keepExtras(doc, { ...(extrasOf(doc) ?? {}), ...x }); }
