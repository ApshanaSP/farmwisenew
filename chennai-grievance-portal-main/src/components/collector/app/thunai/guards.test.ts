import { describe, expect, it } from "vitest";
import { KEEP_BUTTON, workspaceIds } from "./guards";

describe("a spoken click never presses a button that keeps something (BUG-014)", () => {
  it.each(["Save new version", "Pin", "Unpin", "Pin to Overview", "Yes", " ok ", "சேமி"])("%s", (b) => expect(KEEP_BUTTON.test(b)).toBe(true));
  it.each(["Trends", "Open filters", "Weekly", "Show numbers", "Yesterday", "Export"])("not %s", (b) => expect(KEEP_BUTTON.test(b)).toBe(false));
});
describe("opening a workspace by voice finds its id (BUG-013)", () => {
  it("name groups with their versions, newest first", () => {
    expect(workspaceIds([{ name: "Monsoon", versions: [{ id: 9 }, { id: 4 }] }, { name: "Empty", versions: [] }])).toEqual([{ name: "Monsoon", id: 9 }]);
  });
  it("a flat list still works", () => expect(workspaceIds([{ name: "A", id: 3 }])).toEqual([{ name: "A", id: 3 }]));
  it("anything else is empty", () => expect(workspaceIds({ error: "x" })).toEqual([]));
});
