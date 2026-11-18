/**
 * v8's one switch back: `JARVIS_UNDERSTAND=v7` (server) and `NEXT_PUBLIC_JARVIS_UNDERSTAND=v7` (browser, inlined at build time) turn every v8
 * understanding layer off (the addressee gate's new silences, the reply-language rule, the news-by-topic and news-question lanes, the v8
 * references and the deep model), so the turn is understood as v7 understood it. Default: v8.
 */
export const understandV8 = (): boolean => {
  try {
    // either switch set to v7 is v7: the server's JARVIS_UNDERSTAND holds whatever the browser build's NEXT_PUBLIC_ value (the review, 19 Nov)
    const v7 = (x: string | undefined) => (x ?? "").trim().toLowerCase() === "v7";
    return !(v7(process.env.NEXT_PUBLIC_JARVIS_UNDERSTAND) || v7(process.env.JARVIS_UNDERSTAND));
  } catch {
    return true;
  }
};
