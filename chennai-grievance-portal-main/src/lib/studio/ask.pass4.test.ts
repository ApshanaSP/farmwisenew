/**
 * QA pass 4, RC-20 (PB-001): the no-model rules of the Data Studio answer what was asked. A measure that is named is added up (not
 * counted), a plain row count is the whole file, a window that was put on silently is said, and a question the rules cannot read is
 * said to be unread, never answered with a row count. Run on the real fever sample, through the same checkPlan and engine as the route.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPlan } from "@/lib/studio/ai";
import { rulesAsk } from "@/lib/studio/ask";
import { clean } from "@/lib/studio/clean";
import { answerText, runPlan, type Names } from "@/lib/studio/engine";
import { parseFile } from "@/lib/studio/parse";
import { profileTable } from "@/lib/studio/profile";
import type { Refs } from "@/lib/studio/refs";
import { rulesSpec } from "@/lib/studio/spec";

const file = path.join(process.cwd(), "data", "studio-samples", "Fever_Surveillance_Weekly_2026.csv");
const refs: Refs = { wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() };
const names: Names = { zone: (z) => `Zone ${z}`, taluk: (t) => t, zoneOf: () => null };

function setup() {
  const t = parseFile(fs.readFileSync(file), "fever.csv");
  const profile = profileTable(t);
  const spec = rulesSpec(profile, "Fever.csv", t.caption, refs);
  // the live file has one row per hospital per week, which the route reads as a panel (the engine then reads figures in the latest week)
  spec.panelBy = spec.columns.find((x) => x.header === "Hospital")?.key ?? null;
  const c = clean(t, spec);
  const date = spec.columns.find((x) => x.role === "date")?.key;
  const area = spec.columns.find((x) => x.header === "Area")?.key;
  for (const r of c.rows) { r._d = date && typeof r[date] === "string" ? String(r[date]).slice(0, 10) : null; r._p = area ? String(r[area]) : null; }
  return { t, profile, spec, c };
}
const ask = (q: string) => {
  const { profile, spec, c } = setup();
  const out = rulesAsk(q, spec, profile, []);
  if (out.kind === "unsupported") return { out, text: out.note };
  const plan = checkPlan(out, spec, "q1");
  const panel = runPlan(c.rows, spec, plan, names);
  return { out, plan, panel, text: answerText(panel, spec), spec, rows: c.rows };
};

describe.runIf(fs.existsSync(file))("RC-20: the rules' answer is the answer to the question", () => {
  it("'how many rows' is the file's rows, not the latest week's", () => {
    const { c } = setup();
    const r = ask("how many rows are there");
    expect(r.text).toContain(String(c.rows.length));
  });
  it("a named measure is added up: 'most fever cases' is a sum of the Fever Cases column", () => {
    const r = ask("which place has the most fever cases");
    expect(r.out.agg).toBe("sum");
    expect(r.out.col).toBeTruthy();
    const total = r.panel!.values.reduce((a, b) => a + b, 0);
    // the figure is cases, so it is at least the number of rows it came from
    expect(total).toBeGreaterThan(r.panel!.rows);
  });
  it("a window put on silently is said in the answer", () => {
    const r = ask("which place has the most fever cases");
    if (r.plan!.filters.some((f) => f.op === "latest")) expect(r.text).toMatch(/latest/i);
  });
  it("a question in Tamil script that the rules cannot read says so, and does not answer with a row count", () => {
    const r = ask("எந்த மண்டலத்தில் அதிக காய்ச்சல்");
    expect(r.out.kind).toBe("unsupported");
    expect(r.text).not.toMatch(/^Case reports: 16/);
    expect(r.text).toMatch(/[஀-௿]/);
  });
  it("Tanglish with English column words is read by those words: the measure is added up, not the rows counted", () => {
    const r = ask("entha zone la fever adhigam");
    expect(r.out.agg).toBe("sum");
    expect(r.out.by).toBe("zone");
  });
  it("a question with nothing the rules can read is not answered with a row count, in any script", () => {
    expect(ask("எப்படி இருக்கிறது").out.kind).toBe("unsupported");
    expect(ask("how many rows").out.kind).not.toBe("unsupported");
  });
  it("an English question the rules read still works: total cases by area", () => {
    const r = ask("total fever cases by area");
    expect(r.out.agg).toBe("sum");
  });
});

// RC-20 class guard: on every sample file, a measure column that the question names is the measure the answer adds up.
describe("RC-20 guard: naming a measure column asks for its sum, on every sample file", () => {
  const dir = path.join(process.cwd(), "data", "studio-samples");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(csv|xlsx)$/i.test(f)) : [];
  it("there are sample files (guard on the guard)", () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(`${f}: each named measure is summed, never counted`, () => {
      const t = parseFile(fs.readFileSync(path.join(dir, f)), f);
      const profile = profileTable(t);
      const spec = rulesSpec(profile, f, t.caption, refs);
      for (const c of spec.columns.filter((x) => x.role === "measure")) {
        const out = rulesAsk(`which area has the highest ${c.label.toLowerCase()}`, spec, profile, []);
        expect(out.agg, `${f}: ${c.label}`).toBe("sum");
        expect(out.col, `${f}: ${c.label}`).toBe(c.key);
      }
    });
  }
});
