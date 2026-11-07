// QA pass 4, lane c skeptic: breaks found in the lane c fixes. Each is it.fails: it stays green while the bug is open, and the fixer changes it to it().
// Run: npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/c-skeptic.test.ts
import { describe, expect, it } from "vitest";
import { asksForbidden, asksPrivate, redactText } from "@/lib/thunai/privacy";
import { lineProblem } from "@/lib/thunai/exitgate";
import fs from "node:fs";
import path from "node:path";
import { looksLikePlaceholder } from "@/lib/secrets";
import { localOnly } from "@/lib/thunai/devguard";
import { rulesAsk } from "@/lib/studio/ask";
import { parseFile } from "@/lib/studio/parse";
import { profileTable } from "@/lib/studio/profile";
import type { Refs } from "@/lib/studio/refs";
import { rulesSpec } from "@/lib/studio/spec";

const ctx = { records: [] as string[] };

describe("CSK-1 RC-18 exit gate: a filer named at the start of a sentence (the rules have no case-insensitive flag)", () => {
  for (const t of ["Filed by Ramesh Kumar", "Reported by Priya Raman of Adyar", "Raised by Priya"]) {
    it.fails(`CSK-1 names the filer: ${t}`, () => expect(lineProblem(t, ctx)).not.toBeNull());
  }
  for (const t of ["Door No 5, Anna Salai", "House No 12", "Flat 4B, Gandhi Nagar, Adyar"]) {
    it.fails(`CSK-1 a private address with a capital: ${t}`, () => expect(lineProblem(t, ctx)).not.toBeNull());
  }
});

describe("CSK-2 RC-19 exit gate: Tanglish and Tamil filers the shapes do not read", () => {
  for (const t of ["Ramesh dhaan indha complaint kuduthaar", "indha complaint Ramesh kuduthaar", "புகார் ரமேஷ் குமார் என்பவரால் கொடுக்கப்பட்டது", "இந்த புகாரை ரமேஷ் என்பவர் கொடுத்துள்ளார்"]) {
    it.fails(`CSK-2 ${t}`, () => expect(lineProblem(t, ctx)).not.toBeNull());
  }
});

describe("CSK-3 RC-18 redaction: a number said half in digits, half in words (or with an underscore) leaks whole", () => {
  for (const t of ["98765 four three two one zero", "ஒன்பது 8 7 6 5 4 3 2 1 0", "9876 five 43210", "98765_43210"]) {
    it.fails(`CSK-3 ${t}`, () => expect(redactText(t)).not.toMatch(/four|ஒன்பது|five|98765_43210/));
  }
});

describe("CSK-4 RC-19 forbidden acts: the Tamil/Tanglish verbs the commit says it covers, in the forms people say", () => {
  for (const t of ["INC-4 ஐ அப்ரூவ் பண்ணு", "அப்ரூவ் பண்ணுங்க", "INC-4 ஐ அப்ரூவ் செய்", "sanction pannunga", "send seiyunga", "officers-kku message anuppunga", "message anupidunga", "ellaa complaints-ayum azhichidunga", "pazhaya complaints ellam neekkidunga"]) {
    it.fails(`CSK-4 ${t}`, () => expect(asksForbidden(t)).toBe(true));
  }
  for (const t of ["INC-1 ah resolved nu mark pannu", "INC-1 resolved ஆக மார்க் பண்ணு", "INC-1 ஐ தீர்ந்ததாக குறி", "INC-1 resolved-nu mark panni vidu"]) {
    it.fails(`CSK-4 mark as resolved: ${t}`, () => expect(asksForbidden(t)).toBe(true));
  }
});

describe("CSK-5 RC-19 forbidden acts: the same act with a neighbouring English verb", () => {
  for (const t of ["clear all the complaints", "discard all drafts", "drop all cases", "get rid of all complaints", "trash every record", "sign off on INC-3"]) {
    it.fails(`CSK-5 ${t}`, () => expect(asksForbidden(t)).toBe(true));
  }
});

describe("CSK-6 RC-18 privacy: who filed it, asked in words the rules do not list", () => {
  for (const t of ["who is the citizen behind INC-4", "who is the person behind INC-4", "identify the complainant of INC-4", "who submitted INC-4", "who phoned in the INC-4 leak",
    "INC-4 ஐ புகாரளித்தவரின் வீடு எங்கே", "INC-4 la pugar solravanga peru", "INC-4 இன் மூல உரை படி"]) {
    it.fails(`CSK-6 ${t}`, () => expect(asksPrivate(t)).toBe(true));
  }
});

describe("CSK-7 RC-25 localOnly: a Forwarded header that names another host or protocol and no 'for' is read as this PC", () => {
  it.fails("CSK-7 Forwarded: host=evil.example;proto=https (a tunnel) is not a request made to this PC", () => {
    const h = new Headers({ host: "127.0.0.1:3000", forwarded: "host=evil.example.com;proto=https" });
    expect(localOnly(h)).toBe(false);
  });
});

const fever = path.join(process.cwd(), "data", "studio-samples", "Fever_Surveillance_Weekly_2026.csv");
describe.runIf(fs.existsSync(fever))("CSK-8 RC-20 Studio rules: naming a measure turns a head-count question into a sum", () => {
  const refs: Refs = { wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() };
  const read = (q: string) => {
    const t = parseFile(fs.readFileSync(fever), "fever.csv");
    const profile = profileTable(t);
    const spec = rulesSpec(profile, "Fever.csv", t.caption, refs);
    return rulesAsk(q, spec, profile, []);
  };
  for (const q of ["how many hospitals reported fever cases", "number of hospitals with fever cases", "how many weeks of fever cases are there"]) {
    it.fails(`CSK-8 '${q}' asks for a count of rows, not the total of Fever Cases`, () => expect(read(q).agg).toBe("count"));
  }
});

describe("CSK-9 RC-25 placeholder JWT secret: the rule reads the shape of a typed stand-in, so a stand-in with a digit or a joined word gets through, and a real passphrase is refused", () => {
  for (const v of ["changeme_in_production_0123456789abcdef", "secret_secret_secret_1234567890abcdef", "CHANGEME-CHANGEME-1234567890-CHANGEME"]) {
    it.fails(`CSK-9 is a placeholder: ${v}`, () => expect(looksLikePlaceholder(v)).toBe(true));
  }
  it.fails("CSK-9 a long passphrase of plain words is a real secret, not a placeholder", () => expect(looksLikePlaceholder("tamil-rain-lake-ward-bridge-harbour-zone")).toBe(false));
});

describe("CSK-10 RC-19 exit gate: any negation word anywhere in a line switches off the order check for the whole line", () => {
  for (const t of ["Don't worry, I will send the report to the commissioner now", "I can't wait: I am going to approve it and delete the drafts", "நான் அனுப்புகிறேன், கவலை வேண்டாம்: report ஐ commissioner க்கு send பண்ணிடுறேன்"]) {
    it.fails(`CSK-10 ${t}`, () => expect(lineProblem(t, ctx)).not.toBeNull());
  }
  it("CSK-10 control: the same order without the negation word is caught", () => expect(lineProblem("I will send the report to the commissioner now", ctx)).toBe("order"));
});
