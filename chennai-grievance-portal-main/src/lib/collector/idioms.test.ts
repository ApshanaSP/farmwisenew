import { describe, expect, it } from "vitest";
import { isOccasion, joinsOccasion, plainEvents, stormName } from "./idioms";

describe("phrases that carry an event word but are not that event", () => {
  it("a cardiac arrest is not an arrest, nor is a heart attack an attack", () => {
    for (const t of ["Kolathur MLA V S Babu dies at Chennai hospital after cardiac arrest", "TVK Kolathur MLA VS Babu who defeated MK Stalin dies of cardiac arrest",
      "Man suffers cardiac arrest on GST Road", "Student dies of cardio-respiratory arrest"])
      expect(plainEvents(t), t).not.toMatch(/arrest/i);
    expect(plainEvents("MLA dies of heart attack")).not.toMatch(/attack/i);
  });
  it("a real arrest stays", () => {
    expect(plainEvents("School teacher arrested for misbehaving with college girl in Kotturpuram")).toMatch(/arrested/);
    expect(plainEvents("Doctor arrested after patient's cardiac arrest")).toMatch(/Doctor arrested/);
  });
  it("a digital arrest is a fraud, GTA is a game, a meeting held is not a person held", () => {
    expect(plainEvents("Retired officer loses Rs 2 crore in digital arrest scam")).not.toMatch(/arrest/i);
    expect(plainEvents("Back to Vice City: Why GTA 6 is a big deal")).toMatch(/video game/);
    expect(plainEvents("Grand Theft Auto launch: firm declares holiday")).not.toMatch(/theft/i);
    expect(plainEvents("Consultation meeting held at Ripon Building")).not.toMatch(/\bheld\b/);
    expect(plainEvents("Camp to be held on November 28")).not.toMatch(/\bheld\b/);
    expect(plainEvents("Two held for smuggling ganja")).toMatch(/\bheld for\b/);
  });
  it("a civic body is not a dead body", () => {
    expect(plainEvents("Civic body clears 100 encroachments")).not.toMatch(/\bbody\b/i);
    expect(plainEvents("Body of missing student found in Adyar river")).toMatch(/Body of/);
  });
});

// 24 Nov 2026: the banner and the key points read "Heavy rain Karthigai Deepam"
describe("a festival is never a storm's name", () => {
  it("knows the festivals", () => {
    for (const n of ["Karthigai Deepam", "Kartik Deepam", "Thirukarthigai Deepam", "Deepavali", "Pongal", "கார்த்திகை தீபம்", "Vinayagar Chathurthi", "Christmas"])
      expect(isOccasion(n), n).toBe(true);
    for (const n of ["Arnab", "Akwan", "Michaung", "Fengal", "Nivar", "Vardah"]) expect(isOccasion(n), n).toBe(false);
  });
  it("takes a name only when the headline writes it beside the storm word", () => {
    expect(stormName("Karthigai Deepam", "Tamil Nadu-Chennai Weather Update: Heavy Rain In 9 Districts On Karthigai Deepam; Check Full List")).toBeNull();
    expect(stormName("Kartik Deepam", "On Kartik Deepam, rain in more than 30 districts – Chennai Weather Research Centre")).toBeNull();
    expect(stormName("Deepam", "Cyclone to cross on Deepam day")).toBeNull();
    expect(stormName("Arnab", "Cyclone Arnab forming in the Bay of Bengal")).toBe("Arnab");
    expect(stormName("Arnab", "'Arnab' cyclone formed in the Bay of Bengal")).toBe("Arnab");
    expect(stormName("Cyclone Akwan", "The sea appeared rough due to Cyclone Akwan at Kasimedu")).toBe("Akwan");
    expect(stormName("Arnab", "Heavy rain in Chennai today")).toBeNull();
    expect(stormName("Arnab", "அர்னாப் புயல் காரணமாக மழை")).toBe("Arnab");
    expect(stormName("Chennai", "Cyclone Chennai update")).toBeNull();
  });
  it("sees a hazard run together with a festival, and leaves a date alone", () => {
    expect(joinsOccasion("The Heavy rain Karthigai Deepam alert is active")).toBe(true);
    expect(joinsOccasion("Heavy rain Deepavali warning for Chennai")).toBe(true);
    expect(joinsOccasion("Heavy rain on Karthigai Deepam in 9 districts")).toBe(false);
    expect(joinsOccasion("Thunderstorm warning for Chennai; crowds at the Deepam festival")).toBe(false);
  });
});
