import { describe, expect, it, vi } from "vitest";

// derive.ts registers its steps with the store on import; the store is not needed to test the text rules
vi.mock("@/lib/aws/store", () => ({ onBuild: () => undefined }));
vi.mock("@/lib/collector/nlp", () => ({ placeResolver: async () => () => null }));
const { headlineOf } = await import("./derive");

describe("headlineOf", () => {
  it("skips who is writing and keeps the problem", () => {
    expect(headlineOf("I live at door no. 76, Srinivasapuram 1st Street. Vehicles are left on the footpath in our street every day; pedestrians have to walk on the road. Kindly send someone."))
      .toBe("Vehicles are left on the footpath in our street every day; pedestrians have to walk on the road");
    expect(headlineOf("I run a small shop on Indira Nagar 5th St. Deep pothole near Mariamman Kovil is filled with rain water and not visible to motorists. Please do the needful."))
      .toBe("Deep pothole near Mariamman Kovil is filled with rain water and not visible to motorists");
  });
  it("keeps a police report's sentence and fixes road-name capitals", () => {
    expect(headlineOf("A cab hit a two-wheeler on Vaidhyanathan 2Nd Cross Street, Korukkupet. 2 injured and taken to hospital."))
      .toBe("A cab hit a two-wheeler on Vaidhyanathan 2nd Cross Street, Korukkupet");
  });
  it("shortens a long text at a word", () => {
    const h = headlineOf("Garbage " + "is piled up near the bus stop and nobody has cleared it ".repeat(6));
    expect(h.length).toBeLessThanOrEqual(141);
    expect(h.endsWith("…")).toBe(true);
  });
});
