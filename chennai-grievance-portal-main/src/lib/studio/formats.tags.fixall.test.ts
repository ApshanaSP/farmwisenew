import { describe, expect, it } from "vitest";
import { kmlGrid, xmlGrid } from "@/lib/studio/formats";
import { htmlTables, parseAll } from "@/lib/studio/parse";

// reviewer5-10: the tag readers used lazy patterns (<x\b[^>]*>([\s\S]*?)<\/x>) that searched to the end of the text again for every opening
// tag with no closing one: 200 KB of unclosed <Placemark> took 2.3 s (1 MB over 20 s), 140 KB of <table> 2.6 s, 300 KB of nested XML 10 s.
// The time for twice the input must be about twice, not four times; each case is also refused well inside a second at its full size.
const ms = (f: () => unknown) => { const t = performance.now(); try { f(); } catch { /* refused: what is timed is the reading */ } return performance.now() - t; };
/** linear: doubling the input about doubles the time (a quadratic reader is x4); small times are noise, so a floor */
const linear = (make: (n: number) => string, read: (s: string) => unknown, n: number) => {
  const a = ms(() => read(make(n))), b = ms(() => read(make(2 * n))), c = ms(() => read(make(4 * n)));
  return { a, b, c, ok: c < Math.max(150, a * 8) };
};

describe("reviewer5-10: unclosed tags are read in time growing with their size, not its square", () => {
  it("a KML of unclosed <Placemark>", () => {
    const r = linear((n) => "<kml>" + "<Placemark><name>".repeat(n), kmlGrid, 12_000);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(ms(() => parseAll(Buffer.from("<kml>" + "<Placemark><name>".repeat(60_000)), "map.kml"))).toBeLessThan(1000);
  });
  it("a page of unclosed <table>, <tr> and <td>", () => {
    for (const tag of ["<table>", "<table><tr>", "<table><tr><td>"]) {
      const r = linear((n) => "<html>" + tag.repeat(n), htmlTables, 20_000);
      expect(r.ok, `${tag} ${JSON.stringify(r)}`).toBe(true);
    }
    expect(ms(() => parseAll(Buffer.from("<html>" + "<table>".repeat(100_000)), "page.html"))).toBeLessThan(1000);
  });
  it("nested and unclosed XML, comments and processing instructions", () => {
    for (const make of [(n: number) => "<a>" + "<b><c>".repeat(n) + "</c></b>".repeat(n) + "</a>", (n: number) => "<a>" + "<row><x>".repeat(n),
      (n: number) => "<a>" + "<!-- x ".repeat(n), (n: number) => "<a>" + "<?x ".repeat(n), (n: number) => "<a>" + "<b ".repeat(n)]) {
      const r = linear(make, xmlGrid, 10_000);
      expect(r.ok, `${make(1)} ${JSON.stringify(r)}`).toBe(true);
    }
  });
  it("well-formed files read as before", () => {
    const kml = `<kml><Document><Placemark><name>A</name><ExtendedData><Data name="ward"><value>12</value></Data></ExtendedData><Point><coordinates>80.2,13.0</coordinates></Point></Placemark>
      <Placemark><name>B</name><ExtendedData><SimpleData name="ward">13</SimpleData></ExtendedData><Point><coordinates>80.3,13.1</coordinates></Point></Placemark></Document></kml>`;
    expect(kmlGrid(kml)).toEqual([["Name", "ward", "Latitude", "Longitude"], ["A", 12, 13, 80.2], ["B", 13, 13.1, 80.3]]);
    const html = `<html><!-- <table><tr><td>hidden</td></tr></table> --><script>var t = "<table>";</script><table class="x"><tr><th>Ward</th><th colspan="2">Count</th></tr>
      <tr><td>1</td><td>5</td><td>6</td></tr><TR><TD>2</TD><td>7</td><td>8</td></TR></table></html>`;
    expect(htmlTables(html)).toEqual([[["Ward", "Count", "Count"], ["1", "5", "6"], ["2", "7", "8"]]]);
    const xml = `<?xml version="1.0"?><!-- list --><data><row id="1"><a>x</a><b>1</b></row><row id="2"><a>y</a><b>2</b></row><row id="3"><a>z</a><b>3</b></row><row id="4"><a>w</a><b>4</b></row></data>`;
    expect(xmlGrid(xml)).toEqual([["id", "a", "b"], [1, "x", 1], [2, "y", 2], [3, "z", 3], [4, "w", 4]]);
  });
});
