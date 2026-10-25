import { describe, expect, it } from "vitest";
import { readableTime } from "@/lib/assistant/tools";

describe("story times read as a Collector would say them", () => {
  it("formats IST and UTC times, and leaves other text alone", () => {
    expect(readableTime("2026-10-02 07:40:48")).toBe("2 Oct 2026, 7:40 AM");
    expect(readableTime("2026-10-02 13:05")).toBe("2 Oct 2026, 1:05 PM");
    expect(readableTime("2026-10-02T02:10:48.000Z")).toBe("2 Oct 2026, 7:40 AM");
    expect(readableTime("2026-10-02")).toBe("2 Oct 2026");
    expect(readableTime("yesterday")).toBe("yesterday");
    expect(readableTime(null)).toBeNull();
  });
});
