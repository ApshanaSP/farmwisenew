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
    // g-review (smaller point): this used to scan five named files. It now scans every file of src, and a digit-only reader of a zone number is allowed only in a file that also reads the number through zone-no.ts
    // (zoneNoIn, zoneNosIn or withZoneDigits), so a new reader in a new file is found.
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name) || /\.(test|live)\.tsx?$/.test(e.name) || /\.pass4\./.test(e.name)) continue;
        const s = fs.readFileSync(p, "utf8");
        if (/from "@\/lib\/zone-no"|from "\.\/zone-no"/.test(s)) continue; // the file reads the number through the one reader as well
        s.split("\n").forEach((l, i) => { if (/(?:zone|zones|மண்டலம்)(?:\s|\[ -\])[*+?]?[^`\n]{0,40}\(-?\d\{1,[234]\}\)/.test(l) && !/normalise|zoneNoIn/.test(l)) bad.push(`${path.relative(root, p)}:${i + 1}`); });
      }
    };
    walk(path.join(root, "src"));
    expect(bad, "use zoneNoIn() / zoneNosIn() (src/lib/zone-no.ts)").toEqual([]);
  });
});
