import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/collector/db", () => ({ default: {}, ops: (t: string) => t, TITLE: "title" }));
const { countInLanguage } = await import("@/lib/assistant/fastpath");

const c = { n: 4, prev: 3, severe: 1, open: 2, dead: 0, kind: "road accidents", period: "last 7 days", where: " in Velachery (Adyar zone)" };

describe("a count is answered in the question's language", () => {
  it("Tanglish", () => {
    expect(countInLanguage("tanglish", c)?.text).toBe("Velachery (Adyar zone)-la kadandha 7 naal-la 4 road accidents report aagirukku (munnadi 3): 1 severe, 2 innum open.");
  });
  it("Tamil", () => {
    expect(countInLanguage("ta", c)?.text).toBe("கடந்த 7 நாட்களில் Velachery (Adyar zone) பகுதியில் 4 road accidents பதிவாகியுள்ளன (முந்தைய காலத்தில் 3): 1 கடுமையானவை, 2 இன்னும் நிலுவையில்.");
  });
  it("English is left to the English sentence", () => {
    expect(countInLanguage("en", c)).toBeNull();
  });
});
