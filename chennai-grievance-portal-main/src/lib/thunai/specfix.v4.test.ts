import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { understand } from "./understand";
import { START, WORLD } from "./fixture";

const UI = join(__dirname, "..", "..", "components", "collector", "app", "thunai");
describe("v4 spec findings", () => {
  it("a save said after another request is not acted on by the rules: the whole sentence goes on (level B waits for the name)", () => {
    expect(understand("show Adyar and save this workspace as Daily", START, WORLD, { speechConf: 0.95 }).kind).toBe("unknown");
    const plain = understand("save this workspace as Daily", START, WORLD, { speechConf: 0.95 });
    expect(plain.kind).toBe("do");
    expect(plain.kind === "do" && plain.steps.some((s) => s.a === "workspace")).toBe(true);
  });
  it("the microphone closed while starting is not a failure: open() returns quietly when the ears were replaced", () => {
    const src = readFileSync(join(UI, "conductor.ts"), "utf8");
    expect(src).toMatch(/if \(this\.ears !== e\) return;\s*this\.ears = null;\s*this\.h\.onFail/);
  });
  it("the core draws at most about 60 times a second, whatever the screen's refresh rate", () => {
    const src = readFileSync(join(UI, "Hud.tsx"), "utf8");
    expect(src).toMatch(/MIN_FRAME_MS = 12/);
    expect(src).toMatch(/t - lastPaint < MIN_FRAME_MS/);
  });
});
