/**
 * v14 (21 Nov review 13 of the v13 city screens in place), Thunai.tsx's city parts, read from the source as the v4 to v13 wiring tests do (the
 * loop needs a browser and a console to run; the pure parts are tested in cityopen.v14, mapops.city.v14 and map10.city.v14):
 *   - scenarios 0, routing 8: every answer writes the last city answer (remember() -> cityTurnEnds), and drops an in-place screen quietly;
 *   - scenarios 7: the map lane keeps what its op opened (cityAfterMap), a camera move the one before;
 *   - routing 1: close, back, full screen, table and "details" said about an in-place screen act on its view and its card;
 *   - scenarios 8: putStage does not remount a view already open on the same thing;
 *   - routing 0 and scenarios 4: the map lane gets the console's places and the open screen's subject.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8").replace(/\r\n/g, "\n");
const between = (a: string, b: string) => { const i = src.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };
const handle = between("const handle = async (", "const handleRef = useRef(handle)");

describe("v14 scenarios 0, routing 8: the last city answer belongs to the last answer", () => {
  it("every remembered turn decides it (keepsLastCity), and the in-place screen goes with it, never cutting the voice", () => {
    expect(between("const remember = ", "\n")).toContain("cityTurnEnds(heardText, did, o.doc ?? null);");
    const ends = between("const cityTurnEnds = (", "\n  };");
    expect(ends).toContain("if (keepsLastCity(heardText, did, doc, (s) => !!smallTalk(s))) return;");
    expect(ends).toContain("lastCityRef.current = null;");
    expect(ends).toContain("if (inPlaceNow()) { stageRef.current = null; unfinishedScreen.current = null; setStage(null); setStageBack([]); }");
    // (quietly: closeStage stops the voice, and remember() can come after this turn's answer has started speaking)
    expect(ends).not.toContain("closeStage(");
    expect(ends).not.toContain("stopNarration(");
  });
  it("in place is read through refs by a turn in flight", () => {
    expect(src).toContain("const stageFullRef = useRef(stageFull);\n  stageFullRef.current = stageFull;");
    expect(src).toContain('const inPlaceNow = (): boolean => { const s = stageRef.current; return !!s && s.recipe === "city" && stageFullRef.current !== s.id; };');
  });
});

describe("v14 scenarios 7, routing 8: the map lane writes it for every op", () => {
  const map = handle.slice(handle.indexOf('if (f10.lane?.lane === "map") {'), handle.indexOf('if (f10.lane?.lane === "control") {'));
  it("in time and late, after the turn is remembered: what the op opened, a camera move the one before", () => {
    expect(map.match(/lastCityRef\.current = cityAfterMap\(cmd10, (?:l|line), lastCityRef\.current\);/g)?.length).toBe(2);
    expect(map).not.toContain("if (op === \"city\") lastCityRef.current");
    expect(map.lastIndexOf("lastCityRef.current = cityAfterMap(cmd10, line, lastCityRef.current);")).toBeGreaterThan(map.indexOf("remember(said, `Ask the Map: ${op}`, { doc: null });"));
  });
  it("the map's state carries the console's places and the open screen's subject", () => {
    expect(src).toContain("world: worldRef.current, subject: screenSubject(stageRef.current), trafficOpen: !!hostRef.current.c.trafficView?.open, lastCity: lastCityNow() })");
  });
});

describe("v14 routing 1: commands said about the in-place screen", () => {
  const lane = handle.slice(handle.indexOf("// the open Stage: its own commands"), handle.indexOf("// the v4 flows, before the planner"));
  it("read before the Stage's own commands, only while the screen is in place", () => {
    expect(lane).toContain("const ip = inPlaceNow() ? inPlaceCommand(said, lc) : null;");
    expect(lane.indexOf("if (ip && ipDoc) {")).toBeLessThan(lane.indexOf("if (lc) {"));
  });
  it("details, full screen, a table: the Stage opens on it (a table shown after); back: the view's own level, the screen before, else close", () => {
    expect(lane).toContain("stageFullRef.current = ipDoc.id; setStageFull(ipDoc.id);");
    expect(lane).toContain('if (ip === "view" && lc) await applyLocal(lc, lg);');
    expect(lane).toMatch(/if \(ip === "back" && v\?\.esc\.current\?\.\(\)\) \{/);
    expect(lane).toMatch(/if \(ip === "back" && stageBackRef\.current\.length\) \{ await applyLocal\(\{ op: "back" \}, lg\);/);
  });
  it("close: the view it opened closes, the screen and the card go, and it is said", () => {
    const close = lane.slice(lane.indexOf("v?.close();"), lane.indexOf("if (lc) {"));
    expect(close).toContain("closeStage();");
    expect(close).toContain('hud.set({ answer: "", panels: [], focus: null });');
    expect(close).toContain('out(VIEW_CLOSED[view][lg], lg, "ready", NO_FIGURES);');
  });
});

describe("v14 routing 5 and scenarios 8: the views themselves", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "CollectorApp.tsx"), "utf8").replace(/\r\n/g, "\n");
  const tv = fs.readFileSync(path.join(__dirname, "..", "traffic", "TrafficView.tsx"), "utf8").replace(/\r\n/g, "\n");
  const rv = fs.readFileSync(path.join(__dirname, "..", "rehearsal", "RainView.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("Live traffic opens on a zone's filter: CityOpen and openTraffic carry it, the view starts on it", () => {
    expect(app).toMatch(/export type CityOpen = \{ kind: "traffic";[^\n]*zone\?: number \| null \}/);
    expect(app).toContain("lat: o.lat ?? null, lon: o.lon ?? null, zone: o.zone ?? null }));");
    expect(app).toContain("lat: v.lat ?? null, lon: v.lon ?? null, zone: v.zone ?? null });");
    expect(tv).toMatch(/export interface TrafficStart \{[^\n]*zone\?: number \| null \}/);
    expect(tv).toContain("const [zone, setZone] = useState<number | null>(start.zone ?? null);");
  });
  it("Rain & flooding moves back to every rain in place (the bridge's \"all\")", () => {
    expect(rv).toContain('if (a.rain === "all") { setPick(null); setAllReports(false); setView({ kind: "all", zone: null });');
  });
});

describe("v14 scenarios 8: putStage does not remount a view already open on the same thing", () => {
  const put = between("const putStage = (", "const showStage = (");
  it("the same Live traffic: no dispatch; Rain open: moved in place by the bridge; else opened as before", () => {
    expect(put).toContain("const mv = cityViewMove(city.detail, { page: x0.page ?? null, traffic: x0.trafficView?.open ?? null, rain: x0.rainView?.open ?? null });");
    expect(put).toContain('const moved = mv === "same" || (mv === "bridge" && city.detail.kind === "rain" && !!mapCmd("rain", cityBridgeArgs(city.detail))?.ok);');
    expect(put).toContain('if (!moved) window.dispatchEvent(new CustomEvent("diq:open-city", { detail: city.detail }));');
  });
});
