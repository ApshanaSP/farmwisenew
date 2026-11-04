import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// the mark Jarvis refuses to press: no pattern over a name can catch "Yes", so the buttons that close, delete or accept carry it
const linesWith = (file: string, hint: string) => readFileSync(join(__dirname, file), "utf8").split("\n").filter((l) => l.includes("<button") && l.includes(hint));

describe("buttons Jarvis never presses", () => {
  it("Verify, which closes a severe incident for the citizen", () => {
    const b = linesWith("Attention.tsx", "onClick={() => verify(i)}");
    expect(b).toHaveLength(1);
    expect(b[0]).toContain("data-jarvis-never");
  });
  it("the Yes that deletes a dataset, and not its No", () => {
    const b = linesWith("studio/Dataset.tsx", "onClick={del}");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatch(/<button onClick=\{del\} data-jarvis-never>Yes/);
    expect(b[0]).toMatch(/<button onClick=\{\(\) => setConfirm\(false\)\}>No/);
  });
  it.each(["approve", "approveNew", "accept", "reject"])("the connector's %s", (action) => {
    const b = linesWith("studio/Connectors.tsx", `act(k.id, "${action}")`);
    expect(b).toHaveLength(1);
    expect(b[0]).toContain("data-jarvis-never");
  });
});
