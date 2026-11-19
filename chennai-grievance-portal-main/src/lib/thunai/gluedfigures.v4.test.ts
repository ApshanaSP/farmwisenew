/**
 * Review (Phase 7, Numbers 1): a figure glued to a word ("deaths-300", "x300", "Velachery-300", "deaths-٣٠٠") was no figure to the gate's
 * reader (a letter-led code is masked whole, and a digit run after a letter is not read), so it passed stripFigures, replyOk, requestOk,
 * a clarify option's label and the model's say template, and could be shown or said as Jarvis's. Outside an incident's id and a real
 * zone's label, every digit run in a model's words is now a figure.
 */
import { describe, expect, it } from "vitest";
import { checkScreen } from "./agent";
import { WORLD } from "./fixture";
import { fillTemplate, forGate, stripFigures, zoneLabelsOut } from "./numbergate";
import { checkPlan, replyOk, requestOk, type AiPlan } from "./plan";

const ZONES = WORLD.zones.map((z) => z.n);
const GLUED = ["deaths-300", "x300", "Velachery-300", "deaths-٣٠٠", "flood347", "Adyar-௩௪௭", "km-73", "Covid-347"];
/** digits left outside an incident's id and a real zone's label */
const stray = (s: string) => /\d/.test(zoneLabelsOut(forGate(s).replace(/(?<![\p{L}\p{M}\d])INC(?:-[A-Za-z0-9_]+)+/gu, " "), ZONES));

describe("a figure glued to a word is a figure", () => {
  it("stripFigures takes it out and keeps the word, an incident's id and a real zone's label", () => {
    expect(stripFigures("flood deaths-300", ZONES)).toBe("flood deaths");
    expect(stripFigures("x300 cases", ZONES)).toBe("x cases");
    expect(stripFigures("Velachery-300 flooding", ZONES)).toBe("Velachery flooding");
    expect(stripFigures("deaths-٣٠٠ in Adyar", ZONES)).toBe("deaths in Adyar");
    expect(stripFigures("INC-2026-004 and deaths-300 in Zone 13", ZONES)).toBe("INC-2026-004 and deaths in Zone 13");
    for (const g of GLUED) {
      const s = stripFigures(`cases ${g} near the drain`, ZONES);
      expect(s == null || !stray(s), `${g} -> ${s}`).toBe(true);
    }
  });
  it("a model's free-text slot keeps no glued figure (agent.ts checkScreen)", () => {
    for (const g of GLUED) {
      const sc = checkScreen({ recipe: "cases", q: `flood ${g} Velachery`, name: null, zones: [], period: null }, WORLD, null);
      expect(sc?.slots.q == null || !stray(String(sc.slots.q)), `${g}: ${sc?.slots.q}`).toBe(true);
    }
  });
  it("a reply, a clarify option's request and its label with a glued figure are refused", () => {
    for (const g of GLUED) {
      expect(replyOk(`Showing ${g} for you.`, "show the flood cases", [], ZONES), g).toBe(false);
      expect(requestOk(`show the ${g} cases`, "show the flood cases", ZONES), g).toBe(false);
    }
    // the Collector's own figure, a real zone's label and an incident's id stay allowed
    expect(replyOk("Zone 13 it is.", "show zone 13", [{ a: "view", view: { zone: 13 } }], ZONES)).toBe(true);
    expect(requestOk("open INC-2026-004", "open that case", ZONES)).toBe(true);
    const p = checkPlan({ kind: "clarify", lang: "en", reply: "Which one?", steps: [], options: [
      { label: "deaths-300", request: "show the flood deaths" }, { label: "Velachery", request: "show Velachery-300 cases" },
      { label: "Adyar", request: "show the cases in Adyar" }, { label: "Ambattur", request: "show the cases in Ambattur" }] } as AiPlan, WORLD, "show the flood cases");
    expect(p.kind).toBe("clarify");
    if (p.kind === "clarify") expect(p.options.map((o) => o.label)).toEqual(["Adyar", "Ambattur"]);
  });
  it("a say template with a glued figure of the model's is refused whole (fillTemplate)", () => {
    expect(fillTemplate("Velachery-300 deaths; {n:f1} open.", { f1: 4 }, ZONES)).toBeNull();
    expect(fillTemplate("x300 and {n:f1} open.", { f1: 4 }, ZONES)).toBeNull();
    expect(fillTemplate("Zone 13 has {n:f1} open; see INC-2026-004.", { f1: 4 }, ZONES)).toBe("Zone 13 has 4 open; see INC-2026-004.");
  });
});
