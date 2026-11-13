/**
 * QA pass 7 (desk-and-accounts), officer-day-02: src/lib/manu/grade.ts grades a website complaint by the pipeline's rules. This test reads
 * the pipeline's own files (district_intel/reference/category_map.yaml, dintel/textproc.py, dintel/severity.py, dintel/refdata.py) and fails
 * when the copy in grade.ts no longer matches them, so a change to the pipeline's rules cannot leave the live cases behind unnoticed.
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/desk-and-accounts/grade.test.ts
 */
import fs from "fs";
import path from "path";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import * as G from "@/lib/manu/grade";

const PIPE = path.resolve(process.cwd(), "..", "district_intel");
const read = (p: string) => fs.readFileSync(path.join(PIPE, p), "utf8");

/** the r"..." pieces of NAME = re.compile(r"..." r"...", re.I) in a Python file, joined */
function pySource(src: string, name: string): string {
  const at = src.indexOf(`${name} = re.compile(`);
  if (at < 0) throw new Error(`${name} not found`);
  const body = src.slice(at, src.indexOf(", re.I)", at));
  return [...body.matchAll(/r"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
}

describe("officer-day-02: grade.ts is the pipeline's rules", () => {
  const cmap = YAML.parse(read("reference/category_map.yaml")).grievance;
  const textproc = read("dintel/textproc.py");

  it("the category crosswalk is category_map.yaml's grievance section", () => {
    expect(G.SUBTYPE).toEqual(cmap.subtype);
    expect(G.TYPE).toEqual(cmap.type);
    expect(G.SUBTYPE_REGEX.map(([rx, code]) => [rx.source, rx.flags, code])).toEqual(
      cmap.subtype_regex.map((r: { pattern: string; code: string }) => [r.pattern.replace(/^\(\?i\)/, ""), r.pattern.startsWith("(?i)") ? "i" : "", r.code]));
  });

  for (const name of ["HIGH_RISK_SUB", "ELEVATED_SUB", "LOW_SUB", "TEXT_HAZARD", "REPEAT"] as const) {
    it(`${name} is textproc.py's`, () => {
      expect(G.PY[name]).toBe(pySource(textproc, name));
      expect(G[name].flags).toContain("i");
    });
  }

  it("VULNERABLE is textproc.py's", () => {
    const block = textproc.slice(textproc.indexOf("VULNERABLE = ["), textproc.indexOf("]\n", textproc.indexOf("VULNERABLE = [")));
    const py = [...block.matchAll(/\("(\w+)", re\.compile\(r"((?:[^"\\]|\\.)*)", re\.I\)\)/g)].map((m) => [m[1], m[2]]);
    expect(G.PY.VULNERABLE).toEqual(py);
  });

  it("the score and its levels are severity.py's grievance() and refdata.py's severity_level", () => {
    const sev = read("dintel/severity.py"), ref = read("dintel/refdata.py");
    for (const s of ["score = 35", "score = 5", "score = 25", "score = 15", "score += 15", "min(8 * len(vul), 24)", "score += 10", 'cat == "Flood"', 'cat in ("Tax and Licence", "Voter ID")'])
      expect(sev, s).toContain(s);
    for (const s of ["if score >= 70:\n        return \"Severe\"", "if score >= 50:\n        return \"High\"", "if score >= 30:\n        return \"Medium\""]) expect(ref.replace(/\r\n/g, "\n"), s).toContain(s);
    expect([G.levelOf(70), G.levelOf(69), G.levelOf(50), G.levelOf(49), G.levelOf(30), G.levelOf(29)]).toEqual(["Severe", "High", "High", "Medium", "Medium", "Low"]);
    expect(ref).toContain('"sla_severe_h": c["sla_h"][0], "sla_high_h": c["sla_h"][1]');
  });

  it("the row's two examples: a sparking EB wire is High, a garbage removal Low", () => {
    expect(G.gradeGrievance({ type: "Flood", subtype: "EB wire cut/Spark seen", title: "Spark", text: "live wire hanging" }).level).toBe("High");
    expect(G.grievanceCategory("Flood", "EB wire cut/Spark seen")).toBe("STREETLIGHT_ELECTRICAL");
    expect(G.gradeGrievance({ type: "Garbage", subtype: "Removal of Garbage", title: "Garbage", text: "not cleared" }).level).toBe("Low");
    expect(G.grievanceCategory("Garbage", "Removal of Garbage")).toBe("SOLID_WASTE");
    expect(G.grievanceCategory("Road and Footpath", "Big pothole on main road")).toBe("ROAD_DAMAGE");
    expect(G.grievanceCategory("Other", "Other / not listed above")).toBe("OTHER");
  });
});

describe("officer-day-02, pass 7 reviewer 2: grade.ts reads text as the pipeline does", () => {
  it("\b and \d mean what Python 3 makes them mean: 'UPHCக்கு' is not a UPHC, '௩ times' is a number of times", () => {
    expect(G.gradeGrievance({ type: "Public Health", subtype: "Street Dogs", title: "Dogs", text: "Dogs biting people near UPHCக்கு அருகில்" }).score).toBe(25);
    expect(G.gradeGrievance({ type: "Public Health", subtype: "Street Dogs", title: "Dogs", text: "Dogs biting people near the UPHC" }).score).toBe(33);
    expect(G.gradeGrievance({ type: "Garbage", subtype: "Removal of Garbage", title: "Garbage", text: "complained ௩ times, nothing done" }).score).toBe(35);
  });
  it("a title that is only the sub-type is graded as the pipeline's loader rewrites it, with the street: 'Street Dogs' on Kovil Street is Medium", () => {
    expect(G.pipelineTitle("Street Dogs", "Street Dogs", "kovil street", 70)).toBe("Street Dogs, Kovil Street, Ward 70");
    expect(G.pipelineTitle("Dogs chasing kids", "Street Dogs", "Kovil Street", 70)).toBe("Dogs chasing kids");
    const g = G.gradeGrievance({ type: "Public Health", subtype: "Street Dogs", title: G.pipelineTitle("Street Dogs", "Street Dogs", "Kovil Street", 70), text: "Dogs everywhere" });
    expect([g.score, g.level]).toEqual([33, "Medium"]);
  });
});
