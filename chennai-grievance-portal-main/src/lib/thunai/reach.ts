/**
 * The reach audit: what the console can do, and how Jarvis does it by voice. "Tell Jarvis to do anything" means every read,
 * navigate and build action here works by voice, and anything else gets a clear spoken "I can't do that, here's what I can".
 * Data tools are read-only. Level A runs at once with undo; B needs a spoken yes or a tap; C is draft-to-tray only. Jarvis
 * never sends, approves or deletes. reach.test.ts checks this table against the risk table and the rules.
 */
import type { ActionName } from "./types";

export type Level = "read" | "A" | "B" | "C" | "never";
export interface Reach { what: string; level: Level; how: string; say: string }

export const REACH: Reach[] = [
  { what: "Go to a page", level: "A", how: "step page", say: "go to the trends page" },
  { what: "Change the period", level: "A", how: "step period", say: "make it weekly" },
  { what: "Filter by zone, department, category, taluk, severity", level: "A", how: "step view", say: "show zone 7" },
  { what: "Clear the filters", level: "A", how: "step view", say: "clear the filters" },
  { what: "Open a panel: news, stories, conflicts, gaps, next door, markets, zones, departments, sources, review, workspaces, export, customize, search, assistant, map", level: "A", how: "step panel", say: "open the news panel" },
  { what: "Switch the map between zones and taluks; map layers", level: "A", how: "steps mapMode, layer", say: "switch to taluks" },
  { what: "Open an incident from the list; next and previous", level: "A", how: "step item", say: "open the first one" },
  { what: "Theme, language, how replies come", level: "A", how: "steps theme, lang, mode", say: "dark mode" },
  { what: "Show numbers on the buttons; press one that is not a send or a delete", level: "A", how: "steps numbers, click", say: "show numbers" },
  { what: "Undo", level: "A", how: "step undo", say: "undo" },
  { what: "Build a screen: cases, one case, news, readings, ranking, compare, trend, why, performance, dashboard, map, nearby, brief, prices, what first, what stands out, complete this data", level: "A", how: "recipes", say: "compare Adyar and Ambattur this week" },
  { what: "Work on the open screen: read, next, previous, sort, filter, view as table, map or chart, export", level: "A", how: "stage ops", say: "sort these by complaints" },
  { what: "Read a tool: KPIs, zones, departments, severity, resolution times, backlog, follow-ups, trends, taluks, hotspots, change drivers, a place, unusual rises, stories, environment, series, prices, contacts, gaps, the verification queue, incidents, one incident, the briefing, source health, a place's location, search", level: "read", how: "data bundle", say: "how many open complaints does Metro Water have" },
  { what: "Get ready for heavy rain", level: "A", how: "step mission rain", say: "we expect heavy rain tonight, get everything ready" },
  { what: "Save this workspace", level: "B", how: "step workspace, spoken yes or a tap", say: "save this workspace as Collector's Daily Briefing" },
  { what: "Pin a screen", level: "B", how: "stage op pin, spoken yes or a tap", say: "pin this" },
  { what: "Remember a note, set a reminder, forget a note", level: "B", how: "steps remember, remind, forget", say: "remember that the Adyar bridge is closed" },
  { what: "Draft an action for an incident", level: "C", how: "to the tray only", say: "draft action for the second one" },
  { what: "Send, approve, delete, change an officer's record, anything outside this console", level: "never", how: "refused in code; the tray's button is the Collector's own tap", say: "send the drafts" }
];

/** Every console action, and which level it has: the same table risk.ts runs. */
export const ACTION_LEVEL: Record<ActionName, Level> = {
  page: "A", period: "A", view: "A", mapMode: "A", layer: "A", panel: "A", close: "A", item: "A", draft: "A", zoom: "A", ask: "A", map: "A", theme: "A", lang: "A", mode: "A", speed: "A", handsfree: "A", undo: "A",
  stop: "A", off: "A", repeat: "A", whatDid: "A", whereAmI: "A", explain: "A", numbers: "A", click: "A", scroll: "A", type: "A", clearText: "A", recall: "A", read: "A", help: "A", mission: "A",
  workspace: "B", remember: "B", forget: "B", remind: "B", send: "C", confirm: "C"
};

/** Said when a request is outside what Jarvis can do. */
export function cannotLine(lang: "en" | "ta"): string {
  return lang === "ta"
    ? "அதை என்னால் செய்ய முடியாது. சம்பவங்கள், செய்திகள், மழை, காற்று, ஏரிகள், விலைகள் காட்டலாம், பகுதிகளை ஒப்பிடலாம், தனித்து நிற்பதைக் கண்டறியலாம், தரவை நிரப்பலாம், கன்சோலை இயக்கலாம், வரைவுகளைத் தட்டில் வைக்கலாம்."
    : "I can't do that. I can show incidents, news, rain, air, reservoirs and prices, compare places, find what stands out, complete data, drive the console, and draft for your tray.";
}
export const NO_MODEL_LINE = {
  en: "I cannot reason right now: no model is answering. Plain requests still work, like show the severe cases, or go to the trends page.",
  ta: "இப்போது என்னால் யோசிக்க முடியவில்லை: எந்த மாடலும் பதில் தரவில்லை. கடுமையான சம்பவங்களைக் காட்டு, போக்குகள் பக்கத்துக்குப் போ போன்ற எளிய கோரிக்கைகள் வேலை செய்யும்."
};
