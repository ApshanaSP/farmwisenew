/**
 * v12 (21 Nov), the wiring of the three v12 parts in Thunai.tsx (the routing's city reading, the turn's ownership of the map, the ordered
 * steps), read from the source as the v4 to v12 reading tests do (the loop needs a browser and a console to run), and cityopen.ts, the view a
 * city screen opens, as a function. The owner's 21 Nov sentences: "Okay, now tell me, show me in the map." (34 s on the map lane), "Zoom in
 * the map to the most congested area" (a generic screen), "Where are the flooded roads?" (a Roads & potholes list).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cityOpenOf } from "./cityopen";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8").replace(/\r\n/g, "\n");
const between = (a: string, b: string) => { const i = src.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };
const handle = between("const handle = async (", "const handleRef = useRef(handle)");

describe("cityOpenOf: the view a city screen opens", () => {
  const spotDoc = (focus: string | null) => ({ recipe: "city", slots: { q: "traffic", focus },
    blocks: [{ kind: "Kpis", id: "spot-kpis" }, { kind: "MapView", id: "spot", points: [{ id: "very12", lat: 13.06, lon: 80.25, label: "Road very12" }] }] });
  it("the most congested stretch: Live traffic on its spot, with where it was, and the reticle on it", () => {
    expect(cityOpenOf(spotDoc("worst-jam"))).toEqual({ detail: { kind: "traffic", spot: "very12", lat: 13.06, lon: 80.25 }, focus: { label: "Road very12", lat: 13.06, lon: 80.25 } });
  });
  it("the trouble spot that keeps coming back: its cluster on the Keeps coming tab", () => {
    expect(cityOpenOf(spotDoc("repeat"))?.detail).toEqual({ kind: "traffic", cluster: "very12", tab: "repeat", lat: 13.06, lon: 80.25 });
    expect(cityOpenOf({ recipe: "city", slots: { q: "traffic", focus: "repeat" }, blocks: [] })?.detail).toEqual({ kind: "traffic", tab: "repeat" });
  });
  it("the plain live traffic screen (and the whole city) opens the view on nothing in particular, as before", () => {
    expect(cityOpenOf({ recipe: "city", slots: { q: "traffic" }, blocks: [{ kind: "MapView", id: "map", points: [{ id: "city-0", lat: 1, lon: 2, label: "x" }] }] })).toEqual({ detail: { kind: "traffic" }, focus: null });
    expect(cityOpenOf({ recipe: "city", slots: {}, blocks: [] })?.detail).toEqual({ kind: "traffic" });
  });
  it("the flooded streets in the last rain: Rain & flooding on that rain; a day; power and trains on their tabs; a malformed rain dropped", () => {
    expect(cityOpenOf({ recipe: "city", slots: { q: "flood", rain: "latest" }, blocks: [] })?.detail).toEqual({ kind: "rain", lens: "flood", replay: "latest" });
    expect(cityOpenOf({ recipe: "city", slots: { q: "flood", rain: "rain-2026-10-21" }, blocks: [] })?.detail).toEqual({ kind: "rain", lens: "flood", replay: "rain-2026-10-21" });
    expect(cityOpenOf({ recipe: "city", slots: { q: "rain" }, blocks: [] })?.detail).toEqual({ kind: "rain", lens: "flood" });
    expect(cityOpenOf({ recipe: "city", slots: { q: "power" }, blocks: [] })?.detail).toEqual({ kind: "rain", lens: "power" });
    expect(cityOpenOf({ recipe: "city", slots: { q: "metro" }, blocks: [] })?.detail).toEqual({ kind: "rain", lens: "metro" });
    expect(cityOpenOf({ recipe: "city", slots: { q: "flood", rain: "javascript:x" }, blocks: [] })?.detail).toEqual({ kind: "rain", lens: "flood" });
  });
  it("any other screen opens nothing", () => {
    expect(cityOpenOf({ recipe: "cases", slots: { cat: "ROAD_DAMAGE" }, blocks: [] })).toBeNull();
  });
});

describe("putStage: the city screen opens its view, and says what 'show me in the map' means next", () => {
  const put = between("const putStage = (", "const showStage = (");
  it("dispatches the view cityOpenOf gives, rings its spot, and keeps the city topic (null for any other screen)", () => {
    expect(put).toContain("const city = cityOpenOf(doc);");
    expect(put).toMatch(/window\.dispatchEvent\(new CustomEvent\("diq:open-city", \{ detail: city\.detail \}\)\)/);
    expect(put).toMatch(/if \(city\.focus\) hud\.set\(\{ focus: \{ \.\.\.city\.focus, zone: null \} \}\)/);
    // (v13, finding 1 7: the city answer's slots, its focus, rain and spot, not only its topic: thunai.city.v13.test.ts)
    expect(put).toContain("lastCityRef.current = city ? lastCitySlotsOf(withDrafts) : null;");
  });
});

describe("the map lane", () => {
  const map = handle.slice(handle.indexOf('if (f10.lane?.lane === "map") {'), handle.indexOf('if (f10.lane?.lane === "control") {'));
  it("the map's state carries the Live traffic view and the part of the city last shown", () => {
    expect(between("const front10 = (s: string) => {", "\n    };")).toMatch(/mapSnap10\(hostRef\.current\.c\.mapAsk, \{ rainOpen: [^}]*trafficOpen: !!hostRef\.current\.c\.trafficView\?\.open, lastCity: lastCityNow\(\) \}\)/);
    // (v13, finding 1 7: the slots of the last city answer)
    expect(src).toContain("const lastCityNow = (): CityLast | null => lastCityRef.current ?? lastCitySlotsOf(stageRef.current, turns.current);");
  });
  it("the map works on the turn's signal, is raced against MAP_LANE_MS (8 s), says MAP_SLOW past it and lets the map finish quietly", () => {
    expect(src).toMatch(/const MAP_LANE_MS = 8000;/);
    expect(map).toMatch(/lang: lg, signal: ctl\.signal,/);
    expect(map).toMatch(/const got = await Promise\.race\(\[mapRun\.then\(\(l\) => \(\{ l \}\)\), sleep\(MAP_LANE_MS\)\.then\(\(\) => null\)\]\);/);
    const slow = map.slice(map.indexOf("if (!got) {"), map.indexOf("const line = got.l;"));
    expect(slow).toContain("out(MAP_SLOW[lg], lg, \"ready\", NO_FIGURES);");
    // the late answer only shows, never speaks, and only while this is still the turn
    const late = slow.slice(slow.indexOf("void mapRun.then((l) => {"), slow.indexOf(".catch(() => undefined);"));
    expect(late).toMatch(/if \(!alive\(\)\) return;/);
    expect(late).toMatch(/if \(l\) \{ setReply\(/);
    expect(late).not.toContain("out(");
    expect(slow).toContain("return;");
  });
  it("nothing the map does after its turn has ended shows: its card, the reticle, a save's question", () => {
    expect(map).toMatch(/show: \(p\) => \{ if \(alive\(\)\) hud\.panel\(/);
    expect(map).toMatch(/point: \(p\) => \{ if \(alive\(\)\) hud\.set\(/);
    expect(map).toMatch(/askYes: \(q, act\) => \{\n\s*if \(!alive\(\)\) return;/);
  });
  it("a city or zoom op on the Overview waits for its map first; the city op is what 'show me in the map' means next", () => {
    expect(map).toMatch(/if \(\(op === "city" \|\| op === "zoom"\) && hostRef\.current\.c\.page === "overview"\) await whenMapReady\(1500, ctl\.signal\);\n\s*if \(!alive\(\)\) return;/);
    // (the answer in time: after the turn is remembered; a late one, past MAP_LANE_MS, sets it too, while this is still the turn)
    // (v13, finding 1 7: what the op showed, its slots: mapops.ts cityShownBy)
    // (v14, review 13 routing 8: every op writes it, mapops.ts cityAfterMap)
    expect(map.lastIndexOf("lastCityRef.current = cityAfterMap(cmd10, line, lastCityRef.current);")).toBeGreaterThan(map.indexOf("remember(said, `Ask the Map: ${op}`"));
  });
});

describe("the rules' guard and fallback for a sentence about the city", () => {
  it("the instant shortcut's guard reads the shared city reading (cityAsk), with the last city shown", () => {
    expect(handle).toContain("const ca = cityAsk(said, { last: lastCityNow() });");
    expect(handle).toMatch(/const cityAsFilter = !!ca && rules\.kind === "do" && rules\.steps\.some\(\(x\) => x\.a === "view" && !!x\.view\.cat\);/);
    expect(src).not.toMatch(/cityTopic\(said\)/);
  });
  it("when the agent gave nothing, the city screen is built directly (no complaints filter, no analyst), after the answer gate's branch", () => {
    const gate = handle.indexOf('ag.note === "answer-gate"');
    const rulesNow = handle.indexOf('setBrainNow({ by: "rules", model: null, ms: 0 });\n    // v12 (21 Nov, routing RC6)');
    // (v13, finding 0 9: gated on cityQuick, the server fast lane's reading with its bail-outs, and built with its slots)
    const fb = handle.indexOf("if (ca && cq && (rules.kind === \"unknown\" || cityAsFilter)) {");
    const unknown = handle.indexOf('if (rules.kind === "unknown") {', fb);
    expect(gate).toBeGreaterThan(-1);
    expect(rulesNow).toBeGreaterThan(gate);
    expect(fb).toBeGreaterThan(rulesNow);
    expect(unknown).toBeGreaterThan(fb);
    expect(handle.slice(fb, unknown)).toMatch(/await directStage\("city", cq\.slots, ackFor\(said, rules\.lang\)/);
    expect(handle.slice(fb, unknown)).toContain("return;");
  });
});

describe("ordered steps (understanding RC13)", () => {
  const run = between("const run = async", "const missed = ");
  it("a page, panel, filter, period, layer, map mode or close waits for the console to settle before the next step, in quiet mode too", () => {
    expect(src).toMatch(/const SETTLES = new Set\(\["page", "panel", "view", "period", "layer", "mapMode", "close", "clearFilters"\]\);/);
    const settle = run.indexOf("if (i < steps.length - 1 && SETTLES.has(steps[i].a)) await hostRef.current.settled?.();");
    expect(settle).toBeGreaterThan(run.indexOf("if (quiet) s = await runStep("));
    expect(settle).toBeLessThan(run.indexOf('state: "done"'));
  });
  it("a map or zoom step after an earlier step waits for the map, and stops if the turn moved on", () => {
    expect(run).toMatch(/if \(i > 0 && \(steps\[i\]\.a === "map" \|\| steps\[i\]\.a === "zoom"\)\) \{ await whenMapReady\(1500, turnCtl\.current\?\.signal\); if \(!alive\(\)\) break; \}/);
    expect(run.indexOf("await whenMapReady(")).toBeLessThan(run.indexOf("ran++;"));
  });
  it("a planner's city screen after its own steps (the page) waits for the map before it is shown", () => {
    const own = handle.indexOf("if (own.length) await run(own, lang, heardAs, \"ai\", undefined, true);");
    const wait = handle.indexOf('if (ag.stage.recipe === "city" && own.length) { await whenMapReady(1500, ctl.signal); if (!alive()) return; }');
    expect(wait).toBeGreaterThan(own);
    expect(handle.indexOf("showStage(ag.stage, ag.say", wait)).toBeGreaterThan(wait);
  });
});
