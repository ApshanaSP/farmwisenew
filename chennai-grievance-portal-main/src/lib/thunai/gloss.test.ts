import { describe, expect, it } from "vitest";
import { gloss } from "./gloss";

describe("gloss: Tanglish and spoken Tamil, word by word", () => {
  it("glosses Tanglish, reading -la as 'in'", () => {
    expect(gloss("konjam last 24 hours-la evlo mazhai peidhirukku nu sollu")).toBe("[a little/please] last 24 hours [in] [how many/how much] [rain] peidhirukku nu [tell]");
    expect(gloss("naalaiku semma mazhai vandha endha areas mudhal-la moozhgum?")).toContain("[tomorrow] [very heavy] [rain] [if it comes] [which]");
  });
  it("glosses Tamil script by stem, so case endings still match", () => {
    expect(gloss("தண்ணி தேங்குற புகார் இந்த மாசம் ஏறியிருக்கா, இறங்கியிருக்கா?")).toBe("[water] [waterlogging] [complaint] இந்த [month] [has it gone up] [has it gone down]");
    expect(gloss("மெட்ரோ வாட்டர் கிட்ட எவ்வளவு கேஸ் பெண்டிங்ல இருக்கு?")).toContain("[Metro Water (CMWSSB)]");
  });
  it("leaves plain English alone", () => {
    expect(gloss("show me the severe cases in Adyar")).toBeNull();
    expect(gloss("compare Manali and Madhavaram for the last month")).toBeNull();
  });
});
