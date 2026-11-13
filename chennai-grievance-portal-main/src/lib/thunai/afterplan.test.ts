// QA pass 7, P6-024: Jarvis's line after a plan's steps (Thunai.tsx run()). A handed-on question is answered by Ask District IQ's card; the
// step's description ("Asked District IQ") must not be put over it.
import { describe, expect, it } from "vitest";
import { afterPlan } from "./afterplan";
import type { Step } from "./types";

const describeStep = (s: Step) => (s.a === "ask" ? "Asked District IQ" : s.a === "view" ? "Severe" : s.a === "period" ? "Last 7 days" : s.a);

describe("afterPlan: what run() says once the steps have run", () => {
  it("P6-024: a question handed to Ask District IQ is not covered with 'Asked District IQ' (the analyst said its answer)", () => {
    const r = afterPlan([{ a: "ask", q: "How many cases are overdue?" }], [], undefined, describeStep);
    expect(r).toEqual({ kind: "answered" });
  });
  it("nor when the hand-over comes with a console move", () => {
    expect(afterPlan([{ a: "view", view: { sev: "Severe" } }, { a: "ask", q: "how many severe" }], [], undefined, describeStep).kind).toBe("answered");
  });
  it("the lines the steps said are said, the note first", () => {
    expect(afterPlan([{ a: "read", what: "rain", name: null }], ["5 mm of rain."], "Here:", describeStep)).toEqual({ kind: "say", text: "Here: 5 mm of rain." });
  });
  it("a plan of moves with nothing to say is described, as before", () => {
    expect(afterPlan([{ a: "view", view: { sev: "Severe" } }, { a: "period", period: "weekly" }], [], undefined, describeStep)).toEqual({ kind: "describe", text: "Severe · Last 7 days" });
  });
});
