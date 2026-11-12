// QA pass 4, fixer G2, RC-05 and RC-07 (PB-288, PB-289, PB-298): a zone named by number is the same zone however the number is said.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { zoneNoIn } from "./zone-no";

const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const TA = ["", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து", "பதினொன்று", "பன்னிரண்டு", "பதிமூன்று", "பதினான்கு", "பதினைந்து"];

describe("zoneNoIn", () => {
  it("every zone: digits, a word, 'number', the Tamil letters, a Tamil digit and Tanglish are one number", () => {
    const bad: string[] = [];
    for (let n = 1; n <= 15; n++) {
      for (const t of [`zone ${n}`, `Zone ${WORDS[n]}`, `show zone number ${n} please`, `zone-${n}`, `மண்டலம் ${n}`, `மண்டலம் ${TA[n]}`, `மண்டலத்தில் ${n}`]) if (zoneNoIn(t) !== n) bad.push(`${t} -> ${zoneNoIn(t)}`);
    }
    expect(bad).toEqual([]);
  });
  it("a sentence with no zone number, or a number that is not a zone's, is not one", () => {
    expect(zoneNoIn("severe complaints in Adyar")).toBeNull();
    expect(zoneNoIn("5 zones")).toBeNull();
    expect(zoneNoIn(null as never)).toBeNull();
    expect(zoneNoIn("zone")).toBeNull();
  });
  it("class guard: no reader of a zone number in the assistant or the console lanes takes digits only", () => {
    const root = path.resolve(__dirname, "..", "..");
    const bad: string[] = [];
    for (const f of ["src/lib/assistant/compare.ts", "src/lib/assistant/guard.ts", "src/lib/assistant/pipeline.ts", "src/lib/assistant/tools.ts", "src/lib/thunai/quick.ts"]) {
      fs.readFileSync(path.join(root, f), "utf8").split("\n").forEach((l, i) => { if (/(?:zone|மண்டலம்)\s\*[^`\n]{0,30}\(\d\{1,2\}\)/.test(l) && !/normalise|zoneNoIn/.test(l)) bad.push(`${f}:${i + 1}`); });
    }
    expect(bad, "use zoneNoIn() (src/lib/zone-no.ts)").toEqual([]);
  });
});
