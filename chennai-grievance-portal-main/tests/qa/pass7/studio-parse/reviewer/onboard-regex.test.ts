/**
 * Reviewer probe (QA pass 7, studio-parse), kept as a regression test: the feed pattern reviewer5-09 found exponential was replaced in
 * parse.ts but a copy stayed in src/lib/collector/onboard.ts kindOf(), on the server's thread for every link a Collector onboards (26
 * comments, 429 bytes: 2.8 s, about 4x for every 2 more). kindOf() now calls feedRoot (connect/links.ts). kindOf() is not exported: the
 * source is checked for the call and for the old pattern, and feedRoot is timed on the reviewer's input.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer/onboard-regex.test.ts < /dev/null
 */
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { feedRoot } from "@/lib/studio/connect/links";
import { commentsXml } from "../files";

it("onboard.ts kindOf() decides a feed with feedRoot, not the backtracking pattern, and stays fast on a run of comments", () => {
  const src = fs.readFileSync(path.resolve("src/lib/collector/onboard.ts"), "utf8");
  expect(src).not.toContain(/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)\b/i.toString());
  expect(src).toMatch(/\|\| feedRoot\(head\)\) return "rss";/);
  const ms: Record<number, number> = {};
  for (const n of [26, 70]) {
    const head = commentsXml(n).toString("utf8").slice(0, 800).trimStart();
    const t0 = performance.now(); expect(feedRoot(head)).toBe(false); ms[n] = performance.now() - t0;
  }
  console.log("feedRoot on the onboarding head, ms by comment count:", ms);
  expect(ms[70]).toBeLessThan(50);
});
