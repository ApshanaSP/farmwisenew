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

describe("v10 review 2, round 2: a no the speech-to-text ends with an ellipsis or a dash is a no (finding 24)", () => {
  // v10 review 2, round 2: the lookahead allowed only a space, a comma, . ! ? or the end after the no, narrower than the \b it replaced for Latin
  // text: "No…", "No-" were taken as a new request; the no now ends at anything that is no letter, mark or digit
  const m = /if \(\/(\^\(\?:no\|nope\|not that[^/]+)\/iu\.test\(said\)\)/.exec(confirm);
  it.each(["No…", "No-", "Nope…", "No—", "no;", "No:", "இல்லை…", "இல்ல-", "வேண்டாம்…", "illa…", "Not that…"])("'%s' is a no", (s) => {
    expect(new RegExp(m![1], "iu").test(s)).toBe(true);
  });
  it.each(["nobody told me", "illaiyaam", "இல்லையாம்", "notice the Adyar one", "Nopes", "no1", "nothing yet"])("'%s' is not", (s) => {
    expect(new RegExp(m![1], "iu").test(s)).toBe(false);
  });
});

describe("v10 review 2, round 2: the wake word's spoken rest is spoken, not typed (finding 19)", () => {
  // v10 review 2, round 2: the on-device wake path called handleRef.current(rest, 0.95) with no source, so handle() took the same-breath rest
  // ("Hey Jarvis, tell me about the") for typed text, and it skipped the cut-off and one-word waits
  const wake = src.slice(src.indexOf("const woke = (rest: string) =>"), src.indexOf("const named = (w: WakeEars) =>"));
  it("the wake path hands its rest over as the browser's speech (captions)", () => {
    expect(wake).toMatch(/handleRef\.current\(rest, 0\.95, undefined, \{ source: "captions" \}\)/);
    expect(wake).not.toMatch(/handleRef\.current\(rest, 0\.95\)/);
  });
  it("every handleRef call in the wake path says how the words came", () => {
    const calls = wake.match(/handleRef\.current\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/source: "(?:captions|whisper)"/);
  });
});
