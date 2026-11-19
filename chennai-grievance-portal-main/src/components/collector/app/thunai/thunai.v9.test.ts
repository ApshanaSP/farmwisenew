/**
 * v9 review (19 Nov, findings #12, #17, #19, #23): the soft find's wiring in Thunai.tsx, read from the source as thunai.v5/v7 tests do.
 * A soft find (a story-like topic with no news word) is only a probe: when it finds nothing close, or fails before it found anything (a 429,
 * a 5xx, the network, an error event), the turn goes on to the console's lanes, as the evaluation runner assumes; its bookkeeping (the trace's
 * lane, the brain line, the busy line) waits until it has something; an aborted probe records no decision.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8");
const turn = src.slice(src.indexOf("const newsTurn = async"), src.indexOf("const draftMany = async"));

describe("v9 review: the soft find in Thunai.tsx", () => {
  it("newsTurn says what happened: done, none (go on to the lanes) or aborted", () => {
    expect(turn).toMatch(/Promise<"done" \| "none" \| "aborted">/);
    expect(turn).not.toMatch(/return true;|return false;/);
  });
  it("a soft probe that failed before it found anything goes on to the lanes, never says a web failure", () => {
    expect(turn).toMatch(/if \(soft && !found && !st\.answered\) \{[^}]*return "none";/);
  });
  it("its bookkeeping waits until the probe has something (trace lane, brain, busy line)", () => {
    expect(turn).toMatch(/const begin = \(\) => \{/);
    expect(turn).toMatch(/if \(!soft\) begin\(\);/);
    expect(turn.indexOf('traceDecided("rules")')).toBeGreaterThan(turn.indexOf("const begin = () => {"));
  });
  it("handle(): an aborted probe records nothing; 'none' goes on", () => {
    expect(src).toMatch(/const r8n = await newsTurn\(n8, said, ulang \?\? "en", alive, ctl\.signal\);\s*if \(r8n === "aborted"\) return;\s*if \(r8n === "done"\) \{/);
  });
});
