// reviewer5 probe (P6-018 brief: other small inputs that hold the server thread in parse.ts). In-process, sizes kept small so the probe ends.
//  - the news-feed test regex at parse.ts:102 backtracks exponentially on XML comments: each extra "<!-- a -->" about doubles the time
//    (scratch runs: 20 comments 0.2 s, 24 comments 4.5 s, 26 comments 12.3 s; a 300-byte upload or fetched page)
//  - an unclosed <Placemark> run (KML) and a run of <table> (HTML) grow much faster than their size
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/reviewer5/parse-slow.test.ts
import { describe, expect, it } from "vitest";
import { parseAll } from "@/lib/studio/parse";

const timed = (buf: Buffer, name: string) => { const t = Date.now(); let res = ""; try { res = `OK ${parseAll(buf, name).length}`; } catch (e) { res = `ERR ${(e as Error).message.slice(0, 80)}`; } return { ms: Date.now() - t, res }; };

describe("reviewer5: small inputs that hold parseAll", () => {
  it("an XML file of 24 comments then records (337 bytes) is read in under 1 s", () => {
    const xml = "<?xml version=\"1.0\"?>\n" + "<!-- a -->\n".repeat(24) + "<data><row><a>1</a></row><row><a>2</a></row></data>";
    const r = timed(Buffer.from(xml), "list.xml");
    console.log("24 comments,", xml.length, "bytes:", r);
    expect(r.ms).toBeLessThan(1000);
  }, 60_000);
  it("a 200 KB KML with unclosed Placemarks is refused in under 1 s", () => {
    const r = timed(Buffer.from("<kml>" + "<Placemark><name>".repeat(12000)), "map.kml");
    console.log("KML 200 KB:", r);
    expect(r.ms).toBeLessThan(1000);
  }, 60_000);
  it("a 140 KB page of <table> tags is refused in under 1 s", () => {
    const r = timed(Buffer.from("<html>" + "<table>".repeat(20000)), "page.html");
    console.log("HTML 140 KB:", r);
    expect(r.ms).toBeLessThan(1000);
  }, 60_000);
});
