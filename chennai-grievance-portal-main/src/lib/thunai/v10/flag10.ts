/**
 * v10's one switch back: `JARVIS_UNDERSTAND=v9` (server) and `NEXT_PUBLIC_JARVIS_UNDERSTAND=v9` (browser, inlined at build time) turn every v10
 * understanding layer off (the cut-off wait, the screen model's by-ear positions, the entity lexicon and its "did you mean", the named event's
 * routing, the news words added in v10, Ask the Map and the controls by voice), so the turn is understood as v9 understood it. `v7` turns v8's
 * off too (flag8.ts). Default: v10.
 */
import { understandV8 } from "../v8/flag8";

export const understandV10 = (): boolean => {
  try {
    if (!understandV8()) return false;
    const v9 = (x: string | undefined) => (x ?? "").trim().toLowerCase() === "v9";
    return !(v9(process.env.NEXT_PUBLIC_JARVIS_UNDERSTAND) || v9(process.env.JARVIS_UNDERSTAND));
  } catch {
    return true;
  }
};
