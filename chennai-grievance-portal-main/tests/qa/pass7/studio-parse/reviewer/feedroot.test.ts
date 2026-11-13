/**
 * Reviewer probe (QA pass 7, studio-parse), kept as a regression test: feedRoot() is linear and answers as intended.
 *  - A run of DOCTYPEs made each one search to the end of the file for "[" (500 KB 712 ms, 2 MB 12 s): "[" is now looked for only before
 *    the DOCTYPE's first ">".
 *  - Where it differs from the old pattern, on purpose: a feed with an <?xml-stylesheet?> line or a DOCTYPE (RSS 0.91) is a feed; text
 *    between two comments before <rss> is not a prolog (the old pattern accepted it only by letting a comment run across "-->").
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer/feedroot.test.ts < /dev/null
 */
import { expect, it } from "vitest";
import { feedRoot, parseAll } from "@/lib/studio/parse";

it("feedRoot is linear: a prolog of DOCTYPEs with no '['", () => {
  const ms: Record<string, number> = {};
  for (const kb of [500, 1000, 2000]) {
    const t = "<!DOCTYPE a>".repeat(Math.floor((kb * 1024) / 12)) + "<data/>";
    const t0 = performance.now(); feedRoot(t); ms[kb] = Math.round(performance.now() - t0);
  }
  console.log("feedRoot DOCTYPEs ms by KB:", ms);
  expect(ms[2000]).toBeLessThan(ms[500] * 6 + 50);
  expect(ms[2000]).toBeLessThan(500);
}, 120_000);

it("feedRoot's answers where it differs from the old pattern are the intended ones", () => {
  expect(feedRoot("<!-- a --> junk <!-- b --><rss version=\"2.0\">")).toBe(false);
  expect(feedRoot("<?xml version=\"1.0\"?>\n<?xml-stylesheet type=\"text/xsl\" href=\"/feed.xsl\"?>\n<rss version=\"2.0\">")).toBe(true);
  const rss091 = "<!DOCTYPE rss PUBLIC \"-//Netscape//DTD RSS 0.91//EN\" \"http://my.netscape.com/publish/formats/rss-0.91.dtd\">\n<rss version=\"0.91\">";
  expect(feedRoot(rss091)).toBe(true);
  expect(feedRoot("<?xml version=\"1.0\"?><!-- x --><feed xmlns=\"http://www.w3.org/2005/Atom\">")).toBe(true);
  expect(parseAll(Buffer.from(rss091 + "<channel><title>GCC</title><item><title>a</title></item><item><title>b</title></item></channel></rss>"), "news.xml")[0].format).toBe("feed");
});
