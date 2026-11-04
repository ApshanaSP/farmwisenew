import { describe, expect, it } from "vitest";
import { coreOf, micOpen, powerOnDue, savedTheme, tabStop } from "./hudstore";

describe("what the HUD claims about the microphone", () => {
  it("does not say listening before the microphone has opened", () => {
    expect(coreOf("on", "off", false, false)).toBe("idle");
    expect(coreOf("on", "listening", false, false)).toBe("listening");
    expect(coreOf("on", "off", true, false)).toBe("thinking");
  });
  it("shows the dot from the open microphone, not from the mode", () => {
    expect(micOpen({ mode: "on", turn: "off" })).toBe(false);
    expect(micOpen({ mode: "on", turn: "listening" })).toBe(true);
    expect(micOpen({ mode: "on", turn: "speaking" })).toBe(true);
    expect(micOpen({ mode: "muted", turn: "off" })).toBe(false);
  });
});

describe("the power-on", () => {
  it("plays once a session and never with reduced motion", () => {
    expect(powerOnDue(false, null)).toBe(true);
    expect(powerOnDue(false, "1")).toBe(false);
    expect(powerOnDue(true, null)).toBe(false);
  });
});

describe("Tab with a screen open", () => {
  const stage = ["close", "read", "pin"], controls = ["yes", "stop", "type"];
  it("does not pull focus out of the HUD", () => {
    expect(tabStop(stage, controls, "stop", false, true)).toBeNull();
    expect(tabStop(stage, controls, "stop", true, true)).toBeNull();
  });
  it("reaches the HUD's controls from the Stage, and comes back round", () => {
    expect(tabStop(stage, controls, "pin", false, true)).toBe("yes");
    expect(tabStop(stage, controls, "type", false, true)).toBe("close");
    expect(tabStop(stage, controls, "close", true, true)).toBe("type");
    expect(tabStop(stage, controls, "yes", true, true)).toBe("pin");
  });
  it("cycles inside the Stage when no HUD is up, and leaves the middle to the browser", () => {
    expect(tabStop(stage, [], "pin", false, true)).toBe("close");
    expect(tabStop(stage, [], "close", true, true)).toBe("pin");
    expect(tabStop(stage, [], "read", false, true)).toBeNull();
  });
  it("brings focus on the console behind back to the Stage", () => {
    expect(tabStop(stage, controls, null, false, false)).toBe("close");
    expect(tabStop(stage, controls, "console", false, false)).toBe("close");
  });
});

describe("the theme after Jarvis mode", () => {
  it("is the saved one", () => {
    expect(savedTheme("dark")).toBe("dark");
    expect(savedTheme("light")).toBe("light");
    expect(savedTheme(null)).toBe("light");
  });
});
