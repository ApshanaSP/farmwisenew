import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hudRoom } from "./thunai/Hud";

// 26 Nov 2026 (the owner: "no overlaps, every button visible"): the dock and Jarvis's bar lie over nothing.
// 28 Nov (the owner: the strip kept free along the bottom "shrank all the tiles" and left "a big gap at the bottom"; the Briefing, which scrolls,
// was the model): no strip. Every page scrolls inside the console, and the end of its scroll leaves the dock its room; the Overview, which does
// not scroll, ends only its right-hand card above the dock.
const css = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");
const app = css("CollectorApp.tsx");
const d = css("dock.css");
const px = (re: RegExp) => Number(d.match(re)?.[1]);

describe("the dock: Jarvis and Ask District IQ side by side, over no card", () => {
  it("holds both buttons, and is loaded after the sheets that used to float them", () => {
    expect(app).toMatch(/className="cdock"[^]*<JarvisFab \/>[^]*ask-fab ask-fab-v2/);
    expect(app.indexOf('"./dock.css"')).toBeGreaterThan(app.indexOf('"./shell2.css"'));
    expect(app.indexOf('"./dock.css"')).toBeGreaterThan(app.indexOf('"./briefing.css"'));
    expect(app.indexOf('"./dock.css"')).toBeGreaterThan(app.indexOf('"./thunai/JarvisFab"'));
  });
  it("no strip along the bottom of the pages: the page area reaches the window's foot and scrolls", () => {
    expect(d).toMatch(/\.dic\.fit \.app:has\(>\.cdock\) \.body\{padding-bottom:0\}/);
    expect(d).not.toMatch(/\.body\{padding-bottom:var\(--dock-h\)\}/);
    expect(d).toMatch(/\.dic\.fit #view\{[^}]*overflow-y:auto/);
    // a page is at least the window's height (no gap under it) and never shorter than its cards' sizes
    expect(d).toMatch(/\.dic\.fit #view>\*\{flex:none;min-height:0;height:max\(100%,var\(--pg-min,0px\)\)\}/);
    // the Briefing no longer scrolls on its own (one scroll, the page area's)
    expect(css("briefing.css")).not.toMatch(/\.bb\.bb2\{overflow-y:auto/);
  });
  it("the end of a page's scroll clears the dock", () => {
    const room = px(/--dock-h:(\d+)px/);
    const h = px(/\.dic \.cdock\{[^}]*height:(\d+)px/), b = px(/\.dic \.cdock\{[^}]*bottom:(\d+)px/);
    expect(h + b).toBeLessThanOrEqual(room);
    const extra = px(/--end-room:calc\(var\(--dock-h\) \+ (\d+)px\)/);
    expect(room + extra).toBeGreaterThanOrEqual(h + b + 6);
  });
  it("the Overview keeps the whole height; its right-hand card, and the grown map, end above the dock", () => {
    const room = px(/--dock-h:(\d+)px/), h = px(/\.dic \.cdock\{[^}]*height:(\d+)px/), b = px(/\.dic \.cdock\{[^}]*bottom:(\d+)px/);
    const foot = px(/\.dic\.fit #view>\.p1\{height:max\(calc\(100% - (\d+)px\),\d+px\)\}/);
    const margin = room - px(/\.p1>\.p1-end\{margin-bottom:calc\(var\(--dock-h\) - (\d+)px\)\}/);
    expect(foot + margin).toBeGreaterThanOrEqual(h + b + 6);
    expect(d).toMatch(/\.dic\.fit #view:has\(>\.p1\)\{--end-room:0px\}/);
    expect(d).toMatch(/\.dic\.fit\.map-grown #view>\.p1\{height:max\(calc\(100% - var\(--dock-h\) - \d+px\),\d+px\)\}/);
    // the card in the last column carries the class (Overview.tsx)
    const ov = css("Overview.tsx");
    expect(ov).toContain('const endKey = cols.length < 2 ? null : cols.includes("map") ? r0[r0.length - 1] : cols[cols.length - 1];');
    expect(ov).toContain("card a-brief${end(\"brief\")}");
  });
  it("the phone's bar (48 px) and the page tabs (60 px) are cleared by the page's end", () => {
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
    // with the bar open, the end of every page's scroll (the Overview's too) leaves it its room
    expect(d).toMatch(/html\.jv-hud \.dic\.fit #view,html\.jv-hud \.dic\.fit #view:has\(>\.p1\)\{--end-room:calc\(var\(--hud-room,92px\) \/ var\(--z,1\)\)\}/);
  });
});
