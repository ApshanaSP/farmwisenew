/**
 * v10: Ask the Map's operations, run by Jarvis in the page (docs/jarvis/v10-research/50-askmap-anatomy.md 4: Jarvis already holds the Console's
 * `mapAsk`, the useMapAsk instance, and the client-safe helpers beside it). One map operation (lib/thunai/v10/map10.ts MapCmd) in, what to say
 * out (code's own words, the answer's own numbers), or null when there is nothing to say.
 *
 * STUB until the map work lands: a question goes to Ask the Map as v9 sent it (`askOnMap`); every other operation says it cannot yet.
 */
import type { MapCmd } from "@/lib/thunai/v10/map10";
import type { Lang } from "@/lib/thunai/types";

export interface MapOpsDeps {
  /** the console's Ask the Map entry v9 used */
  askOnMap?: (q: string) => void;
  lang: Lang;
}

export async function runMapCmd(cmd: MapCmd, d: MapOpsDeps): Promise<{ en: string; ta: string } | null> {
  if ((cmd.op === "ask" || cmd.op === "followup") && cmd.question && d.askOnMap) { d.askOnMap(cmd.question); return null; }
  return { en: "I can't do that on the map yet.", ta: "வரைபடத்தில் அதை இன்னும் செய்ய முடியாது." };
}
