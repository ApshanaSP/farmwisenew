import { describe, expect, it } from "vitest";
import { openIncidentAsk, policeAsk } from "./placeasks";

describe("placeasks: questions put into one shape before any model (29 Nov)", () => {
  it("a police station's responsibility for a place is asked of the map as the nearest stations", () => {
    for (const [q, place] of [["Which police station is responsible for Avadi?", "Avadi"], ["Jarvis, police station for Tambaram", "Tambaram"], ["Avadi police station", "Avadi"],
      ["What police station covers Anna Nagar?", "Anna Nagar"]] as const) {
      expect(policeAsk(q), q).toContain(`nearest police stations to ${place},`);
    }
  });
  it("other police questions are left alone", () => {
    for (const q of ["How many police reports today?", "Show police incidents in Adyar", "police station"]) expect(policeAsk(q), q).toBeNull();
  });
  it("open incident with an id opens it; no id, nothing", () => {
    expect(openIncidentAsk("Open incident INC-20260919-E72C52")).toBe("INC-20260919-E72C52");
    expect(openIncidentAsk("Jarvis, show me inc-20261128-6b8086 please")).toBe("INC-20261128-6B8086");
    expect(openIncidentAsk("Open the severe incidents")).toBeNull();
    expect(openIncidentAsk("What happened in INC-20260919-E72C52?")).toBeNull();
  });
});
