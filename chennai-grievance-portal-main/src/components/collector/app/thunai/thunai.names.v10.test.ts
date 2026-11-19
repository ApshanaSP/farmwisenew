/**
 * v10 review 2 (names): the confirm flow's and the cut-off wait's wiring in Thunai.tsx, read from the source as the v5, v7, v9 and v10 reading
 * tests do.
 *   - finding 24: a Tamil "no" (இல்லை, இல்ல, வேண்டாம்) to "Akvan புயலா?" is a no: the pattern's trailing \b never matched after a Tamil letter.
 *   - finding 19: the lanes know a typed line from a spoken one (a typed line is finished when Enter is pressed, so it never waits for its rest).
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8");
const handle = src.slice(src.indexOf("const handle = async"), src.indexOf("const handleRef = useRef(handle)"));
const confirm = handle.slice(handle.indexOf("const cf = confirmRef.current;"), handle.indexOf("// the next step offered after a screen"));
const front = handle.slice(handle.indexOf("const f10 = v10Front(said"), handle.indexOf('if (f10.lane?.lane === "wait")'));

describe("v10 review 2: a Tamil no to the confirm (finding 24)", () => {
  const m = /if \(\/(\^\(\?:no\|nope\|not that[^/]+)\/iu\.test\(said\)\)/.exec(confirm);
  it("the confirm block has its no pattern", () => expect(m).not.toBeNull());
  it.each(["இல்லை", "இல்ல", "வேண்டாம்", "இல்லை.", "இல்ல, வேற", "no", "No, the other one", "vendaam"])("'%s' is a no", (s) => {
    expect(new RegExp(m![1], "iu").test(s)).toBe(true);
  });
  it.each(["nobody told me", "illaiyaam", "இல்லையாம்", "notice the Adyar one"])("'%s' is not", (s) => {
    expect(new RegExp(m![1], "iu").test(s)).toBe(false);
  });
});

describe("v10 review 2: the lanes know a typed line (finding 19)", () => {
  it("handle() passes the turn's source into v10Front", () => {
    expect(front).toMatch(/source: sourceRef\.current/);
    expect(handle.indexOf("sourceRef.current = opts.source")).toBeLessThan(handle.indexOf("const f10 = v10Front(said"));
  });
});
