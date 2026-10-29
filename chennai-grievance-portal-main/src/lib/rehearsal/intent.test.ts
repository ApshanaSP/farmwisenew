import { describe, expect, it } from "vitest";
import { dayIn, rehearsalIntent } from "./intent";

describe("rain rehearsal questions", () => {
  it("opens the rehearsal for questions about the coming rain", () => {
    for (const q of ["what will flood tomorrow?", "Which streets will go under water if it rains heavily?", "flooding tomorrow in Velachery", "rain rehearsal", "rehearse a heavy rain",
      "நாளை எங்கே வெள்ளம் வரும்?", "மழை ஒத்திகை", "naalaiku enga thanni nikkum"])
      expect(rehearsalIntent(q), q).not.toBeNull();
  });
  it("knows hospitals, dry schools, the report card and replays", () => {
    expect(rehearsalIntent("which hospitals get cut off?")?.focus).toBe("help");
    expect(rehearsalIntent("wards that lose fire cover")?.focus).toBe("help");
    expect(rehearsalIntent("dry schools near Velachery")?.focus).toBe("schools");
    expect(rehearsalIntent("how did we do last rain?")?.stop).toBe("check");
    expect(rehearsalIntent("replay 21 October")?.replay).toBe("rain-2026-10-21");
    expect(rehearsalIntent("replay the Oct 21 rain")?.replay).toBe("rain-2026-10-21");
  });
  it("leaves ordinary map questions to Ask the Map", () => {
    for (const q of ["waterlogging within 300 m of schools", "open flooding near hospitals", "garbage in Adyar", "flooding along Anna Salai this week", "how many complaints in ward 106"])
      expect(rehearsalIntent(q), q).toBeNull();
  });
  it("reads a day in a question", () => {
    expect(dayIn("21st oct")).toBe("2026-10-21");
    expect(dayIn("sep 9")).toBe("2026-09-09");
    expect(dayIn("no date")).toBeNull();
  });
});
