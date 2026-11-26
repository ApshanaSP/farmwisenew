import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hudRoom } from "./thunai/Hud";

// 26 Nov 2026 (the owner: "no overlaps, every button visible"): the dock and Jarvis's bar lie over nothing, because every page leaves them room
const css = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");
const app = css("CollectorApp.tsx");

describe("the dock: Jarvis and Ask District IQ side by side in a strip every page leaves free", () => {
  it("holds both buttons, and is loaded after the sheets that used to float them", () => {
    expect(app).toMatch(/className="cdock"[^]*<JarvisFab \/>[^]*ask-fab ask-fab-v2/);
    expect(app.indexOf('"./dock.css"')).toBeGreaterThan(app.indexOf('"./shell2.css"'));
    expect(app.indexOf('"./dock.css"')).toBeGreaterThan(app.indexOf('"./thunai/JarvisFab"'));
  });
  it("is as tall as the room the pages leave", () => {
    const d = css("dock.css");
    const room = Number(d.match(/--dock-h:(\d+)px/)?.[1]);
    const h = Number(d.match(/\.dic \.cdock\{[^}]*height:(\d+)px/)?.[1]), b = Number(d.match(/\.dic \.cdock\{[^}]*bottom:(\d+)px/)?.[1]);
    expect(h + b).toBeLessThanOrEqual(room);
    expect(d).toMatch(/\.dic\.fit \.app:has\(>\.cdock\) \.body\{padding-bottom:var\(--dock-h\)\}/);
    // the phone's bar (48 px) and the page tabs (60 px) are cleared by the page's end
    expect(Number(d.match(/\.dic:not\(\.fit\) \.app:has\(>\.cdock\) \.body\{padding-bottom:calc\((\d+)px/)?.[1])).toBeGreaterThanOrEqual(108);
  });
  it("leaves Jarvis's bar its room in steps, at most 26 % of the screen or 132 px", () => {
    expect(hudRoom(58, 680)).toBe(88);
    expect(hudRoom(64, 680)).toBe(88);
    expect(hudRoom(90, 680)).toBe(132);
    expect(hudRoom(140, 680)).toBe(176);
    expect(hudRoom(400, 680)).toBe(177);
    expect(hudRoom(400, 1080)).toBe(281);
    expect(hudRoom(400, 400)).toBe(132);
  });
});
