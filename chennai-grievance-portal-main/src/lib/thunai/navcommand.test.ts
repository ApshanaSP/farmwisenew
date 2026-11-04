import { describe, expect, it } from "vitest";
import { START, WORLD } from "./fixture";
import { isNavCommand, isPlainMove } from "./plan";
import { understand } from "./understand";

// A command to move around the dashboard runs at once from the rules (no model), so the Collector sees Jarvis move;
// a question about the data still goes to the agent, which builds a screen for it
const instant = (q: string) => { const r = understand(q, START, WORLD); return r.kind === "do" && r.confidence >= 0.9 && (isPlainMove(r.steps) || isNavCommand(q, r.steps)); };

describe("dashboard commands skip the model", () => {
  it.each(["Go to the trends page and show only Adyar", "switch to weekly", "open news", "show latest news", "show only severe", "navigate to trends and filter dengue",
    "show Teynampet on the map", "turn on the rain layer", "டிரெண்ட்ஸ் பேஜுக்கு போ", "weekly ku maathu"])("%s", (q) => expect(instant(q)).toBe(true));
  it.each(["show me Adyar zone", "Why are dengue cases rising in Teynampet?", "Which zone has the most garbage complaints this week?", "how is Adyar doing this week"])("not: %s", (q) => expect(instant(q)).toBe(false));
});
