/**
 * Reviewer probe (QA pass 7, studio-parse): visibleText and dropComments against the patterns they replaced, on random pages built from the
 * pieces that matter (block names in any case, unclosed tags, "<>", comment marks), and their time on hostile pages.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer/equiv.test.ts < /dev/null
 */
import { expect, it } from "vitest";
import { visibleText, dropComments } from "@/lib/studio/connect/discover";

const OLDVT = (html: string) => html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const OLDDC = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");
const PIECES = ["<", ">", "/", "<script", "<SCRIPT", "</script>", "</Script>", "<style", "</style>", "<svg", "</svg>", "<noscript>", "</noscript>", "<template", "</template>",
  "<scripts", "<svg-x", "<s", "<t", "<n", "a", " ", "\n", "<>", "<!--", "-->", "--", "<!-->", "x", "é", "<script>", "</script >", "<style\u00e9", "<SVG", "</SVG>", "<script_", "<template1"];
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

it("visibleText and dropComments give what the old patterns gave (20 000 random pages)", () => {
  const bad: { html: string; old: string; now: string; f: string }[] = [];
  for (let i = 0; i < 20_000 && bad.length < 5; i++) {
    const html = Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => PIECES[Math.floor(rnd() * PIECES.length)]).join("");
    const a = OLDVT(html), b = visibleText(html);
    if (a !== b) bad.push({ f: "visibleText", html, old: a, now: b });
    const c = OLDDC(html), d = dropComments(html);
    if (c !== d) bad.push({ f: "dropComments", html, old: c, now: d });
  }
  console.log("differences:", bad);
  expect(bad).toEqual([]);
});

it("visibleText and dropComments stay fast on 3 MB hostile pages", () => {
  const ms: Record<string, number> = {};
  for (const [k, s] of Object.entries({ comments: "<!--", scripts: "<script ", lt: "<", mixed: "<script></style><style></script>", svgClosedLate: "<svg>" })) {
    const page = s.repeat(Math.floor(3e6 / s.length)) + (k === "svgClosedLate" ? "</svg>" : "");
    const t0 = performance.now(); visibleText(page); dropComments(page); ms[k] = Math.round(performance.now() - t0);
  }
  console.log("3 MB pages ms:", ms);
  expect(Math.max(...Object.values(ms))).toBeLessThan(2000);
}, 120_000);
