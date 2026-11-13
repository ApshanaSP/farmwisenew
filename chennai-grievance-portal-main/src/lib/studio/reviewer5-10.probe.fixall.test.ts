// reviewerF-03 (on reviewer5-10, 346f1f08): elements() remembered a name whose closing tag is missing, so a run of the SAME unclosed tag was
// read in one pass. xmlGrid reads each record's fields with elements(inner, "[A-Za-z_][\w.:-]*"), where every field name is new: a record of
// many DIFFERENT unclosed fields (<f0><f1>...<fN>) built a new closing pattern per name and searched to the end of the record for each, so
// the time grew with the square of the record again. Many distinct CLOSED fields hit a second square step, the column list searched per
// field (and the same in a KML's Data names). Four times the input must take about four times as long, not sixteen.
import { describe, expect, it } from "vitest";
import { kmlGrid, xmlGrid } from "@/lib/studio/formats";

const ms = (f: () => unknown) => { const t = performance.now(); try { f(); } catch { /* refused: what is timed is the reading */ } return performance.now() - t; };
/** linear: four times the input about four times the time (a square reader is x16); small times are noise, so a floor */
const linear = (make: (n: number) => string, read: (s: string) => unknown, n: number) => {
  const a = ms(() => read(make(n))), c = ms(() => read(make(4 * n)));
  return { a, c, bytes: make(4 * n).length, ok: c < Math.max(150, a * 8) };
};
const fields = (n: number, closed: boolean) => Array.from({ length: n }, (_, k) => (closed ? `<f${k}>${k}</f${k}>` : `<f${k}>`)).join("");
/** three records (so <r> is the record), each holding n differently named fields */
const records = (closed: boolean) => (n: number) => { const f = fields(n, closed); return `<d> list <r>${f}</r> <r>${f}</r> <r>${f}</r> </d>`; };

describe("reviewerF-03 (reviewer5-10): XML records of distinct fields are read in time growing with their size", () => {
  it("distinct unclosed fields: four times the input, about four times the time", () => {
    const r = linear(records(false), xmlGrid, 6000);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  }, 180_000);
  it("distinct closed fields: four times the input, about four times the time", () => {
    const r = linear(records(true), xmlGrid, 6000);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  }, 180_000);
  it("a KML place with many distinct Data names", () => {
    const make = (n: number) => `<kml><Placemark><name>A</name>${Array.from({ length: n }, (_, k) => `<Data name="d${k}"><value>${k}</value></Data>`).join("")}</Placemark></kml>`;
    const r = linear(make, kmlGrid, 6000);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  }, 180_000);
  it("records read as before: columns in first-seen order, a missing field empty, a field named like an object key", () => {
    const xml = `<d> <r id="1"><a>x</a><constructor>c</constructor></r><r id="2"><b>2</b><a>y</a></r><r id="3"><a>z</a><b>3</b><c>unclosed</r><r id="4"><B>4</B></r></d>`;
    expect(xmlGrid(xml)).toEqual([["id", "a", "constructor", "b", "B"], [1, "x", "c", null, null], [2, "y", null, 2, null], [3, "z", null, 3, null], [4, null, null, null, 4]]);
  });
});
