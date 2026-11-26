/**
 * v13 (21 Nov review of v12's city routing), Thunai.tsx and Hud.tsx, read from the source as the v4 to v12 wiring tests do (the loop needs a
 * browser and a console to run):
 *   - finding 1 6: a city screen shows in place on the Overview's map, its answer in the HUD's corner card; the opaque full-screen Stage is not
 *     mounted over it (the owner never saw the map view behind it). The card's Details tap opens the Stage on that same screen;
 *   - finding 1 7: what "show me in the map" reopens is the last city answer's slots (topic, focus, rain, spot);
 *   - finding 0 9: the rules fallback opens a city screen only for what the server's fast lane would (cityQuick and its bail-outs).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\r\n/g, "\n");
const src = read("Thunai.tsx");
const hudSrc = read("Hud.tsx");
const between = (s: string, a: string, b: string) => { const i = s.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = s.indexOf(b, i + a.length); return s.slice(i, j < 0 ? undefined : j); };

describe("v13 finding 1 6: the city screen in place, the Stage only on Details", () => {
  it("a city screen is in place unless its Details opened it full", () => {
    expect(src).toContain("const [stageFull, setStageFull] = useState<string | null>(null);");
    expect(src).toContain('const stageInPlace = !!stage && stage.recipe === "city" && stageFull !== stage.id;');
  });
  it("the Stage is not mounted for it, and the HUD's corner card and reticle stay (stageOpen false)", () => {
    expect(src).toContain("{on && stage && !stageInPlace && (\n        <Stage doc={stage}");
    expect(src).toMatch(/<Hud lang=\{listenLang\} coreRef=\{orbRef\} stageOpen=\{!!stage && !stageInPlace\}/);
    expect(hudSrc).toContain("{!stageOpen && !pill && (s.answer || panel) && <AnswerCorner");
    expect(hudSrc).toContain("{!stageOpen && <Reticle />}");
  });
  it("putStage opens the city view with the console's drawer and chatbot out of the way, or full when its Details asked", () => {
    const put = between(src, "const putStage = (", "const showStage = (");
    const city = put.slice(put.indexOf("if (city) {"));
    expect(city).toMatch(/if \(fw && Date\.now\(\) - fw\.at < 20_000 && fw\.q === String\(doc\.slots\.q \?\? "all"\)\) setStageFull\(doc\.id\);\n\s*else \{ const x = hostRef\.current\.c; x\.closeAll\?\.\(\); x\.setAsk\?\.\(false\); \}/);
    expect(city.indexOf("setStageFull(doc.id)")).toBeLessThan(city.indexOf('window.dispatchEvent(new CustomEvent("diq:open-city"'));
  });
  it("the corner card's Details sends the screen's id with full; Thunai opens that same screen full, or builds it again full", () => {
    expect(hudSrc).toContain('const city = p?.recipe === "city";');
    expect(hudSrc).toMatch(/detail: \{ id: p\.id, recipe: p\.recipe, slots: p\.slots, title: p\.title, \.\.\.\(city \? \{ full: true \} : \{\}\) \}/);
    expect(hudSrc).toContain('{city ? (ta ? "விவரங்கள்" : "Details") : (ta ? "முழுத் திரையில் பார்" : "Open full screen")}');
    const pin = between(src, "// a pinned screen's chip on the Overview", 'window.addEventListener("jarvis:open-pin", f);');
    expect(pin).toMatch(/if \(p\.recipe === "city" && p\.full\) \{\n\s*const cur = stageRef\.current;\n\s*if \(cur\?\.recipe === "city" && cur\.id === p\.id\) \{ setStageFull\(cur\.id\); return; \}\n\s*fullWanted\.current = \{ q: String\(p\.slots\?\.q \?\? "all"\), at: Date\.now\(\) \};/);
    expect(pin.indexOf("fullWanted.current =")).toBeLessThan(pin.indexOf("void directStage("));
  });
});

describe("v13 finding 1 7: the last city answer's slots", () => {
  it("the ref keeps the slots; putStage and the map lane write them", () => {
    expect(src).toContain("const lastCityRef = useRef<CityLast | null>(null);");
    expect(src).toContain("lastCityRef.current = city ? lastCitySlotsOf(withDrafts) : null;");
    // (v14, review 13 routing 8 and scenarios 7: the map lane writes it for every op, through mapops.ts cityAfterMap, which keeps cityShownBy)
    expect(src.match(/lastCityRef\.current = cityAfterMap\(cmd10, (?:l|line), lastCityRef\.current\);/g)?.length).toBe(2);
    expect(src).not.toMatch(/lastCityRef\.current = cmd10\.topic/);
  });
});

describe("v13 finding 0 9: the rules fallback reads cityQuick", () => {
  it("a city screen only for the fast lane's city sentences, with its slots (zones too)", () => {
    expect(src).toContain("const cq = ca ? cityQuick(said, worldRef.current, { lastCity: lastCityNow() }) : null;");
    expect(src).toMatch(/if \(ca && cq && \(rules\.kind === "unknown" \|\| cityAsFilter\)\) \{[\s\S]{0,300}await directStage\("city", cq\.slots,/);
  });
});
