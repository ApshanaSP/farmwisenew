/**
 * v10 (reading, JARVIS_V10.md 4.5 and 4.9 feature 1): the news brief's wiring in Thunai.tsx, read from the source as the v5, v7 and v9 tests do.
 * The brief's offer is kept for the next turn only and forgotten on any other; a reply runs through the console's own paths (Ask the Map, the
 * tray, the follow flow and its yes, the news route); a draft needs the level-C gate and only fills the tray; "read it fully" carries `full`.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8");
const turn = src.slice(src.indexOf("const newsTurn = async"), src.indexOf("const draftMany = async"));
const handle = src.slice(src.indexOf("const handle = async"), src.indexOf("const handleRef = useRef(handle)"));
const hook = handle.slice(handle.indexOf("const nOffer = newsOffer.current;"), handle.indexOf("// v6 (Phase 4): the report on screen read"));

describe("v10 reading: Thunai.tsx", () => {
  it("one pending offer, taken from the ref as each sentence comes (forgotten on any other turn), before v10's and v8's lanes", () => {
    expect(hook).toMatch(/const nOffer = newsOffer\.current;\s*newsOffer\.current = null;/);
    // (v12, 21 Nov: v10's lanes run through one helper, front10; the provisional check before a turn starts reads only its wait lane)
    expect(handle.indexOf("const f10 = front10(said);")).toBeGreaterThan(-1);
    expect(handle.indexOf("const nOffer = newsOffer.current;")).toBeLessThan(handle.indexOf("const f10 = front10(said);"));
    // (v10 review 2, round 2: with the console's world, so a locality named elsewhere, in any script, is told from the story's own)
    expect(hook).toMatch(/offerAct\(said, nOffer, Date\.now\(\), worldRef\.current\)/);
  });
  it("each reply goes the console's own way: the map step, the tray (level C), the follow flow (level B, its yes), the news route", () => {
    expect(hook).toMatch(/await run\(\[\{ a: "map", q: oa\.q \}\], lg, said, "rules"\)/);
    expect(hook).toMatch(/if \(needsName\("C", lg\)\) return; await draftMany\(oa\.ids, lg\);/);
    expect(hook).toMatch(/if \(needsName\("B", lg\)\) return; askFollow\(\{ op: "follow", kind: "zone", ref: oa\.zone, name: oa\.name \}, said, lg\)/);
    expect(hook).toMatch(/\{ kind: "read", body: \{ id: oa\.id \}, full: true \}/);
    expect(hook).toMatch(/\{ kind: "ground", body: \{ ground: \{ id: oa\.id, lang: lg/);
    // Jarvis never sends: nothing in the hook sends or approves
    expect(hook).not.toMatch(/sendTray|confirmTray|approve/i);
  });
  it("newsTurn keeps the offer the route sent, draws the ground truth's cases, and sends `full` for \"read it fully\"", () => {
    expect(turn).toMatch(/e\.type === "offer"\) \{[\s\S]*?st\.offer = newsOfferOf\(e, lang, Date\.now\(\)\);/);
    expect(turn).toMatch(/e\.type === "ground"\) \{[\s\S]*?st\.ground = \{ rows: g\.rows/);
    expect(turn).toMatch(/st\.ground \? groundScreen\(/);
    expect(turn).toMatch(/na\.full \|\| fullRead\(heardText\) \? \{ full: true \} : \{\}/);
    expect(turn).toMatch(/newsOffer\.current = st\.offer;/);
  });
});
