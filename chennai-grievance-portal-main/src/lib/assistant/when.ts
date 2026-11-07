// Words for a point in time that every lane of Ask District IQ must read the same way (RC-10).

/**
 * "yesterday" in every form the app reads: English, Tanglish (nethu, netru, neththu, nethaiki) and Tamil (நேற்று, நேற்றைய, நேத்து, நேத்தைய).
 * ONE pattern for the window, the period and the tools (pipeline.ts), so no lane knows a form the others do not (RC-10, PB-081).
 */
export const YESTERDAY = /\b(yesterday|yesterday'?s|nethu|netru|neththu|nethaiki|nethikku|nethaiya|netraiya)\b|நேற்று|நேற்றைய|நேத்து|நேத்தைய|நேத்திக்கு/i;
export const SINCE_YESTERDAY = /\b(since|from) yesterday\b/i;
