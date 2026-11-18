/**
 * v8's one switch back: `JARVIS_UNDERSTAND=v7` (server) and `NEXT_PUBLIC_JARVIS_UNDERSTAND=v7` (browser, inlined at build time) turn every v8
 * understanding layer off (the addressee gate's new silences, the reply-language rule, the news-by-topic and news-question lanes, the v8
 * references and the deep model), so the turn is understood as v7 understood it. Default: v8.
 */
export const understandV8 = (): boolean => {
  try {
    const v = (process.env.NEXT_PUBLIC_JARVIS_UNDERSTAND || process.env.JARVIS_UNDERSTAND || "").trim().toLowerCase();
    return v !== "v7";
  } catch {
    return true;
  }
};
