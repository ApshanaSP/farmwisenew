/**
 * Review (Phase 7, Numbers 2, server part): a case's title (a citizen's own words, a name, a phone) reached the planner's prompt unscrubbed
 * through the register's title (register.ts registerLine) and through an earlier turn's heard words and result (plan.ts turnLine). Both now
 * go through scrubDigest, as the screen's digest does: phones and Aadhaar masked, a quoted sentence replaced, a piece naming who filed hidden.
 */
import { describe, expect, it } from "vitest";
import { turnLine } from "./plan";
import { buildRegister, registerLine } from "./register";
import type { StageContext } from "./stage";

const TITLE = "Filed by Ramesh Kumar, 9876543210: \"the drain near my house overflows every night\"";

describe("a citizen's words never reach the planner through the register or the turns", () => {
  it("the register's title is scrubbed: no phone, no quoted sentence, no filer's name", () => {
    const stage: StageContext = { recipe: "case", title: TITLE, focus: null, slots: {}, blocks: [{ kind: "CaseDetail", ids: ["INC-2026-004"] }] };
    const line = registerLine(buildRegister(stage, [], null));
    expect(line).toMatch(/on screen: case/);
    expect(line).not.toMatch(/9876543210/);
    expect(line).not.toMatch(/overflows every night/);
    expect(line).not.toMatch(/Ramesh/);
  });
  it("a turn's heard words and its result are scrubbed in turnLine, and in the register's recent turns", () => {
    const t = { heard: `open the one from 9876543210 "my street is flooded again today"`, did: "opened it", result: TITLE };
    const line = turnLine(t);
    for (const bad of [/9876543210/, /flooded again today/, /overflows every night/, /Ramesh/]) expect(line).not.toMatch(bad);
    expect(line).toMatch(/opened it/);
    const reg = registerLine(buildRegister(null, [{ ...t, recipe: "case", slots: { zones: [13] } }], null));
    for (const bad of [/9876543210/, /overflows every night/, /Ramesh/]) expect(reg).not.toMatch(bad);
  });
  it("a plain request and result pass as they were", () => {
    expect(turnLine({ heard: "severe cases in Adyar", did: "showed them", recipe: "cases", slots: { zones: [13] }, result: "Showed four severe cases." }))
      .toBe('- "severe cases in Adyar" -> cases {"zones":[13]} => "Showed four severe cases."');
  });
});
