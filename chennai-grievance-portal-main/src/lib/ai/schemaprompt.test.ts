import { describe, expect, it } from "vitest";
import { AgentPlanSchema } from "@/lib/thunai/agent";
import { jsonIn, schemaText } from "./gateway";

describe("Gemini fallback: the schema as instructions, the reply checked by code", () => {
  it("writes Thunai's agent plan schema as JSON Schema text the model can follow", () => {
    const t = schemaText(AgentPlanSchema);
    const j = JSON.parse(t);
    expect(j.type).toBe("object");
    expect(Object.keys(j.properties)).toEqual(expect.arrayContaining(["kind", "lang", "reply", "steps", "screen", "calls", "done", "say", "options"]));
  });
  it("finds the JSON object in a plain, fenced or chatty reply", () => {
    expect(jsonIn('{"kind":"do"}')).toEqual({ kind: "do" });
    expect(jsonIn('```json\n{"kind":"chat"}\n```')).toEqual({ kind: "chat" });
    expect(jsonIn('Here is the plan: {"kind":"refuse","reply":"no"} hope that helps')).toEqual({ kind: "refuse", reply: "no" });
    expect(jsonIn("no json here")).toBeNull();
  });
});
